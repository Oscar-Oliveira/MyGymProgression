// Weekly challenge: one goal per week (Monday to Sunday), made from the recent workouts. Pure functions; storage is in src/data.
import { entryMetrics, mondayOf, muscleDistribution } from './analysis';
import type { Challenge, ChallengeKind, Workout } from './types';

/** Weeks of history used to set a target. */
export const HISTORY_WEEKS = 4;
/** Muscles a challenge (or a game) can name; the general groups are left out. */
export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hamstrings', 'glutes', 'calves', 'adductors'];

const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Monday of the week of `d`, as a local date YYYY-MM-DD. */
export function weekKey(d: Date): string {
  const m = mondayOf(d);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}

const weekStart = (week: string) => {
  const [y, m, d] = week.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Finished workouts started in [from, to). */
const between = (workouts: Workout[], from: Date, to: Date) =>
  workouts.filter((w) => w.status !== 'in_progress' && new Date(w.startedAt) >= from && new Date(w.startedAt) < to);

const sets = (ws: Workout[]) => ws.reduce((a, w) => a + w.entries.reduce((b, e) => b + entryMetrics(e).doneWorkingSets, 0), 0);
const topLoad = (ws: Workout[], exerciseId: string) => Math.max(0, ...ws.flatMap((w) => w.entries.filter((e) => e.exerciseId === exerciseId).map((e) => entryMetrics(e).topLoad ?? 0)));

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/**
 * The challenge of a week, from the workouts of the 4 weeks before it. The kind changes from week to week.
 * - workouts: one more workout than the weekly average (2 to 7).
 * - sets: 10 % more working sets than the weekly average (at least 10).
 * - record: beat the top load of the exercise with load done most often.
 * - muscle: 2 more sets than the weekly average for the least trained muscle (at least 4). Only sets where it is a primary muscle count.
 * Without recent workouts, only "workouts" is possible.
 */
export function createChallenge(week: string, workouts: Workout[], id: string, now: string): Challenge {
  const start = weekStart(week);
  const recent = between(workouts, addDays(start, -7 * HISTORY_WEEKS), start);
  const options: Omit<Challenge, 'id' | 'week' | 'status' | 'createdAt'>[] = [
    { kind: 'workouts', target: Math.min(7, Math.max(2, Math.round(recent.length / HISTORY_WEEKS) + 1)) },
  ];
  if (recent.length) {
    options.push({ kind: 'sets', target: Math.max(10, Math.round((sets(recent) / HISTORY_WEEKS) * 1.1)) });
    const counts = new Map<string, { n: number; name: string; perSide: boolean }>();
    for (const e of recent.flatMap((w) => w.entries)) {
      if (!entryMetrics(e).topLoad) continue;
      const c = counts.get(e.exerciseId);
      counts.set(e.exerciseId, { n: (c?.n ?? 0) + 1, name: e.exercise.name, perSide: e.exercise.loadMode === 'perSide' });
    }
    const [best] = [...counts].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
    if (best) {
      const target = topLoad(between(workouts, new Date(0), start), best[0]);
      options.push({ kind: 'record', target, exerciseId: best[0], exerciseName: best[1].name, ...(best[1].perSide ? { perSide: true } : {}) });
    }
    const [weak] = Object.entries(muscleDistribution(recent, 0))
      .filter(([m, v]) => MUSCLES.includes(m) && v > 0)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (weak) options.push({ kind: 'muscle', target: Math.max(4, Math.ceil(weak[1] / HISTORY_WEEKS) + 2), muscle: weak[0] });
  }
  return { id, week, status: 'open', createdAt: now, ...options[hash(week) % options.length] };
}

/** Progress in the week of the challenge. `value` uses the unit of `target` (kg for a record, which must be beaten). */
export function challengeProgress(ch: Challenge, workouts: Workout[]): { value: number; met: boolean } {
  const start = weekStart(ch.week);
  const ws = between(workouts, start, addDays(start, 7));
  const value: Record<ChallengeKind, () => number> = {
    workouts: () => ws.length,
    sets: () => sets(ws),
    record: () => topLoad(ws, ch.exerciseId ?? ''),
    muscle: () => muscleDistribution(ws, 0)[ch.muscle ?? ''] ?? 0,
  };
  const v = value[ch.kind]();
  return { value: v, met: ch.kind === 'record' ? v > ch.target : v >= ch.target };
}

/** Open challenges of past weeks are closed: done when the workouts show it, else missed. Returns only the changed ones. */
export function settleChallenges(challenges: Challenge[], workouts: Workout[], current: string, now: string): Challenge[] {
  return challenges
    .filter((c) => c.status === 'open' && c.week < current)
    .map((c) => (challengeProgress(c, workouts).met ? { ...c, status: 'done', doneAt: now } : { ...c, status: 'missed' }));
}
