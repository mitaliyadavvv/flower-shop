import { INK } from "@/lib/flowers";

const s = { fill: "none", stroke: INK, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Tiny hand-drawn diagrams for the four gestures. */
export function GestureIcon({ name }: { name: "palm" | "fist" | "twist" | "stretch" }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
      {name === "palm" && (
        <>
          <path {...s} d="M22 56 C17 49 15 43 16 37 L12 26 C11 22 16 21 18 24 L22 33 L21 13 C21 9 26 9 26 13 L27 30 L29 9 C29 5 34 5 34 9 L33 30 L37 12 C38 8 43 9 42 13 L39 33 L44 22 C46 18 51 20 49 24 L43 41 C41 47 40 52 40 56" />
          <circle cx="31" cy="40" r="3" fill="#f6dc8f" stroke={INK} strokeWidth="1.2" />
        </>
      )}
      {name === "fist" && (
        <>
          <path {...s} d="M20 56 C17 50 16 44 17 38 C18 31 20 26 24 24 C27 21 31 21 34 22 C37 20 41 21 43 24 C46 24 48 27 48 31 C48 37 46 43 43 47 C41 51 40 54 40 56" />
          <path {...s} d="M24 24 C24 28 25 31 28 32 M34 22 C33 26 34 30 37 31 M43 24 C42 28 42 31 44 33 M17 38 C21 36 26 37 29 40 C31 42 30 45 27 46" />
          <circle cx="32" cy="13" r="4.5" fill="#f7cdc7" stroke={INK} strokeWidth="1.2" />
          <path {...s} d="M32 18 L32 21" opacity="0.6" />
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
