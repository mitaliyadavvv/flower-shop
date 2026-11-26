import { NextResponse } from "next/server";
import { sanitizeComposition, sanitizeNote } from "@/lib/flowers";
import { StorageError, saveBouquet } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 32_000) return NextResponse.json({ error: "That bouquet is a little too big to send." }, { status: 413 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { composition: c, note: n } = (body ?? {}) as { composition?: unknown; note?: unknown };
  const composition = sanitizeComposition(c);
  if (!composition) return NextResponse.json({ error: "Add at least one flower first." }, { status: 400 });
  const note = sanitizeNote(n);
  if (!note) return NextResponse.json({ error: "Write a few words first — even a short one is lovely." }, { status: 400 });

  try {
    const id = await saveBouquet(composition, note);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error(err);
    const notSetUp = err instanceof StorageError && err.status === 403;
    return NextResponse.json(
      {
        error: notSetUp
          ? "The flower shop isn't set up yet (Firestore rules don't allow saving bouquets)."
          : "We couldn't wrap your flowers just now. Please try again.",
      },
      { status: notSetUp ? 503 : 500 },
    );
  }
}
