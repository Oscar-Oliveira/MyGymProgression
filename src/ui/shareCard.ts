// Workout share card (D44): a PNG image drawn on a canvas, given through the share menu (phone) or downloaded.
export interface ShareCardData {
  title: string;
  subtitle: string;
  /** Three big numbers with their labels. */
  stats: { value: string; label: string }[];
  /** One line per exercise: name and sets. */
  lines: { name: string; value: string }[];
  /** "+ 3 more". */
  more?: string;
  records: { name: string; value: string }[];
  recordsTitle: string;
  /** Message of the trainer, with its face (SVG markup). */
  coach?: { text: string; svg?: string };
  /** Tone colour (CSS colour). */
  tone: string;
  footer: string;
}

const W = 1080;
const H = 1350;
const PAD = 72;

function loadSvg(svg: string): Promise<HTMLImageElement | undefined> {
  const markup = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

/** Shortens a text with "…" to fit `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Splits a text in lines of at most `max` pixels (at most `lines` lines). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out.length > lines ? [...out.slice(0, lines - 1), fit(ctx, out.slice(lines - 1).join(' '), max)] : out;
}

export async function drawShareCard(d: ShareCardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = (size: number, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  ctx.fillStyle = '#0c0d12';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createLinearGradient(0, 0, W, H * 0.6);
  glow.addColorStop(0, d.tone);
  glow.addColorStop(1, '#0c0d12');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H * 0.6);
  ctx.globalAlpha = 1;

  let y = PAD + 20;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = font(34, 600);
  ctx.fillText(fit(ctx, d.subtitle, W - 2 * PAD), PAD, y);
  y += 84;
  ctx.fillStyle = '#fff';
  ctx.font = font(76, 850);
  ctx.fillText(fit(ctx, d.title, W - 2 * PAD), PAD, y);
  y += 70;

  // Three stat tiles.
  const gap = 24;
  const tw = (W - 2 * PAD - 2 * gap) / 3;
  d.stats.slice(0, 3).forEach((s, i) => {
    const x = PAD + i * (tw + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    ctx.roundRect(x, y, tw, 170, 28);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(64, 850);
    ctx.fillText(fit(ctx, s.value, tw - 48), x + 24, y + 92);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = font(28, 600);
    ctx.fillText(fit(ctx, s.label, tw - 48), x + 24, y + 140);
  });
  y += 230;

  // Exercises.
  ctx.font = font(36, 650);
  for (const l of d.lines) {
    ctx.fillStyle = '#fff';
    const value = ctx.measureText(l.value).width;
    ctx.fillText(fit(ctx, l.name, W - 2 * PAD - value - 32), PAD, y);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(l.value, W - PAD - value, y);
    y += 58;
  }
  if (d.more) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = font(30, 600);
    ctx.fillText(d.more, PAD, y);
    y += 50;
  }

  // Records.
  if (d.records.length) {
    y += 20;
    ctx.fillStyle = d.tone;
    ctx.font = font(38, 800);
    ctx.fillText(`🏆 ${d.recordsTitle}`, PAD, y);
    y += 58;
    ctx.font = font(34, 650);
    for (const r of d.records) {
      ctx.fillStyle = '#fff';
      const value = ctx.measureText(r.value).width;
      ctx.fillText(fit(ctx, r.name, W - 2 * PAD - value - 32), PAD, y);
      ctx.fillText(r.value, W - PAD - value, y);
      y += 54;
    }
  }

  // Trainer at the bottom.
  if (d.coach?.text) {
    const top = H - PAD - 200;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(PAD, top, W - 2 * PAD, 150, 28);
    ctx.fill();
    const face = d.coach.svg ? await loadSvg(d.coach.svg) : undefined;
    const tx = face ? PAD + 140 : PAD + 32;
    if (face) ctx.drawImage(face, PAD + 24, top + 23, 104, 104);
    ctx.fillStyle = '#fff';
    ctx.font = font(32, 650);
    wrap(ctx, d.coach.text, W - PAD - tx - 32, 3).forEach((line, i) => ctx.fillText(line, tx, top + 52 + i * 40));
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = font(28, 600);
  ctx.fillText(d.footer, PAD, H - PAD + 12);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Shares the image (phone) or downloads it. */
export async function shareImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      return await navigator.share({ files: [file] });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
