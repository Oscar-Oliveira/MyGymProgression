// Load sync between plans (D36). Pure functions, no UI or storage dependencies.
//
// When the load of an exercise goes up in one plan, other active plans with the same exercise may now be out of date
// (e.g. strength 5×5 at a load the hypertrophy sets already reach). The app asks once per target item.
// - Hypertrophy → strength: estimated 1RM of the last session converted to the strength reps, or hypertrophy + 1 increment.
// - Strength → hypertrophy: estimated 1RM converted to the hypertrophy range minimum, or hypertrophy + 1 increment.
// - Same goal (hypertrophy → hypertrophy, strength → strength): the same load with the same rep range, else converted through the estimated 1RM.
// A load is never suggested lower. Loads set by this sync never cause new questions (no chain).
import { e1rm } from './analysis';
import { dayGoal, followsGoal, goalProgression } from './goals';
import { applyTargets, currentTarget } from './progression';
import type { DayGoal, Exercise, LoadSync, MetricKey, Plan, PlanDay, PlanItem, PlanVersion, ProgressionEvent, ProgressionState, SetPrescription, SetRecord } from './types';
import { round } from './units';

const EPS = 1e-9;

export const DEFAULT_LOAD_SYNC: LoadSync = { trigger: 'below', method: 'e1rm' };

/** A plan item that progresses on load, in an active plan, with a hypertrophy or strength goal. */
export interface SyncItem {
  lineageId: string;
  exerciseId: string;
  planId: string;
  planName: string;
  dayName: string;
  goal: DayGoal;
  /** Current progression targets (state, else the plan values). */
  targets: Partial<Record<MetricKey, number>>;
  load: number;
  repsMin: number;
  repsMax: number;
  increment: number;
}

/** Rep range of the first working set (a fixed value counts as min = max). */
function repsOf(sets: SetPrescription[]): { min: number; max: number } | undefined {
  const r = sets.find((s) => s.kind === 'working')?.targets.reps;
  const min = r?.min ?? r?.value;
  const max = r?.max ?? r?.value ?? min;
  return min !== undefined && max !== undefined ? { min, max } : undefined;
}

/** One item as a sync item, or undefined when the item does not progress on load under a hypertrophy or strength goal. */
export function syncItem(plan: Plan, day: PlanDay, item: PlanItem, ex: Exercise, state?: ProgressionState): SyncItem | undefined {
  const goal = dayGoal(plan, day)?.goal;
  if (goal !== 'hypertrophy' && goal !== 'strength') return undefined;
  if (item.role === 'warmup') return undefined;
  const cfg = goalProgression({ goal }, ex, item.progression);
  const step = cfg.steps[0];
  if (!followsGoal({ progression: cfg, metrics: ex.metrics }) || step?.metric !== 'load') return undefined;
  const prescription = applyTargets(item.sets, state?.targets, state?.repsRange);
  const load = currentTarget(prescription, 'load');
  const reps = repsOf(prescription);
  if (load === undefined || !reps) return undefined;
  const targets = state?.targets ?? { load };
  return { lineageId: item.lineageId, exerciseId: ex.id, planId: plan.id, planName: plan.name, dayName: day.name, goal, targets, load, repsMin: reps.min, repsMax: reps.max, increment: step.increment };
}

/** Every sync item of the active plans (current versions). */
export function syncItems(plans: Plan[], versions: PlanVersion[], exercises: Map<string, Exercise>, states: Map<string, ProgressionState>): SyncItem[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  return plans
    .filter((p) => p.status === 'active')
    .flatMap((p) =>
      (byId.get(p.currentVersionId)?.days ?? []).flatMap((d) =>
        d.items.flatMap((it) => {
          const ex = exercises.get(it.exerciseId);
          const s = ex && syncItem(p, d, it, ex, states.get(it.lineageId));
          return s ? [s] : [];
        }),
      ),
    );
}

/** Best estimated 1RM of the done working sets (Epley, up to 12 reps). */
export function bestE1rm(sets: SetRecord[]): number | undefined {
  const values = sets
    .filter((s) => s.kind === 'working' && s.status === 'done')
    .map((s) => e1rm(s.values.load ?? 0, s.values.reps ?? 0))
    .filter((v): v is number => v !== undefined);
  return values.length ? Math.max(...values) : undefined;
}

/** Rounds down to a multiple of the increment, so the suggestion is never heavier than the estimate. */
const floorTo = (v: number, inc: number) => (inc > 0 ? round(Math.floor(v / inc + EPS) * inc) : round(v));

/** Load for a number of reps from an estimated 1RM (Epley in reverse). */
const loadFor = (oneRm: number, reps: number) => (reps <= 1 ? oneRm : oneRm / (1 + reps / 30));

/**
 * Suggested load for `target` after `source` changed. `oneRm` is the source's best estimated 1RM from performed sets.
 */
export function syncSuggestion(source: Pick<SyncItem, 'goal' | 'load' | 'repsMin' | 'repsMax'>, target: Pick<SyncItem, 'goal' | 'load' | 'repsMin' | 'repsMax' | 'increment'>, method: LoadSync['method'], oneRm?: number): number {
  const converted = oneRm !== undefined ? floorTo(loadFor(oneRm, target.repsMin), target.increment) : undefined;
  if (source.goal === target.goal) {
    const sameRange = source.repsMin === target.repsMin && source.repsMax === target.repsMax;
    return sameRange ? source.load : (converted ?? source.load);
  }
  if (source.goal === 'hypertrophy' && target.goal === 'strength') return method === 'e1rm' && converted !== undefined ? converted : round(source.load + target.increment);
  return method === 'e1rm' && converted !== undefined ? converted : round(target.load + target.increment);
}

/**
 * Whether to ask. "below": the target is below the suggestion. "order": only when the order breaks
 * (hypertrophy at or above strength, or another item with the same goal below); strength going up never breaks it for hypertrophy.
 */
export function shouldAsk(trigger: LoadSync['trigger'], source: Pick<SyncItem, 'goal' | 'load'>, target: Pick<SyncItem, 'goal' | 'load'>, suggestion: number | undefined): boolean {
  if (trigger === 'off' || suggestion === undefined || suggestion <= target.load + EPS) return false;
  if (trigger === 'below') return true;
  if (source.goal === 'hypertrophy' && target.goal === 'strength') return source.load >= target.load - EPS;
  return source.goal === target.goal;
}

/** True when an event raised (or may have raised) the progression of its item: a source for sync questions. */
export function raisesLoad(ev: ProgressionEvent): boolean {
  if (ev.outcome === 'sync') return false;
  if (ev.decision === 'applied' || ev.decision === 'reps_up') return true;
  return ev.decision === 'overridden' && (ev.after.load ?? 0) > (ev.before.load ?? Infinity);
}

/** Sync questions created by a source event. One per target item; `now` and `id` are injected for tests. */
export function syncEvents(
  source: ProgressionEvent,
  items: SyncItem[],
  settings: LoadSync,
  lastSets: (lineageId: string) => SetRecord[] | undefined,
  states: Map<string, ProgressionState>,
  id: () => string,
  now: string,
): ProgressionEvent[] {
  if (settings.trigger === 'off' || !raisesLoad(source)) return [];
  const from = items.find((x) => x.lineageId === source.lineageId);
  if (!from) return [];
  const sets = lastSets(from.lineageId);
  const oneRm = sets ? bestE1rm(sets) : undefined;
  return items
    .filter((to) => to.exerciseId === from.exerciseId && to.lineageId !== from.lineageId)
    .flatMap((to) => {
      const x = syncSuggestion(from, to, settings.method, oneRm);
      if (!shouldAsk(settings.trigger, from, to, x)) return [];
      const range = states.get(to.lineageId)?.repsRange;
      return [
        {
          id: id(),
          ...(source.workoutId ? { workoutId: source.workoutId } : {}),
          lineageId: to.lineageId,
          exerciseId: to.exerciseId,
          strategy: 'double',
          outcome: 'sync',
          suggestion: { metric: 'load', from: to.load, to: x!, kind: 'increase' },
          reasons: [{ code: 'sync', params: { plan: from.planName, day: from.dayName, goal: from.goal, load: from.load, targetPlan: to.planName, targetDay: to.dayName, targetGoal: to.goal } }],
          decision: 'pending',
          before: { ...to.targets },
          after: { ...to.targets },
          ...(range ? { rangeBefore: range, rangeAfter: range } : {}),
          sourceEventId: source.id,
          createdAt: now,
        } satisfies ProgressionEvent,
      ];
    });
}

/**
 * Starting load for an exercise added to a plan, from the most recently trained other item of the same exercise.
 * `sources` are ordered most recent first; undefined when nothing applies.
 */
export function initialLoad(target: Pick<SyncItem, 'goal' | 'repsMin' | 'repsMax' | 'increment'> & { load?: number }, sources: { item: SyncItem; sets?: SetRecord[] }[], method: LoadSync['method']): number | undefined {
  for (const { item, sets } of sources) {
    const oneRm = sets ? bestE1rm(sets) : undefined;
    // Strength → hypertrophy has no starting value without an estimated 1RM ("+1 increment" needs a hypertrophy load).
    if (item.goal === 'strength' && target.goal === 'hypertrophy' && (method !== 'e1rm' || oneRm === undefined)) continue;
    return syncSuggestion(item, { ...target, load: item.load }, method, oneRm);
  }
  return undefined;
}

/** A new plan item with its working load taken from other plans with the same exercise (see initialLoad). */
export function withStartLoad(plan: Plan, day: PlanDay, item: PlanItem, ex: Exercise, sources: { item: SyncItem; sets?: SetRecord[] }[], method: LoadSync['method']): PlanItem {
  const goal = dayGoal(plan, day)?.goal;
  if (goal !== 'hypertrophy' && goal !== 'strength') return item;
  const cfg = goalProgression({ goal }, ex, item.progression);
  const step = cfg.steps[0];
  const reps = repsOf(item.sets);
  if (!followsGoal({ progression: cfg, metrics: ex.metrics }) || step?.metric !== 'load' || !reps) return item;
  const load = initialLoad({ goal, repsMin: reps.min, repsMax: reps.max, increment: step.increment }, sources.filter((s) => s.item.exerciseId === ex.id && s.item.lineageId !== item.lineageId), method);
  if (load === undefined) return item;
  return { ...item, sets: item.sets.map((s) => (s.kind === 'working' ? { ...s, targets: { ...s.targets, load: { ...s.targets.load, value: load } } } : s)) };
}
