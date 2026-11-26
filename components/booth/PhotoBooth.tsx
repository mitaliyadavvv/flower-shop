"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bouquet } from "@/components/Bouquet";
import { Flower } from "@/lib/flowers";
import type { HandFrame, HandTracker } from "@/lib/hands/tracker";
import { isHeart, isPeace } from "@/lib/hands/poses";
import { PHOTO_H, PHOTO_W, Polaroid, composePolaroid } from "@/lib/polaroid";
import { BACKDROPS, BackdropId, paintBackdrop } from "@/lib/booth/backdrops";
import type { PersonCutout } from "@/lib/booth/cutout";

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
/** The point in the bouquet (600 × 800 art) it's held by: just under the bow. */
const GRIP = { x: 300 / 600, y: 700 / 800 };
const START = { x: W * 0.5, y: H * 0.98, h: H * 0.74 };
const POSE_FRAMES = 8;

/**
 * Rendered straight onto <body>, outside the bouquet page's layout, with page
 * scrolling locked while it's open — so the full-screen overlay always paints,
 * whatever the page scroll position.
 */
export function PhotoBooth(props: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.body);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);
  return host ? createPortal(<Booth {...props} />, host) : null;
}

function Booth({ bouquetId, flowers, sender, onClose, onSent }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const cutoutRef = useRef<PersonCutout | null>(null);
  const art = useRef<HTMLImageElement | null>(null);
  const backdrops = useRef<Partial<Record<BackdropId, HTMLCanvasElement>>>({});
  const personLayer = useRef<HTMLCanvasElement | null>(null);
  const place = useRef({ x: START.x, y: START.y });
  const pose = useRef<{ name: Pose; frames: number }>({ name: null, frames: 0 });
  const counting = useRef(false);
  const cooldownUntil = useRef(0);
  const shotRef = useRef<Polaroid | null>(null);
  const drag = useRef<null | { dx: number; dy: number }>(null);
  const settings = useRef({ size: 1, tilt: 0, backdrop: "room" as BackdropId });

  const [camera, setCamera] = useState<Camera>("starting");
  const [poseLabel, setPoseLabel] = useState<Pose>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [shot, setShot] = useState<Polaroid | null>(null);
  const [sizePct, setSizePct] = useState(100);
  const [tilt, setTilt] = useState(0);
  const [backdrop, setBackdrop] = useState<BackdropId>("room");
  const [cutoutState, setCutoutState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [toGallery, setToGallery] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const [noPicture, setNoPicture] = useState(false);
  const startError = useRef("");
  const [diag, setDiag] = useState<string | null>(null);

  settings.current = { size: sizePct / 100, tilt, backdrop };
  shotRef.current = shot;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

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

  /* ---------- backdrops, painted once ---------- */
  useEffect(() => {
    for (const b of BACKDROPS) {
      if (b.id === "room") continue;
      const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
      paintBackdrop(c.getContext("2d")!, b, W, H);
      backdrops.current[b.id] = c;
    }
    personLayer.current = Object.assign(document.createElement("canvas"), { width: W, height: H });
  }, []);

  /* ---------- camera + hand gestures (for ♡ / ✌️) ---------- */
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
      } catch (err) {
        startError.current = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        if (cancelled) return;
        if (video.srcObject) {
          // The camera works; only hand tracking failed. The shutter button still works.
          setCamera("on");
          setTrackingFailed(true);
        } else {
          t.stop();
          trackerRef.current = null;
          setCamera("off");
        }
      }
    })();
    const v = videoRef.current;
    const onPlay = () => !cancelled && setCamera("on");
    v?.addEventListener("playing", onPlay);
    return () => {
      cancelled = true;
      v?.removeEventListener("playing", onPlay);
      trackerRef.current?.stop();
      trackerRef.current = null;
      cutoutRef.current?.close();
      cutoutRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFrame(f: HandFrame) {
    const v = videoRef.current;
    const aspect = v && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3;
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

  /* ---------- person cut-out, loaded the first time a backdrop is picked ---------- */
  useEffect(() => {
    if (backdrop === "room" || cutoutRef.current) return;
    let cancelled = false;
    setCutoutState("loading");
    (async () => {
      try {
        const { PersonCutout } = await import("@/lib/booth/cutout");
        const c = new PersonCutout();
        await c.load();
        if (cancelled) return c.close();
        cutoutRef.current = c;
        setCutoutState("ready");
      } catch {
        if (!cancelled) setCutoutState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backdrop]);

  // If the camera says "on" but no frames arrive, say so instead of showing nothing.
  useEffect(() => {
    if (camera !== "on") return;
    const t = window.setTimeout(() => {
      const v = videoRef.current;
      setNoPicture(!v || v.readyState < 2 || v.videoWidth === 0);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [camera]);

  // Diagnostics, shown with ?debug in the URL.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const t = window.setInterval(() => {
      const v = videoRef.current;
      const track = (v?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      setDiag(
        [
          `state=${cameraRef.current} backdrop=${settings.current.backdrop} cutout=${cutoutRef.current?.hasMask ?? false}`,
          `video ready=${v?.readyState} ${v?.videoWidth}x${v?.videoHeight} paused=${v?.paused}`,
          `track=${track ? `${track.readyState} muted=${track.muted}` : "none"}`,
          `error=${startError.current || "none"}`,
        ].join("\n"),
      );
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  /* ---------- drawing ---------- */
  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const video = videoRef.current;
      const live = !!video && video.readyState >= 2 && video.videoWidth > 0;
      const cover = live ? coverOf(video!) : null;
      const { backdrop: bd, size, tilt } = settings.current;
      const wall = bd !== "room" ? backdrops.current[bd] : undefined;
      const cutout = cutoutRef.current;

      // 1. Background: a pastel backdrop with the person cut out in front, or the room as it is.
      if (wall && cover && cutout?.ready) {
        cutout.update(video!);
        ctx.drawImage(wall, 0, 0);
        if (cutout.hasMask && personLayer.current) {
          const pl = personLayer.current.getContext("2d")!;
          pl.globalCompositeOperation = "source-over";
          pl.clearRect(0, 0, W, H);
          drawVideo(pl, video!, cover);
          pl.globalCompositeOperation = "destination-in";
          pl.imageSmoothingEnabled = true;
          if ("filter" in pl) pl.filter = "blur(1.5px)";
          drawMirrored(pl, cutout.mask, cover);
          if ("filter" in pl) pl.filter = "none";
          pl.globalCompositeOperation = "source-over";
          ctx.drawImage(personLayer.current, 0, 0);
        }
      } else if (wall && !cover) {
        ctx.drawImage(wall, 0, 0);
      } else if (cover) {
        drawVideo(ctx, video!, cover);
      } else {
        paintPlain(ctx);
      }

      // 2. The bouquet: placed by dragging, with size and tilt.
      const img = art.current;
      if (img) {
        const h = START.h * size;
        const w = h * 0.75;
        const sway = Math.sin(performance.now() / 1400) * 0.01;
        ctx.save();
        ctx.translate(place.current.x, place.current.y);
        ctx.rotate((tilt * Math.PI) / 180 + sway);
        ctx.drawImage(img, -GRIP.x * w, -GRIP.y * h, w, h);
        ctx.restore();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------- taking the photo ---------- */
  const capture = useCallback(async () => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 450);
    const p = await composePolaroid(canvasRef.current!);
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

  /* ---------- placing the bouquet by dragging ---------- */
  const toLocal = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const onDown = (e: React.PointerEvent) => {
    if (shot) return;
    const [x, y] = toLocal(e);
    drag.current = { dx: place.current.x - x, dy: place.current.y - y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const [x, y] = toLocal(e);
    place.current.x = Math.min(W, Math.max(0, x + drag.current.dx));
    place.current.y = Math.min(H * 1.25, Math.max(H * 0.25, y + drag.current.dy));
  };
  const onUp = () => {
    drag.current = null;
  };

  const who = sender.trim() || "them";
  const note =
    camera === "starting"
      ? "Waking up the camera…"
      : camera === "off"
        ? "No camera, but you can still take a picture of your bouquet."
        : noPicture
          ? "The camera is on but no picture is coming through. Try closing other apps using it, then reload."
          : backdrop !== "room" && cutoutState === "loading"
            ? "Preparing the backdrop…"
            : backdrop !== "room" && cutoutState === "failed"
              ? "This backdrop couldn’t load here. Try “Room”."
              : trackingFailed
                ? "Hand poses aren’t available here. Use the round button to take your photo."
                : null;

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
          {/* The camera stays on screen (under the canvas) so every browser keeps it running. */}
          <video ref={videoRef} className="booth-live is-on" playsInline muted autoPlay />
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="booth-canvas is-draggable"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {note && <p className="booth-note">{note}</p>}
          {poseLabel && count === null && <p className="booth-pose">{poseLabel === "heart" ? "♡ Lovely, hold it…" : "✌️ Hold it…"}</p>}
          {count !== null && (
            <p className="booth-count" key={count}>
              {count}
            </p>
          )}
          <div className={`booth-flash${flash ? " is-on" : ""}`} />
          {diag && <pre className="booth-diag">{diag}</pre>}
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
          <div className="backdrops" role="radiogroup" aria-label="Background">
            {BACKDROPS.map((b) => (
              <button
                key={b.id}
                role="radio"
                aria-checked={backdrop === b.id}
                className={`backdrop${backdrop === b.id ? " is-on" : ""}`}
                onClick={() => setBackdrop(b.id)}
              >
                <span className="backdrop-swatch" style={{ background: b.swatch }} />
                {b.name}
              </button>
            ))}
          </div>
          <div className="booth-row">
            <div className="booth-sliders">
              <label className="booth-size">
                <span>Size</span>
                <input type="range" min={60} max={150} value={sizePct} onChange={(e) => setSizePct(Number(e.target.value))} />
              </label>
              <label className="booth-size">
                <span>Tilt</span>
                <input type="range" min={-45} max={45} value={tilt} onChange={(e) => setTilt(Number(e.target.value))} onDoubleClick={() => setTilt(0)} />
                <span className="booth-deg">{tilt > 0 ? `${tilt}° right` : tilt < 0 ? `${-tilt}° left` : "straight"}</span>
              </label>
            </div>
            <button className="shutter" onClick={() => startCountdown()} aria-label="Take photo (3 second timer)" disabled={count !== null}>
              <span />
            </button>
          </div>
          <p className="booth-tip">Drag the bouquet to place it. Make a ♡ with your hands or a ✌️, or press the button.</p>
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

/** Draw a camera-frame-sized source mirrored and cover-cropped into the photo. */
function drawMirrored(ctx: CanvasRenderingContext2D, src: CanvasImageSource, c: Cover) {
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, c.dx, c.dy, c.dw, c.dh);
  ctx.restore();
}

function drawVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, c: Cover) {
  drawMirrored(ctx, video, c);
}

function paintPlain(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#f8f1e5");
  g.addColorStop(1, "#f1e3cf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
