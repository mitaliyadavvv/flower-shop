"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bouquet } from "@/components/Bouquet";
import { Flower } from "@/lib/flowers";
import type { HandFrame, HandTracker } from "@/lib/hands/tracker";
import { isHeart, isPeace } from "@/lib/hands/poses";
import { PHOTO_H, PHOTO_W, Polaroid, composePolaroid } from "@/lib/polaroid";

type Pose = "heart" | "peace" | null;
type Camera = "starting" | "on" | "off";

interface Props {
  bouquetId: string;
  flowers: Flower[];
  sender: string;
  onClose: () => void;
  onSent: (photo: { id: string; createdAt: string }) => void;
}

const W = PHOTO_W;
const H = PHOTO_H;
/** The point in the bouquet (600 × 800 art) where hands hold it: just under the bow. */
const GRIP = { x: 300 / 600, y: 700 / 800 };
const DEFAULT = { x: W * 0.5, y: H * 1.0, h: H * 0.76 };
const POSE_FRAMES = 8;

const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

export function PhotoBooth({ bouquetId, flowers, sender, onClose, onSent }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const art = useRef<HTMLImageElement | null>(null);
  const hands = useRef<{ frame: HandFrame | null; aspect: number }>({ frame: null, aspect: 4 / 3 });
  const place = useRef({ ...DEFAULT, tx: DEFAULT.x, ty: DEFAULT.y, th: DEFAULT.h, lastHands: 0 });
  const pose = useRef<{ name: Pose; frames: number }>({ name: null, frames: 0 });
  const counting = useRef(false);
  const cooldownUntil = useRef(0);
  const follow = useRef(true);
  const size = useRef(1);
  const drag = useRef<null | { dx: number; dy: number }>(null);

  const [camera, setCamera] = useState<Camera>("starting");
  const [poseLabel, setPoseLabel] = useState<Pose>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [shot, setShot] = useState<Polaroid | null>(null);
  const [followHands, setFollowHands] = useState(true);
  const [sizePct, setSizePct] = useState(100);
  const [toGallery, setToGallery] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const [noPicture, setNoPicture] = useState(false);

  follow.current = followHands;
  size.current = sizePct / 100;

  /* ---------- the bouquet as a crisp still image ---------- */
  useEffect(() => {
    const svg = srcRef.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1200");
    clone.setAttribute("height", "1600");
    clone.removeAttribute("class");
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => (art.current = img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [flowers]);

  /* ---------- camera + hand tracking ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCamera("off");
        return;
      }
      const { HandTracker } = await import("@/lib/hands/tracker");
      const t = new HandTracker(video, onFrame, { width: 1280, height: 720 });
      trackerRef.current = t;
      try {
        await t.start();
        if (!cancelled) setCamera("on");
      } catch {
        if (cancelled) return;
        if (video.srcObject) {
          // The camera works; only hand tracking failed. Keep the picture —
          // the shutter button still takes photos.
          setCamera("on");
          setTrackingFailed(true);
        } else {
          t.stop();
          trackerRef.current = null;
          setCamera("off");
        }
      }
    })();
    // The video can be playing before the hand model has finished loading.
    const v = videoRef.current;
    const onPlay = () => !cancelled && setCamera("on");
    v?.addEventListener("playing", onPlay);
    return () => {
      cancelled = true;
      v?.removeEventListener("playing", onPlay);
      trackerRef.current?.stop();
      trackerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFrame(f: HandFrame) {
    const v = videoRef.current;
    const aspect = v && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3;
    hands.current = { frame: f, aspect };
    let p: Pose = null;
    if (f.hands.length === 2 && isHeart(f.hands[0].landmarks, f.hands[1].landmarks, aspect)) p = "heart";
    else if (f.hands.some((h) => isPeace(h.landmarks, aspect))) p = "peace";
    const ps = pose.current;
    if (p === ps.name) ps.frames++;
    else {
      ps.name = p;
      ps.frames = 1;
    }
    const stable = ps.frames >= POSE_FRAMES ? ps.name : null;
    setPoseLabel((cur) => (cur === stable ? cur : stable));
    if (stable && !counting.current && performance.now() > cooldownUntil.current && !shotRef.current) startCountdown();
  }

  // If the camera reports "on" but no frames arrive, say so instead of showing nothing.
  useEffect(() => {
    if (camera !== "on") return;
    const t = window.setTimeout(() => {
      const v = videoRef.current;
      setNoPicture(!v || v.readyState < 2 || v.videoWidth === 0);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [camera]);

  /* ---------- drawing ---------- */
  const handLayer = useRef<HTMLCanvasElement | null>(null);
  const maskLayer = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    handLayer.current = Object.assign(document.createElement("canvas"), { width: W, height: H });
    maskLayer.current = Object.assign(document.createElement("canvas"), { width: W, height: H });
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const video = videoRef.current;
      const live = !!video && video.readyState >= 2 && video.videoWidth > 0;
      const cover = live ? coverOf(video!) : null;

      // 1. The live camera is the real <video> element underneath (shown
      //    directly, so every browser keeps it updating). This canvas only
      //    holds the bouquet and the fingers drawn over it.
      ctx.clearRect(0, 0, W, H);

      // 2. Where the bouquet should be.
      const now = performance.now();
      const pl = place.current;
      const frame = hands.current.frame;
      const fresh = frame && now - frame.time < 250 ? frame.hands : [];
      if (cover && follow.current && !counting.current && !pose.current.name && !drag.current) {
        const palms = fresh.map((h) => {
          const lm = h.landmarks;
          return toCanvas((lm[0].x + lm[9].x) / 2, (lm[0].y + lm[9].y) / 2, cover);
        });
        if (palms.length === 2) {
          const d = Math.hypot(palms[1][0] - palms[0][0], palms[1][1] - palms[0][1]);
          if (d < W * 0.55) {
            pl.tx = (palms[0][0] + palms[1][0]) / 2;
            pl.ty = (palms[0][1] + palms[1][1]) / 2;
            // Size the wrap to fit between the hands, so they close around it.
            pl.th = Math.min(H * 1.15, Math.max(H * 0.5, d * 4.4));
            pl.lastHands = now;
          }
        } else if (palms.length === 1) {
          pl.tx = palms[0][0];
          pl.ty = palms[0][1];
          pl.lastHands = now;
        }
      }
      if (follow.current && now - pl.lastHands > 1600 && !drag.current) {
        pl.tx = DEFAULT.x;
        pl.ty = DEFAULT.y;
        pl.th = DEFAULT.h;
      }
      pl.x += (pl.tx - pl.x) * 0.22;
      pl.y += (pl.ty - pl.y) * 0.22;
      pl.h += (pl.th - pl.h) * 0.1;

      // 3. The bouquet, with a gentle sway.
      const img = art.current;
      if (img) {
        const h = pl.h * size.current;
        const w = h * 0.75;
        const sway = Math.sin(now / 1400) * 0.012;
        ctx.save();
        ctx.translate(pl.x, pl.y);
        ctx.rotate(sway);
        ctx.drawImage(img, -GRIP.x * w, -GRIP.y * h, w, h);
        ctx.restore();
      }

      // 4. Fingers in front of the bouquet, so it looks held.
      if (cover && fresh.length && handLayer.current && maskLayer.current) {
        const m = maskLayer.current.getContext("2d")!;
        m.clearRect(0, 0, W, H);
        m.strokeStyle = "#fff";
        m.fillStyle = "#fff";
        m.lineCap = "round";
        m.lineJoin = "round";
        for (const hand of fresh) {
          const pts = hand.landmarks.map((p) => toCanvas(p.x, p.y, cover));
          const palm = Math.hypot(pts[9][0] - pts[0][0], pts[9][1] - pts[0][1]);
          FINGERS.forEach((chain, i) => {
            m.lineWidth = palm * (i === 0 ? 0.34 : i === 4 ? 0.22 : 0.27);
            m.beginPath();
            m.moveTo(pts[chain[0]][0], pts[chain[0]][1]);
            for (const k of chain.slice(1)) m.lineTo(pts[k][0], pts[k][1]);
            m.stroke();
          });
          m.lineWidth = palm * 0.3;
          m.beginPath();
          for (const [i, k] of [0, 1, 2, 5, 9, 13, 17].entries()) (i ? m.lineTo : m.moveTo).call(m, pts[k][0], pts[k][1]);
          m.closePath();
          m.fill();
          m.stroke();
        }
        const hl = handLayer.current.getContext("2d")!;
        hl.globalCompositeOperation = "source-over";
        hl.clearRect(0, 0, W, H);
        drawVideo(hl, video!, cover);
        hl.globalCompositeOperation = "destination-in";
        if ("filter" in hl) hl.filter = "blur(3px)";
        hl.drawImage(maskLayer.current, 0, 0);
        if ("filter" in hl) hl.filter = "none";
        hl.globalCompositeOperation = "source-over";
        ctx.drawImage(handLayer.current, 0, 0);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------- taking the photo ---------- */
  const shotRef = useRef<Polaroid | null>(null);
  shotRef.current = shot;

  const capture = useCallback(async () => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 450);
    const photo = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const pc = photo.getContext("2d")!;
    const v = videoRef.current;
    if (v && v.readyState >= 2 && v.videoWidth > 0) drawVideo(pc, v, coverOf(v));
    else paintBackdrop(pc);
    pc.drawImage(canvasRef.current!, 0, 0);
    const p = await composePolaroid(photo);
    setShot(p);
    setSent(false);
    setError(null);
  }, []);

  function startCountdown() {
    if (counting.current) return;
    counting.current = true;
    let n = 3;
    setCount(n);
    const tick = window.setInterval(() => {
      n -= 1;
      if (n > 0) setCount(n);
      else {
        window.clearInterval(tick);
        setCount(null);
        capture().finally(() => {
          counting.current = false;
          cooldownUntil.current = performance.now() + 2500;
        });
      }
    }, 900);
  }

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setSent(false);
    setError(null);
    cooldownUntil.current = performance.now() + 2000;
  };

  useEffect(() => {
    if (!shot) return;
    const file = new File([shot.blob], "posy-bouquet.jpg", { type: "image/jpeg" });
    setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
  }, [shot]);

  const share = async () => {
    if (!shot) return;
    const file = new File([shot.blob], "posy-bouquet.jpg", { type: "image/jpeg" });
    try {
      await navigator.share({ files: [file], title: "My bouquet" });
    } catch {}
  };

  const sendBack = async () => {
    if (!shot || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/bouquets/${bouquetId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: shot.dataUrl, gallery: toGallery }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error || "We couldn't send your photo just now. Please try again.");
      setSent(true);
      onSent({ id: data.id, createdAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't send your photo just now.");
    } finally {
      setSending(false);
    }
  };

  /* ---------- manual placement (when not following hands) ---------- */
  const toLocal = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onDown = (e: React.PointerEvent) => {
    if ((followHands && camera === "on") || shot) return;
    const [x, y] = toLocal(e);
    drag.current = { dx: place.current.x - x, dy: place.current.y - y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const [x, y] = toLocal(e);
    place.current.tx = x + drag.current.dx;
    place.current.ty = y + drag.current.dy;
  };
  const onUp = () => {
    drag.current = null;
    place.current.lastHands = Infinity; // stay where it was put
  };

  const who = sender.trim() || "them";

  return (
    <div className="booth" role="dialog" aria-label="Take a photo with your flowers">
      <div className="booth-src" ref={srcRef} aria-hidden>
        <Bouquet flowers={flowers} texture />
      </div>

      <header className="booth-top">
        <p className="eyebrow">Photo booth</p>
        <button className="link-btn" onClick={onClose}>Close</button>
      </header>

      <div className="booth-stage">
        <div className={`booth-frame${shot ? " is-hidden" : ""}`}>
          <video ref={videoRef} className={`booth-live${camera === "on" ? " is-on" : ""}`} playsInline muted autoPlay />
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className={`booth-canvas${followHands && camera === "on" ? "" : " is-draggable"}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {camera === "starting" && <p className="booth-note">Waking up the camera…</p>}
          {camera === "off" && <p className="booth-note">No camera, but you can still take a picture of your bouquet.</p>}
          {camera === "on" && noPicture && <p className="booth-note">The camera is on but no picture is coming through. Try closing other apps using it, then reload.</p>}
          {camera === "on" && trackingFailed && !noPicture && <p className="booth-note">Hand poses aren’t available here. Use the round button to take your photo.</p>}
          {poseLabel && count === null && (
            <p className="booth-pose">{poseLabel === "heart" ? "♡ Lovely, hold it…" : "✌️ Hold it…"}</p>
          )}
          {count !== null && (
            <p className="booth-count" key={count}>
              {count}
            </p>
          )}
          <div className={`booth-flash${flash ? " is-on" : ""}`} />
        </div>

        {shot && (
          <div className="booth-review">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt="Your photo with the bouquet" className="booth-polaroid" />
          </div>
        )}
      </div>

      {!shot ? (
        <footer className="booth-controls">
          <p className="booth-tip">
            {camera === "on"
              ? followHands
                ? "Hold your hands low and the bouquet moves into them. Make a ♡ or ✌️ to snap."
                : "Drag the bouquet to place it. Make a ♡ or ✌️ to snap."
              : "Drag the bouquet to place it."}
          </p>
          <div className="booth-row">
            <label className="booth-size">
              <span>Size</span>
              <input type="range" min={70} max={140} value={sizePct} onChange={(e) => setSizePct(Number(e.target.value))} />
            </label>
            <button className="shutter" onClick={() => startCountdown()} aria-label="Take photo (3 second timer)" disabled={count !== null}>
              <span />
            </button>
            {camera === "on" ? (
              <button className="chip-btn" onClick={() => setFollowHands((f) => !f)} aria-pressed={followHands}>
                {followHands ? "Following hands" : "Placing by hand"}
              </button>
            ) : (
              <span className="booth-spacer" />
            )}
          </div>
        </footer>
      ) : (
        <footer className="booth-controls booth-controls--review">
          <div className="booth-row booth-row--wrap">
            <a className="btn btn--ghost btn--small" href={shot.url} download="posy-bouquet.jpg">
              Download
            </a>
            {canShare && (
              <button className="btn btn--ghost btn--small" onClick={share}>
                Share…
              </button>
            )}
            <button className="btn btn--ghost btn--small" onClick={retake}>
              Retake
            </button>
          </div>
          {!sent ? (
            <div className="sendback">
              <label className="check">
                <input type="checkbox" checked={toGallery} onChange={(e) => setToGallery(e.target.checked)} />
                <span>Also show it in the public posy gallery (no names shown)</span>
              </label>
              <button className="btn btn--primary" onClick={sendBack} disabled={sending}>
                {sending ? "Sending…" : `Send it back to ${who}`}
              </button>
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          ) : (
            <p className="sent-note">
              Sent ♡ {sender.trim() ? sender.trim() : "They"} will see it when they open this bouquet’s link
              {toGallery ? ", and it’s in the gallery too." : "."}
            </p>
          )}
        </footer>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

interface Cover {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

function coverOf(video: HTMLVideoElement): Cover {
  const s = Math.max(W / video.videoWidth, H / video.videoHeight);
  const dw = video.videoWidth * s;
  const dh = video.videoHeight * s;
  return { dw, dh, dx: (W - dw) / 2, dy: (H - dh) / 2 };
}

function drawVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, c: Cover) {
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, c.dx, c.dy, c.dw, c.dh);
  ctx.restore();
}

function paintBackdrop(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#f8f1e5");
  g.addColorStop(1, "#f1e3cf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Normalised landmark → mirrored canvas pixels. */
function toCanvas(x: number, y: number, c: Cover): [number, number] {
  return [W - (x * c.dw + c.dx), y * c.dh + c.dy];
}
