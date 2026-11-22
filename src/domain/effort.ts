// Effort per set (V2-D6): one stored unit, reps in reserve (RIR), shown as RIR or RPE.
// RIR has a real zero (failure); RPE is 10 − RIR (RPE 8 = 2 reps left). The user chooses the scale in Settings.
import type { SetRecord, Settings } from './types';

export type EffortScale = 'rir' | 'rpe';

/** The scale to show, or undefined when effort is off. Default: RIR. */
export const effortScale = (s: Pick<Settings, 'effort'>): EffortScale | undefined => (s.effort === 'off' ? undefined : (s.effort ?? 'rir'));

/** RIR choices offered on a set; 5 means "5 or more". */
export const RIR_CHOICES = [0, 1, 2, 3, 4, 5];

/** A stored RIR on the chosen scale. */
export const toScale = (rir: number, scale: EffortScale): number => (scale === 'rpe' ? 10 - rir : rir);

/** Short text for a stored RIR: "RIR 2", "RIR 5+", "RPE 8". */
export function effortText(rir: number, scale: EffortScale): string {
  if (scale === 'rpe') return `RPE ${10 - rir}`;
  return rir >= 5 ? 'RIR 5+' : `RIR ${rir}`;
}

/** Colour band of an effort: failure, very hard (1), hard (2–3), easy (4 or more). */
export function effortBand(rir: number): 'failure' | 'hard' | 'good' | 'easy' {
  if (rir <= 0) return 'failure';
  if (rir < 2) return 'hard';
  if (rir < 4) return 'good';
  return 'easy';
}

/** Mean RIR of the done sets that have one (undefined when none). */
export function meanRir(sets: Pick<SetRecord, 'rir' | 'status'>[]): number | undefined {
  const rated = sets.filter((s) => s.status === 'done' && s.rir !== undefined).map((s) => s.rir!);
  return rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : undefined;
}
