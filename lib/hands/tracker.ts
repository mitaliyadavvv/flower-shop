/**
 * Webcam hand tracking with MediaPipe's HandLandmarker. Reports up to two
 * hands per frame, each reduced to a few stable signals; the studio turns
 * them into gestures (open palm to point, closed fist to grab, twist, and
 * the two-hand "L" stretch).
 */
import type { HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface HandData {
  /** Pointer position, mirrored and normalised 0…1 within the camera frame. */
  px: number;
  py: number;
  /** Anchor for the two-hand stretch: the index knuckle, which barely moves when
   *  fingers curl (so closing a fist doesn't read as moving the hand). Mirrored, 0…1. */
  lx: number;
  ly: number;
  /**
   * How far each of the four fingers reaches from the wrist, relative to its
   * knuckle (≈2 when straight, ≈1 when curled into the palm).
   * `fistMax` is the least-curled finger: low only when all four are folded.
   * `openAvg` is the average: high when the hand is open.
   */
  fistMax: number;
  openAvg: number;
  /** Radians. Increases when the hand twists clockwise (from the user's view). */
  roll: number;
  /** Thumb and index out, other fingers folded — an "L". */
  isL: boolean;
  landmarks: NormalizedLandmark[];
}

export interface HandFrame {
  hands: HandData[];
  time: number;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private stopped = false;

  constructor(
    private video: HTMLVideoElement,
    private onFrame: (f: HandFrame) => void,
    private resolution: { width: number; height: number } = { width: 640, height: 480 },
  ) {}

  async start() {
    this.stopped = false;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this.resolution.width },
        height: { ideal: this.resolution.height },
        frameRate: { ideal: 30 },
        facingMode: "user",
      },
      audio: false,
    });
    if (this.stopped) return this.release();
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO" as const,
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options("GPU"));
    } catch {
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options("CPU"));
    }
    if (this.stopped) return this.release();
    this.loop();
  }

  private loop = () => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    // Only run the model when the camera has a new frame (~30 fps), not every display frame.
    if (!this.landmarker || v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const now = performance.now();
    let result;
    try {
      result = this.landmarker.detectForVideo(v, now);
    } catch {
      return;
    }
    const aspect = (v.videoWidth || 640) / (v.videoHeight || 480);
    const hands = (result.landmarks ?? []).map((lm) => describe(lm, aspect));
    this.onFrame({ hands, time: now });
  };

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.release();
    this.video.srcObject = null;
    try {
      this.landmarker?.close();
    } catch {}
    this.landmarker = null;
  }
}

function describe(lm: NormalizedLandmark[], aspect: number): HandData {
  const d2 = (a: number, b: number) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);

  // Palm size from two directions, so it holds up when the hand turns sideways.
  const palm = Math.max(d2(0, 9), d2(5, 17) * 1.35, 0.04);
  // Open palm vs closed fist, per finger: fingertip-to-wrist ÷ knuckle-to-wrist.
  const reach = [
    [8, 5],
    [12, 9],
    [16, 13],
    [20, 17],
  ].map(([tip, mcp]) => d2(0, tip) / Math.max(d2(0, mcp), 1e-4));
  const fistMax = Math.max(...reach);
  const openAvg = reach.reduce((a, b) => a + b, 0) / reach.length;

  // Pointer: the middle of the palm. It barely moves when the hand closes into a
  // fist, so a grab lands exactly where you were aiming.
  const px = 1 - (lm[0].x + lm[5].x + lm[9].x + lm[17].x) / 4;
  const py = (lm[0].y + lm[5].y + lm[9].y + lm[17].y) / 4;

  const wx = (1 - lm[0].x) * aspect;
  const kx = (1 - lm[9].x) * aspect;
  const roll = Math.atan2(kx - wx, -(lm[9].y - lm[0].y));

  return { px, py, lx: 1 - lm[5].x, ly: lm[5].y, fistMax, openAvg, roll, isL: isLShape(lm, d2, palm), landmarks: lm };
}

function isLShape(lm: NormalizedLandmark[], d2: (a: number, b: number) => number, palm: number) {
  const indexOut = d2(0, 8) > d2(0, 6) * 1.12 && d2(5, 8) > palm * 0.55;
  const thumbOut = d2(4, 5) > palm * 0.5 && d2(4, 8) > palm * 0.75;
  let folded = 0;
  for (const [tip, pip] of [[12, 10], [16, 14], [20, 18]]) if (d2(0, tip) < d2(0, pip) * 1.08) folded++;
  if (!indexOut || !thumbOut || folded < 2) return false;
  // Thumb and index should open at a clear angle, like the letter L.
  const ax = lm[4].x - lm[2].x;
  const ay = lm[4].y - lm[2].y;
  const bx = lm[8].x - lm[5].x;
  const by = lm[8].y - lm[5].y;
  const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return cos < Math.cos((40 * Math.PI) / 180);
}
