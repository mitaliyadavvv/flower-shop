import { NextResponse } from "next/server";
import { storageInfo } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Setup check: can this deployment read from the bouquets collection? */
export async function GET() {
  const info = storageInfo();
  let reads = "unknown";
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${info.project}/databases/${encodeURIComponent(info.database)}/documents/${info.collection}/healthcheck00`,
      { cache: "no-store" },
    );
    const body = res.status === 403 ? await res.text() : "";
    reads =
      res.status === 404
        ? "allowed"
        : body.includes("on the service")
          ? "Firestore database not created yet — Build → Firestore Database → Create database"
          : res.status === 403
            ? "blocked by rules — publish firebase/firestore.rules"
            : `unexpected (${res.status})`;
  } catch {
    reads = "unreachable";
  }
  return NextResponse.json({ ...info, reads }, { headers: { "cache-control": "no-store" } });
}
