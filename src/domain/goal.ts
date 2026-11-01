// Goals with a projection (D42). Pure functions. Loads in canonical kg (total).
import { e1rm, exerciseHistory, localDay } from './analysis';
import type { Goal, Workout } from './types';

const DAY = 86_400_000;
/** Sessions of the last 8 weeks are used for the trend. */
export const TREND_DAYS = 56;
/** At least 3 sessions are needed for a trend. */
export const TREND_MIN_POINTS = 3;
/** A projection further than 2 years away is not shown. */
export const MAX_PROJECTION_DAYS = 730;

export interface GoalStatus {
  /** Heaviest done working set ever (kg). */
  best?: number;
  /** First session that reached the goal. */
  metAt?: string;
  /** Projected local date (YYYY-MM-DD) when the trend reaches the goal. */
  projected?: string;
  /** The trend is flat or going down: no projection. */
  noTrend?: boolean;
  /** Not enough sessions in the last 8 weeks. */
  fewPoints?: boolean;
}

/** Least-squares line through the points; returns the slope and the value at x. */
export function linearFit(points: { x: number; y: number }[]): { slope: number; at: (x: number) => number } {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const slope = sxx ? points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  return { slope, at: (x) => my + slope * (x - mx) };
}

/**
 * Status of a goal. Met: a done working set reached the load. Projection: a line through the estimated 1RM of the sessions
 * of the last 8 weeks (at least 3); the goal is converted to an estimated 1RM at the reps of the latest top set (Epley),
 * so rep progress at the same load also counts.
 */
export function goalStatus(goal: Goal, workouts: Workout[], now = new Date()): GoalStatus {
  const history = exerciseHistory(workouts, goal.exerciseId).filter((h) => h.metrics.topLoad !== undefined);
  if (!history.length) return { fewPoints: true };
  const best = Math.max(...history.map((h) => h.metrics.topLoad!));
  const met = history.find((h) => h.metrics.topLoad! >= goal.load - 1e-9);
  if (met) return { best, metAt: met.date };
  const since = now.getTime() - TREND_DAYS * DAY;
  const points = history.filter((h) => Date.parse(h.date) >= since && h.metrics.bestE1rm !== undefined).map((h) => ({ x: Date.parse(h.date) / DAY, y: h.metrics.bestE1rm! }));
  if (points.length < TREND_MIN_POINTS) return { best, fewPoints: true };
  const last = history[history.length - 1].entry;
  const reps = Math.max(0, ...last.sets.filter((s) => s.kind === 'working' && s.status === 'done').map((s) => s.values.reps ?? 0));
  const target = e1rm(goal.load, reps) ?? goal.load;
  const fit = linearFit(points);
  if (fit.slope <= 0) return { best, noTrend: true };
  const today = now.getTime() / DAY;
  const days = Math.max(0, (target - fit.at(today)) / fit.slope);
  if (days > MAX_PROJECTION_DAYS) return { best, noTrend: true };
  return { best, projected: localDay(new Date(now.getTime() + Math.ceil(days) * DAY)) };
}
