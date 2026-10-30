import type { Exercise, ExerciseCategory, Plan, PlanDay, PlanItem, PlanVersion, Settings } from './types';
import { goalSets } from './goals';
import { presetDefaults, presetMetrics, type MeasurementPreset } from './units';

export const uid = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

export const DEFAULT_SETTINGS: Settings = { id: 'settings', language: 'pt', loadUnit: 'kg', distanceUnit: 'km', stalledThreshold: 3 };

export function newExercise(preset: MeasurementPreset, settings: Pick<Settings, 'loadUnit' | 'distanceUnit'>, over: Partial<Exercise> = {}): Exercise {
  const d = presetDefaults(preset, settings.loadUnit);
  const now = nowIso();
  const category: ExerciseCategory = ['treadmill', 'distance', 'duration_distance', 'resistance'].includes(preset) ? 'cardio' : preset === 'duration' ? 'isolation' : 'compound';
  return {
    id: uid(),
    name: '',
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: '',
    category,
    instructions: '',
    safetyNotes: '',
    personalNotes: '',
    tags: [],
    links: [],
    active: true,
    metrics: presetMetrics(preset, settings.loadUnit, settings.distanceUnit),
    loadMode: 'total',
    defaultSets: d.sets,
    progression: d.progression,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** Copies an exercise as a variation. The original is not changed. */
export function duplicateAsVariation(ex: Exercise, name: string): Exercise {
  const now = nowIso();
  return { ...structuredClone(ex), id: uid(), name, variationOf: ex.id, createdAt: now, updatedAt: now };
}

/** New plan item. With a plan, the default sets follow the plan goal (see goals.ts). */
export function newPlanItem(ex: Exercise, plan?: Pick<Plan, 'goal' | 'strengthMode'>): PlanItem {
  return { id: uid(), lineageId: uid(), exerciseId: ex.id, role: ex.category === 'warmup' ? 'warmup' : 'main', sets: goalSets(plan, ex), substitutes: [], notes: '' };
}

export function newDay(name: string): PlanDay {
  return { id: uid(), name, items: [] };
}

export function newPlan(name: string): { plan: Plan; version: PlanVersion } {
  const now = nowIso();
  const planId = uid();
  const version: PlanVersion = { id: uid(), planId, number: 1, createdAt: now, locked: false, days: [] };
  const plan: Plan = { id: planId, name, description: '', goal: 'hypertrophy', phase: '', status: 'active', currentVersionId: version.id, createdAt: now, updatedAt: now };
  return { plan, version };
}

/**
 * Returns the version to store after editing. A locked version (used by a workout) is never changed:
 * the edit becomes a new version with the next number. Item lineage ids are kept so progression continues.
 */
export function saveVersion(current: PlanVersion, editedDays: PlanDay[]): PlanVersion {
  if (!current.locked) return { ...current, days: editedDays };
  return { id: uid(), planId: current.planId, number: current.number + 1, createdAt: nowIso(), locked: false, days: editedDays };
}

/** Duplicates a plan with its current version. New ids, new lineages (independent progression). */
export function duplicatePlan(plan: Plan, version: PlanVersion, name: string): { plan: Plan; version: PlanVersion } {
  const { plan: p, version: v } = newPlan(name);
  const days = structuredClone(version.days).map((d) => ({ ...d, id: uid(), items: d.items.map((i) => ({ ...i, id: uid(), lineageId: uid() })) }));
  // Superset labels stay; they are local to a day.
  return { plan: { ...p, description: plan.description, goal: plan.goal, strengthMode: plan.strengthMode, phase: plan.phase }, version: { ...v, days } };
}
