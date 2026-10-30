// Plan goal → progression rule and default sets (D11).
import type { Exercise, Plan, PlanDay, ProgressionConfig, SetPrescription } from './types';

/** Exercises the goal applies to: double progression on reps (load-based work). Others keep their own rule. */
export const followsGoal = (ex: Pick<Exercise, 'progression' | 'metrics'>) => ex.progression.strategy === 'double' && ex.metrics.some((m) => m.key === 'reps');

/** Goal that applies to a day: the plan goal, or in a mixed plan the day's own goal (when set). */
export function dayGoal(plan: Pick<Plan, 'goal' | 'strengthMode'> | undefined, day: Pick<PlanDay, 'goal' | 'strengthMode'> | undefined): Pick<Plan, 'goal' | 'strengthMode'> | undefined {
  if (plan?.goal === 'mixed' && day?.goal) return { goal: day.goal, strengthMode: day.strengthMode };
  return plan;
}

/**
 * Progression for an exercise inside a plan. `override` is an item-level config (e.g. a custom increment).
 * For load exercises the plan goal always decides what happens at the top of the range:
 * - hypertrophy: the user chooses load up or reps up;
 * - strength: the load goes up automatically;
 * - mixed / other: the exercise's own rule (a mixed plan day can set its own goal, see dayGoal).
 */
export function goalProgression(plan: Pick<Plan, 'goal'> | undefined, ex: Pick<Exercise, 'progression' | 'metrics'>, override?: ProgressionConfig): ProgressionConfig {
  const base = structuredClone(override ?? ex.progression);
  if (!plan || !followsGoal({ progression: base, metrics: ex.metrics })) return base;
  if (plan.goal === 'hypertrophy') return { ...base, onTop: 'ask' };
  if (plan.goal === 'strength') return { ...base, onTop: 'load' };
  return base;
}

/** Default sets when an exercise is added to a plan. Loads and other targets come from the exercise defaults. */
export function goalSets(plan: Pick<Plan, 'goal' | 'strengthMode'> | undefined, ex: Pick<Exercise, 'progression' | 'metrics' | 'defaultSets'>): SetPrescription[] {
  if (!plan || !followsGoal(ex) || (plan.goal !== 'hypertrophy' && plan.goal !== 'strength')) return structuredClone(ex.defaultSets);
  const template = ex.defaultSets.find((s) => s.kind === 'working') ?? { kind: 'working' as const, targets: {} };
  const warm = ex.defaultSets.filter((s) => s.kind === 'warmup');
  const [n, min, max] = plan.goal === 'hypertrophy' ? [3, 8, 12] : plan.strengthMode === 'range' ? [4, 4, 6] : [5, 5, 5];
  const working = Array.from({ length: n }, () => ({ ...structuredClone(template), targets: { ...structuredClone(template.targets), reps: { min, max } } }));
  return [...structuredClone(warm), ...working];
}
