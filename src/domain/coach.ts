// Personal trainer: one motivating message when a workout starts (D20), and on other pages (D35).
import type { CoachSettings, ProgressionEvent, Settings, Workout } from './types';

/** Pages where the trainer can speak outside the workout (D35). */
export type CoachPlace = 'home' | 'done' | 'analysis' | 'history';
export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface CoachContext {
  /** Finished workouts this month. */
  month: number;
  /** Days since the last finished workout (only when 2 or more). */
  days?: number;
  /** The latest increase, already formatted. */
  increase?: { exercise: string; from: string; to: string };
  /** Increases applied this month. */
  ups?: number;
  /** All finished workouts. */
  total?: number;
  /** Name of the next workout (Home). */
  day?: string;
  /** Working sets done in the workout (summary). */
  sets?: number;
  /** New records in the workout (summary). */
  records?: number;
}

/** The trainer, when it is on and may also speak outside the workout (default: yes). */
export function coachOnPages(s: Settings): CoachSettings | undefined {
  return s.coach?.enabled && s.coach.pages !== false ? s.coach : undefined;
}

/** Morning 05:00–11:59, afternoon 12:00–19:59, evening otherwise. */
export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 20 ? 'afternoon' : 'evening';
}

/** Key of the message list: the spite style has a version with swear words. */
export function coachKey(coach: Pick<CoachSettings, 'style' | 'profanity'>): CoachSettings['style'] | 'spiteProfane' {
  return coach.style === 'spite' && coach.profanity ? 'spiteProfane' : coach.style;
}

/** Same seed, same message: the message does not change while the workout is open. */
function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Whether the trainer speaks after step `seed` is done: always, never, or about 4 in 10 (the same each time for a seed). */
export function speaksAfterStep(when: CoachSettings['when'], seed: string): boolean {
  if (when === 'each') return true;
  if (when === 'start') return false;
  return hash(`after:${seed}`) % 10 < 4;
}

/** Picks a message of the style; messages whose data is missing are left out. */
export function coachMessage(bank: Record<string, string[]>, coach: Pick<CoachSettings, 'style' | 'profanity'>, ctx: CoachContext, seed: string): string {
  const list = bank[coachKey(coach)] ?? [];
  const count = (n?: number) => (n ? String(n) : undefined);
  const values: Record<string, string | undefined> = {
    month: count(ctx.month),
    days: ctx.days !== undefined ? String(ctx.days) : undefined,
    exercise: ctx.increase?.exercise,
    from: ctx.increase?.from,
    to: ctx.increase?.to,
    ups: count(ctx.ups),
    total: count(ctx.total),
    day: ctx.day,
    sets: count(ctx.sets),
    records: count(ctx.records),
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
  const applied = events.filter((e) => e.decision === 'applied').sort((a, b) => (a.decidedAt ?? a.createdAt).localeCompare(b.decidedAt ?? b.createdAt));
  const latest = applied[applied.length - 1];
  const ups = applied.filter((e) => {
    const d = new Date(e.decidedAt ?? e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  return { month, days: gap !== undefined && gap >= 2 ? gap : undefined, increase: latest ? format(latest) : undefined, ups, total: finished.length };
}
