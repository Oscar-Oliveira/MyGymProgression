// Analysis functions. All values are derived from recorded sets.
// Canonical units: load kg, duration s, distance m, speed km/h.
import type { MetricKey, Outcome, ProgressionStrategy, Workout, WorkoutEntry } from './types';
import { hasMetric, toCanonical } from './units';

export const E1RM_MAX_REPS = 12;
export const SECONDARY_MUSCLE_WEIGHT = 0.5;
const PROGRESSIVE: ProgressionStrategy[] = ['double', 'duration', 'distance', 'intensity', 'multi'];
const NO_PROGRESS: Outcome[] = ['keep', 'missed'];

/** Epley estimate: load × (1 + reps / 30). Only for 1–12 reps. This is an estimate, not a measured maximum. */
export function e1rm(load: number, reps: number): number | undefined {
  if (reps < 1 || reps > E1RM_MAX_REPS || load <= 0) return undefined;
  return reps === 1 ? load : load * (1 + reps / 30);
}

export interface EntryMetrics {
  prescribedWorkingSets: number;
  doneWorkingSets: number;
  /** done / prescribed, capped at 1. 1 when nothing was prescribed. */
  completionRate: number;
  totalReps?: number;
  maxReps?: number;
  /** Heaviest working-set load, canonical kg, total (per-side × 2). */
  topLoad?: number;
  /** Σ(load × reps) over working sets, kg. Only for exercises that record load and reps. */
  volume?: number;
  bestE1rm?: number;
  totalDuration?: number;
  maxDuration?: number;
  totalDistance?: number;
  avgSpeed?: number;
  avgIncline?: number;
  /** Seconds per km. */
  pace?: number;
}

function unitOf(entry: WorkoutEntry, key: MetricKey): string {
  return entry.exercise.metrics.find((m) => m.key === key)?.unit ?? '';
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);
const sum = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) : undefined);

export function entryMetrics(entry: WorkoutEntry): EntryMetrics {
  const working = entry.sets.filter((s) => s.kind === 'working' && s.status === 'done');
  const prescribed = entry.prescription.filter((s) => s.kind === 'working').length;
  const m: EntryMetrics = {
    prescribedWorkingSets: prescribed,
    doneWorkingSets: working.length,
    completionRate: prescribed ? Math.min(1, working.length / prescribed) : 1,
  };
  if (!working.length) return m;
  const metrics = entry.exercise.metrics;
  const sideFactor = entry.exercise.loadMode === 'perSide' ? 2 : 1;
  const vals = (key: MetricKey, canonical = true) =>
    working.map((s) => s.values[key]).filter((v): v is number => v !== undefined).map((v) => (canonical ? toCanonical(v, unitOf(entry, key)) : v));

  if (hasMetric(metrics, 'reps')) {
    const reps = vals('reps', false);
    m.totalReps = sum(reps);
    m.maxReps = max(reps);
  }
  if (hasMetric(metrics, 'load')) {
    const loads = vals('load').map((v) => v * sideFactor);
    m.topLoad = max(loads);
    if (hasMetric(metrics, 'reps')) {
      const lu = unitOf(entry, 'load');
      let volume = 0;
      const est: number[] = [];
      for (const s of working) {
        const l = s.values.load;
        const r = s.values.reps;
        if (l === undefined || r === undefined) continue;
        const kg = toCanonical(l, lu) * sideFactor;
        volume += kg * r;
        const e = e1rm(kg, r);
        if (e !== undefined) est.push(e);
      }
      m.volume = volume;
      m.bestE1rm = max(est);
    }
  }
  if (hasMetric(metrics, 'duration')) {
    const d = vals('duration');
    m.totalDuration = sum(d);
    m.maxDuration = max(d);
  }
  if (hasMetric(metrics, 'distance')) m.totalDistance = sum(vals('distance'));
  if (hasMetric(metrics, 'speed')) m.avgSpeed = avg(vals('speed'));
  if (hasMetric(metrics, 'incline')) m.avgIncline = avg(vals('incline'));
  if (m.totalDuration && m.totalDistance) m.pace = m.totalDuration / (m.totalDistance / 1000);
  return m;
}

export interface HistoryPoint {
  workoutId: string;
  entryId: string;
  date: string;
  entry: WorkoutEntry;
  metrics: EntryMetrics;
}

const isFinished = (w: Workout) => w.status !== 'in_progress';
const byDate = (a: { startedAt: string }, b: { startedAt: string }) => a.startedAt.localeCompare(b.startedAt);

/** Chronological history for one exercise, from finished workouts. */
export function exerciseHistory(workouts: Workout[], exerciseId: string): HistoryPoint[] {
  return workouts
    .filter(isFinished)
    .sort(byDate)
    .flatMap((w) =>
      w.entries.filter((e) => e.exerciseId === exerciseId).map((e) => ({ workoutId: w.id, entryId: e.id, date: w.startedAt, entry: e, metrics: entryMetrics(e) })),
    );
}

export interface PersonalRecords {
  topLoad?: number;
  bestE1rm?: number;
  maxVolume?: number;
  maxReps?: number;
  maxDuration?: number;
  maxDistance?: number;
  bestPace?: number;
}

export function personalRecords(history: HistoryPoint[]): PersonalRecords {
  const pick = (f: (m: EntryMetrics) => number | undefined) => max(history.map((h) => f(h.metrics)).filter((v): v is number => v !== undefined));
  const paces = history.map((h) => h.metrics.pace).filter((v): v is number => v !== undefined);
  return {
    topLoad: pick((m) => m.topLoad),
    bestE1rm: pick((m) => m.bestE1rm),
    maxVolume: pick((m) => m.volume),
    maxReps: pick((m) => m.maxReps),
    maxDuration: pick((m) => m.maxDuration),
    maxDistance: pick((m) => m.totalDistance),
    bestPace: paces.length ? Math.min(...paces) : undefined,
  };
}

export type RecordKind = 'topLoad' | 'bestE1rm' | 'maxReps' | 'maxDuration' | 'maxDistance';

export interface RecordHit {
  exerciseId: string;
  name: string;
  kind: RecordKind;
  /** Canonical units (kg, s, m). */
  value: number;
  previous: number;
}

/**
 * New personal records of a workout, compared with the earlier finished workouts.
 * An exercise done for the first time sets no record. Reps count only for exercises without load.
 * The estimated 1RM is shown only when the top load is not also a record (same cause).
 */
export function workoutRecords(workout: Workout, earlier: Workout[]): RecordHit[] {
  const before = earlier.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt);
  const out: RecordHit[] = [];
  const seen = new Set<string>();
  for (const e of workout.entries) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    const prev = personalRecords(exerciseHistory(before, e.exerciseId));
    // The workout counts as finished here, so a summary can be computed before the status is saved.
    const now = personalRecords(exerciseHistory([{ ...workout, status: 'completed' }], e.exerciseId));
    const hit = (kind: RecordKind, a?: number, b?: number) => {
      if (a === undefined || b === undefined || a <= b) return false;
      out.push({ exerciseId: e.exerciseId, name: e.exercise.name, kind, value: a, previous: b });
      return true;
    };
    const load = hasMetric(e.exercise.metrics, 'load');
    const loadUp = hit('topLoad', now.topLoad, prev.topLoad);
    if (!loadUp) hit('bestE1rm', now.bestE1rm, prev.bestE1rm);
    if (!load) hit('maxReps', now.maxReps, prev.maxReps);
    hit('maxDuration', now.maxDuration, prev.maxDuration);
    hit('maxDistance', now.maxDistance, prev.maxDistance);
  }
  return out;
}

export interface WorkoutFilter {
  from?: string;
  to?: string;
  planId?: string;
  exerciseId?: string;
}

/** Local date YYYY-MM-DD of a timestamp (the day the user sees, not the UTC day). */
export const localDay = (iso: string | Date) => new Date(iso).toLocaleDateString('sv');

/** Filters finished workouts by local date. With an exercise filter, only that exercise's entries are kept. */
export function filterWorkouts(workouts: Workout[], f: WorkoutFilter): Workout[] {
  const out = workouts.filter(
    (w) =>
      isFinished(w) &&
      (!f.from || localDay(w.startedAt) >= f.from) &&
      (!f.to || localDay(w.startedAt) <= f.to) &&
      (!f.planId || w.planId === f.planId) &&
      (!f.exerciseId || w.entries.some((e) => e.exerciseId === f.exerciseId)),
  );
  return f.exerciseId ? out.map((w) => ({ ...w, entries: w.entries.filter((e) => e.exerciseId === f.exerciseId) })) : out;
}

/** Completed working sets per muscle. A primary muscle counts 1, a secondary muscle counts 0.5. */
export function muscleDistribution(workouts: Workout[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of workouts.filter(isFinished)) {
    for (const e of w.entries) {
      const n = entryMetrics(e).doneWorkingSets;
      for (const m of e.exercise.primaryMuscles) out[m] = (out[m] ?? 0) + n;
      for (const m of e.exercise.secondaryMuscles) out[m] = (out[m] ?? 0) + n * SECONDARY_MUSCLE_WEIGHT;
    }
  }
  return out;
}

export interface CompletionStat {
  exerciseId: string;
  name: string;
  strategy: ProgressionStrategy;
  sessions: number;
  prescribed: number;
  done: number;
  rate: number;
}

/** Completion rate per exercise = completed prescribed working sets / prescribed working sets. */
export function completionByExercise(workouts: Workout[]): CompletionStat[] {
  const map = new Map<string, CompletionStat>();
  for (const w of workouts.filter(isFinished)) {
    for (const e of w.entries) {
      const m = entryMetrics(e);
      const s = map.get(e.exerciseId) ?? { exerciseId: e.exerciseId, name: e.exercise.name, strategy: e.progression.strategy, sessions: 0, prescribed: 0, done: 0, rate: 1 };
      s.sessions++;
      s.prescribed += m.prescribedWorkingSets;
      s.done += Math.min(m.doneWorkingSets, m.prescribedWorkingSets);
      s.rate = s.prescribed ? s.done / s.prescribed : 1;
      map.set(e.exerciseId, s);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface StalledItem {
  lineageId: string;
  exerciseId: string;
  name: string;
  sessions: number;
}

/**
 * An item is stalled when its last `threshold` evaluated sessions all had outcome
 * "keep" (no rep progress) or "missed". Only progression-enabled strategies are checked,
 * so fixed (none) and manual exercises are never flagged.
 */
export function stalledItems(workouts: Workout[], threshold: number): StalledItem[] {
  const byLineage = new Map<string, WorkoutEntry[]>();
  for (const w of workouts.filter(isFinished).sort(byDate)) {
    for (const e of w.entries) {
      if (!e.lineageId || !e.evaluation || !PROGRESSIVE.includes(e.evaluation.strategy)) continue;
      byLineage.set(e.lineageId, [...(byLineage.get(e.lineageId) ?? []), e]);
    }
  }
  const out: StalledItem[] = [];
  for (const [lineageId, entries] of byLineage) {
    const last = entries.slice(-threshold);
    if (last.length < threshold) continue;
    if (last.every((e) => NO_PROGRESS.includes(e.evaluation!.outcome))) {
      const e = last[last.length - 1];
      out.push({ lineageId, exerciseId: e.exerciseId, name: e.exercise.name, sessions: last.length });
    }
  }
  return out;
}

export interface PeriodSummary {
  workouts: number;
  workingSets: number;
  volume: number;
  duration: number;
  distance: number;
  completionRate: number;
}

export function periodSummary(workouts: Workout[]): PeriodSummary {
  let workingSets = 0;
  let volume = 0;
  let duration = 0;
  let distance = 0;
  let prescribed = 0;
  let done = 0;
  const finished = workouts.filter(isFinished);
  for (const w of finished) {
    for (const e of w.entries) {
      const m = entryMetrics(e);
      workingSets += m.doneWorkingSets;
      volume += m.volume ?? 0;
      duration += m.totalDuration ?? 0;
      distance += m.totalDistance ?? 0;
      prescribed += m.prescribedWorkingSets;
      done += Math.min(m.doneWorkingSets, m.prescribedWorkingSets);
    }
  }
  return { workouts: finished.length, workingSets, volume, duration, distance, completionRate: prescribed ? done / prescribed : 1 };
}

/**
 * Adherence = finished workouts of a plan / planned sessions.
 * Planned sessions = number of plan days × number of weeks in the period (rounded up).
 */
export function adherence(finishedCount: number, daysPerWeek: number, from: string, to: string): number | undefined {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!(days > 0) || daysPerWeek <= 0) return undefined;
  const planned = Math.ceil(days / 7) * daysPerWeek;
  return finishedCount / planned;
}

/** Local midnight of the Monday of the week of `d`. */
export function mondayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** Weeks (Monday first) from the week of `from` to the week of `to`, each with its workouts, oldest first. */
export function workoutsByWeek(workouts: Workout[], from: Date, to: Date): { start: Date; workouts: Workout[] }[] {
  const weeks: { start: Date; workouts: Workout[] }[] = [];
  for (let d = mondayOf(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) weeks.push({ start: d, workouts: [] });
  for (const w of workouts) {
    const start = mondayOf(new Date(w.startedAt)).getTime();
    weeks.find((x) => x.start.getTime() === start)?.workouts.push(w);
  }
  for (const x of weeks) x.workouts.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return weeks;
}

/** Number of weeks from `from` to `to` (both days included), at least 1. Used for averages per week. */
export function weeksIn(from: string, to: string): number {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  return Math.max(1, days / 7);
}

/** The period of the same length just before [from, from + days − 1], as ISO dates. */
export function previousPeriod(from: string, days: number): { from: string; to: string } {
  const start = Date.parse(`${from}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start - days * 86400000), to: iso(start - 86400000) };
}

/**
 * Completed working sets per muscle per week (primary 1, secondary 0.5), in the period [from, to].
 * A common guideline for hypertrophy is about 10–20 sets per muscle per week.
 */
export function muscleSetsPerWeek(workouts: Workout[], from: string, to: string): Record<string, number> {
  const weeks = weeksIn(from, to);
  return Object.fromEntries(Object.entries(muscleDistribution(workouts)).map(([m, v]) => [m, v / weeks]));
}

export const MUSCLE_SETS_GUIDE = { min: 10, max: 20 };
