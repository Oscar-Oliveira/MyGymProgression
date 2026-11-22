// Tools (V2-D6): estimated 1RM from a set, percentages of it, and the load for reps at a given RIR.
// All estimates use the Epley formula (as the rest of the app): 1RM = load × (1 + reps / 30). They are estimates.
import { e1rm } from './analysis';

/** Estimated 1RM of a set; reps in reserve count as reps the set could still do. */
export const oneRmOf = (load: number, reps: number, rir = 0): number | undefined => e1rm(load, reps + rir);

export const PCT_STEPS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

/** Loads at each percentage of a 1RM, rounded by `round`. */
export const percentTable = (oneRm: number, round: (x: number) => number = (x) => x) => PCT_STEPS.map((pct) => ({ pct, load: round((oneRm * pct) / 100) }));

/** Load for `reps` with `rir` reps left, from a 1RM (the inverse of oneRmOf). */
export function loadFor(oneRm: number, reps: number, rir = 0): number {
  const total = reps + rir;
  return total <= 1 ? oneRm : oneRm / (1 + total / 30);
}

/** Rounds to a step (e.g. 2.5 kg). */
export const roundTo = (x: number, step: number) => (step > 0 ? Math.round(x / step) * step : x);
