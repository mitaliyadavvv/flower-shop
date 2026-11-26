import { INK } from "@/lib/flowers";

const s = { fill: "none", stroke: INK, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Tiny hand-drawn diagrams for the four gestures. */
export function GestureIcon({ name }: { name: "point" | "pinch" | "twist" | "stretch" }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
      {name === "point" && (
        <>
          <path {...s} d="M24 54 C21 46 18 40 19 34 C20 30 24 31 25 34 L26 37 L26 16 C26 12 31 12 31 16 L31 31 M31 28 C31 24 36 24 36 28 L36 32 M36 30 C36 26 41 26 41 30 L41 34 M41 32 C41 29 46 29 46 33 C46 42 44 48 40 54" />
          <path {...s} d="M28.5 6 C24 6 22 9 22 9 M34 7 C36 8 37 10 37 10" opacity="0.6" />
          <circle cx="28.5" cy="5" r="2" fill="#f6dc8f" stroke={INK} strokeWidth="1.2" />
        </>
      )}
      {name === "pinch" && (
        <>
          <path {...s} d="M22 54 C18 46 16 40 18 33 C20 26 26 22 30 20 L38 14 C41 12 44 15 42 18 L36 25 M42 18 C45 17 47 20 45 23 L38 30 M20 34 C22 30 28 29 31 31 C34 33 34 36 32 37" />
          <path {...s} d="M38 30 C44 34 46 42 42 54" />
          <circle cx="33" cy="36" r="3.4" fill="#f7cdc7" stroke={INK} strokeWidth="1.2" />
        </>
      )}
      {name === "twist" && (
        <>
          <path {...s} d="M32 50 L32 30" />
          <path {...s} d="M22 30 C22 22 27 16 32 16 C37 16 42 22 42 30" />
          <path {...s} d="M12 26 C14 14 24 7 34 8 C44 9 51 16 53 25" opacity="0.8" />
          <path {...s} d="M48 22 L53 26 L56 20" opacity="0.8" />
          <ellipse cx="32" cy="15" rx="5" ry="6" fill="#cfc0e4" stroke={INK} strokeWidth="1.2" />
        </>
      )}
      {name === "stretch" && (
        <>
          <path {...s} d="M8 50 C7 44 8 40 11 38 L11 20 C11 17 15 17 15 20 L15 36 M11 38 C13 41 17 42 21 41 L26 40 C29 39 29 43 26 44 L18 47 C14 49 11 50 8 50" />
          <path {...s} d="M56 50 C57 44 56 40 53 38 L53 20 C53 17 49 17 49 20 L49 36 M53 38 C51 41 47 42 43 41 L38 40 C35 39 35 43 38 44 L46 47 C50 49 53 50 56 50" />
          <path {...s} d="M26 28 L38 28 M29 25 L26 28 L29 31 M35 25 L38 28 L35 31" opacity="0.75" />
          <circle cx="32" cy="16" r="4.5" fill="#f7cdc7" stroke={INK} strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}
