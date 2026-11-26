/**
 * Photo-booth backdrops: a soft pastel wall with layered shapes for a little
 * depth (a floor curve, overlapping blobs), plus a few hand-drawn flowers and
 * sparkles in the same ink style as the bouquets. Drawn once per option.
 */
import { mulberry32, wiggle, between, Rng } from "../rng";
import { Pt, blob, closedPath } from "../paths";
import { petalPath } from "../flowers";

export type BackdropId = "room" | "blush" | "sky" | "sage";

export interface Backdrop {
  id: BackdropId;
  name: string;
  /** Swatch colour for the picker. */
  swatch: string;
  wall?: string;
  wallLight?: string;
  wallDeep?: string;
  floor?: string;
  flowers?: string[];
}

export const BACKDROPS: Backdrop[] = [
  { id: "room", name: "Room", swatch: "linear-gradient(135deg, #b9b2a8, #7f776e)" },
  {
    id: "blush",
    name: "Blush",
    swatch: "#f4cfc9",
    wall: "#f6d7d1",
    wallLight: "#fbe8e4",
    wallDeep: "#eebfb8",
    floor: "#ecb8b0",
    flowers: ["#fcf7ec", "#f6dc8f", "#e0a6a8"],
  },
  {
    id: "sky",
    name: "Sky",
    swatch: "#c9dcef",
    wall: "#d3e2f1",
    wallLight: "#e6eff8",
    wallDeep: "#bcd2e8",
    floor: "#b3cbe3",
    flowers: ["#fcf7ec", "#f6dc8f", "#cfc0e4"],
  },
  {
    id: "sage",
    name: "Sage",
    swatch: "#cfdcbf",
    wall: "#d8e3cb",
    wallLight: "#e9f0e1",
    wallDeep: "#c3d3b1",
    floor: "#b9cba5",
    flowers: ["#fcf7ec", "#f7cdc7", "#f6dc8f"],
  },
];

const INK = "#3b302a";

function outlined(ctx: CanvasRenderingContext2D, d: string, fill: string, width = 2.2) {
  const p = new Path2D(d);
  ctx.save();
  ctx.translate(2.5, -2);
  ctx.fillStyle = fill;
  ctx.fill(p);
  ctx.restore();
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke(p);
}

function flatBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, rng: Rng, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(blob(x, y, r, rng, 0.1, 10)));
  ctx.restore();
}

function littleFlower(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string, rng: Rng) {
  const n = 5 + Math.floor(rng() * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rng() * Math.PI);
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((i / n) * Math.PI * 2);
    outlined(ctx, petalPath("blossom", size, size * 0.85, rng), fill, 1.8);
    ctx.restore();
  }
  outlined(ctx, blob(0, 0, size * 0.26, rng, 0.12, 7), "#f6dc8f", 1.6);
  ctx.restore();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
  ctx.restore();
}

/** Paint a pastel backdrop into a W × H canvas. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, b: Backdrop, W: number, H: number) {
  const r = mulberry32(b.id.length * 97 + 5);
  ctx.fillStyle = b.wall!;
  ctx.fillRect(0, 0, W, H);

  // Soft light falling on the wall.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.32, 40, W * 0.5, H * 0.32, W * 0.75);
  glow.addColorStop(0, b.wallLight!);
  glow.addColorStop(1, b.wall!);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Layered blobs, deeper ones behind lighter ones, for a little depth.
  flatBlob(ctx, W * 0.08, H * 0.2, W * 0.26, b.wallDeep!, r, 0.55);
  flatBlob(ctx, W * 0.95, H * 0.42, W * 0.3, b.wallDeep!, r, 0.5);
  flatBlob(ctx, W * 0.18, H * 0.05, W * 0.16, b.wallLight!, r, 0.9);
  flatBlob(ctx, W * 0.86, H * 0.12, W * 0.13, b.wallLight!, r, 0.9);

  // A gentle floor curve, slightly darker, with a hand-drawn edge.
  const floor: Pt[] = [[-40, H + 40], [-40, H * 0.8]];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    floor.push([W * t, H * 0.76 + Math.sin(t * Math.PI) * -H * 0.04 + wiggle(r, 3)]);
  }
  floor.push([W + 40, H * 0.8], [W + 40, H + 40]);
  ctx.fillStyle = b.floor!;
  ctx.fill(new Path2D(closedPath(floor)));
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke(new Path2D(closedPath(floor)));
  ctx.restore();

  // A few loose flowers around the edges (kept clear of the middle, where the person is).
  const spots: [number, number, number][] = [
    [W * 0.09, H * 0.36, 30],
    [W * 0.14, H * 0.6, 22],
    [W * 0.9, H * 0.22, 26],
    [W * 0.92, H * 0.64, 32],
    [W * 0.06, H * 0.88, 26],
    [W * 0.94, H * 0.9, 24],
  ];
  spots.forEach(([x, y, s], i) => littleFlower(ctx, x + wiggle(r, 8), y + wiggle(r, 8), s, b.flowers![i % b.flowers!.length], r));

  // Tiny dots and sparkles.
  ctx.fillStyle = INK;
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? between(r, 0.02, 0.2) : between(r, 0.8, 0.98);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(W * side, H * between(r, 0.05, 0.75), between(r, 2, 3.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  sparkle(ctx, W * 0.2, H * 0.14, 12);
  sparkle(ctx, W * 0.8, H * 0.08, 10);
  sparkle(ctx, W * 0.84, H * 0.5, 11);
  sparkle(ctx, W * 0.12, H * 0.74, 9);
}
