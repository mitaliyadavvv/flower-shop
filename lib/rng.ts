/** Small, fast seeded PRNG so every flower draws the same way everywhere. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const between = (r: Rng, min: number, max: number) => min + r() * (max - min);
export const wiggle = (r: Rng, amount: number) => (r() - 0.5) * 2 * amount;
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
