// Copies MediaPipe's WebAssembly runtime into /public so hand tracking
// is served from our own origin (no third-party CDN at runtime).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dest = join(root, "public/mediapipe/wasm");

if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("posy: copied MediaPipe wasm → public/mediapipe/wasm");
}
