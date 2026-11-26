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
  lily: { name: "Lily", length: 1.12, width: 0.46, center: 0.12, petals: 6 },
  cherry: { name: "Cherry", length: 0.84, width: 1.05, center: 0.15, petals: 5 },
  // No longer offered in the studio, but kept so bouquets already sent still draw.
  tulip: { name: "Tulip", length: 1.14, width: 0.66, center: 0, petals: 3 },
  aster: { name: "Aster", length: 1.02, width: 0.4, center: 0.2, petals: 8 },
} as const;

export type KindKey = keyof typeof KINDS;
/** Every kind that can be drawn (including retired ones). */
export const KIND_KEYS = Object.keys(KINDS) as KindKey[];
/** The kinds offered in the studio. */
export const PICKER_KINDS: KindKey[] = ["daisy", "blossom", "lily", "cherry"];

export const MIN_PETALS = 3;
export const MAX_PETALS = 12;

/** Petal range per kind — lilies have at most six. */
export const petalRange = (kind: KindKey): [number, number] => (kind === "lily" ? [3, 6] : [MIN_PETALS, MAX_PETALS]);
export const clampPetals = (kind: KindKey, n: number) => {
  const [lo, hi] = petalRange(kind);
  return Math.max(lo, Math.min(hi, Math.round(n)));
};
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
    case "lily":
      // Narrow at the base, fullest a third of the way out, then a long pointed tip.
      return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 1.2) * 0.5;
    case "tulip":
      // Rounded at the bottom, fullest a third of the way up, tapering to a point.
      return Math.pow(Math.sin(Math.PI * (0.22 + 0.78 * t)), 0.8) * 0.5;
  }
}

/** One petal pointing up (−y) from the origin. */
export function petalPath(kind: KindKey, length: number, width: number, r: Rng): string {
  const steps = 6;
  const left: Pt[] = [];
  const right: Pt[] = [];
  // Tulips want smooth, confident sides; the rest can wobble a little more.
  const wx = kind === "tulip" || kind === "lily" ? 0.03 : 0.07;
  const wy = kind === "tulip" || kind === "lily" ? 0.012 : 0.025;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const w = halfWidth(kind, t) * width;
    const jy = wiggle(r, length * wy);
    left.push([-w + wiggle(r, width * wx), -length * t + jy]);
    right.push([w + wiggle(r, width * wx), -length * t + jy]);
  }
  let tip: Pt[];
  if (kind === "cherry") {
    tip = [
      [-width * 0.2, -length * 0.98],
      [wiggle(r, 1), -length * 0.86],
      [width * 0.2, -length * 0.98],
    ];
  } else if (kind === "aster" || kind === "tulip" || kind === "lily") {
    tip = [[wiggle(r, 1), -length * 1.03]];
  } else {
    tip = [[wiggle(r, width * 0.08), -length * (1 + wiggle(r, 0.03))]];
  }
  // Tulip petals have a rounded cup bottom rather than meeting at a point.
  const base: Pt = kind === "tulip" ? [0, length * 0.05] : [0, -length * 0.06];
  return closedPath([base, ...left, ...tip, ...right.reverse()]);
}

export interface HeadGeometry {
  radius: number;
  /** `oy` (when set) moves the petal's base below the centre — tulips fan up from a base.
   *  `vein` is a midrib + freckles drawn inside the petal (lilies). */
  petals: { d: string; angle: number; oy?: number; vein?: string; freckles?: string }[];
  center: string;
  centerFill: string;
  dots: { x: number; y: number; r: number }[];
  stamens: string[];
  /** Pollen tips on the ends of long stamens (lilies). */
  anthers?: { x: number; y: number; a: number }[];
}

/** Build the shapes for one flower head. Petal shapes are stable per index. */
export function headGeometry(kind: KindKey, petals: number, seed: number, color: ColorKey): HeadGeometry {
  if (kind === "tulip") return tulipGeometry(petals, seed, color);
  if (kind === "lily") return lilyGeometry(petals, seed, color);
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

/**
 * Lily: long pointed star petals (3–6), alternating slightly wider and narrower,
 * each with a midrib and a few freckles, and long stamens tipped with pollen.
 */
function lilyGeometry(petals: number, seed: number, color: ColorKey): HeadGeometry {
  const n = clampPetals("lily", petals);
  const spec = KINDS.lily;
  const r = mulberry32(seed);
  const radius = HEAD;
  const offset = r() * 360;
  const list: HeadGeometry["petals"] = [];
  for (let i = 0; i < n; i++) {
    const pr = mulberry32(seed * 31 + i * 7919);
    const inner = i % 2 === 0;
    const len = radius * spec.length * (inner ? 1 : 0.94) * between(pr, 0.96, 1.04);
    const wid = radius * spec.width * (inner ? 1.1 : 0.88) * (n <= 4 ? 1.25 : 1) * between(pr, 0.95, 1.05);
    // Midrib, slightly curved, plus freckles near the base.
    const vein = openPath([[0, -len * 0.12], [wiggle(pr, 1.2), -len * 0.45], [wiggle(pr, 1), -len * 0.78]]);
    let freckles = "";
    const count = 3 + Math.floor(pr() * 3);
    for (let k = 0; k < count; k++) {
      const fy = -len * between(pr, 0.18, 0.42);
      const fx = (pr() > 0.5 ? 1 : -1) * wid * between(pr, 0.08, 0.2);
      freckles += `M${r2(fx)} ${r2(fy)} l0.1 0 `;
    }
    list.push({ d: petalPath("lily", len, wid, pr), angle: r2(offset + (i * 360) / n + wiggle(pr, 3)), vein, freckles });
  }
  const cr = mulberry32(seed + 101);
  const stamens: string[] = [];
  const anthers: NonNullable<HeadGeometry["anthers"]> = [];
  for (let i = 0; i < 6; i++) {
    const a = ((offset + 30 + i * 60) * Math.PI) / 180 + wiggle(cr, 0.15);
    const L = radius * between(cr, 0.55, 0.7);
    const bend = wiggle(cr, 0.12);
    const ex = Math.cos(a) * L;
    const ey = Math.sin(a) * L;
    stamens.push(openPath([
      [Math.cos(a) * radius * 0.05, Math.sin(a) * radius * 0.05],
      [Math.cos(a + bend) * L * 0.55, Math.sin(a + bend) * L * 0.55],
      [ex, ey],
    ]));
    anthers.push({ x: r2(ex), y: r2(ey), a: r2((a * 180) / Math.PI) });
  }
  return {
    radius,
    petals: list,
    center: blob(0, 0, radius * spec.center, cr, 0.12, 7),
    centerFill: "#d3e0b3",
    dots: [],
    stamens,
    anthers,
  };
}

/**
 * Tulip: tall cupped petals fanning up from a base point. More petals make a
 * fuller, frillier "double" tulip. The middle petals are drawn last (in front).
 */
function tulipGeometry(petals: number, seed: number, color: ColorKey): HeadGeometry {
  const spec = KINDS.tulip;
  const radius = HEAD;
  const base = radius * 0.44;
  const spread = Math.min(76, 22 * (petals - 1));
  const widthScale = Math.min(1, Math.max(0.6, Math.sqrt(3 / petals) * 1.12));
  const list: { d: string; angle: number; oy: number; order: number }[] = [];
  for (let i = 0; i < petals; i++) {
    const pr = mulberry32(seed * 31 + i * 7919);
    const t = petals === 1 ? 0 : i / (petals - 1) - 0.5; // −0.5 … 0.5
    const centrality = 1 - Math.abs(t) * 2; // 1 in the middle, 0 at the edges
    const len = radius * spec.length * (0.9 + centrality * 0.1) * between(pr, 0.97, 1.03);
    const wid = radius * spec.width * widthScale * (1.02 - centrality * 0.04) * between(pr, 0.95, 1.04);
    list.push({
      d: petalPath("tulip", len, wid, pr),
      angle: r2(t * spread + wiggle(pr, 2.5)),
      oy: r2(base),
      order: centrality + wiggle(pr, 0.05),
    });
  }
  list.sort((a, b) => a.order - b.order);
  return {
    radius,
    petals: list.map(({ d, angle, oy }) => ({ d, angle, oy })),
    center: "",
    centerFill: CENTER_FOR[color],
    dots: [],
    stamens: [],
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
      petals: clampPetals(kind, num(o.petals, MIN_PETALS, MAX_PETALS, KINDS[kind].petals)),
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
