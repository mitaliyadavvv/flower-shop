"use client";

import { CSSProperties, memo, useEffect, useMemo, useRef } from "react";
import { COLORS, Flower, HEAD, INK, headGeometry, KindKey, ColorKey } from "@/lib/flowers";
import { mulberry32 } from "@/lib/rng";

interface HeadProps {
  kind: KindKey;
  color: ColorKey;
  petals: number;
  seed: number;
  /** Disable the gentle petal breathing (e.g. tiny icons). */
  still?: boolean;
}

/** Just the illustrated head, centred on 0,0. Used everywhere a flower is drawn. */
export const FlowerArt = memo(function FlowerArt({ kind, color, petals, seed, still }: HeadProps) {
  const g = useMemo(() => headGeometry(kind, petals, seed, color), [kind, petals, seed, color]);
  const fill = COLORS[color].fill;
  return (
    <g className={still ? "fa fa--still" : "fa"}>
      {g.petals.map((p, i) => (
        <g key={i} className="petal" style={{ transform: `translate(0px, ${p.oy ?? 0}px) rotate(${p.angle}deg)` }}>
          <g className="petal-in" style={{ "--pd": `${(i % 7) * 0.4}s` } as CSSProperties}>
            <path d={p.d} fill={fill} transform="translate(1.6 -1.2)" />
            <path d={p.d} fill="none" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        </g>
      ))}
      {g.stamens.map((d, i) => (
        <path key={`s${i}`} d={d} fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
      ))}
      {g.center && <path d={g.center} fill={g.centerFill} transform="translate(1.2 -0.8)" />}
      {g.center && <path d={g.center} fill="none" stroke={INK} strokeWidth={1.4} />}
      {g.dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={INK} />
      ))}
    </g>
  );
});

interface FlowerHeadProps {
  flower: Flower;
  lifted?: boolean;
  interactive?: boolean;
  /** Increments when the flower is dropped, to play a little settle. */
  settleKey?: number;
  order?: number;
  animateIn?: boolean;
}

/** A positioned, swaying head inside the bouquet. */
export const FlowerHead = memo(function FlowerHead({
  flower,
  lifted,
  interactive,
  settleKey,
  order = 0,
  animateIn = true,
}: FlowerHeadProps) {
  const bloomRef = useRef<SVGGElement>(null);
  const sway = useMemo(() => {
    const r = mulberry32(flower.seed + 5);
    return { "--sd": `${5 + r() * 3.5}s`, "--sdl": `${-r() * 6}s`, "--o": order } as CSSProperties;
  }, [flower.seed, order]);

  useEffect(() => {
    if (!settleKey || !bloomRef.current?.animate) return;
    bloomRef.current.animate(
      [
        { transform: "scale(1.1) rotate(-4deg)" },
        { transform: "scale(0.96) rotate(2deg)", offset: 0.45 },
        { transform: "scale(1.01) rotate(-0.5deg)", offset: 0.75 },
        { transform: "scale(1) rotate(0deg)" },
      ],
      { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)" },
    );
  }, [settleKey]);

  const s = flower.scale * (lifted ? 1.1 : 1);
  return (
    <g
      transform={`translate(${flower.x} ${flower.y})`}
      data-flower-id={interactive ? flower.id : undefined}
      className={`fh${lifted ? " fh--lifted" : ""}${animateIn ? "" : " fh--static"}`}
      style={sway}
    >
      <g className="fh-sway">
        <g className="fh-turn" style={{ transform: `rotate(${flower.rotation}deg) scale(${s})` }}>
          <g ref={bloomRef} className="fh-bloom">
            <FlowerArt kind={flower.kind} color={flower.color} petals={flower.petals} seed={flower.seed} />
          </g>
        </g>
      </g>
      {interactive && <circle r={HEAD * flower.scale * 1.12} className="fh-hit" />}
    </g>
  );
});
