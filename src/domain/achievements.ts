// Achievements (D73): medals computed from the workout history, in date order. Pure functions; nothing is stored.
import { entryMetrics, mondayOf, personalRecords, recordsAgainst, type PersonalRecords } from './analysis';
import { MUSCLES } from './challenge';
import type { Settings, Workout } from './types';

/** Achievements are on unless turned off in Settings. */
export const achievementsOn = (s: Pick<Settings, 'achievements'>) => s.achievements !== false;

/**
 * workouts: finished workouts. streak: best run of weeks in a row with a workout. session: volume of one workout (kg).
 * total: volume of all workouts (kg). records: new personal records. muscles: most of the 12 muscles worked (primary) in one week.
 * early: a workout started before 07:00. late: a workout started at 22:00 or later.
 */
export type AchievementKind = 'workouts' | 'streak' | 'session' | 'total' | 'records' | 'muscles' | 'early' | 'late';

export const ACHIEVEMENTS: { kind: AchievementKind; target: number }[] = [
  ...[1, 10, 50, 100, 250].map((target) => ({ kind: 'workouts' as const, target })),
  ...[4, 12, 26, 52].map((target) => ({ kind: 'streak' as const, target })),
  ...[5000, 10000].map((target) => ({ kind: 'session' as const, target })),
  ...[100000, 1000000].map((target) => ({ kind: 'total' as const, target })),
  ...[10, 50].map((target) => ({ kind: 'records' as const, target })),
  { kind: 'muscles', target: MUSCLES.length },
  { kind: 'early', target: 1 },
  { kind: 'late', target: 1 },
];

export interface Achievement {
  id: string;
  kind: AchievementKind;
  target: number;
  /** Best value so far (capped at the target). */
  progress: number;
  /** The workout that earned it, and its start. */
  workoutId?: string;
  earnedAt?: string;
}

const isFinished = (w: Workout) => w.status !== 'in_progress';

/** The records of two histories together: the higher value, or the lower pace. */
function merge(a: PersonalRecords, b: PersonalRecords): PersonalRecords {
  const out = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof PersonalRecords, number | undefined][]) {
    if (v === undefined) continue;
    const old = out[k];
    out[k] = old === undefined ? v : k === 'bestPace' ? Math.min(old, v) : Math.max(old, v);
  }
  return out;
}
const DAY_MS = 86400000;

/** Every achievement with its progress and, when earned, the workout that earned it. */
export function achievements(workouts: Workout[]): Achievement[] {
  const done = workouts.filter(isFinished).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const best: Record<AchievementKind, number> = { workouts: 0, streak: 0, session: 0, total: 0, records: 0, muscles: 0, early: 0, late: 0 };
  const list = ACHIEVEMENTS.map((a): Achievement => ({ id: `${a.kind}-${a.target}`, ...a, progress: 0 }));
  const weeks = new Set<number>();
  const muscles = new Map<number, Set<string>>();
  // Records of each exercise so far, kept as the workouts go by (a full recount per workout is too slow).
  const records = new Map<string, PersonalRecords>();
  done.forEach((w, i) => {
    const start = new Date(w.startedAt);
    const week = mondayOf(start).getTime();
    weeks.add(week);
    let run = 0;
    // Local Mondays; a 7-day step can be 1 h off across a clock change, so the week is found again with mondayOf.
    for (let k = week; weeks.has(k); k = mondayOf(new Date(k - DAY_MS)).getTime()) run++;
    const worked = muscles.get(week) ?? new Set<string>();
    muscles.set(week, worked);
    best.records += recordsAgainst(w, (id) => records.get(id) ?? {}).length;
    let volume = 0;
    for (const e of w.entries) {
      const m = entryMetrics(e);
      volume += m.volume ?? 0;
      if (m.doneWorkingSets > 0) e.exercise.primaryMuscles.filter((x) => MUSCLES.includes(x)).forEach((x) => worked.add(x));
      records.set(e.exerciseId, merge(records.get(e.exerciseId) ?? {}, personalRecords([{ workoutId: w.id, entryId: e.id, date: w.startedAt, entry: e, metrics: m }])));
    }
    best.workouts = i + 1;
    best.streak = Math.max(best.streak, run);
    best.session = Math.max(best.session, volume);
    best.total += volume;
    best.muscles = Math.max(best.muscles, worked.size);
    if (start.getHours() < 7) best.early = 1;
    if (start.getHours() >= 22) best.late = 1;
    for (const a of list) {
      if (a.earnedAt || best[a.kind] < a.target) continue;
      a.workoutId = w.id;
      a.earnedAt = w.startedAt;
    }
  });
  for (const a of list) a.progress = Math.min(best[a.kind], a.target);
  return list;
}
