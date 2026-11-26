import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Make a bouquet — posy" };

export default function StudioPage() {
  return <Studio />;
}
