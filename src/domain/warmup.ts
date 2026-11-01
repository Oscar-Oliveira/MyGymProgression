// Automatic warm-up sets (D38). Pure functions.
import { hasMetric } from './units';
import { uid } from './factory';
import type { SetPrescription, SetRecord, Workout, WorkoutEntry } from './types';

/** Percent of the working load and reps of each warm-up set. */
export const WARMUP_RAMP = [
  { pct: 0.5, reps: 8 },
  { pct: 0.7, reps: 5 },
  { pct: 0.85, reps: 3 },
];

/** Default load step when the exercise has no load increment: 2.5 kg or 5 lb. */
const defaultStep = (unit: string) => (unit === 'lb' ? 5 : 2.5);

/**
 * Warm-up loads for a working load, rounded down to the step. Loads of 0, repeated loads and loads not below the
 * working load are left out.
 */
export function warmupLoads(load: number, step: number): { load: number; reps: number }[] {
  const out: { load: number; reps: number }[] = [];
  for (const r of WARMUP_RAMP) {
    const l = Math.round(Math.floor((load * r.pct) / step + 1e-9) * step * 100) / 100;
    if (l <= 0 || l >= load || out.some((x) => x.load === l)) continue;
    out.push({ load: l, reps: r.reps });
  }
  return out;
}

/** An entry that can get warm-up sets: compound, load and reps, outside a circuit, without warm-up sets of its own. */
function eligible(e: WorkoutEntry): boolean {
  const m = e.exercise.metrics;
  return e.exercise.category === 'compound' && hasMetric(m, 'load') && hasMetric(m, 'reps') && !e.circuit && !e.sets.some((s) => s.kind === 'warmup');
}

/**
 * Adds warm-up sets before the working sets of the first compound exercise of each main muscle.
 * An exercise gets them when none of its main muscles was warmed up by an earlier exercise of the workout.
 * Warm-up sets never count for progression or analysis (only working sets do).
 */
export function addWarmups(w: Workout): Workout {
  const warmed = new Set<string>();
  const entries = w.entries.map((e) => {
    if (!eligible(e)) return e;
    const muscles = e.exercise.primaryMuscles;
    if (muscles.some((m) => warmed.has(m))) return e;
    const load = e.sets.find((s) => s.kind === 'working')?.values.load;
    if (!load) return e;
    const unit = e.exercise.metrics.find((m) => m.key === 'load')?.unit ?? 'kg';
    const step = e.progression.steps.find((s) => s.metric === 'load')?.increment || defaultStep(unit);
    const ramp = warmupLoads(load, step);
    if (!ramp.length) return e;
    muscles.forEach((m) => warmed.add(m));
    const rx: SetPrescription[] = ramp.map((r) => ({ kind: 'warmup', targets: { load: { value: r.load }, reps: { value: r.reps } } }));
    const sets: SetRecord[] = ramp.map((r) => ({ id: uid(), kind: 'warmup', values: { load: r.load, reps: r.reps }, status: 'pending', notes: '' }));
    return { ...e, prescription: [...rx, ...e.prescription], sets: [...sets, ...e.sets] };
  });
  return { ...w, entries };
}
