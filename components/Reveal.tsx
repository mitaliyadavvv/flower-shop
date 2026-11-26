"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bouquet } from "./Bouquet";
import { FlowerArt } from "./Flower";
import { Wordmark } from "./Wordmark";
import { SavedBouquet } from "@/lib/flowers";

type Stage = "arrive" | "bloom" | "card";

export function Reveal({ bouquet }: { bouquet: SavedBouquet }) {
  const [stage, setStage] = useState<Stage>("arrive");
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
              <button className="link-btn" onClick={() => { setPlay((p) => p + 1); setStage("bloom"); }}>
                Watch it bloom again
              </button>
              <Link className="link-btn link-btn--quiet" href="/">
                Make a bouquet of your own
              </Link>
            </nav>
          )}
        </main>
      )}
    </div>
  );
}
