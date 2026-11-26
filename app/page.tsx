import Link from "next/link";
import { Bouquet } from "@/components/Bouquet";
import { Wordmark } from "@/components/Wordmark";
import { HERO } from "@/lib/presets";

export default function Home() {
  return (
    <div className="home">
      <header className="page-top">
        <Wordmark />
        <Link href="/gallery" className="page-top-link">Gallery</Link>
      </header>

      <main className="home-hero">
        <div className="home-copy">
          <h1 className="home-title">
            Flowers,
            <br />
            <em>made by you.</em>
          </h1>
          <p className="lede">
            Arrange a little bouquet with your hands, tuck in a note, and send it to someone who’d love it.
          </p>
          <Link href="/studio" className="btn btn--primary btn--large">
            Make a bouquet
          </Link>
          <p className="fine">Use your webcam to gesture, or simply a mouse or finger. No sign-up.</p>
        </div>
        <div className="home-art">
          <Bouquet flowers={HERO} reveal title="A hand-drawn bouquet of seven flowers" />
        </div>
      </main>

      <footer className="home-foot">
        <ol className="how">
          <li><span>01</span> Arrange your flowers</li>
          <li><span>02</span> Write a little note</li>
          <li><span>03</span> Send them a link</li>
        </ol>
      </footer>
    </div>
  );
}
