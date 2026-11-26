/**
 * Poses for the photo booth, from MediaPipe hand landmarks.
 * `aspect` = video width / height, so distances are in true proportions.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

type LM = NormalizedLandmark[];

const dist = (a: NormalizedLandmark, b: NormalizedLandmark, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y);

const palmSize = (lm: LM, aspect: number) => Math.max(dist(lm[0], lm[9], aspect), dist(lm[5], lm[17], aspect) * 1.35, 0.02);

const extended = (lm: LM, tip: number, pip: number, aspect: number) => dist(lm[0], lm[tip], aspect) > dist(lm[0], lm[pip], aspect) * 1.12;
const folded = (lm: LM, tip: number, pip: number, aspect: number) => dist(lm[0], lm[tip], aspect) < dist(lm[0], lm[pip], aspect) * 1.04;

/** ✌️ Index and middle up and apart; ring and pinky folded. */
export function isPeace(lm: LM, aspect: number): boolean {
  if (!extended(lm, 8, 6, aspect) || !extended(lm, 12, 10, aspect)) return false;
  if (!folded(lm, 16, 14, aspect) || !folded(lm, 20, 18, aspect)) return false;
  const palm = palmSize(lm, aspect);
  return dist(lm[8], lm[12], aspect) > palm * 0.32;
}

/** 🫶 Two hands: index tips touching at the top, thumb tips touching below. */
export function isHeart(a: LM, b: LM, aspect: number): boolean {
  const palm = (palmSize(a, aspect) + palmSize(b, aspect)) / 2;
  const indexTogether = dist(a[8], b[8], aspect) < palm * 0.6;
  const thumbsTogether = dist(a[4], b[4], aspect) < palm * 0.6;
  if (!indexTogether || !thumbsTogether) return false;
  const indexY = (a[8].y + b[8].y) / 2;
  const thumbY = (a[4].y + b[4].y) / 2;
  // Index tips above the thumbs, with an opening in between — the heart.
  return thumbY - indexY > palm * 0.45;
}

export { palmSize };
