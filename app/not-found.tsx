import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <div className="lost">
      <header className="page-top page-top--center">
        <Wordmark />
      </header>
      <main className="lost-main">
        <h1 className="arrive-title">
          These flowers <em>seem to have wandered off.</em>
        </h1>
        <p className="arrive-lede">The link may be incomplete — check it was copied in full.</p>
        <Link href="/" className="btn btn--primary">Make a bouquet</Link>
      </main>
    </div>
  );
}
