// Personal trainer functions beyond messages: live reactions (D45), the rival (D49) and the week report (D46). Pure functions.
import { entryMetrics, mondayOf, muscleDistribution } from './analysis';
import { challengeProgress, MUSCLES, weekKey } from './challenge';
import { toCanonical } from './units';
import type { Challenge, CoachReport, ProgressionEvent, SetRecord, Workout, WorkoutEntry } from './types';

const DAY = 86_400_000;
const finished = (w: Workout) => w.status !== 'in_progress';

/** What a done set beat, compared with the same working set of last time (D45). */
export type Beat = { kind: 'load'; from: number; to: number } | { kind: 'reps'; from: number; to: number } | { kind: 'duration'; from: number; to: number };

/**
 * Compares the n-th done working set with the n-th done working set of last time (same exercise).
 * More load (with at least the minimum reps of the range, when there is one), or more reps at the same load,
 * or a longer set for exercises without load and reps.
 */
export function beatsLastTime(entry: WorkoutEntry, set: SetRecord, previous?: WorkoutEntry): Beat | undefined {
  if (set.kind !== 'working' || set.status !== 'done' || !previous || previous.exerciseId !== entry.exerciseId) return undefined;
  const n = entry.sets.filter((s) => s.kind === 'working' && s.status === 'done').indexOf(set);
  const before = previous.sets.filter((s) => s.kind === 'working' && s.status === 'done')[n];
  if (n < 0 || !before) return undefined;
  const v = set.values;
  const p = before.values;
  if (v.load !== undefined && p.load !== undefined) {
    const min = entry.prescription.find((x) => x.kind === 'working')?.targets.reps?.min ?? 1;
    if (v.load > p.load && (v.reps === undefined || v.reps >= min)) return { kind: 'load', from: p.load, to: v.load };
    if (v.load === p.load && v.reps !== undefined && p.reps !== undefined && v.reps > p.reps) return { kind: 'reps', from: p.reps, to: v.reps };
    return undefined;
  }
  if (v.reps !== undefined && p.reps !== undefined) return v.reps > p.reps ? { kind: 'reps', from: p.reps, to: v.reps } : undefined;
  if (v.duration !== undefined && p.duration !== undefined && v.duration > p.duration) return { kind: 'duration', from: p.duration, to: v.duration };
  return undefined;
}

/** Rival window: about 3 months before (75–105 days, the nearest to 90). */
export const RIVAL_DAYS = { min: 75, target: 90, max: 105, fallback: 28 };

/**
 * "You of 3 months ago" (D49): the finished workout of the same plan day nearest to 90 days before, within 75–105 days;
 * else the oldest one at least 28 days before. Free workouts have no rival.
 */
export function rivalWorkout(current: Workout, workouts: Workout[]): Workout | undefined {
  if (!current.planId || !current.dayId) return undefined;
  const at = Date.parse(current.startedAt);
  const same = workouts
    .filter((w) => w.id !== current.id && finished(w) && w.planId === current.planId && w.dayId === current.dayId)
    .map((w) => ({ w, days: (at - Date.parse(w.startedAt)) / DAY }))
    .filter((x) => x.days >= RIVAL_DAYS.fallback);
  const near = same.filter((x) => x.days >= RIVAL_DAYS.min && x.days <= RIVAL_DAYS.max).sort((a, b) => Math.abs(a.days - RIVAL_DAYS.target) - Math.abs(b.days - RIVAL_DAYS.target));
  return (near[0] ?? same.sort((a, b) => b.days - a.days)[0])?.w;
}

export interface RivalRow {
  exerciseId: string;
  name: string;
  /** Which number is compared: top set load (kg), total reps, longest set (s) or distance (m). */
  metric: 'topLoad' | 'totalReps' | 'maxDuration' | 'totalDistance';
  now: number;
  then: number;
  result: 'won' | 'lost' | 'tie';
}

/** Compares each exercise done in both workouts on its main number. */
export function rivalRows(current: Workout, rival: Workout): RivalRow[] {
  const rows: RivalRow[] = [];
  for (const e of current.entries) {
    const r = rival.entries.find((x) => x.exerciseId === e.exerciseId);
    if (!r) continue;
    const a = entryMetrics(e);
    const b = entryMetrics(r);
    const metric = (['topLoad', 'totalReps', 'maxDuration', 'totalDistance'] as const).find((k) => a[k] !== undefined && b[k] !== undefined);
    if (!metric) continue;
    const now = a[metric]!;
    const then = b[metric]!;
    rows.push({ exerciseId: e.exerciseId, name: e.exercise.name, metric, now, then, result: now > then + 1e-9 ? 'won' : now < then - 1e-9 ? 'lost' : 'tie' });
  }
  return rows;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inRange = (iso: string, from: Date, to: Date) => {
  const t = Date.parse(iso);
  return t >= from.getTime() && t < to.getTime();
};

/** The week report is made on Sundays (D46): the week of Sunday `now`, else undefined. */
export function reportWeek(now: Date): string | undefined {
  return now.getDay() === 0 ? weekKey(now) : undefined;
}

/**
 * The trainer's report of the week of `now` (Monday to Sunday), as of `now`.
 * best: heaviest done working set (total kg). weak: the main muscle with the fewest sets this week, among the muscles
 * trained in the 4 weeks before.
 */
export function weekReport(now: Date, workouts: Workout[], events: ProgressionEvent[], challenge: Challenge | undefined, id: string): CoachReport {
  const start = mondayOf(now);
  const end = addDays(start, 7);
  const week = workouts.filter((w) => finished(w) && inRange(w.startedAt, start, end));
  let sets = 0;
  let best: CoachReport['best'];
  for (const e of week.flatMap((w) => w.entries)) {
    sets += entryMetrics(e).doneWorkingSets;
    const lu = e.exercise.metrics.find((m) => m.key === 'load')?.unit;
    if (!lu) continue;
    const side = e.exercise.loadMode === 'perSide' ? 2 : 1;
    for (const s of e.sets.filter((x) => x.kind === 'working' && x.status === 'done' && x.values.load !== undefined)) {
      const kg = toCanonical(s.values.load!, lu) * side;
      if (!best || kg > best.load) best = { exerciseName: e.exercise.name, load: kg, ...(s.values.reps !== undefined ? { reps: s.values.reps } : {}) };
    }
  }
  const ups = events.filter((e) => (e.decision === 'applied' || e.decision === 'reps_up') && inRange(e.decidedAt ?? e.createdAt, start, end)).length;
  const before = workouts.filter((w) => finished(w) && inRange(w.startedAt, addDays(start, -28), start));
  const trained = Object.keys(muscleDistribution(before, 0)).filter((m) => MUSCLES.includes(m));
  const now7 = muscleDistribution(week, 0);
  const [weak] = trained.sort((a, b) => (now7[a] ?? 0) - (now7[b] ?? 0) || a.localeCompare(b));
  return {
    id,
    week: weekKey(now),
    workouts: week.length,
    sets,
    ...(best ? { best } : {}),
    ups,
    ...(weak ? { weak } : {}),
    // The week is not over yet: the challenge is done or still open.
    ...(challenge ? { challenge: challenge.status === 'done' || challengeProgress(challenge, workouts).met ? 'done' : 'open' } : {}),
    createdAt: now.toISOString(),
  };
}
