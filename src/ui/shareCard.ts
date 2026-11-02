// Workout share card (D44): a PNG image drawn on a canvas, given through the share menu (phone) or downloaded.
export interface ShareCardData {
  title: string;
  subtitle: string;
  /** Three big numbers with their labels. */
  stats: { value: string; label: string }[];
  /** One line per exercise: name and sets. The card shows as many as fit. */
  lines: { name: string; value: string }[];
  linesTitle: string;
  /** "+ 3 more", for the lines that do not fit. */
  more: (count: number) => string;
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
const ROW = 84;
const COACH = 150;

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
  const card = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 32);
    ctx.fill();
  };
  const dot = (x: number, y: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const caps = (text: string, x: number, y: number) => {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = font(24, 750);
    ctx.letterSpacing = '3px';
    ctx.fillText(fit(ctx, text.toUpperCase(), W - PAD - x), x, y);
    ctx.letterSpacing = '0px';
  };

  // Background: dark, with two soft glows of the tone colour.
  ctx.fillStyle = '#0b0c12';
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [
    [W, 0, 950, 0.6],
    [0, H, 750, 0.25],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, d.tone);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;

  // Header: date and plan, then the day name (up to 2 lines).
  let y = PAD + 24;
  caps(d.subtitle, PAD, y);
  ctx.fillStyle = '#fff';
  ctx.font = font(76, 850);
  ctx.letterSpacing = '-2px';
  for (const line of wrap(ctx, d.title, W - 2 * PAD, 2)) {
    y += 86;
    ctx.fillText(line, PAD, y);
  }
  ctx.letterSpacing = '0px';
  y += 44;

  // Stats: one panel, three columns.
  card(PAD, y, W - 2 * PAD, 156, 'rgba(255,255,255,0.08)');
  const cw = (W - 2 * PAD) / 3;
  ctx.textAlign = 'center';
  d.stats.slice(0, 3).forEach((st, i) => {
    const x = PAD + i * cw;
    if (i) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y + 32, 2, 92);
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(64, 850);
    ctx.fillText(fit(ctx, st.value, cw - 40), x + cw / 2, y + 86);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = font(22, 700);
    ctx.fillText(fit(ctx, st.label.toUpperCase(), cw - 40), x + cw / 2, y + 126);
  });
  ctx.textAlign = 'left';
  y += 156 + 64;

  // From the bottom up: footer, trainer, records. The exercises take the space that stays.
  let bottom = H - PAD - 44;
  const coachTop = d.coach?.text ? (bottom -= COACH) : 0;
  if (coachTop) bottom -= 24;
  const recordsH = d.records.length ? 76 + d.records.length * 50 : 0;
  const recordsTop = recordsH ? (bottom -= recordsH) : 0;
  if (recordsTop) bottom -= 24;

  // Exercises: a numbered badge, the name and the sets below it. Two columns when one is not enough.
  caps(d.linesTitle, PAD, y);
  y += 16;
  const rows = Math.max(1, Math.floor((bottom - y) / ROW));
  const cols = d.lines.length > rows ? 2 : 1;
  const room = rows * cols;
  const shown = d.lines.length > room ? d.lines.slice(0, room - 1) : d.lines;
  const colW = (W - 2 * PAD - (cols - 1) * 32) / cols;
  const r = cols > 1 ? 22 : 26;
  const cell = (i: number) => ({ x: PAD + Math.floor(i / rows) * (colW + 32), top: y + (i % rows) * ROW });
  shown.forEach((l, i) => {
    const { x, top } = cell(i);
    const tx = x + 2 * r + 24;
    if (i % rows) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(tx, top, x + colW - tx, 2);
    }
    dot(x + r, top + ROW / 2, r, d.tone);
    ctx.fillStyle = '#fff';
    ctx.font = font(cols > 1 ? 22 : 26, 850);
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + r, top + ROW / 2 + 8);
    ctx.textAlign = 'left';
    ctx.font = font(cols > 1 ? 30 : 34, 750);
    ctx.fillText(fit(ctx, l.name, x + colW - tx), tx, top + 38);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = font(cols > 1 ? 24 : 28, 600);
    ctx.fillText(fit(ctx, l.value, x + colW - tx), tx, top + 70);
  });
  if (shown.length < d.lines.length) {
    const { x, top } = cell(shown.length);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = font(28, 650);
    ctx.fillText(d.more(d.lines.length - shown.length), x + 2 * r + 24, top + ROW / 2 + 10);
  }

  // Records: a card tinted with the tone.
  if (recordsTop) {
    ctx.globalAlpha = 0.22;
    card(PAD, recordsTop, W - 2 * PAD, recordsH, d.tone);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = font(32, 850);
    ctx.fillText(`🏆 ${d.recordsTitle}`, PAD + 36, recordsTop + 54);
    ctx.font = font(30, 650);
    d.records.forEach((rec, i) => {
      const ry = recordsTop + 54 + (i + 1) * 50;
      const value = ctx.measureText(rec.value).width;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(fit(ctx, rec.name, W - 2 * PAD - 72 - value - 32), PAD + 36, ry);
      ctx.fillStyle = '#fff';
      ctx.fillText(rec.value, W - PAD - 36 - value, ry);
    });
  }

  // Trainer: the face in a circle and the message.
  if (coachTop) {
    card(PAD, coachTop, W - 2 * PAD, COACH, 'rgba(255,255,255,0.08)');
    const mid = coachTop + COACH / 2;
    const face = d.coach!.svg ? await loadSvg(d.coach!.svg) : undefined;
    const cx = face ? PAD + 160 : PAD + 36;
    if (face) {
      dot(PAD + 86, mid, 56, 'rgba(255,255,255,0.1)');
      ctx.drawImage(face, PAD + 40, mid - 46, 92, 92);
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(30, 650);
    const lines = wrap(ctx, d.coach!.text, W - PAD - cx - 36, 3);
    lines.forEach((line, i) => ctx.fillText(line, cx, mid + 10 + (i - (lines.length - 1) / 2) * 38));
  }

  // Footer: a tone dot and the app name.
  dot(PAD + 9, H - PAD + 2, 9, d.tone);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(28, 750);
  ctx.fillText(d.footer, PAD + 30, H - PAD + 12);

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
