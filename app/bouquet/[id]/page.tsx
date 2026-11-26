import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/Reveal";
import { getBouquet, listBouquetPhotos } from "@/lib/store";

export const dynamic = "force-dynamic";

// Kept generic on purpose: link previews shouldn't spoil the bouquet or reveal names.
export const metadata: Metadata = {
  title: "Someone special has sent you flowers",
  description: "A little something, made just for you.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Someone special has sent you flowers",
    description: "A little something, made just for you.",
  },
};

export default async function BouquetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bouquet = await getBouquet(id);
  if (!bouquet) notFound();
  const photos = await listBouquetPhotos(id);
  return <Reveal bouquet={bouquet} photos={photos} />;
}
