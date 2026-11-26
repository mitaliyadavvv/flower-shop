import { NextResponse } from "next/server";
import { MAX_IMAGE_CHARS, StorageError, getBouquet, savePhoto } from "@/lib/store";

export const runtime = "nodejs";

/** A recipient sends their photo back (and optionally to the gallery). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_CHARS + 2000) return NextResponse.json({ error: "That photo is a little too big." }, { status: 413 });

  let body: { image?: unknown; gallery?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m || image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "That photo couldn't be read." }, { status: 400 });
  const bytes = Buffer.from(m[1], "base64");
  // Must really be a JPEG (starts with FF D8 FF).
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return NextResponse.json({ error: "That photo couldn't be read." }, { status: 400 });
  }
  if (!(await getBouquet(id))) return NextResponse.json({ error: "We couldn't find that bouquet." }, { status: 404 });

  try {
    const saved = await savePhoto(id, image, body.gallery === true);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error(err);
    const rules = err instanceof StorageError && err.status === 403;
    return NextResponse.json(
      { error: rules ? "Photos aren't switched on yet (Firestore rules need updating)." : "We couldn't send your photo just now. Please try again." },
      { status: rules ? 503 : 500 },
    );
  }
}
