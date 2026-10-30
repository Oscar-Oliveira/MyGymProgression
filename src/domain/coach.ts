// Personal trainer: one motivating message when a workout starts (D20).
import type { CoachSettings, ProgressionEvent, Workout } from './types';

export interface CoachContext {
  /** Finished workouts this month. */
  month: number;
  /** Days since the last finished workout (only when 2 or more). */
  days?: number;
  /** The latest increase, already formatted. */
  increase?: { exercise: string; from: string; to: string };
}

/** Same seed, same message: the message does not change while the workout is open. */
function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Picks a message of the style; messages whose data is missing are left out. */
export function coachMessage(bank: Record<string, string[]>, coach: Pick<CoachSettings, 'style' | 'profanity'>, ctx: CoachContext, seed: string): string {
  const list = bank[coach.style === 'spite' && coach.profanity ? 'spiteProfane' : coach.style] ?? [];
  const values: Record<string, string | undefined> = {
    month: ctx.month > 0 ? String(ctx.month) : undefined,
    days: ctx.days !== undefined ? String(ctx.days) : undefined,
    exercise: ctx.increase?.exercise,
    from: ctx.increase?.from,
    to: ctx.increase?.to,
  };
  const usable = list.filter((m) => [...m.matchAll(/\{\{(\w+)\}\}/g)].every(([, k]) => values[k] !== undefined));
  if (!usable.length) return '';
  return usable[hash(seed) % usable.length].replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k]!);
}

/** Context from finished workouts and progression events, as of `now`. */
export function coachContext(workouts: Workout[], events: ProgressionEvent[], now: Date, format: (ev: ProgressionEvent) => CoachContext['increase']): CoachContext {
  const finished = workouts.filter((w) => w.status !== 'in_progress');
  const month = finished.filter((w) => {
    const d = new Date(w.startedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const last = finished.map((w) => w.startedAt).sort().pop();
  const gap = last ? Math.floor((now.getTime() - new Date(last).getTime()) / 86_400_000) : undefined;
  const latest = events
    .filter((e) => e.decision === 'applied')
    .sort((a, b) => (a.decidedAt ?? a.createdAt).localeCompare(b.decidedAt ?? b.createdAt))
    .pop();
  return { month, days: gap !== undefined && gap >= 2 ? gap : undefined, increase: latest ? format(latest) : undefined };
}
