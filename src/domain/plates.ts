// Plate math (V2-D6): plates per side for a bar load, from the plates the user has; loads rounded to what can be loaded.
import type { Settings } from './types';

export interface Equipment {
  /** Bar weight per bar type, in the load unit. */
  bars: { barbell: number; ez_bar: number; trap_bar: number };
  /** Plate weights the user has (pairs, any number of each), in the load unit. */
  plates: number[];
}

export const DEFAULT_EQUIPMENT: Record<'kg' | 'lb', Equipment> = {
  kg: { bars: { barbell: 20, ez_bar: 10, trap_bar: 25 }, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bars: { barbell: 45, ez_bar: 25, trap_bar: 55 }, plates: [45, 35, 25, 10, 5, 2.5] },
};
/** Every plate the settings offer to choose from. */
export const PLATE_CHOICES: Record<'kg' | 'lb', number[]> = { kg: [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5], lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25] };

export const equipmentOf = (s: Pick<Settings, 'loadUnit' | 'equipment'>): Equipment => s.equipment ?? DEFAULT_EQUIPMENT[s.loadUnit];

/** Bar type of an exercise equipment, or undefined when it is not loaded on a bar with plates. */
export const barOf = (equipment: string): keyof Equipment['bars'] | undefined =>
  equipment === 'barbell' || equipment === 'ez_bar' || equipment === 'trap_bar' ? equipment : undefined;

const cents = (x: number) => Math.round(x * 100);

/**
 * Plates for one side, heaviest first. `perSide`: the load already is per side (no bar), else total with the bar.
 * `rest`: what the plates cannot make (0 = exact).
 */
export function platesPerSide(load: number, bar: number, plates: number[], perSide = false): { plates: number[]; rest: number } {
  let left = cents(perSide ? load : (load - bar) / 2);
  if (left <= 0) return { plates: [], rest: 0 };
  const out: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const c = cents(p);
    while (c > 0 && left >= c) {
      out.push(p);
      left -= c;
    }
  }
  return { plates: out, rest: left / 100 };
}

/** Every total that the bar and plates can make up to `max` (both sides the same). */
function loadable(bar: number, plates: number[], max: number): number[] {
  const step = Math.min(...plates.map(cents)) * 2 || 1;
  const out: number[] = [];
  for (let c = cents(bar); c <= cents(max) + step; c += Math.max(1, Math.round(step / 2))) {
    if (platesPerSide(c / 100, bar, plates).rest === 0) out.push(c / 100);
  }
  return out;
}

/** The nearest load that can be made (ties go to the lighter one). */
export function roundToPlates(target: number, bar: number, plates: number[]): number {
  if (target <= bar || !plates.length) return Math.max(target, bar);
  const options = loadable(bar, plates, target + Math.max(...plates) * 2);
  return options.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) - 1e-9 ? x : best), options[0] ?? bar);
}
