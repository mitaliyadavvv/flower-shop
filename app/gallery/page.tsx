import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { listGallery } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gallery — phoolish",
  description: "Little moments people shared with the flowers they were sent.",
};

export default async function GalleryPage() {
  const photos = await listGallery(36);
  return (
    <div className="gallery">
      <header className="page-top">
        <Link href="/" aria-label="phoolish home">
          <Wordmark />
        </Link>
        <Link href="/studio" className="page-top-link">Make a bouquet</Link>
      </header>
      <main className="gallery-main">
        <h1 className="gallery-title">
          The <em>gallery.</em>
        </h1>
        <p className="lede">Little moments people chose to share with the flowers they were sent.</p>
        {photos.length === 0 ? (
          <p className="gallery-empty">No photos yet. The first one could be yours.</p>
        ) : (
          <ul className="gallery-grid">
            {photos.map((p, i) => (
              <li key={p.id} style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/gallery/${p.id}`} alt="A photo shared with a phoolish bouquet" loading="lazy" width={1080} height={1350} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
