"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { GestureIcon } from "./GestureIcons";

const GESTURES = [
  { name: "point", title: "Point", text: "Your hand moves a little cursor. Hover over a colour or button to choose it." },
  { name: "pinch", title: "Pinch", text: "Bring thumb and finger together to pick up a flower. Let go to place it." },
  { name: "twist", title: "Twist", text: "While holding a flower, turn your wrist to turn the bloom." },
  { name: "stretch", title: "Stretch", text: "Make an L with both hands and pull them apart for more petals, closer for fewer." },
] as const;

export function Intro({ onBegin }: { onBegin: (mode: "hands" | "touch") => void }) {
  const [touchFirst, setTouchFirst] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);

  useEffect(() => {
    setTouchFirst(window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900);
    setHasCamera(!!navigator.mediaDevices?.getUserMedia);
  }, []);

  return (
    <div className="intro">
      <header className="page-top">
        <Link href="/" aria-label="posy home">
          <Wordmark />
        </Link>
      </header>
      <main className="intro-main">
        <p className="eyebrow">Before we begin</p>
        <h1 className="intro-title">
          Make it with <em>your hands.</em>
        </h1>
        <p className="intro-lede">
          posy can use your camera to follow one hand, so you can pick flowers up and arrange them in the air. The video
          stays on your device — nothing is recorded or sent anywhere.
        </p>

        <ul className="gestures">
          {GESTURES.map((g) => (
            <li key={g.name} className="gesture">
              <GestureIcon name={g.name} />
              <h2>{g.title}</h2>
              <p>{g.text}</p>
            </li>
          ))}
        </ul>

        <div className="intro-actions">
          {touchFirst || !hasCamera ? (
            <>
              <button className="btn btn--primary" onClick={() => onBegin("touch")}>
                Start arranging
              </button>
              {hasCamera && (
                <button className="btn btn--ghost" onClick={() => onBegin("hands")}>
                  Try the camera
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn--primary" onClick={() => onBegin("hands")}>
                Turn on camera
              </button>
              <button className="btn btn--ghost" onClick={() => onBegin("touch")}>
                Use mouse or touch instead
              </button>
            </>
          )}
        </div>
        <p className="fine">Works best in good light, with your hand about an arm’s length from the screen.</p>
      </main>
    </div>
  );
}
