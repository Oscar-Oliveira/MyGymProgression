// Muscle recovery map (V2-D20): recent working sets per muscle (primary 1, secondary 0.5), fading linearly to zero in 72 h.
// A simple guide to pick the day's workout, not a physiological measure.
import { SECONDARY_MUSCLE_WEIGHT } from './analysis';
import type { Workout } from './types';

export const RECOVERY_HOURS = 72;
/** Faded sets from which a muscle counts as recovering or tired. */
export const RECOVERY_LEVELS = { recovering: 2, tired: 5 };

export type RecoveryLevel = 'fresh' | 'recovering' | 'tired';

/** Faded working sets per muscle at `now`. A workout counts from its end (or start); done sets of a workout in progress count too. */
export function muscleFatigue(workouts: Workout[], now: Date, hours = RECOVERY_HOURS): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of workouts) {
    const age = (now.getTime() - Date.parse(w.endedAt ?? w.startedAt)) / 3600000;
    const weight = 1 - Math.max(0, age) / hours;
    if (weight <= 0) continue;
    for (const e of w.entries) {
      const n = e.sets.filter((s) => s.kind === 'working' && s.status === 'done').length * weight;
      if (!n) continue;
      for (const m of e.exercise.primaryMuscles) out[m] = (out[m] ?? 0) + n;
      for (const m of e.exercise.secondaryMuscles) out[m] = (out[m] ?? 0) + n * SECONDARY_MUSCLE_WEIGHT;
    }
  }
  return out;
}

export function recoveryLevel(fatigue: number | undefined): RecoveryLevel {
  if (!fatigue || fatigue < RECOVERY_LEVELS.recovering) return 'fresh';
  return fatigue >= RECOVERY_LEVELS.tired ? 'tired' : 'recovering';
}
