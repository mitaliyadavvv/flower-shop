/**
 * Geometry helpers for the hand-drawn look: everything is built from a few
 * jittered points smoothed with Catmull-Rom curves, so lines wobble a little.
 */
import { Rng, wiggle } from "./rng";

export type Pt = [number, number];

const f = (n: number) => Math.round(n * 10) / 10;

/** Smooth closed shape through points. */
export function closedPath(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += bez(p0, p1, p2, p3);
  }
  return d + "Z";
}

/** Smooth open line through points. */
export function openPath(pts: Pt[]): string {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  return d + segments(pts);
}

/** Bezier segments (no leading M) through points, endpoints clamped. */
export function segments(pts: Pt[]): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += bez(p0, p1, p2, p3);
  }
  return d;
}

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt) {
  const c1x = p1[0] + (p2[0] - p0[0]) / 6;
  const c1y = p1[1] + (p2[1] - p0[1]) / 6;
  const c2x = p2[0] - (p3[0] - p1[0]) / 6;
  const c2y = p2[1] - (p3[1] - p1[1]) / 6;
  return `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
}

/** A polygon with sharp-ish corners and gently wobbling edges. */
export function wobblyPolygon(corners: Pt[], r: Rng, amp = 2.5, steps = 3): string {
  let d = `M${f(corners[0][0])} ${f(corners[0][1])}`;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const pts: Pt[] = [a];
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      pts.push([a[0] + (b[0] - a[0]) * t + wiggle(r, amp), a[1] + (b[1] - a[1]) * t + wiggle(r, amp)]);
    }
    pts.push(b);
    d += segments(pts);
  }
  return d + "Z";
}

/** A wobbly circle-ish blob. */
export function blob(cx: number, cy: number, radius: number, r: Rng, irregularity = 0.12, count = 9): string {
  const pts: Pt[] = [];
  const start = r() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * Math.PI * 2;
    const rr = radius * (1 + wiggle(r, irregularity));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return closedPath(pts);
}

/** A sketchy, not-quite-closed ring, like a pencil circle drawn quickly. */
export function sketchRing(radius: number, r: Rng): string {
  const pts: Pt[] = [];
  const start = r() * Math.PI * 2;
  const sweep = Math.PI * 2 * 1.08;
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * sweep;
    const rr = radius * (1 + wiggle(r, 0.04)) + (i / n) * 3;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return openPath(pts);
}
