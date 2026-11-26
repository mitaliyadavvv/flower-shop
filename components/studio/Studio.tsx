"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bouquet } from "@/components/Bouquet";
import { FlowerArt } from "@/components/Flower";
import { Wordmark } from "@/components/Wordmark";
import {
  COLORS,
  COLOR_KEYS,
  ColorKey,
  Flower,
  HEAD,
  INK,
  KINDS,
  KIND_KEYS,
  KindKey,
  MAX_FLOWERS,
  MAX_PETALS,
  MIN_PETALS,
  Note,
  clampPos,
  newId,
} from "@/lib/flowers";
import { sketchRing } from "@/lib/paths";
import { mulberry32, randomSeed } from "@/lib/rng";
import type { HandFrame, HandTracker } from "@/lib/hands/tracker";
import { OneEuro } from "@/lib/hands/oneEuro";
import { Intro } from "./Intro";
import { WriteStep } from "./WriteStep";
import { SentStep } from "./SentStep";
import { CameraChip, HandStatus } from "./CameraChip";

type Step = "intro" | "make" | "write" | "sent";
type Mode = "hands" | "touch";
type Draft = Pick<Flower, "kind" | "color" | "petals" | "seed" | "scale">;

type Held =
  | { type: "new"; flower: Flower; inside: boolean; startRoll: number | null; source: "pointer" | "hand" }
  | { type: "move"; id: string; dx: number; dy: number; startRot: number; startRoll: number | null; source: "pointer" | "hand" }
  | { type: "rotate"; id: string; startRot: number; startAngle: number; source: "pointer" };

const STORAGE_KEY = "posy:draft:v1";
const DWELL_MS = 800;
const RAD = 180 / Math.PI;

const freshDraft = (prev?: Partial<Draft>): Draft => {
  const seed = randomSeed();
  const r = mulberry32(seed);
  const kind = prev?.kind ?? "daisy";
  return {
    kind,
    color: prev?.color ?? "blush",
    petals: prev?.petals ?? KINDS[kind].petals,
    seed,
    scale: Math.round((0.88 + r() * 0.24) * 100) / 100,
  };
};

const angleDelta = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const store = {
  load(): { flowers?: Flower[]; note?: Note; draft?: Draft } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(v: unknown) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
};

export function Studio() {
  const [step, setStep] = useState<Step>("intro");
  const [mode, setMode] = useState<Mode>("touch");
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const [draft, setDraft] = useState<Draft>(() => freshDraft());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [heldNew, setHeldNew] = useState<Flower | null>(null);
  const [heldInside, setHeldInside] = useState(false);
  const [binHot, setBinHot] = useState(false);
  const [settle, setSettle] = useState<Record<string, number>>({});
  const [note, setNote] = useState<Note>({ to: "", message: "", from: "" });
  const [shareId, setShareId] = useState<string | null>(null);
  const [handStatus, setHandStatus] = useState<HandStatus>("off");
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const binRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const held = useRef<Held | null>(null);

  // Mirrors of state for the gesture loop, which runs outside React.
  const flowersRef = useRef(flowers);
  const draftRef = useRef(draft);
  const selectedRef = useRef(selectedId);
  flowersRef.current = flowers;
  draftRef.current = draft;
  selectedRef.current = selectedId;

  /* ---------------- persistence (per-browser convenience only) --------------- */

  useEffect(() => {
    const saved = store.load();
    if (saved?.flowers?.length) setFlowers(saved.flowers);
    if (saved?.note) setNote(saved.note);
    if (saved?.draft) setDraft(saved.draft);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && step !== "sent") store.save({ flowers, note, draft });
  }, [flowers, note, draft, hydrated, step]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  /* ---------------- geometry helpers ---------------- */

  const toSvg = useCallback((cx: number, cy: number): [number, number] => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [300, 300];
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }, []);

  const within = (el: Element | null, cx: number, cy: number, pad = 0) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
  };

  const svgScale = () => {
    const svg = svgRef.current;
    return svg ? svg.getBoundingClientRect().height / 800 : 1;
  };

  const ghostPos = useRef<[number, number]>([0, 0]);
  const placeGhost = (cx: number, cy: number) => {
    ghostPos.current = [cx, cy];
    const g = ghostRef.current;
    if (g) g.style.transform = `translate(${cx}px, ${cy}px)`;
  };

  /* ---------------- editing ---------------- */

  const editTarget = useCallback((patch: Partial<Flower>) => {
    const sel = selectedRef.current;
    if (sel) setFlowers((fs) => fs.map((f) => (f.id === sel ? { ...f, ...patch } : f)));
    else setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setKind = (kind: KindKey) => editTarget({ kind, petals: KINDS[kind].petals });
  const setColor = (color: ColorKey) => editTarget({ color });
  const target: Draft | Flower = flowers.find((f) => f.id === selectedId) ?? draft;
  const nudgePetals = (d: number) =>
    editTarget({ petals: Math.max(MIN_PETALS, Math.min(MAX_PETALS, target.petals + d)) });
  const rotateSelected = (deg: number) => {
    const sel = selectedRef.current;
    if (sel) setFlowers((fs) => fs.map((f) => (f.id === sel ? { ...f, rotation: f.rotation + deg } : f)));
  };
  const bumpSettle = (id: string) => setSettle((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));

  const removeFlower = useCallback((id: string) => {
    setFlowers((fs) => fs.filter((f) => f.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  /* ---------------- pick up / move / drop (shared by mouse, touch and hands) ---------------- */

  const startNew = useCallback(
    (cx: number, cy: number, roll: number | null, source: "pointer" | "hand") => {
      if (flowersRef.current.length >= MAX_FLOWERS) {
        flash(`That's a full bouquet — ${MAX_FLOWERS} flowers is the most it can hold.`);
        return;
      }
      const [sx, sy] = toSvg(cx, cy);
      const [x, y] = clampPos(sx, sy);
      const f: Flower = { ...draftRef.current, id: newId(), x, y, rotation: 0 };
      held.current = { type: "new", flower: f, inside: false, startRoll: roll, source };
      setSelectedId(null);
      setHeldNew(f);
      setHeldInside(false);
      setLiftedId(f.id);
      placeGhost(cx, cy);
    },
    [flash, toSvg],
  );

  const startMove = useCallback(
    (id: string, cx: number, cy: number, roll: number | null, source: "pointer" | "hand") => {
      const f = flowersRef.current.find((x) => x.id === id);
      if (!f) return;
      const [sx, sy] = toSvg(cx, cy);
      held.current = { type: "move", id, dx: f.x - sx, dy: f.y - sy, startRot: f.rotation, startRoll: roll, source };
      setFlowers((fs) => [...fs.filter((x) => x.id !== id), f]); // bring to front
      setSelectedId(id);
      setLiftedId(id);
    },
    [toSvg],
  );

  const moveHeld = useCallback(
    (cx: number, cy: number, roll: number | null) => {
      const h = held.current;
      if (!h) return;
      const [sx, sy] = toSvg(cx, cy);
      const onBin = within(binRef.current, cx, cy, 12);
      setBinHot(onBin && h.type !== "rotate");
      if (h.type === "new") {
        const [x, y] = clampPos(sx, sy);
        const rotation = roll != null && h.startRoll != null ? angleDelta(roll, h.startRoll) * RAD * 1.4 : h.flower.rotation;
        const inside = within(stageRef.current, cx, cy) && !onBin;
        h.flower = { ...h.flower, x, y, rotation };
        h.inside = inside;
        setHeldNew(h.flower);
        setHeldInside(inside);
        placeGhost(cx, cy);
      } else if (h.type === "move") {
        const [x, y] = clampPos(sx + h.dx, sy + h.dy);
        const rot = roll != null && h.startRoll != null ? h.startRot + angleDelta(roll, h.startRoll) * RAD * 1.4 : null;
        setFlowers((fs) => fs.map((f) => (f.id === h.id ? { ...f, x, y, rotation: rot ?? f.rotation } : f)));
      } else {
        const f = flowersRef.current.find((x) => x.id === h.id);
        if (!f) return;
        const a = Math.atan2(sy - f.y, sx - f.x) * RAD;
        setFlowers((fs) => fs.map((x) => (x.id === h.id ? { ...x, rotation: h.startRot + (a - h.startAngle) } : x)));
      }
    },
    [toSvg],
  );

  const release = useCallback(
    (cx: number, cy: number) => {
      const h = held.current;
      if (!h) return;
      held.current = null;
      const onBin = within(binRef.current, cx, cy, 12);
      setLiftedId(null);
      setBinHot(false);
      if (h.type === "new") {
        setHeldNew(null);
        setHeldInside(false);
        if (h.inside && !onBin) {
          setFlowers((fs) => [...fs, h.flower]);
          bumpSettle(h.flower.id);
          setDraft((d) => freshDraft(d));
        }
      } else if (h.type === "move") {
        if (onBin) {
          removeFlower(h.id);
          flash("Flower removed.");
        } else bumpSettle(h.id);
      }
    },
    [flash, removeFlower],
  );

  /* ---------------- mouse + touch ---------------- */

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (held.current?.source === "pointer") moveHeld(e.clientX, e.clientY, null);
    };
    const up = (e: PointerEvent) => {
      if (held.current?.source === "pointer") release(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [moveHeld, release]);

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (held.current) return;
    const el = e.target as Element;
    const rot = el.closest("[data-rotate]");
    if (rot && selectedRef.current) {
      const f = flowersRef.current.find((x) => x.id === selectedRef.current);
      if (!f) return;
      const [sx, sy] = toSvg(e.clientX, e.clientY);
      held.current = {
        type: "rotate",
        id: f.id,
        startRot: f.rotation,
        startAngle: Math.atan2(sy - f.y, sx - f.x) * RAD,
        source: "pointer",
      };
      e.preventDefault();
      return;
    }
    const fl = el.closest("[data-flower-id]");
    if (fl) {
      e.preventDefault();
      startMove(fl.getAttribute("data-flower-id")!, e.clientX, e.clientY, null, "pointer");
      return;
    }
    if (!el.closest("button")) setSelectedId(null);
  };

  const onBenchPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    startNew(e.clientX, e.clientY, null, "pointer");
  };

  const onWheel = (e: React.WheelEvent) => {
    if (selectedRef.current && (e.target as Element).closest("[data-flower-id], [data-rotate]")) rotateSelected(e.deltaY * 0.15);
  };

  useEffect(() => {
    if (step !== "make") return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      const sel = selectedRef.current;
      if (e.key === "Escape") setSelectedId(null);
      if (!sel) return;
      if (e.key === "Delete" || e.key === "Backspace") removeFlower(sel);
      if (e.key === "[") rotateSelected(-15);
      if (e.key === "]") rotateSelected(15);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step, removeFlower]);

  /* ---------------- hand tracking ---------------- */

  const hand = useRef({
    fx: new OneEuro(0.85, 0.006),
    fy: new OneEuro(0.85, 0.006),
    x: 0,
    y: 0,
    trail: [] as { t: number; x: number; y: number }[],
    primary: null as null | { px: number; py: number },
    pinching: false,
    releaseFrames: 0,
    prevRatio: 1,
    lostAt: 0,
    roll: 0,
    rollInit: false,
    dwellEl: null as HTMLElement | null,
    dwellStart: 0,
    dwellFired: false,
    lFrames: 0,
    notLFrames: 0,
    stretch: null as null | {
      key: string;
      d0: number;
      p0: number;
      ax: number;
      ay: number;
      bx: number;
      by: number;
      /** Petal count currently shown. */
      n: number;
      /** Last count that was held steady — what we keep when the hands leave. */
      settled: number;
      lastChange: number;
    },
    status: "off" as HandStatus,
  });

  const setStatus = (s: HandStatus) => {
    if (hand.current.status !== s) {
      hand.current.status = s;
      setHandStatus(s);
    }
  };

  const petalsOf = (key: string) =>
    key === "draft" ? draftRef.current.petals : flowersRef.current.find((f) => f.id === key)?.petals ?? 5;
  const setPetalsOf = (key: string, n: number) => {
    if (key === "draft") setDraft((d) => ({ ...d, petals: n }));
    else setFlowers((fs) => fs.map((f) => (f.id === key ? { ...f, petals: n } : f)));
  };

  /** Map a normalised camera point to the window, using the comfortable middle of the frame. */
  const toScreen = (nx: number, ny: number): [number, number] => [
    Math.min(1, Math.max(0, (nx - 0.12) / 0.76)) * window.innerWidth,
    Math.min(1, Math.max(0, (ny - 0.1) / 0.68)) * window.innerHeight,
  ];

  /** The nearest flower head to a screen point, generous enough to forgive a slightly-off pinch. */
  const flowerNear = (cx: number, cy: number): string | null => {
    if (!within(stageRef.current, cx, cy, 24)) return null;
    const [sx, sy] = toSvg(cx, cy);
    let best: string | null = null;
    let bestD = Infinity;
    const fs = flowersRef.current;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      const d = Math.hypot(f.x - sx, f.y - sy) / (HEAD * f.scale * 1.4);
      if (d < 1 && d < bestD - 0.15) {
        best = f.id;
        bestD = d;
      }
    }
    return best;
  };

  const onHand = useRef<(f: HandFrame) => void>(() => {});
  onHand.current = (frame: HandFrame) => {
    const h = hand.current;
    const cursor = cursorRef.current;
    drawSkeleton(canvasRef.current, frame);
    const { hands, time } = frame;

    /* -- nobody there -- */
    if (hands.length === 0) {
      // Hands gone mid-stretch: wrap it up right away (keeping the set count).
      if (h.stretch && ++h.notLFrames >= 3) endStretch();
      if (!h.lostAt) h.lostAt = time;
      if (time - h.lostAt > 450) {
        cursor?.classList.add("is-lost");
        if (held.current?.source === "hand") release(h.x, h.y);
        endStretch();
        h.fx.reset();
        h.fy.reset();
        h.trail = [];
        h.primary = null;
        h.rollInit = false;
        h.pinching = false;
        clearDwell();
        setStatus("searching");
      }
      return;
    }
    h.lostAt = 0;

    /* -- two hands in an L: stretch to change petals -- */
    const bothL = hands.length === 2 && hands[0].isL && hands[1].isL && !held.current;
    h.lFrames = bothL ? h.lFrames + 1 : 0;
    h.notLFrames = bothL ? 0 : h.notLFrames + 1;
    if (!h.stretch && h.lFrames >= 4) startStretch(hands, time);
    if (h.stretch) {
      if (h.notLFrames >= 5 || hands.length < 2) endStretch();
      else {
        // Only count while both hands are clearly in an L. As soon as either
        // starts to relax (closing a fist, dropping a hand), the count freezes.
        if (bothL) updateStretch(hands, time);
        cursor?.classList.add("is-lost");
        setStatus("stretching");
        return;
      }
    }

    /* -- one pointing hand: the one nearest where the cursor was -- */
    let p = hands[0];
    if (hands.length > 1 && h.primary) {
      const dist = (q: typeof p) => Math.hypot(q.px - h.primary!.px, q.py - h.primary!.py);
      p = dist(hands[1]) < dist(hands[0]) ? hands[1] : hands[0];
    }
    h.primary = { px: p.px, py: p.py };
    cursor?.classList.remove("is-lost");

    const [tx, ty] = toScreen(p.px, p.py);
    h.x = h.fx.filter(tx, time);
    h.y = h.fy.filter(ty, time);
    h.trail.push({ t: time, x: h.x, y: h.y });
    while (h.trail.length && time - h.trail[0].t > 400) h.trail.shift();
    if (!h.rollInit) {
      h.roll = p.roll;
      h.rollInit = true;
    } else h.roll += angleDelta(p.roll, h.roll) * 0.4;

    // Pinch: quick to catch (one clear frame or two near ones), slow to let go
    // (three open frames), so flowers don't slip out of your fingers mid-drag.
    const r = p.pinchRatio;
    const was = h.pinching;
    if (!h.pinching) {
      if (r < 0.28 || (r < 0.4 && h.prevRatio < 0.4)) {
        h.pinching = true;
        h.releaseFrames = 0;
      }
    } else {
      h.releaseFrames = r > 0.55 ? h.releaseFrames + 1 : 0;
      if (h.releaseFrames >= 3) h.pinching = false;
    }
    h.prevRatio = r;
    const pinchStart = h.pinching && !was;
    const pinchEnd = !h.pinching && was;

    if (pinchStart) {
      // Fingers drift a little while closing — aim with where the hand was just before.
      const before = h.trail.find((s) => time - s.t <= 140) ?? { x: h.x, y: h.y };
      const ax = before.x;
      const ay = before.y;
      const el = document.elementFromPoint(ax, ay);
      const dwellEl = el?.closest("[data-dwell]") as HTMLElement | null;
      const bench = document.querySelector("[data-workbench]");
      if (dwellEl) {
        dwellEl.click();
        h.dwellFired = true;
      } else if (within(bench, ax, ay, 18)) startNew(h.x, h.y, h.roll, "hand");
      else {
        const id = flowerNear(ax, ay);
        if (id) startMove(id, h.x, h.y, h.roll, "hand");
        else if (within(stageRef.current, ax, ay)) setSelectedId(null);
      }
    }

    if (held.current?.source === "hand") {
      if (pinchEnd) release(h.x, h.y);
      else moveHeld(h.x, h.y, h.roll);
    }

    // Hover-to-choose for buttons and swatches.
    const holding = !!held.current;
    const dwellEl = holding || h.pinching ? null : ((document.elementFromPoint(h.x, h.y)?.closest("[data-dwell]") as HTMLElement | null) ?? null);
    if (!holding && !h.pinching) {
      if (dwellEl !== h.dwellEl) {
        h.dwellEl?.classList.remove("is-hand-hover");
        h.dwellEl = dwellEl;
        h.dwellStart = time;
        h.dwellFired = false;
        dwellEl?.classList.add("is-hand-hover");
      } else if (dwellEl && !h.dwellFired && time - h.dwellStart > DWELL_MS) {
        dwellEl.click();
        h.dwellFired = true;
      }
    } else if (holding) clearDwell();
    const progress = h.dwellEl && !h.dwellFired ? Math.min(1, (time - h.dwellStart) / DWELL_MS) : 0;

    if (cursor) {
      cursor.style.transform = `translate3d(${h.x}px, ${h.y}px, 0)`;
      cursor.dataset.state = holding ? "hold" : h.pinching ? "pinch" : "point";
      cursor.style.setProperty("--dwell", String(progress));
    }
    setStatus(holding ? "holding" : h.pinching ? "pinching" : hands.length === 2 ? "twohands" : "pointing");
  };

  /* -- the two-hand stretch -- */

  const stretchRef = useRef<HTMLDivElement>(null);
  const [stretch, setStretch] = useState<{ key: string; petals: number; bump: number; set: boolean } | null>(null);

  const lPoints = (hands: HandFrame["hands"]) => {
    const [a, b] = [toScreen(hands[0].lx, hands[0].ly), toScreen(hands[1].lx, hands[1].ly)];
    return a[0] <= b[0] ? [a, b] : [b, a];
  };

  const SETTLE_MS = 450;

  function startStretch(hands: HandFrame["hands"], time: number) {
    const [[ax, ay], [bx, by]] = lPoints(hands);
    const key = selectedRef.current ?? "draft";
    const p0 = petalsOf(key);
    hand.current.stretch = { key, d0: Math.abs(bx - ax), p0, ax, ay, bx, by, n: p0, settled: p0, lastChange: time };
    clearDwell();
    setStretch({ key, petals: p0, bump: 0, set: true });
    placeStretch(ax, ay, bx, by);
  }

  function updateStretch(hands: HandFrame["hands"], time: number) {
    const s = hand.current.stretch;
    if (!s) return;
    const [[ax, ay], [bx, by]] = lPoints(hands);
    // Light easing on the endpoints so the ribbon between your hands glides.
    s.ax += (ax - s.ax) * 0.5;
    s.ay += (ay - s.ay) * 0.5;
    s.bx += (bx - s.bx) * 0.5;
    s.by += (by - s.by) * 0.5;
    placeStretch(s.ax, s.ay, s.bx, s.by);

    // Horizontal distance only: lowering your hands doesn't change the count.
    const d = Math.abs(s.bx - s.ax);
    const step = Math.max(40, window.innerWidth / 20);
    const wanted = s.p0 + (d - s.d0) / step;
    // Dead zone: move most of a step past the current number before it changes,
    // so it never flickers between two values.
    if (Math.abs(wanted - s.n) > 0.8) {
      const n = Math.max(MIN_PETALS, Math.min(MAX_PETALS, Math.round(wanted)));
      if (n !== s.n) {
        s.n = n;
        s.lastChange = time;
        setPetalsOf(s.key, n);
        setStretch((st) => (st ? { ...st, petals: n, bump: st.bump + 1, set: false } : st));
        return;
      }
    }
    // Held steady long enough → this is the number we keep.
    if (s.settled !== s.n && time - s.lastChange >= SETTLE_MS) {
      s.settled = s.n;
      setStretch((st) => (st ? { ...st, set: true } : st));
    }
  }

  function endStretch() {
    const h = hand.current;
    const s = h.stretch;
    if (!s) return;
    // Anything that changed while the hands were leaving (not held steady) is undone.
    if (s.n !== s.settled) setPetalsOf(s.key, s.settled);
    if (s.settled !== s.p0) flash(`${s.settled} petals — set`);
    h.stretch = null;
    h.lFrames = 0;
    h.fx.reset();
    h.fy.reset();
    h.trail = [];
    setStretch(null);
  }

  function placeStretch(ax: number, ay: number, bx: number, by: number) {
    const el = stretchRef.current;
    if (!el) return;
    el.style.setProperty("--ax", `${ax}px`);
    el.style.setProperty("--ay", `${ay}px`);
    el.style.setProperty("--len", `${Math.hypot(bx - ax, by - ay)}px`);
    el.style.setProperty("--ang", `${Math.atan2(by - ay, bx - ax)}rad`);
    el.style.setProperty("--mx", `${(ax + bx) / 2}px`);
    el.style.setProperty("--my", `${(ay + by) / 2}px`);
    el.style.setProperty("--bx", `${bx}px`);
    el.style.setProperty("--by", `${by}px`);
  }

  const clearDwell = () => {
    const h = hand.current;
    h.dwellEl?.classList.remove("is-hand-hover");
    h.dwellEl = null;
    h.dwellFired = false;
  };

  // Dev-only: lets us replay synthetic hand frames when no webcam is available.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __posyHand?: (f: HandFrame) => void }).__posyHand = (f) => onHand.current(f);
  }, []);

  const startHands = useCallback(async () => {
    setMode("hands");
    setStatus("loading");
    if (!videoRef.current) return;
    const { HandTracker } = await import("@/lib/hands/tracker");
    trackerRef.current?.stop();
    const t = new HandTracker(videoRef.current, (f) => onHand.current(f));
    trackerRef.current = t;
    try {
      await t.start();
      setStatus("searching");
    } catch (err) {
      t.stop();
      trackerRef.current = null;
      setMode("touch");
      setStatus("off");
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      flash(denied ? "No camera access — that's fine, you can arrange with your mouse or finger." : "The camera couldn't start, so we've switched to touch.");
    }
  }, [flash]);

  const stopHands = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    if (held.current?.source === "hand") release(hand.current.x, hand.current.y);
    clearDwell();
    setMode("touch");
    setStatus("off");
  }, [release]);

  useEffect(() => () => trackerRef.current?.stop(), []);

  // The camera runs only while arranging: paused while writing, resumed when back.
  useEffect(() => {
    if (step !== "make" && trackerRef.current) {
      trackerRef.current.stop();
      trackerRef.current = null;
      setStatus("off");
    }
    if (step === "make" && mode === "hands" && !trackerRef.current) startHands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const begin = (m: Mode) => {
    setMode(m);
    setStep("make");
  };

  /* ---------------- sending ---------------- */

  const send = async (): Promise<string | null> => {
    const res = await fetch("/api/bouquets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ composition: { version: 1, flowers }, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) return data.error ?? "Something went wrong while wrapping your flowers. Please try again.";
    setShareId(data.id);
    setStep("sent");
    store.clear();
    return null;
  };

  const startOver = () => {
    setFlowers([]);
    setNote({ to: "", message: "", from: "" });
    setSelectedId(null);
    setShareId(null);
    setDraft(freshDraft());
    store.clear();
    setStep("make");
  };

  /* ---------------- render ---------------- */

  const renderFlowers = useMemo(
    () => (heldNew && heldInside ? [...flowers, heldNew] : flowers),
    [flowers, heldNew, heldInside],
  );
  const selected = flowers.find((f) => f.id === selectedId) ?? null;
  const ringPath = useMemo(() => sketchRing(HEAD * 1.32, mulberry32(selected?.seed ?? 3)), [selected?.seed]);
  const ghostSize = HEAD * 2.6 * svgScale() * (heldNew?.scale ?? 1) * 1.1;

  if (step === "intro") {
    return <Intro onBegin={begin} />;
  }
  if (step === "write") {
    return <WriteStep flowers={flowers} note={note} onChange={setNote} onBack={() => setStep("make")} onSend={send} />;
  }
  if (step === "sent" && shareId) {
    return <SentStep id={shareId} flowers={flowers} to={note.to} onAgain={startOver} />;
  }

  const editingLabel = selected ? "Selected flower" : "Next flower";

  return (
    <div className={`studio mode-${mode}${heldNew || liftedId ? " is-holding" : ""}`}>
      <header className="studio-top">
        <Link href="/" className="studio-home" aria-label="posy home">
          <Wordmark />
        </Link>
        <ol className="steps" aria-label="Progress">
          <li className="is-current">Arrange</li>
          <li>Write</li>
          <li>Send</li>
        </ol>
        <button
          className="btn btn--primary btn--small"
          data-dwell
          disabled={flowers.length === 0}
          onClick={() => {
            setSelectedId(null);
            setStep("write");
          }}
        >
          Finish bouquet
        </button>
      </header>

      <main className="studio-body">
        <div className="stage" ref={stageRef} onPointerDown={onStagePointerDown} onWheel={onWheel}>
          <Bouquet
            ref={svgRef}
            flowers={renderFlowers}
            interactive
            liftedId={liftedId}
            settle={settle}
            className="stage-bouquet"
            texture={false}
            overlay={
              selected && !liftedId ? (
                <g transform={`translate(${selected.x} ${selected.y})`} className="sel">
                  <g style={{ transform: `scale(${selected.scale})` }}>
                    <path d={ringPath} className="sel-ring" />
                    <g
                      data-rotate
                      className="sel-rotate"
                      transform={`rotate(${selected.rotation}) translate(0 ${-HEAD * 1.32})`}
                    >
                      <circle r={13} className="sel-rotate-hit" />
                      <circle r={6} className="sel-rotate-dot" />
                    </g>
                  </g>
                </g>
              ) : null
            }
          />
          {flowers.length === 0 && !heldNew && (
            <p className="stage-hint">
              {mode === "hands" ? "Pinch a flower from the bench and carry it into the wrap." : "Drag a flower from the bench into the wrap to begin."}
            </p>
          )}
          <div ref={binRef} className={`bin${liftedId ? " is-visible" : ""}${binHot ? " is-hot" : ""}`} aria-hidden>
            <svg viewBox="0 0 40 40" width="26" height="26">
              <path d="M9 12 L31 12 M15 12 L16 7 L24 7 L25 12 M11 12 L13.5 33 L26.5 33 L29 12 M17 17 L18 28 M23 17 L22 28" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Drop here to remove</span>
          </div>
          <p className="stage-count">
            {flowers.length} {flowers.length === 1 ? "flower" : "flowers"}
          </p>
        </div>

        <aside className="bench" aria-label="Flower controls">
          <div className="bench-head">
            <span className="label">{editingLabel}</span>
            {selected && (
              <button className="link-btn" data-dwell onClick={() => setSelectedId(null)}>
                Done
              </button>
            )}
          </div>

          <div
            className={`bench-flower${selected ? " is-dim" : ""}`}
            data-workbench
            onPointerDown={onBenchPointerDown}
            role="button"
            aria-label="Pick up this flower and drag it into the bouquet"
          >
            <svg viewBox="-70 -70 140 140" className="bench-svg">
              <g style={{ transform: `scale(${(selected ?? draft).scale})` }} className="bench-art">
                <FlowerArt kind={(selected ?? draft).kind} color={(selected ?? draft).color} petals={(selected ?? draft).petals} seed={(selected ?? draft).seed} />
              </g>
            </svg>
            <span className="bench-cap">{selected ? "Changes apply to the selected flower" : mode === "hands" ? "Pinch to pick up" : "Drag to add"}</span>
          </div>

          <section className="ctrl">
            <h3 className="label">Flower</h3>
            <div className="kinds">
              {KIND_KEYS.map((k) => (
                <button
                  key={k}
                  data-dwell
                  className={`kind${target.kind === k ? " is-on" : ""}`}
                  onClick={() => setKind(k)}
                  aria-pressed={target.kind === k}
                  title={KINDS[k].name}
                >
                  <svg viewBox="-56 -56 112 112" aria-hidden>
                    <FlowerArt kind={k} color={target.color} petals={KINDS[k].petals} seed={42} still />
                  </svg>
                  <span>{KINDS[k].name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="ctrl">
            <h3 className="label">
              Colour <span className="label-value">{COLORS[target.color].name}</span>
            </h3>
            <div className="swatches">
              {COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  data-dwell
                  className={`swatch${target.color === c ? " is-on" : ""}`}
                  style={{ "--c": COLORS[c].fill } as React.CSSProperties}
                  onClick={() => setColor(c)}
                  aria-label={COLORS[c].name}
                  aria-pressed={target.color === c}
                />
              ))}
            </div>
          </section>

          <section className="ctrl">
            <h3 className="label">Petals</h3>
            <div className="petals">
              <button className="round-btn" data-dwell onClick={() => nudgePetals(-1)} disabled={target.petals <= MIN_PETALS} aria-label="Fewer petals">
                −
              </button>
              <span className="petals-n" aria-live="polite">{target.petals}</span>
              <button className="round-btn" data-dwell onClick={() => nudgePetals(1)} disabled={target.petals >= MAX_PETALS} aria-label="More petals">
                +
              </button>
            </div>
            {mode === "hands" && <p className="tip">Or make an L with both hands and stretch them apart.</p>}
          </section>

          {selected && (
            <section className="ctrl ctrl--selected">
              <h3 className="label">Turn</h3>
              <div className="petals">
                <button className="round-btn" data-dwell onClick={() => rotateSelected(-20)} aria-label="Turn left">
                  ↺
                </button>
                <button className="round-btn" data-dwell onClick={() => rotateSelected(20)} aria-label="Turn right">
                  ↻
                </button>
                <button className="link-btn link-btn--quiet" data-dwell onClick={() => removeFlower(selected.id)}>
                  Remove flower
                </button>
              </div>
            </section>
          )}
        </aside>
      </main>

      <CameraChip
        mode={mode}
        status={handStatus}
        videoRef={videoRef}
        canvasRef={canvasRef}
        onEnable={startHands}
        onDisable={stopHands}
      />

      {mode === "hands" && (
        <div ref={cursorRef} className="hand-cursor is-lost" data-state="point" aria-hidden>
          <svg viewBox="-30 -30 60 60" width="60" height="60">
            <circle r="20" className="hc-dwell" pathLength={1} />
            <path d="M-15 1 C-15 -9 -7 -16 2 -15 C11 -14 16 -6 15 3 C14 11 6 16 -2 15 C-10 14 -15 8 -14 0" className="hc-ring" />
            <circle r="4" className="hc-dot" />
          </svg>
          <span className="hc-label" />
        </div>
      )}

      {(
        <div ref={stretchRef} className={`stretch${stretch ? " is-on" : ""}`} aria-hidden>
          <div className="stretch-line" />
          <span className="stretch-end stretch-end--a" />
          <span className="stretch-end stretch-end--b" />
          {stretch && <StretchBloom flower={stretch.key === "draft" ? draft : flowers.find((f) => f.id === stretch.key) ?? draft} bump={stretch.bump} set={stretch.set} />}
        </div>
      )}

      {heldNew && !heldInside && (
        <div ref={ghostRef} className="ghost" aria-hidden style={{ transform: `translate(${ghostPos.current[0]}px, ${ghostPos.current[1]}px)` }}>
          <svg viewBox="-70 -70 140 140" width={ghostSize} height={ghostSize} style={{ transform: `rotate(${heldNew.rotation}deg)` }}>
            <FlowerArt kind={heldNew.kind} color={heldNew.color} petals={heldNew.petals} seed={heldNew.seed} />
          </svg>
        </div>
      )}

      <div className={`toast${toast ? " is-on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function drawSkeleton(canvas: HTMLCanvasElement | null, frame: HandFrame) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const hand of frame.hands) {
    const lm = hand.landmarks;
    const X = (i: number) => (1 - lm[i].x) * w;
    const Y = (i: number) => lm[i].y * h;
    ctx.strokeStyle = hand.isL ? "rgba(224,166,168,0.95)" : "rgba(251,246,236,0.9)";
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
    }
    ctx.stroke();
    ctx.fillStyle = hand.pinchRatio < 0.4 ? "#e0a6a8" : "#f6dc8f";
    for (const i of [4, 8]) {
      ctx.beginPath();
      ctx.arc(X(i), Y(i), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The flower shown between your hands while stretching; it hops on every change. */
function StretchBloom({ flower, bump, set }: { flower: Pick<Flower, "kind" | "color" | "petals" | "seed">; bump: number; set: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bump && ref.current?.animate) {
      ref.current.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.12) rotate(-6deg)" }, { transform: "scale(1)" }],
        { duration: 380, easing: "cubic-bezier(.34,1.4,.5,1)" },
      );
    }
  }, [bump]);
  return (
    <div className={`stretch-center${set ? " is-set" : ""}`}>
      <div ref={ref} className="stretch-flower">
        <svg viewBox="-80 -80 160 160">
          <FlowerArt kind={flower.kind} color={flower.color} petals={flower.petals} seed={flower.seed} />
        </svg>
      </div>
      <div className="stretch-count">
        <svg className="stretch-ring" viewBox="0 0 44 44" aria-hidden key={bump}>
          <circle cx="22" cy="22" r="19" pathLength={1} />
        </svg>
        <p className="stretch-n">
          {flower.petals}
          <span>petals</span>
        </p>
      </div>
      <p className="stretch-hint">{set ? "Set ✓  Drop your hands to keep it" : "Hold still to set"}</p>
    </div>
  );
}
