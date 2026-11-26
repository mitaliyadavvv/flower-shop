/**
 * Turns a photo-booth frame into a little polaroid: cream border, the photo,
 * and a handwritten-feeling caption underneath.
 */

export const PHOTO_W = 1000;
export const PHOTO_H = 1150;
const CARD_W = 1080;
const CARD_H = 1350;
const PAD = 40;

const INK = "#3b302a";
const INK_SOFT = "#9d8e83";
const PAPER = "#fdf9f2";

function cssFont(variable: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

function tinyFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.62, r * 0.4, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f7cdc7";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "#f6dc8f";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export interface Polaroid {
  blob: Blob;
  dataUrl: string;
  url: string;
}

/** Compose the polaroid and encode it as a JPEG small enough to store (≈ under 650k base64 chars). */
export async function composePolaroid(photo: HTMLCanvasElement, caption = "a bouquet, made just for me"): Promise<Polaroid> {
  const serif = cssFont("--font-serif", "Georgia, serif");
  const sans = cssFont("--font-sans", "system-ui, sans-serif");
  try {
    await Promise.all([document.fonts.load(`italic 300 46px ${serif}`), document.fonts.load(`24px ${sans}`)]);
  } catch {}

  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.drawImage(photo, PAD, PAD, CARD_W - PAD * 2, PHOTO_H * ((CARD_W - PAD * 2) / PHOTO_W));
  ctx.strokeStyle = "rgba(59,48,42,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD, PAD, CARD_W - PAD * 2, PHOTO_H * ((CARD_W - PAD * 2) / PHOTO_W));

  const base = PAD + PHOTO_H * ((CARD_W - PAD * 2) / PHOTO_W);
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.font = `italic 300 46px ${serif}`;
  ctx.fillText(caption, PAD + 8, base + 74);

  ctx.font = `22px ${sans}`;
  ctx.fillStyle = INK_SOFT;
  const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  ctx.fillText(date.toUpperCase(), PAD + 10, base + 116);

  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = `italic 400 40px ${serif}`;
  ctx.fillText("posy", CARD_W - PAD - 8, base + 74);
  const w = ctx.measureText("posy").width;
  tinyFlower(ctx, CARD_W - PAD - 8 - w - 24, base + 62, 13);

  let quality = 0.86;
  let dataUrl = c.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 650_000 && quality > 0.5) {
    quality -= 0.08;
    dataUrl = c.toDataURL("image/jpeg", quality);
  }
  const blob = await (await fetch(dataUrl)).blob();
  return { blob, dataUrl, url: URL.createObjectURL(blob) };
}
