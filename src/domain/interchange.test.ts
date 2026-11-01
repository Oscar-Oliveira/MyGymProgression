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

describe('schema migration v1 → v2', () => {
  it('imports a v1 file: drops RIR/RPE, maps outcomes and decisions', () => {
    const d = sample();
    const b = JSON.parse(JSON.stringify(buildBundle(d, 'full', 'x')));
    b.schemaVersion = 1;
    b.data.exercises[0].defaultSets[0].rir = 2;
    b.data.exercises[0].progression.criteria.useRir = true;
    b.data.workouts[0].entries[0].sets[0].rpe = 8;
    b.data.workouts[0].entries[0].evaluation = { strategy: 'double', outcome: 'below_target', completion: 'complete', reasons: [] };
    b.data.progressionEvents[0] = { ...b.data.progressionEvents[0], outcome: 'increase_recommended', decision: 'deferred', recommendation: { metric: 'load', from: 20, to: 22.5 } };
    delete b.data.progressionEvents[0].suggestion;
    const r = parseBundle(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.bundle.data.exercises[0].defaultSets[0]).not.toHaveProperty('rir');
    expect(r.bundle.data.workouts[0].entries[0].evaluation?.outcome).toBe('missed');
    expect(r.bundle.data.progressionEvents[0]).toMatchObject({ outcome: 'increase', decision: 'kept', suggestion: { kind: 'increase', to: 22.5 } });
  });
});

describe('schema migration v6 → v7', () => {
  it('imports a v6 file as is, and keeps the new optional fields (colours, circuits, theme, trainer)', () => {
    const d = sample();
    const old = JSON.parse(JSON.stringify(buildBundle(d, 'full', 'x')));
    old.schemaVersion = 6;
    const r6 = parseBundle(JSON.stringify(old));
    expect(r6.ok && r6.migratedFrom).toBe(6);

    const v7 = JSON.parse(JSON.stringify(buildBundle(d, 'full', 'x')));
    v7.data.plans[0].color = 'teal';
    v7.data.planVersions[0].days[0] = { ...v7.data.planVersions[0].days[0], color: 'red', circuits: [{ id: 'c1', name: 'Core', rounds: 3 }] };
    v7.data.planVersions[0].days[0].items[0].circuitId = 'c1';
    v7.data.settings = { id: 'settings', language: 'pt', loadUnit: 'kg', distanceUnit: 'km', stalledThreshold: 3, theme: 'light', coach: { enabled: true, style: 'stoic', profanity: false } };
    const r7 = parseBundle(JSON.stringify(v7));
    expect(r7.ok).toBe(true);
    if (!r7.ok) return;
    expect(r7.bundle.data.plans[0].color).toBe('teal');
    expect(r7.bundle.data.planVersions[0].days[0].circuits?.[0].rounds).toBe(3);
    expect(r7.bundle.data.planVersions[0].days[0].items[0].circuitId).toBe('c1');
    expect(r7.bundle.data.settings?.coach?.style).toBe('stoic');

    v7.data.plans[0].color = 'not-a-colour';
    expect(parseBundle(JSON.stringify(v7)).ok).toBe(false);
  });
});

describe('schema migration v10 → v11', () => {
  it('imports a v10 file as is, and keeps the new optional fields (closedBy, perSide)', () => {
    const d = sample();
    const old = JSON.parse(JSON.stringify(buildBundle(d, 'full', 'x')));
    old.schemaVersion = 10;
    const r10 = parseBundle(JSON.stringify(old));
    expect(r10.ok && r10.migratedFrom).toBe(10);

    const now = { ...d, progressionEvents: [{ ...d.progressionEvents[0], decision: 'kept' as const, closedBy: 'w2' }] };
    now.challenges = [{ id: 'c', week: '2026-11-02', kind: 'record', target: 40, perSide: true, status: 'open', createdAt: '2026-11-02T08:00:00.000Z' }];
    const r11 = parseBundle(JSON.stringify(buildBundle(now, 'full', 'x')));
    expect(r11.ok).toBe(true);
    if (!r11.ok) return;
    expect(r11.bundle.data.progressionEvents[0].closedBy).toBe('w2');
    expect(r11.bundle.data.challenges[0].perSide).toBe(true);
  });
});

describe('schema v13 (D37–D49)', () => {
  it('a v12 file (without goals and reports) is migrated; new fields round-trip', () => {
    const old = JSON.parse(JSON.stringify(buildBundle(emptyDataSet(), 'full', 'x')));
    old.schemaVersion = 12;
    delete old.data.goals;
    delete old.data.coachReports;
    const r = parseBundle(JSON.stringify(old));
    expect(r.ok && r.migratedFrom).toBe(12);
    expect(r.ok && r.bundle.data.goals).toEqual([]);

    const d = emptyDataSet();
    d.goals = [{ id: 'g', exerciseId: 'e', exerciseName: 'Bench', load: 100, by: '2027-03-01', createdAt: '2026-11-01T10:00:00.000Z' }];
    d.coachReports = [{ id: 'r', week: '2026-10-26', workouts: 3, sets: 40, best: { exerciseName: 'Squat', load: 120, reps: 5 }, ups: 2, weak: 'back', challenge: 'done', createdAt: '2026-11-01T18:00:00.000Z' }];
    d.settings = { ...DEFAULT_SETTINGS, warmup: true, coach: { enabled: true, style: 'stoic', profanity: false, live: true, report: true, voice: false, tips: true, rival: true } };
    const r13 = parseBundle(JSON.stringify(buildBundle(d, 'full', 'x')));
    expect(r13.ok && r13.bundle.data).toMatchObject({ goals: d.goals, coachReports: d.coachReports, settings: d.settings });
  });

  it('merge: one trainer report per week', () => {
    const rep = (id: string, week: string) => ({ id, week, workouts: 1, sets: 1, ups: 0, createdAt: '2026-11-01T18:00:00.000Z' });
    const existing = { ...emptyDataSet(), coachReports: [rep('here', '2026-10-26')] };
    const incoming = { ...emptyDataSet(), coachReports: [rep('there', '2026-10-26'), rep('older', '2026-10-19')] };
    expect(planMerge(incoming, existing, 'keepBoth', 'useExisting').coachReports.map((c) => c.id)).toEqual(['older']);
  });
});

describe('merge: one weekly challenge per week', () => {
  const ch = (id: string, week: string) => ({ id, week, kind: 'workouts' as const, target: 2, status: 'open' as const, createdAt: '2026-11-02T08:00:00.000Z' });
  it('an imported challenge of a week that has one here is not imported; other weeks are', () => {
    const existing = { ...emptyDataSet(), challenges: [ch('here', '2026-11-02')] };
    const incoming = { ...emptyDataSet(), challenges: [ch('there', '2026-11-02'), ch('older', '2026-10-26')] };
    for (const policy of ['skip', 'overwrite', 'keepBoth'] as const) {
      expect(planMerge(incoming, existing, policy, 'useExisting').challenges.map((c) => c.id)).toEqual(['older']);
    }
  });
  it('the same challenge changed elsewhere replaces the local one only with "overwrite"', () => {
    const existing = { ...emptyDataSet(), challenges: [ch('c', '2026-11-02')] };
    const incoming = { ...emptyDataSet(), challenges: [{ ...ch('c', '2026-11-02'), status: 'done' as const }] };
    expect(planMerge(incoming, existing, 'overwrite', 'useExisting').challenges).toHaveLength(1);
    expect(planMerge(incoming, existing, 'skip', 'useExisting').challenges).toHaveLength(0);
    expect(planMerge(incoming, existing, 'keepBoth', 'useExisting').challenges).toHaveLength(0);
  });
});
