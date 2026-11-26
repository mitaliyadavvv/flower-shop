"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bouquet } from "@/components/Bouquet";
import { Wordmark } from "@/components/Wordmark";
import { Flower } from "@/lib/flowers";

interface Props {
  id: string;
  flowers: Flower[];
  to: string;
  onAgain: () => void;
}

export function SentStep({ id, flowers, to, onAgain }: Props) {
  const [url, setUrl] = useState(`/bouquet/${id}`);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    setUrl(`${base.replace(/\/$/, "")}/bouquet/${id}`);
    setCanShare(typeof navigator.share === "function");
  }, [id]);

  const text = "I made you some flowers 💐";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("share-url") as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const share = async () => {
    try {
      await navigator.share({ title: "Flowers for you", text, url });
    } catch {}
  };

  return (
    <div className="sent">
      <header className="studio-top">
        <span className="studio-home"><Wordmark /></span>
        <ol className="steps" aria-label="Progress">
          <li className="is-done">Arrange</li>
          <li className="is-done">Write</li>
          <li className="is-current">Send</li>
        </ol>
        <span />
      </header>
      <main className="sent-main">
        <div className="sent-art">
          <Bouquet flowers={flowers} reveal />
        </div>
        <div className="sent-copy">
          <p className="eyebrow">Wrapped &amp; ready</p>
          <h1 className="sent-title">
            Your flowers are <em>ready to send.</em>
          </h1>
          <p className="lede">
            Send this link to {to.trim() || "them"} however you like. They’ll unwrap the bouquet and your note whenever
            they open it — as many times as they want.
          </p>
          <div className="share-field">
            <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Shareable link" />
            <button className="btn btn--primary btn--small" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="share-row">
            {canShare && (
              <button className="chip-btn" onClick={share}>Share…</button>
            )}
            <a className="chip-btn" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a className="chip-btn" href={`sms:?&body=${encodeURIComponent(`${text} ${url}`)}`}>
              Message
            </a>
            <Link className="chip-btn" href={`/bouquet/${id}`} target="_blank">
              Preview it
            </Link>
          </div>
          <p className="fine">Keep this link. If they take a photo with your flowers and send it back, it’ll appear there.</p>
          <button className="link-btn" onClick={onAgain}>Make another bouquet</button>
        </div>
      </main>
    </div>
  );
}
