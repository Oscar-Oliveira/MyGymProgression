// Strength balance (V2-D19): the best estimated 1RM of the main barbell lifts, compared in pairs with common reference ranges.
// The ranges are rough coaching guidelines, not exact rules: build, lever lengths and training history change them.
import { oneRmOf } from './tools';
import type { Exercise, Workout, WorkoutEntry } from './types';
import { hasMetric, toCanonical } from './units';

export type Lift = 'squat' | 'deadlift' | 'bench' | 'ohp' | 'row';
export const LIFTS: Lift[] = ['squat', 'deadlift', 'bench', 'ohp', 'row'];

/**
 * English names (name or alias) of the barbell variants that count for each lift. Library exercises keep the English
 * name as an alias, so Portuguese names match too. Front, incline, upright, single-leg and similar variants do not count.
 */
const LIFT_NAMES: Record<Lift, RegExp[]> = {
  squat: [/^(barbell )?(full |back |high bar |low bar )?squat( \((back|side) pov\))?$/],
  deadlift: [/^(barbell )?(sumo )?deadlift$/],
  bench: [/^barbell bench press( - medium grip)?$/],
  ohp: [/^(barbell )?(standing |seated )?(close grip |wide )?(military|overhead|shoulder) press$/],
  row: [/^(barbell )?(reverse grip )?(bent over |pendlay )?row$/, /^bent over barbell row$/],
};

export function liftOf(ex: Pick<Exercise, 'name' | 'aliases'>): Lift | undefined {
  const names = [ex.name, ...ex.aliases].map((n) => n.trim().toLowerCase().replace(/\s+/g, ' '));
  return LIFTS.find((l) => LIFT_NAMES[l].some((re) => names.some((n) => re.test(n))));
}

/** Pairs compared: `a` / `b` should fall in [min, max]. */
export const BALANCE_PAIRS = [
  { id: 'bench_squat', a: 'bench', b: 'squat', min: 0.65, max: 0.85 },
  { id: 'deadlift_squat', a: 'deadlift', b: 'squat', min: 1.05, max: 1.35 },
  { id: 'ohp_bench', a: 'ohp', b: 'bench', min: 0.55, max: 0.75 },
  { id: 'row_bench', a: 'row', b: 'bench', min: 0.7, max: 1.0 },
] as const satisfies readonly { id: string; a: Lift; b: Lift; min: number; max: number }[];

/** Weeks of history used for the best lifts. */
export const BALANCE_DAYS = 84;

export interface BestLift {
  /** Estimated 1RM, canonical kg. */
  e1rm: number;
  exerciseId: string;
  date: string;
}

/** Best estimated 1RM (canonical kg) of the done working sets of one entry; RIR counts as reps left. */
function entryBest(e: WorkoutEntry): number {
  const metrics = e.exercise.metrics;
  if (!hasMetric(metrics, 'load') || !hasMetric(metrics, 'reps')) return 0;
  const unit = metrics.find((m) => m.key === 'load')?.unit ?? 'kg';
  const sides = e.exercise.loadMode === 'perSide' ? 2 : 1;
  let best = 0;
  for (const s of e.sets) {
    const { load, reps } = s.values;
    if (s.kind !== 'working' || s.status !== 'done' || load === undefined || reps === undefined) continue;
    best = Math.max(best, oneRmOf(toCanonical(load, unit) * sides, reps, s.rir ?? 0) ?? 0);
  }
  return best;
}

/** Best estimated 1RM per lift from finished workouts of the last `days` days. */
export function bestLifts(workouts: Workout[], exercises: Map<string, Exercise>, now: Date, days = BALANCE_DAYS): Partial<Record<Lift, BestLift>> {
  const since = now.getTime() - days * 86400000;
  const out: Partial<Record<Lift, BestLift>> = {};
  for (const w of workouts) {
    if (w.status === 'in_progress' || Date.parse(w.startedAt) < since) continue;
    for (const e of w.entries) {
      const ex = exercises.get(e.exerciseId);
      const lift = ex && liftOf(ex);
      const est = lift ? entryBest(e) : 0;
      if (lift && est > (out[lift]?.e1rm ?? 0)) out[lift] = { e1rm: est, exerciseId: e.exerciseId, date: w.startedAt };
    }
  }
  return out;
}

export type BalanceStatus = 'missing' | 'ok' | 'aLow' | 'bLow';
export interface BalanceRow {
  id: (typeof BALANCE_PAIRS)[number]['id'];
  a: Lift;
  b: Lift;
  min: number;
  max: number;
  ratio?: number;
  /** aLow: `a` is behind `b`; bLow: `b` is behind `a`. */
  status: BalanceStatus;
}

function statusOf(ratio: number, min: number, max: number): BalanceStatus {
  if (ratio < min) return 'aLow';
  return ratio > max ? 'bLow' : 'ok';
}

export function strengthBalance(best: Partial<Record<Lift, BestLift>>): BalanceRow[] {
  return BALANCE_PAIRS.map((p) => {
    const a = best[p.a]?.e1rm;
    const b = best[p.b]?.e1rm;
    if (!a || !b) return { ...p, status: 'missing' };
    return { ...p, ratio: a / b, status: statusOf(a / b, p.min, p.max) };
  });
}
