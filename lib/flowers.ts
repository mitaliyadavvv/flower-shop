/**
 * The flower model, palette and the drawing recipes for each kind of bloom.
 * Shared by the studio, the API (for validation) and the recipient page.
 */
import { mulberry32, Rng, between, wiggle } from "./rng";
import { Pt, closedPath, openPath, blob } from "./paths";

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const INK = "#3b302a";
export const STEM = "#7d9473";
export const LEAF = "#b5c6a3";
export const PAPER = "#f2e2cc";
export const PAPER_BACK = "#e9d2b8";
export const RIBBON = "#dfa3a6";

export const COLORS = {
  butter: { name: "Butter", fill: "#f6dc8f" },
  blush: { name: "Blush", fill: "#f7cdc7" },
  rose: { name: "Dusty rose", fill: "#e0a6a8" },
  peach: { name: "Peach", fill: "#f5c5a3" },
  lavender: { name: "Lavender", fill: "#cfc0e4" },
  sky: { name: "Powder blue", fill: "#bdd4e9" },
  pistachio: { name: "Pistachio", fill: "#d3e0b3" },
  milk: { name: "Milk", fill: "#fcf7ec" },
} as const;

export type ColorKey = keyof typeof COLORS;
export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

const CENTER_FOR: Record<ColorKey, string> = {
  butter: "#e7a58a",
  blush: "#f6dc8f",
  rose: "#f6dc8f",
  peach: "#f9e7a8",
  lavender: "#f6dc8f",
  sky: "#f6dc8f",
  pistachio: "#f5c5a3",
  milk: "#f6dc8f",
};

/* ------------------------------------------------------------------ */
/* Kinds                                                               */
/* ------------------------------------------------------------------ */

export const KINDS = {
  daisy: { name: "Daisy", length: 1.0, width: 0.36, center: 0.27, petals: 10 },
  blossom: { name: "Blossom", length: 0.86, width: 1.0, center: 0.22, petals: 5 },
  aster: { name: "Aster", length: 1.02, width: 0.4, center: 0.2, petals: 8 },
  cherry: { name: "Cherry", length: 0.84, width: 1.05, center: 0.15, petals: 5 },
} as const;

export type KindKey = keyof typeof KINDS;
export const KIND_KEYS = Object.keys(KINDS) as KindKey[];

export const MIN_PETALS = 3;
export const MAX_PETALS = 12;
export const MAX_FLOWERS = 24;

/** Head radius in bouquet units (the bouquet canvas is 600 × 800). */
export const HEAD = 64;

export interface Flower {
  id: string;
  kind: KindKey;
  color: ColorKey;
  petals: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  seed: number;
}

export interface Composition {
  version: 1;
  flowers: Flower[];
}

export interface Note {
  to: string;
  message: string;
  from: string;
}

export interface SavedBouquet {
  id: string;
  composition: Composition;
  note: Note;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Bouquet layout                                                      */
/* ------------------------------------------------------------------ */

export const VIEW_W = 600;
export const VIEW_H = 800;
/** Where the stems are gathered and tied. */
export const KNOT: Pt = [300, 640];
export const BOUNDS = { minX: 70, maxX: 530, minY: 90, maxY: 560 };

export const clampPos = (x: number, y: number): Pt => [
  Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, x)),
  Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, y)),
];

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Drawing recipes                                                     */
/* ------------------------------------------------------------------ */

function halfWidth(kind: KindKey, t: number): number {
  switch (kind) {
    case "daisy":
      return Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.94 + 0.04)), 0.7) * 0.5;
    case "blossom":
      return Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.86 + 0.06)), 0.55) * 0.5;
    case "aster":
      return (t < 0.42 ? Math.sin((Math.PI * t) / 0.84) : (1 - t) / 0.58) * 0.5;
    case "cherry":
      return Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.1)), 0.6) * 0.5;
  }
}

/** One petal pointing up (−y) from the origin. */
export function petalPath(kind: KindKey, length: number, width: number, r: Rng): string {
  const steps = 6;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const w = halfWidth(kind, t) * width;
    const jy = wiggle(r, length * 0.025);
    left.push([-w + wiggle(r, width * 0.07), -length * t + jy]);
    right.push([w + wiggle(r, width * 0.07), -length * t + jy]);
  }
  let tip: Pt[];
  if (kind === "cherry") {
    tip = [
      [-width * 0.2, -length * 0.98],
      [wiggle(r, 1), -length * 0.86],
      [width * 0.2, -length * 0.98],
    ];
  } else if (kind === "aster") {
    tip = [[wiggle(r, 1.2), -length * 1.04]];
  } else {
    tip = [[wiggle(r, width * 0.08), -length * (1 + wiggle(r, 0.03))]];
  }
  return closedPath([[0, -length * 0.06], ...left, ...tip, ...right.reverse()]);
}

export interface HeadGeometry {
  radius: number;
  petals: { d: string; angle: number }[];
  center: string;
  centerFill: string;
  dots: { x: number; y: number; r: number }[];
  stamens: string[];
}

/** Build the shapes for one flower head. Petal shapes are stable per index. */
export function headGeometry(kind: KindKey, petals: number, seed: number, color: ColorKey): HeadGeometry {
  const spec = KINDS[kind];
  const r = mulberry32(seed);
  const radius = HEAD;
  const offset = r() * 360;
  const widthScale = Math.min(1.35, Math.max(0.62, Math.sqrt(spec.petals / petals)));
  const list: { d: string; angle: number }[] = [];
  for (let i = 0; i < petals; i++) {
    const pr = mulberry32(seed * 31 + i * 7919);
    const len = radius * spec.length * between(pr, 0.9, 1.06);
    let wid = radius * spec.width * widthScale * between(pr, 0.88, 1.08);
    // Slim, spiky kinds shouldn't overlap much, or they read as a pinwheel.
    if (kind === "aster" || kind === "daisy") wid = Math.min(wid, ((2 * Math.PI * 0.42 * len) / petals) * 1.05);
    list.push({ d: petalPath(kind, len, wid, pr), angle: r2(offset + (i * 360) / petals + wiggle(pr, 4)) });
  }
  const cr = mulberry32(seed + 101);
  const centerR = radius * spec.center;
  const dots: HeadGeometry["dots"] = [];
  const dotCount = kind === "cherry" ? 0 : 3 + Math.floor(cr() * 3);
  for (let i = 0; i < dotCount; i++) {
    const a = cr() * Math.PI * 2;
    const d = cr() * centerR * 0.55;
    dots.push({ x: r2(Math.cos(a) * d), y: r2(Math.sin(a) * d), r: r2(between(cr, 1.1, 1.8)) });
  }
  const stamens: string[] = [];
  if (kind === "cherry") {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + wiggle(cr, 0.3);
      const L = radius * between(cr, 0.3, 0.42);
      stamens.push(openPath([
        [Math.cos(a) * centerR * 0.4, Math.sin(a) * centerR * 0.4],
        [Math.cos(a + 0.08) * L * 0.6, Math.sin(a + 0.08) * L * 0.6],
        [Math.cos(a) * L, Math.sin(a) * L],
      ]));
    }
  }
  return {
    radius,
    petals: list,
    center: blob(0, 0, centerR, cr, 0.14, 8),
    centerFill: CENTER_FOR[color],
    dots,
    stamens,
  };
}

export interface StemGeometry {
  stem: string;
  leaves: { d: string; vein: string; x: number; y: number; angle: number }[];
}

/** A stem that runs from the head down through the knot, crossing like a real tied bunch. */
export function stemGeometry(f: Pick<Flower, "x" | "y" | "seed">): StemGeometry {
  const r = mulberry32(f.seed + 977);
  const [kx, ky] = KNOT;
  const hx = f.x;
  const hy = f.y + 6;
  const dx = kx - hx;
  const dy = ky - hy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = wiggle(r, Math.min(26, len * 0.08));
  const pts: Pt[] = [[hx, hy]];
  for (const t of [0.3, 0.62]) {
    const s = Math.sin(Math.PI * t) * bend;
    pts.push([hx + dx * t + nx * s + wiggle(r, 1.5), hy + dy * t + ny * s + wiggle(r, 1.5)]);
  }
  const knotJ: Pt = [kx + wiggle(r, 5), ky + wiggle(r, 2)];
  pts.push(knotJ);
  const endX = kx - (hx - kx) * 0.16 + wiggle(r, 6);
  pts.push([endX, 792 + wiggle(r, 4)]);

  const leaves: StemGeometry["leaves"] = [];
  const leafCount = len > 180 ? (r() > 0.35 ? 1 : 0) + (r() > 0.75 ? 1 : 0) : r() > 0.6 ? 1 : 0;
  for (let i = 0; i < leafCount; i++) {
    const t = between(r, 0.34, 0.62);
    const s = Math.sin(Math.PI * t) * bend;
    const x = hx + dx * t + nx * s;
    const y = hy + dy * t + ny * s;
    // Leaves point up and away from the stem, alternating sides.
    const side = (i % 2 === 0 ? 1 : -1) * (r() > 0.5 ? 1 : -1);
    const lean = (Math.atan2(-dx, dy) * 180) / Math.PI; // follow the stem's tilt
    const angle = lean * 0.5 + side * between(r, 38, 62);
    const L = between(r, 26, 36);
    leaves.push({
      d: petalPath("daisy", L, L * 0.78, r),
      vein: openPath([[0, -2], [wiggle(r, 0.8), -L * 0.5], [wiggle(r, 0.8), -L * 0.82]]),
      x: r2(x),
      y: r2(y),
      angle: r2(angle),
    });
  }
  return { stem: openPath(pts), leaves };
}

/* ------------------------------------------------------------------ */
/* Creation + validation                                               */
/* ------------------------------------------------------------------ */

export const newId = () => Math.random().toString(36).slice(2, 10);

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Accept only well-formed compositions — used on the server before saving. */
export function sanitizeComposition(input: unknown): Composition | null {
  const flowersIn = (input as { flowers?: unknown })?.flowers;
  if (!Array.isArray(flowersIn) || flowersIn.length === 0) return null;
  const flowers: Flower[] = flowersIn.slice(0, MAX_FLOWERS).map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const kind = KIND_KEYS.includes(o.kind as KindKey) ? (o.kind as KindKey) : "daisy";
    const color = COLOR_KEYS.includes(o.color as ColorKey) ? (o.color as ColorKey) : "blush";
    const [x, y] = clampPos(num(o.x, 0, VIEW_W, 300), num(o.y, 0, VIEW_H, 300));
    return {
      id: `f${i}`,
      kind,
      color,
      petals: Math.round(num(o.petals, MIN_PETALS, MAX_PETALS, KINDS[kind].petals)),
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      rotation: Math.round(num(o.rotation, -3600, 3600, 0) % 360),
      scale: Math.round(num(o.scale, 0.7, 1.3, 1) * 100) / 100,
      seed: Math.floor(num(o.seed, 0, 2 ** 31, 1)),
    };
  });
  return { version: 1, flowers };
}

export function sanitizeNote(input: unknown): Note | null {
  const o = (input ?? {}) as Record<string, unknown>;
  const message = str(o.message, 800);
  if (!message) return null;
  return { to: str(o.to, 60), message, from: str(o.from, 60) };
}
