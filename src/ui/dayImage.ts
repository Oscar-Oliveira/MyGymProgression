// A plan day as an image (D84): every exercise with its sets and today's targets, for another person to follow.
import type { TFunction } from 'i18next';
import type { ColorKey, Plan, PlanDay, WorkoutEntry } from '../domain/types';
import { toneOf } from './colors';
import { setGroups } from './planText';
import { fit, shareImage, wrap } from './shareCard';

export type DayImageRow = { circuit: string } | { n: number; name: string; sets: string[]; inCircuit: boolean };

/** Rows of the image: a header for each circuit, then each exercise with one line per group of equal sets. */
export function dayImageRows(entries: WorkoutEntry[], t: TFunction, lang: string): DayImageRow[] {
  const rows: DayImageRow[] = [];
  let circuit: string | undefined;
  entries.forEach((e, i) => {
    if (e.circuit && e.circuit.id !== circuit) rows.push({ circuit: `${t('circuit.label')} · ${e.circuit.name} · ${t('circuit.roundsCount', { count: e.circuit.rounds })}` });
    circuit = e.circuit?.id;
    const sets = setGroups(e.prescription, e.exercise.metrics, lang).map((g) => (g.kind === 'working' ? `${g.n} × ${g.text}` : `${t(`setKind.${g.kind}`)}: ${g.n} × ${g.text}`));
    rows.push({ n: i + 1, name: e.exercise.name, sets, inCircuit: !!e.circuit });
  });
  return rows;
}

const W = 1080;
const PAD = 72;
const NAME = 52;
const LINE = 40;
const GAP = 30;
const CIRCUIT = 72;

const rowHeight = (r: DayImageRow) => ('circuit' in r ? CIRCUIT : NAME + r.sets.length * LINE + GAP);

async function drawDayImage(title: string, subtitle: string, meta: string, rows: DayImageRow[], tone: string): Promise<Blob | null> {
  const head = PAD + 24 + 2 * 86 + 70;
  const H = Math.max(1080, head + 40 + rows.reduce((a, r) => a + rowHeight(r), 0) + 100);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = (size: number, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const dot = (x: number, y: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Background: the same as the workout card (D44).
  ctx.fillStyle = '#0b0c12';
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [
    [W, 0, 950, 0.6],
    [0, H, 750, 0.25],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, tone);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;

  // Header: plan and weekday, the day name (up to 2 lines), the size.
  let y = PAD + 24;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = font(24, 750);
  ctx.letterSpacing = '3px';
  ctx.fillText(fit(ctx, subtitle.toUpperCase(), W - 2 * PAD), PAD, y);
  ctx.fillStyle = '#fff';
  ctx.font = font(76, 850);
  ctx.letterSpacing = '-2px';
  for (const line of wrap(ctx, title, W - 2 * PAD, 2)) {
    y += 86;
    ctx.fillText(line, PAD, y);
  }
  ctx.letterSpacing = '0px';
  y += 56;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(30, 650);
  ctx.fillText(fit(ctx, meta, W - 2 * PAD), PAD, y);
  y += 60;

  // Rows: circuit headers in the tone; exercises with a numbered badge, the name and the sets below it.
  const r = 26;
  const tx = PAD + 2 * r + 24;
  for (const row of rows) {
    if ('circuit' in row) {
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.roundRect(PAD, y + 12, W - 2 * PAD, 48, 24);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = font(26, 800);
      ctx.fillText(fit(ctx, row.circuit.toUpperCase(), W - 2 * PAD - 48), PAD + 24, y + 46);
      y += CIRCUIT;
      continue;
    }
    const h = rowHeight(row);
    if (row.inCircuit) {
      ctx.fillStyle = tone;
      ctx.fillRect(PAD + r - 3, y, 6, h);
    }
    dot(PAD + r, y + 30, r, tone);
    ctx.fillStyle = '#fff';
    ctx.font = font(26, 850);
    ctx.textAlign = 'center';
    ctx.fillText(String(row.n), PAD + r, y + 39);
    ctx.textAlign = 'left';
    ctx.font = font(36, 750);
    ctx.fillText(fit(ctx, row.name, W - PAD - tx), tx, y + 42);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = font(30, 600);
    row.sets.forEach((line, i) => ctx.fillText(fit(ctx, line, W - PAD - tx), tx, y + NAME + (i + 1) * LINE - 6));
    y += h;
  }

  // Footer: a tone dot and the app name.
  dot(PAD + 9, H - PAD + 2, 9, tone);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(28, 750);
  ctx.fillText('MyGymProgression', PAD + 30, H - PAD + 12);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** CSS colour of a tone key (the variable of the page), violet when there is none. */
function toneColor(key?: ColorKey): string {
  return (key && getComputedStyle(document.documentElement).getPropertyValue(`--c-${key}`).trim()) || '#5b4cf5';
}

/** Draws the day (`entries`: the workout it would start now) and shares the image (phone) or downloads it. */
export async function shareDayImage(plan: Plan, day: PlanDay, entries: WorkoutEntry[], t: TFunction, lang: string): Promise<void> {
  const weekdays = t('weekday', { returnObjects: true }) as string[];
  const subtitle = [plan.name, day.weekday !== undefined && weekdays[day.weekday]].filter(Boolean).join(' · ');
  const sets = entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);
  const blob = await drawDayImage(day.name, subtitle, t('home.size', { count: entries.length, sets }), dayImageRows(entries, t, lang), toneColor(toneOf(plan, day)));
  if (blob) await shareImage(blob, `mygymprogression-${day.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`);
}
