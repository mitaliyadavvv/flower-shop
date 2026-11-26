import "server-only";
import { randomBytes } from "node:crypto";
import { Composition, Note, SavedBouquet, sanitizeComposition } from "./flowers";

/**
 * Bouquet storage in Cloud Firestore, through its REST API.
 *
 * No secret keys are involved: Firestore is called like any public client,
 * and the security rules in firebase/firestore.rules decide what's allowed
 * (create a well-formed bouquet, read one by id — nothing else).
 */

const PROJECT = process.env.FIREBASE_PROJECT_ID || "posy-17da6";
const DATABASE = process.env.FIRESTORE_DATABASE || "(default)";
const COLLECTION = "bouquets";
const API_KEY = process.env.FIREBASE_API_KEY; // optional — only for quota attribution

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(DATABASE)}/documents/${COLLECTION}`;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export const storageInfo = () => ({ provider: "firestore" as const, project: PROJECT, database: DATABASE, collection: COLLECTION });

export function makeId(length = 10) {
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

const withKey = (url: string) => (API_KEY ? `${url}${url.includes("?") ? "&" : "?"}key=${API_KEY}` : url);

type Fields = Record<string, { stringValue?: string; timestampValue?: string }>;

export class StorageError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function saveBouquet(composition: Composition, note: Note): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = makeId();
    const fields: Fields = {
      composition: { stringValue: JSON.stringify(composition) },
      message: { stringValue: note.message },
      recipient_name: { stringValue: note.to },
      sender_name: { stringValue: note.from },
      created_at: { timestampValue: new Date().toISOString() },
    };
    const res = await fetch(withKey(`${BASE}?documentId=${id}`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields }),
      cache: "no-store",
    });
    if (res.ok) return id;
    if (res.status === 409) continue; // id already taken — astronomically rare
    const text = await res.text();
    throw new StorageError(`Firestore write failed (${res.status}): ${text.slice(0, 300)}`, res.status);
  }
  throw new StorageError("Could not find a free bouquet id", 500);
}

export async function getBouquet(id: string): Promise<SavedBouquet | null> {
  if (!/^[A-Za-z0-9]{8,16}$/.test(id)) return null;
  const res = await fetch(withKey(`${BASE}/${id}`), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("Firestore read failed", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const doc = (await res.json()) as { fields?: Fields; createTime?: string };
  const f = doc.fields ?? {};
  let raw: unknown = null;
  try {
    raw = JSON.parse(f.composition?.stringValue ?? "null");
  } catch {
    return null;
  }
  const composition = sanitizeComposition(raw);
  if (!composition) return null;
  return {
    id,
    composition,
    note: {
      to: f.recipient_name?.stringValue ?? "",
      message: f.message?.stringValue ?? "",
      from: f.sender_name?.stringValue ?? "",
    },
    createdAt: f.created_at?.timestampValue ?? doc.createTime ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/*                                                                     */
/*   bouquets/{id}/photos/{pid}  – sent back to the sender; only       */
/*                                 reachable by people with the link    */
/*   gallery/{gid}               – opted into the public gallery; no   */
/*                                 names, no link back to the bouquet  */
/* ------------------------------------------------------------------ */

const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(DATABASE)}/documents`;
export const MAX_IMAGE_CHARS = 900_000; // keeps each document safely under Firestore's 1 MiB

export interface PhotoRef {
  id: string;
  createdAt: string;
}

async function createDoc(path: string, docId: string, fields: Fields) {
  const res = await fetch(withKey(`${DOCS}/${path}?documentId=${docId}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields }),
    cache: "no-store",
  });
  if (!res.ok) throw new StorageError(`Firestore write failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
}

export async function savePhoto(bouquetId: string, image: string, toGallery: boolean): Promise<{ id: string; galleryId: string | null }> {
  const created_at = { timestampValue: new Date().toISOString() };
  const id = makeId(12);
  await createDoc(`${COLLECTION}/${bouquetId}/photos`, id, { image: { stringValue: image }, created_at });
  let galleryId: string | null = null;
  if (toGallery) {
    galleryId = makeId(12);
    await createDoc("gallery", galleryId, { image: { stringValue: image }, created_at });
  }
  return { id, galleryId };
}

async function listIds(parent: string, collectionId: string, limit: number): Promise<PhotoRef[]> {
  const res = await fetch(withKey(`${parent}:runQuery`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        select: { fields: [{ fieldPath: "created_at" }] },
        from: [{ collectionId }],
        orderBy: [{ field: { fieldPath: "created_at" }, direction: "DESCENDING" }],
        limit,
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Firestore query failed", res.status, (await res.text()).slice(0, 300));
    return [];
  }
  const rows = (await res.json()) as { document?: { name: string; fields?: Fields } }[];
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document!.name.split("/").pop()!,
      createdAt: r.document!.fields?.created_at?.timestampValue ?? "",
    }));
}

export const listBouquetPhotos = (bouquetId: string) =>
  /^[A-Za-z0-9]{8,16}$/.test(bouquetId) ? listIds(`${DOCS}/${COLLECTION}/${bouquetId}`, "photos", 12) : Promise.resolve([]);

export const listGallery = (limit = 36) => listIds(DOCS, "gallery", limit);

/** Returns the JPEG bytes for a stored photo, or null. */
export async function getPhotoBytes(path: string): Promise<Buffer | null> {
  const res = await fetch(withKey(`${DOCS}/${path}`), { cache: "no-store" });
  if (!res.ok) return null;
  const doc = (await res.json()) as { fields?: Fields };
  const data = doc.fields?.image?.stringValue ?? "";
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(data);
  return m ? Buffer.from(m[1], "base64") : null;
}
