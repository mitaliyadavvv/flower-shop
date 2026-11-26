/** One Euro filter — smooths jitter when the hand is still, stays responsive when it moves. */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(private minCutoff = 1.4, private beta = 0.012, private dCutoff = 1) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset() {
    this.x = null;
  }
  filter(value: number, timeMs: number) {
    if (this.x === null) {
      this.x = value;
      this.t = timeMs;
      return value;
    }
    const dt = Math.max(1e-3, (timeMs - this.t) / 1000);
    this.t = timeMs;
    const dxRaw = (value - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
