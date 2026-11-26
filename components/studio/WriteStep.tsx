"use client";

import { FormEvent, useState } from "react";
import { Bouquet } from "@/components/Bouquet";
import { Wordmark } from "@/components/Wordmark";
import { Flower, Note } from "@/lib/flowers";

interface Props {
  flowers: Flower[];
  note: Note;
  onChange: (n: Note) => void;
  onBack: () => void;
  onSend: () => Promise<string | null>;
}

export function WriteStep({ flowers, note, onChange, onBack, onSend }: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Note) => (e: { target: { value: string } }) => onChange({ ...note, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.message.trim()) {
      setError("Write a few words first — even a short one is lovely.");
      return;
    }
    setSending(true);
    setError(null);
    const err = await onSend().catch(() => "We couldn't reach the flower shop. Check your connection and try again.");
    if (err) {
      setError(err);
      setSending(false);
    }
  };

  return (
    <div className="write">
      <header className="studio-top">
        <span className="studio-home"><Wordmark /></span>
        <ol className="steps" aria-label="Progress">
          <li className="is-done">Arrange</li>
          <li className="is-current">Write</li>
          <li>Send</li>
        </ol>
        <button className="link-btn" onClick={onBack}>← Keep arranging</button>
      </header>

      <main className="write-main">
        <div className="write-art">
          <Bouquet flowers={flowers} />
        </div>

        <form className="card card--edit" onSubmit={submit}>
          <p className="eyebrow">A little note</p>
          <label className="card-line">
            <span>To</span>
            <input value={note.to} onChange={set("to")} maxLength={60} placeholder="their name (optional)" autoComplete="off" />
          </label>
          <textarea
            className="card-message"
            value={note.message}
            onChange={set("message")}
            maxLength={800}
            placeholder="Write a little something…"
            rows={7}
            autoFocus
            aria-label="Your message"
          />
          <label className="card-line">
            <span>From</span>
            <input value={note.from} onChange={set("from")} maxLength={60} placeholder="your name (optional)" autoComplete="off" />
          </label>
          <div className="card-foot">
            <span className="fine">{note.message.length}/800</span>
            <button className="btn btn--primary" type="submit" disabled={sending}>
              {sending ? "Wrapping…" : "Send your flowers"}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </main>
    </div>
  );
}
