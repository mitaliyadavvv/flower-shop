"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bouquet } from "./Bouquet";
import { FlowerArt } from "./Flower";
import { Wordmark } from "./Wordmark";
import dynamic from "next/dynamic";
import { SavedBouquet } from "@/lib/flowers";

const PhotoBooth = dynamic(() => import("./booth/PhotoBooth").then((m) => m.PhotoBooth), { ssr: false });

export interface PhotoRef {
  id: string;
  createdAt: string;
}

type Stage = "arrive" | "bloom" | "card";

export function Reveal({ bouquet, photos: initialPhotos = [] }: { bouquet: SavedBouquet; photos?: PhotoRef[] }) {
  const [stage, setStage] = useState<Stage>("arrive");
  const [booth, setBooth] = useState(false);
  const [photos, setPhotos] = useState<PhotoRef[]>(initialPhotos);
  const [play, setPlay] = useState(0);
  const [noteReady, setNoteReady] = useState(false);
  const { flowers } = bouquet.composition;
  const { to, message, from } = bouquet.note;

  // The note button appears once the last flower has opened.
  const bloomMs = 1700 + flowers.length * 140 + 900;
  useEffect(() => {
    if (stage !== "bloom") return;
    setNoteReady(false);
    const t = window.setTimeout(() => setNoteReady(true), bloomMs);
    return () => window.clearTimeout(t);
  }, [stage, play, bloomMs]);

  const accent = flowers[0];

  return (
    <div className={`reveal reveal--${stage}`}>
      <header className="page-top page-top--center">
        <Wordmark />
      </header>

      {booth && (
        <PhotoBooth
          bouquetId={bouquet.id}
          flowers={flowers}
          sender={from}
          onClose={() => setBooth(false)}
          onSent={(ph) => setPhotos((list) => [ph, ...list])}
        />
      )}

      {stage === "arrive" && (
        <main className="arrive">
          <div className="arrive-bud" aria-hidden>
            <svg viewBox="-60 -60 120 120">
              <g className="arrive-bud-art">
                <FlowerArt kind={accent?.kind ?? "blossom"} color={accent?.color ?? "blush"} petals={accent?.petals ?? 5} seed={accent?.seed ?? 9} />
              </g>
            </svg>
          </div>
          <h1 className="arrive-title">
            Someone special has <em>sent you flowers.</em>
          </h1>
          <p className="arrive-lede">A little something, made just for you.</p>
          <button className="btn btn--primary" onClick={() => setStage("bloom")} autoFocus>
            Open your bouquet
          </button>
        </main>
      )}

      {stage !== "arrive" && (
        <main className="unwrap">
          <div className="unwrap-art" key={play}>
            <Bouquet flowers={flowers} reveal title="Your bouquet" />
          </div>

          {stage === "bloom" && (
            <div className={`unwrap-next${noteReady ? " is-ready" : ""}`}>
              <button className="btn btn--primary" onClick={() => setStage("card")} tabIndex={noteReady ? 0 : -1}>
                Read your note
              </button>
            </div>
          )}

          {stage === "card" && (
            <article className="card card--read" aria-label="Your note">
              <svg className="card-corner" viewBox="-60 -60 120 120" aria-hidden>
                <FlowerArt kind={accent?.kind ?? "daisy"} color={accent?.color ?? "butter"} petals={accent?.petals ?? 8} seed={(accent?.seed ?? 3) + 1} still />
              </svg>
              <p className="card-to">{to ? <>Dear {to},</> : <>For you,</>}</p>
              <p className="card-body">{message}</p>
              <p className="card-from">
                <span>with love,</span>
                {from ? <strong>{from}</strong> : <strong>someone who thinks of you</strong>}
              </p>
            </article>
          )}

          {stage === "card" && (
            <nav className="unwrap-after">
              <button className="btn btn--primary btn--small" onClick={() => setBooth(true)}>
                Take a photo with your flowers
              </button>
              <button className="link-btn" onClick={() => { setPlay((p) => p + 1); setStage("bloom"); }}>
                Watch it bloom again
              </button>
              <Link className="link-btn link-btn--quiet" href="/">
                Make a bouquet of your own
              </Link>
            </nav>
          )}

          {stage === "card" && photos.length > 0 && (
            <section className="sentback" aria-label="Photos with these flowers">
              <p className="eyebrow">Photos with these flowers</p>
              <div className="sentback-grid">
                {photos.map((ph, i) => (
                  <a
                    key={ph.id}
                    href={`/api/bouquets/${bouquet.id}/photos/${ph.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mini-polaroid"
                    style={{ transform: `rotate(${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg)` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/bouquets/${bouquet.id}/photos/${ph.id}`} alt="A photo with this bouquet" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
