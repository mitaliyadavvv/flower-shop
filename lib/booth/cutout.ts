/**
 * Cuts the person out of the camera frame (MediaPipe selfie segmentation), so
 * they can stand in front of a pastel backdrop. Loaded only when a backdrop
 * other than "Room" is chosen. Runs on-device; nothing is uploaded.
 */
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM_PATH = "/mediapipe/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export class PersonCutout {
  private segmenter: ImageSegmenter | null = null;
  private loading: Promise<void> | null = null;
  private lastVideoTime = -1;
  private prev: Float32Array | null = null;
  /** Small canvas holding the person mask as alpha, at the model's resolution. */
  readonly mask: HTMLCanvasElement = document.createElement("canvas");
  ready = false;
  hasMask = false;

  load() {
    if (!this.loading) {
      this.loading = (async () => {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        // CPU keeps the mask as plain numbers (no GPU read-back), and this model is tiny.
        this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        this.ready = true;
      })().catch((e) => {
        this.loading = null;
        throw e;
      });
    }
    return this.loading;
  }

  /** Update the mask from the current video frame (once per new frame). */
  update(video: HTMLVideoElement) {
    if (!this.segmenter || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    try {
      this.segmenter.segmentForVideo(video, performance.now(), (result) => {
        const masks = result.confidenceMasks;
        if (!masks?.length) return;
        // One channel = person confidence. (Multi-class models put background first.)
        const m = masks[0];
        const data = m.getAsFloat32Array();
        const invert = masks.length > 1;
        const w = m.width;
        const h = m.height;
        if (this.mask.width !== w || this.mask.height !== h) {
          this.mask.width = w;
          this.mask.height = h;
          this.prev = null;
        }
        const prev = this.prev ?? new Float32Array(w * h);
        const img = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          let c = invert ? 1 - data[i] : data[i];
          // Blend with the last frame so edges don't flicker.
          c = this.prev ? c * 0.6 + prev[i] * 0.4 : c;
          prev[i] = c;
          // Soft but decisive edge.
          const t = Math.min(1, Math.max(0, (c - 0.3) / 0.45));
          img.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
        }
        this.prev = prev;
        this.mask.getContext("2d")!.putImageData(img, 0, 0);
        this.hasMask = true;
      });
    } catch {
      /* skip this frame */
    }
  }

  close() {
    try {
      this.segmenter?.close();
    } catch {}
    this.segmenter = null;
  }
}
