import { describe, expect, it } from 'vitest';
import { dayMuscles, muscleRoles, planAudit } from './audit';
import { addCircuit, addToCircuit } from './circuit';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlanItem } from './factory';
import type { Exercise, PlanDay } from './types';

const ex = (name: string, primaryMuscles: string[], secondaryMuscles: string[] = []) => ({ ...newExercise('reps_load', DEFAULT_SETTINGS, { name }), primaryMuscles, secondaryMuscles });
const bench = ex('Bench', ['chest'], ['triceps', 'shoulders']);
const row = ex('Row', ['back'], ['biceps']);
const squat = ex('Squat', ['quads'], ['glutes']);
const curl = ex('Leg curl', ['hamstrings']);
const all = new Map<string, Exercise>([bench, row, squat, curl].map((e) => [e.id, e]));

/** A day with `n` working sets of each exercise. */
function day(n: number, ...exs: Exercise[]): PlanDay {
  const d = newDay('Day');
  for (const e of exs) d.items.push({ ...newPlanItem(e), sets: [{ kind: 'warmup', targets: {} }, ...Array.from({ length: n }, () => ({ kind: 'working' as const, targets: {} }))] });
  return d;
}

describe('plan audit', () => {
  it('counts working sets per muscle per week, each day once (primary 1, secondary 0.5)', () => {
    const { sets } = planAudit([day(3, bench, row), day(4, bench)], all);
    expect(sets).toEqual({ chest: 7, triceps: 3.5, shoulders: 3.5, back: 3, biceps: 1.5 });
  });
  it('counts one set per circuit round', () => {
    let d = newDay('Day');
    const made = addCircuit(d, 'C', 5);
    d = addToCircuit(made.day, newPlanItem(row), made.circuit.id);
    expect(planAudit([d], all).sets.back).toBe(5);
  });
  it('lists muscles with no sets, under 10 and over 20', () => {
    const { warnings } = planAudit([day(12, bench), day(11, bench), day(4, row)], all);
    expect(warnings).toContainEqual({ kind: 'high', muscles: ['chest'] });
    expect(warnings).toContainEqual({ kind: 'low', muscles: ['back', 'biceps'] });
    expect(warnings.find((w) => w.kind === 'none')).toMatchObject({ muscles: expect.arrayContaining(['quads', 'calves']) });
  });
  it('warns when push vs pull or quads vs hamstrings + glutes is outside 1.5 : 1, by primary muscles', () => {
    expect(planAudit([day(3, bench, row)], all).warnings.some((w) => w.kind === 'pushPull')).toBe(false);
    expect(planAudit([day(4, bench), day(2, row)], all).warnings).toContainEqual({ kind: 'pushPull', a: 4, b: 2 });
    // Glutes are a secondary muscle of the squat: no hip sets.
    expect(planAudit([day(3, squat)], all).warnings).toContainEqual({ kind: 'quadHip', a: 3, b: 0 });
    expect(planAudit([day(3, squat, curl)], all).warnings.some((w) => w.kind === 'quadHip')).toBe(false);
  });
});

describe('muscles worked', () => {
  it('a muscle is primary when any exercise has it as primary, else secondary', () => {
    expect(muscleRoles([bench, ex('Dips', ['triceps'], ['chest'])])).toEqual({ chest: 'primary', triceps: 'primary', shoulders: 'secondary' });
  });
  it('a day gives its planned sets and the role of each muscle', () => {
    expect(dayMuscles(day(3, squat, curl), all)).toEqual({ sets: { quads: 3, glutes: 1.5, hamstrings: 3 }, roles: { quads: 'primary', glutes: 'secondary', hamstrings: 'primary' } });
  });
});
