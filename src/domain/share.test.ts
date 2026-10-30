import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './factory';
import { generateDemo } from './demo';
import { parseBundle, planMerge } from './interchange';
import { seedExercises } from './seed';
import { decodeShare, encodeShare, planShare } from './share';

const exercises = seedExercises(DEFAULT_SETTINGS).map((e, i) => (i === 0 ? { ...e, personalNotes: 'private', overview: 'long text' } : e));
const data = { ...generateDemo(exercises), exercises };
const plan = data.plans[0];
const used = new Set(data.planVersions.find((v) => v.id === plan.currentVersionId)!.days.flatMap((d) => d.items.map((i) => i.exerciseId)));

describe('planShare', () => {
  const b = planShare(data, plan.id, '0.1.0')!;
  it('copies the plan with new ids, its exercises, and no personal records', () => {
    expect(b.data.plans).toHaveLength(1);
    expect(b.data.plans[0].id).not.toBe(plan.id);
    expect(b.data.plans[0]).toMatchObject({ name: plan.name, goal: plan.goal, color: plan.color });
    expect(b.data.planVersions[0].planId).toBe(b.data.plans[0].id);
    expect(new Set(b.data.exercises.map((e) => e.id))).toEqual(used);
    expect(b.data.workouts).toHaveLength(0);
    expect(b.data.progressionStates).toHaveLength(0);
    expect(b.data.exercises.every((e) => e.personalNotes === '')).toBe(true);
  });
  it('leaves library text out of a link', () => {
    const lite = planShare(data, plan.id, '0.1.0', true)!;
    expect(lite.data.exercises.some((e) => e.overview)).toBe(false);
  });
  it('round trips through a link, and imports as a new plan that reuses existing exercises', async () => {
    const lite = planShare(data, plan.id, '0.1.0', true)!;
    const code = await encodeShare(lite);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const parsed = parseBundle((await decodeShare(code))!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = planMerge(parsed.bundle.data, data, 'skip', 'useExisting');
    expect(merged.plans).toHaveLength(1);
    expect(merged.planVersions).toHaveLength(1);
    // The exercises already exist (same ids): the local ones are kept.
    expect(merged.exercises).toHaveLength(0);
  });
  it('rejects a damaged link', async () => {
    expect(await decodeShare('not*valid')).toBeUndefined();
  });
});
