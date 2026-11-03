// Year in review (D74): the numbers of one calendar year, from the workout history. Pure functions.
import { achievements, recordsByWorkout, type Achievement } from './achievements';
import { entryMetrics, localDay, muscleSetsPerWeek, weekStreak } from './analysis';
import { MUSCLES } from './challenge';
import type { Workout } from './types';

export interface YearReview {
  year: number;
  workouts: number;
  /** Time from start to end of the workouts, in hours. */
  hours: number;
  /** Σ load × reps of working sets, kg. */
  volume: number;
  sets: number;
  /** Longest run of weeks in a row with a workout, within the year. */
  bestStreak: number;
  /** Exercise done in the most workouts (warm-up exercises left out). */
  topExercise?: { id: string; name: string; sessions: number };
  /** Largest rise of the estimated 1RM (kg) from the first session of the year to the best one. */
  topGain?: { id: string; name: string; from: number; to: number };
  records: number;
  /** Weekday with the most workouts (0 = Monday) and the start hour with the most workouts. */
  weekday?: number;
  hour?: number;
  /** Working sets per muscle per week over the year (to today for the current year). */
  muscles: Record<string, number>;
  /** The main muscle with the most sets. */
  topMuscle?: string;
  medals: Achievement[];
}

const isFinished = (w: Workout) => w.status !== 'in_progress';

/** The value seen most often (the first one on a tie). */
function mostOf<T>(xs: T[]): T | undefined {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best: T | undefined;
  for (const [x, c] of n) if (best === undefined || c > n.get(best)!) best = x;
  return best;
}

/** Years with at least one finished workout, newest first. */
export function reviewYears(workouts: Workout[]): number[] {
  return [...new Set(workouts.filter(isFinished).map((w) => new Date(w.startedAt).getFullYear()))].sort((a, b) => b - a);
}

/** The review of `year` (local time). Records and medals are counted against the whole history before each workout. */
export function yearReview(workouts: Workout[], year: number, now: Date): YearReview {
  const all = workouts.filter(isFinished).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const ws = all.filter((w) => new Date(w.startedAt).getFullYear() === year);
  let hours = 0;
  let volume = 0;
  let sets = 0;
  const sessions = new Map<string, { name: string; n: number; first?: number; best?: number }>();
  for (const w of ws) {
    if (w.endedAt) hours += Math.max(0, Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 3600000;
    for (const e of w.entries) {
      const m = entryMetrics(e);
      volume += m.volume ?? 0;
      sets += m.doneWorkingSets;
      // Warm-up exercises are not a favourite.
      if (!m.doneWorkingSets || e.role === 'warmup' || e.exercise.category === 'warmup') continue;
      const x = sessions.get(e.exerciseId) ?? { name: e.exercise.name, n: 0 };
      x.n++;
      x.name = e.exercise.name;
      if (m.bestE1rm !== undefined) {
        x.first ??= m.bestE1rm;
        x.best = Math.max(x.best ?? 0, m.bestE1rm);
      }
      sessions.set(e.exerciseId, x);
    }
  }
  const list = [...sessions.entries()];
  const top = list.sort((a, b) => b[1].n - a[1].n)[0];
  const gain = list
    .filter(([, x]) => x.first !== undefined && x.best !== undefined && x.best > x.first)
    .sort((a, b) => b[1].best! - b[1].first! - (a[1].best! - a[1].first!))[0];
  const records = recordsByWorkout(all);
  const end = year === now.getFullYear() ? localDay(now) : `${year}-12-31`;
  const muscles = ws.length ? muscleSetsPerWeek(ws, `${year}-01-01`, end) : {};
  const topMuscle = MUSCLES.filter((m) => muscles[m]).sort((a, b) => muscles[b] - muscles[a])[0];
  return {
    year,
    workouts: ws.length,
    hours,
    volume,
    sets,
    bestStreak: weekStreak(ws, now).best,
    topExercise: top && { id: top[0], name: top[1].name, sessions: top[1].n },
    topGain: gain && { id: gain[0], name: gain[1].name, from: gain[1].first!, to: gain[1].best! },
    records: ws.reduce((a, w) => a + (records.get(w.id) ?? 0), 0),
    weekday: mostOf(ws.map((w) => (new Date(w.startedAt).getDay() + 6) % 7)),
    hour: mostOf(ws.map((w) => new Date(w.startedAt).getHours())),
    muscles,
    topMuscle,
    medals: achievements(all).filter((a) => a.earnedAt && new Date(a.earnedAt).getFullYear() === year),
  };
}
