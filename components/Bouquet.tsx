"use client";

import { CSSProperties, ReactNode, forwardRef, memo, useId, useMemo } from "react";
import {
  Flower,
  INK,
  KNOT,
  LEAF,
  PAPER,
  PAPER_BACK,
  RIBBON,
  STEM,
  VIEW_H,
  VIEW_W,
  stemGeometry,
  petalPath,
} from "@/lib/flowers";
import { mulberry32 } from "@/lib/rng";
import { Pt, openPath, wobblyPolygon, blob } from "@/lib/paths";
import { FlowerHead } from "./Flower";

interface BouquetProps {
  flowers: Flower[];
  className?: string;
  /** Plays the bloom-in sequence (recipient view). */
  reveal?: boolean;
  /** Interactive studio mode: heads carry hit-areas and ids. */
  interactive?: boolean;
  liftedId?: string | null;
  settle?: Record<string, number>;
  /** Pencil-wobble filter. Lovely, but costs a little performance. */
  texture?: boolean;
  overlay?: ReactNode;
  title?: string;
}

const Stem = memo(function Stem({ flower, order }: { flower: Flower; order: number }) {
  const g = useMemo(() => stemGeometry(flower), [flower.x, flower.y, flower.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g className="st" style={{ "--o": order } as CSSProperties}>
      <path className="st-line" d={g.stem} pathLength={1} fill="none" stroke={STEM} strokeWidth={2.2} strokeLinecap="round" />
      {g.leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`}>
          <g className="st-leaf">
            <path d={l.d} fill={LEAF} transform="translate(1.4 -1)" />
            <path d={l.d} fill="none" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
            <path d={l.vein} fill="none" stroke={INK} strokeWidth={1} strokeLinecap="round" opacity={0.7} />
          </g>
        </g>
      ))}
    </g>
  );
});

/** The wrapping paper and ribbon — fixed, drawn once. */
const Wrap = memo(function Wrap({ part }: { part: "back" | "front" }) {
  const shapes = useMemo(() => {
    const r = mulberry32(part === "back" ? 41 : 77);
    if (part === "back") {
      return {
        paper: wobblyPolygon(
          [
            [158, 556],
            [232, 528],
            [300, 540],
            [370, 524],
            [444, 552],
            [352, 786],
            [248, 786],
          ],
          r,
          2.2,
        ),
      };
    }
    const paper = wobblyPolygon(
      [
        [192, 598],
        [300, 618],
        [410, 594],
        [342, 794],
        [258, 794],
      ],
      r,
      2.4,
    );
    const creases = [
      openPath([[246, 612], [262, 700], [280, 790]] as Pt[]),
      openPath([[352, 610], [338, 704], [322, 790]] as Pt[]),
    ];
    const hatch: string[] = [];
    for (let i = 0; i < 7; i++) {
      const x = 214 + i * 6 + r() * 2;
      const y = 626 + i * 9;
      hatch.push(openPath([[x, y], [x + 9, y - 5]] as Pt[]));
    }
    const [kx, ky] = KNOT;
    const y = ky + 12;
    const loopL = petalPath("blossom", 34, 46, r);
    const loopR = petalPath("blossom", 34, 46, r);
    const tailL = openPath([[kx - 2, y + 2], [kx - 14, y + 26], [kx - 22, y + 52], [kx - 18, y + 62]] as Pt[]);
    const tailR = openPath([[kx + 2, y + 2], [kx + 12, y + 30], [kx + 26, y + 50], [kx + 30, y + 58]] as Pt[]);
    const knot = blob(kx, y, 7.5, r, 0.12, 7);
    return { paper, creases, hatch, bow: { y, loopL, loopR, tailL, tailR, knot } };
  }, [part]);

  if (part === "back") {
    return (
      <g className="wrap wrap--back">
        <path d={shapes.paper} fill={PAPER_BACK} transform="translate(2 -1.5)" />
        <path d={shapes.paper} fill="none" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    );
  }
  const b = shapes.bow!;
  const [kx] = KNOT;
  return (
    <g className="wrap wrap--front">
      <path d={shapes.paper} fill={PAPER} transform="translate(2 -1.5)" />
      <path d={shapes.paper} fill="none" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      {shapes.creases!.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={INK} strokeWidth={1} opacity={0.45} strokeLinecap="round" />
      ))}
      {shapes.hatch!.map((d, i) => (
        <path key={`h${i}`} d={d} fill="none" stroke={INK} strokeWidth={0.9} opacity={0.35} strokeLinecap="round" />
      ))}
      <g className="bow">
        {[b.tailL, b.tailR].map((d, i) => (
          <path key={i} d={d} fill="none" stroke={RIBBON} strokeWidth={5} strokeLinecap="round" />
        ))}
        {[b.tailL, b.tailR].map((d, i) => (
          <path key={`o${i}`} d={d} fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.8} transform="translate(2.4 0)" />
        ))}
        {[
          { d: b.loopL, a: -72 },
          { d: b.loopR, a: 74 },
        ].map((l, i) => (
          <g key={`l${i}`} transform={`translate(${kx} ${b.y}) rotate(${l.a})`}>
            <path d={l.d} fill={RIBBON} transform="translate(1.4 -1)" />
            <path d={l.d} fill="none" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
          </g>
        ))}
        <path d={b.knot} fill={RIBBON} />
        <path d={b.knot} fill="none" stroke={INK} strokeWidth={1.4} />
      </g>
    </g>
  );
});

export const Bouquet = forwardRef<SVGSVGElement, BouquetProps>(function Bouquet(
  { flowers, className, reveal, interactive, liftedId, settle, texture = true, overlay, title },
  ref,
) {
  const fid = useId().replace(/:/g, "");
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={`bouquet${reveal ? " bouquet--reveal" : ""}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={title ?? `A hand-drawn bouquet of ${flowers.length} flower${flowers.length === 1 ? "" : "s"}`}
    >
      <defs>
        <filter id={`pencil-${fid}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={texture ? `url(#pencil-${fid})` : undefined}>
        <g className="bq-sway">
          <Wrap part="back" />
          <g className="bq-stems">
            {flowers.map((f, i) => (
              <Stem key={f.id} flower={f} order={i} />
            ))}
          </g>
          <Wrap part="front" />
          <g className="bq-heads">
            {flowers.map((f, i) => (
              <FlowerHead
                key={f.id}
                flower={f}
                order={i}
                interactive={interactive}
                lifted={liftedId === f.id}
                settleKey={settle?.[f.id]}
                animateIn={liftedId !== f.id}
              />
            ))}
          </g>
        </g>
      </g>
      {overlay}
    </svg>
  );
});
