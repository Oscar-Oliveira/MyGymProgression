// Year in review share image (D74): a 1080 × 1920 PNG (story size) drawn on a canvas, in the look of the workout card (D44).
import { fit } from './shareCard';

export interface YearCardData {
  year: number;
  title: string;
  /** Six big numbers with their labels, two per row. */
  stats: { value: string; label: string }[];
  /** Up to three lines: a label and a value (favourite exercise, biggest rise, top muscle). */
  lines: { label: string; value: string }[];
  /** Tone colour (CSS colour). */
  tone: string;
  footer: string;
}

const W = 1080;
const H = 1920;
const PAD = 80;

export async function drawYearCard(d: YearCardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = (size: number, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const box = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 36);
    ctx.fill();
  };

  // Background: dark, with soft glows of the tone colour.
  ctx.fillStyle = '#0b0c12';
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [
    [W, 0, 1300, 0.7],
    [0, H, 1000, 0.3],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, d.tone);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;

  // Header: the year, very large, and the title.
  ctx.fillStyle = '#fff';
  ctx.font = font(300, 900);
  ctx.letterSpacing = '-12px';
  ctx.fillText(String(d.year), PAD - 10, PAD + 270);
  ctx.letterSpacing = '0px';
  ctx.font = font(64, 800);
  ctx.fillText(fit(ctx, d.title, W - 2 * PAD), PAD, PAD + 380);

  // Stats: two columns.
  const gap = 32;
  const tw = (W - 2 * PAD - gap) / 2;
  const th = 210;
  let y = PAD + 470;
  d.stats.slice(0, 6).forEach((s, i) => {
    const x = PAD + (i % 2) * (tw + gap);
    const ty = y + Math.floor(i / 2) * (th + gap);
    box(x, ty, tw, th);
    ctx.fillStyle = '#fff';
    ctx.font = font(96, 850);
    ctx.fillText(fit(ctx, s.value, tw - 64), x + 40, ty + 115);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = font(36, 600);
    ctx.fillText(fit(ctx, s.label, tw - 64), x + 40, ty + 170);
  });
  y += 3 * (th + gap) + 16;

  // Lines: label above the value.
  for (const l of d.lines.slice(0, 3)) {
    box(PAD, y, W - 2 * PAD, 150);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = font(32, 650);
    ctx.fillText(fit(ctx, l.label.toUpperCase(), W - 2 * PAD - 80), PAD + 40, y + 56);
    ctx.fillStyle = '#fff';
    ctx.font = font(48, 800);
    ctx.fillText(fit(ctx, l.value, W - 2 * PAD - 80), PAD + 40, y + 116);
    y += 150 + 20;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = font(32, 700);
  ctx.textAlign = 'center';
  ctx.fillText(d.footer, W / 2, H - PAD + 10);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
