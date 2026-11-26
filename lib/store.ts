import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Composition, Note, SavedBouquet, sanitizeComposition } from "./flowers";

/**
 * Bouquet storage. Uses Supabase (PostgREST) when SUPABASE_URL and
 * SUPABASE_SECRET_KEY are set. In local development without them, bouquets
 * are kept as JSON files in ./.data so everything works out of the box.
 */

const URL_ = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
const LOCAL_DIR = path.join(process.cwd(), ".data", "bouquets");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export const storageMode = (): "supabase" | "local" | "none" =>
  URL_ && KEY ? "supabase" : process.env.NODE_ENV !== "production" ? "local" : "none";

export function makeId(length = 10) {
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

const headers = () => {
  const h: Record<string, string> = { apikey: KEY!, "content-type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization.
  if (KEY!.startsWith("eyJ")) h.authorization = `Bearer ${KEY}`;
  return h;
};

interface Row {
  id: string;
  composition: Composition;
  recipient_name: string | null;
  message: string;
  sender_name: string | null;
  created_at: string;
}

const fromRow = (row: Row): SavedBouquet | null => {
  const composition = sanitizeComposition(row.composition);
  if (!composition) return null;
  return {
    id: row.id,
    composition,
    note: { to: row.recipient_name ?? "", message: row.message ?? "", from: row.sender_name ?? "" },
    createdAt: row.created_at,
  };
};

export async function saveBouquet(composition: Composition, note: Note): Promise<string> {
  const mode = storageMode();
  if (mode === "none") throw new Error("Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  const id = makeId();
  const row: Row = {
    id,
    composition,
    recipient_name: note.to || null,
    message: note.message,
    sender_name: note.from || null,
    created_at: new Date().toISOString(),
  };
  if (mode === "local") {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_DIR, `${id}.json`), JSON.stringify(row, null, 2));
    return id;
  }
  const res = await fetch(`${URL_}/rest/v1/bouquets`, {
    method: "POST",
    headers: { ...headers(), prefer: "return=minimal" },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
  return id;
}

export async function getBouquet(id: string): Promise<SavedBouquet | null> {
  if (!/^[A-Za-z0-9]{8,16}$/.test(id)) return null;
  const mode = storageMode();
  if (mode === "none") return null;
  if (mode === "local") {
    try {
      const raw = await fs.readFile(path.join(LOCAL_DIR, `${id}.json`), "utf8");
      return fromRow(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  const res = await fetch(
    `${URL_}/rest/v1/bouquets?id=eq.${encodeURIComponent(id)}&select=id,composition,recipient_name,message,sender_name,created_at&limit=1`,
    { headers: headers(), cache: "no-store" },
  );
  if (!res.ok) {
    console.error("Supabase read failed", res.status, await res.text());
    return null;
  }
  const rows = (await res.json()) as Row[];
  return rows[0] ? fromRow(rows[0]) : null;
}
