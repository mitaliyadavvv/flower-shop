import { getPhotoBytes } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  if (!/^[A-Za-z0-9]{8,16}$/.test(gid)) return new Response("Not found", { status: 404 });
  const bytes = await getPhotoBytes(`gallery/${gid}`);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
}
