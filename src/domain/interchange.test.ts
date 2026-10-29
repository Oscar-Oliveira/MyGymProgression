import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlan, newPlanItem } from './factory';
import { buildBundle, emptyDataSet, parseBundle, planMerge, previewImport, type DataSet } from './interchange';
import { eventsCsv, setsCsv, workoutsCsv } from './csv';
import { finishWorkout, startWorkout } from './workout';

function sample(): DataSet {
  const ex = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Bench' });
  const tread = newExercise('treadmill', DEFAULT_SETTINGS, { name: 'Treadmill, "fast"' });
  const { plan, version } = newPlan('P');
  const day = newDay('A');
  day.items.push(newPlanItem(ex), newPlanItem(tread));
  version.days.push(day);
  const w = startWorkout(plan, version, day, { exercises: new Map([ex, tread].map((e) => [e.id, e])), states: new Map(), lastEntry: () => undefined });
  w.entries.forEach((e) => e.sets.forEach((s) => (s.status = 'done')));
  const { workout, events } = finishWorkout(w, false, () => undefined, new Map());
  return { ...emptyDataSet(), exercises: [ex, tread], plans: [plan], planVersions: [{ ...version, locked: true }], workouts: [workout], progressionEvents: events, settings: DEFAULT_SETTINGS };
}

describe('JSON round trip', () => {
  it('export → parse preserves all data', () => {
    const data = sample();
    const parsed = parseBundle(JSON.stringify(buildBundle(data, 'full', '0.1.0')));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.bundle.data).toEqual(data);
  });
  it('library scope contains only exercises; plans scope includes referenced exercises', () => {
    const data = sample();
    expect(buildBundle(data, 'library', 'x').data.workouts).toHaveLength(0);
    const p = buildBundle(data, 'plans', 'x').data;
    expect(p.plans).toHaveLength(1);
    expect(p.exercises).toHaveLength(2);
    expect(p.workouts).toHaveLength(0);
  });
});

describe('invalid imports', () => {
  it.each([
    ['not json', 'invalid_json'],
    ['{"a":1}', 'not_a_backup'],
    ['{"format":"mygymprogression"}', 'schema_version_missing'],
    ['{"format":"mygymprogression","schemaVersion":99}', 'schema_version_newer:99'],
  ])('%s → %s', (text, code) => {
    const r = parseBundle(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toBe(code);
  });
  it('reports schema errors with a path', () => {
    const b = buildBundle(sample(), 'full', 'x');
    (b.data.exercises[0] as unknown as { category: string }).category = 'flying';
    const r = parseBundle(JSON.stringify(b));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^data\.exercises\.0\.category/);
  });
});

describe('merge import', () => {
  it('preview detects new, identical and conflicting records', () => {
    const local = sample();
    const incoming = structuredClone(local);
    incoming.exercises[0].name = 'Bench (edited)';
    incoming.exercises.push(newExercise('duration', DEFAULT_SETTINGS, { name: 'Plank' }));
    const p = previewImport(incoming, local);
    expect(p.tables.exercises).toMatchObject({ incoming: 3, new: 1, identical: 1, conflicts: [local.exercises[0].id] });
    expect(p.tables.workouts.identical).toBe(1);
  });
  it('skip keeps local, overwrite replaces, keepBoth adds a copy with a new id', () => {
    const local = sample();
    const incoming = structuredClone(local);
    incoming.exercises[0].name = 'Bench (edited)';
    expect(planMerge(incoming, local, 'skip', 'import').exercises).toHaveLength(0);
    expect(planMerge(incoming, local, 'overwrite', 'import').exercises[0].name).toBe('Bench (edited)');
    const kb = planMerge(incoming, local, 'keepBoth', 'import', () => 'NEW');
    expect(kb.exercises).toHaveLength(1);
    expect(kb.exercises[0].id).toBe('NEW');
    // Identical records are never rewritten.
    expect(kb.workouts).toHaveLength(0);
  });
  it('duplicate exercise by name can reuse the existing id and rewrites references', () => {
    const local = { ...emptyDataSet(), exercises: [newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Bench' })] };
    const incoming = sample();
    const p = previewImport(incoming, local);
    expect(p.duplicateExercises).toHaveLength(1);
    const out = planMerge(incoming, local, 'skip', 'useExisting');
    expect(out.exercises.map((e) => e.name)).toEqual(['Treadmill, "fast"']);
    expect(out.workouts[0].entries[0].exerciseId).toBe(local.exercises[0].id);
    expect(out.planVersions[0].days[0].items[0].exerciseId).toBe(local.exercises[0].id);
  });
  it('reports references to missing exercises', () => {
    const incoming = sample();
    incoming.exercises = [];
    expect(previewImport(incoming, emptyDataSet()).missingExerciseRefs).toHaveLength(2);
  });
});

describe('CSV', () => {
  it('one row per set, with units and escaping', () => {
    const d = sample();
    const csv = setsCsv(d.workouts);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(1 + 3 + 1);
    expect(lines[0]).toContain('load,load_unit');
    expect(csv).toContain('"Treadmill, ""fast"""');
    expect(lines[1]).toContain(',kg,');
    expect(workoutsCsv(d.workouts).trim().split('\r\n')).toHaveLength(2);
    expect(eventsCsv(d.progressionEvents, { [d.exercises[0].id]: 'Bench' })).toContain('Bench');
  });
});
