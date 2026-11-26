import { getPhotoBytes } from "@/lib/store";

export const runtime = "nodejs";

const ok = /^[A-Za-z0-9]{8,16}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  if (!ok.test(id) || !ok.test(pid)) return new Response("Not found", { status: 404 });
  const bytes = await getPhotoBytes(`bouquets/${id}/photos/${pid}`);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
}
