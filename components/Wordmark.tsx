import { INK } from "@/lib/flowers";

/** "phoolish" with a tiny hand-drawn bloom for the dot. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark${className ? ` ${className}` : ""}`}>
      <svg viewBox="-12 -12 24 24" width="18" height="18" aria-hidden>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="0" cy="-5.2" rx="3.4" ry="5" transform={`rotate(${a})`} fill="#f7cdc7" stroke={INK} strokeWidth="1" />
        ))}
        <circle r="2.6" fill="#f6dc8f" stroke={INK} strokeWidth="1" />
      </svg>
      phoolish
    </span>
  );
}
