// Plan audit (D72): planned working sets per muscle per week and balance warnings. Pure functions.
import { MUSCLE_SETS_GUIDE, SECONDARY_MUSCLE_WEIGHT } from './analysis';
import { MUSCLES } from './challenge';
import type { Exercise, PlanDay } from './types';

/** Muscle pairs compared by sets of exercises whose primary muscles are in each side. */
export const AUDIT_PAIRS = {
  pushPull: [
    ['chest', 'shoulders', 'triceps'],
    ['back', 'biceps'],
  ],
  quadHip: [['quads'], ['hamstrings', 'glutes']],
} as const;
export type AuditPair = keyof typeof AUDIT_PAIRS;
/** A side may have at most this many times the sets of the other (about 0.67–1.5). */
export const AUDIT_RATIO_MAX = 1.5;

export type AuditWarning = { kind: 'none' | 'low' | 'high'; muscles: string[] } | { kind: AuditPair; a: number; b: number };

export interface PlanAudit {
  /** Planned working sets per muscle per week (primary 1, secondary 0.5). */
  sets: Record<string, number>;
  warnings: AuditWarning[];
}

/**
 * Audits a plan as if each day is done once a week: working sets of every item (in a circuit, one per round),
 * the 10–20 guideline for the 12 muscles, and the balance of push vs pull and quads vs hamstrings + glutes.
 */
export function planAudit(days: PlanDay[], exercises: Map<string, Exercise>): PlanAudit {
  const sets: Record<string, number> = {};
  const pair = Object.fromEntries(Object.keys(AUDIT_PAIRS).map((k) => [k, [0, 0]])) as Record<AuditPair, [number, number]>;
  for (const item of days.flatMap((d) => d.items)) {
    const ex = exercises.get(item.exerciseId);
    const n = item.sets.filter((s) => s.kind === 'working').length;
    if (!ex || !n) continue;
    for (const m of ex.primaryMuscles) sets[m] = (sets[m] ?? 0) + n;
    for (const m of ex.secondaryMuscles) sets[m] = (sets[m] ?? 0) + n * SECONDARY_MUSCLE_WEIGHT;
    for (const [k, sides] of Object.entries(AUDIT_PAIRS) as [AuditPair, (typeof AUDIT_PAIRS)[AuditPair]][])
      sides.forEach((side, i) => ex.primaryMuscles.some((m) => (side as readonly string[]).includes(m)) && (pair[k][i] += n));
  }
  const warnings: AuditWarning[] = [];
  const where = (f: (v: number) => boolean) => MUSCLES.filter((m) => f(sets[m] ?? 0));
  const add = (kind: 'none' | 'low' | 'high', muscles: string[]) => muscles.length && warnings.push({ kind, muscles });
  add('none', where((v) => v === 0));
  add('low', where((v) => v > 0 && v < MUSCLE_SETS_GUIDE.min));
  add('high', where((v) => v > MUSCLE_SETS_GUIDE.max));
  for (const [k, [a, b]] of Object.entries(pair) as [AuditPair, [number, number]][])
    if (Math.max(a, b) > AUDIT_RATIO_MAX * Math.min(a, b)) warnings.push({ kind: k, a, b });
  return { sets, warnings };
}
