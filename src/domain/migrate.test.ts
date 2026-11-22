import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlan, newPlanItem, uid } from './factory';
import { emptyDataSet, type DataSet } from './interchange';
import type { LibraryRecord } from './library';
import type { Exercise, ProgressionState, Workout } from './types';
import { adHocLineage } from './workout';
import { checkMigration, defaultDecisions, KEEP, migrateV1, nameTokens, suggestMatches } from './migrate';

const lib = (sid: string, name: string, equipment: string, pt: string, primary = ['Pectorals'], bodyPart = 'chest'): LibraryRecord => ({
  sid, slug: `exds-${sid}`, url: 'https://github.com/hasaneyldrm/exercises-dataset', name, bodyParts: [bodyPart], equipment: [equipment], type: 'weight_reps',
  primary, secondary: [], overview: '', steps: ['Step.'], tips: [], video: '', related: [], source: 'exercises-dataset (MIT)', pt: { name: pt },
  thumb: `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@x/images/${sid}.jpg`, imageUrl: `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@x/videos/${sid}.gif`,
});
const LIB = [
  lib('0025', 'Barbell Bench Press', 'barbell', 'Supino com barra'),
  lib('0150', 'Cable Bar Lateral Pulldown', 'cable', 'Puxada à frente com barra na polia', ['Lats'], 'back'),
  lib('0739', 'Sled 45° Leg Press', 'sled machine', 'Prensa de pernas a 45°', ['Glutes'], 'upper legs'),
  lib('0596', 'Lever Seated Fly', 'leverage machine', 'Aberturas sentado na máquina (peck deck)'),
  lib('0294', 'Dumbbell Biceps Curl', 'dumbbell', 'Curl de bíceps com halteres', ['Biceps'], 'upper arms'),
  lib('0201', 'Cable Pushdown', 'cable', 'Tríceps na polia', ['Triceps'], 'upper arms'),
];

const v1ex = (name: string, equipment: string, over: Partial<Exercise> = {}) =>
  newExercise('reps_load', DEFAULT_SETTINGS, { name, equipment, source: { name: 'Exsercise.com', id: name, url: 'https://example.com' }, ...over });

function workout(day: string, items: { ex: Exercise; sets: [number, number][] }[]): Workout {
  return {
    id: uid(), startedAt: `${day}T10:00:00.000Z`, endedAt: `${day}T11:00:00.000Z`, status: 'completed', notes: '', updatedAt: `${day}T11:00:00.000Z`,
    entries: items.map(({ ex, sets }) => ({
      id: uid(), exerciseId: ex.id, lineageId: adHocLineage(ex.id), role: 'main', pain: false, technique: false, notes: '', prescription: [], progression: ex.progression,
      exercise: { name: ex.name, category: ex.category, metrics: ex.metrics, loadMode: ex.loadMode, primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles },
      sets: sets.map(([load, reps]) => ({ id: uid(), kind: 'working' as const, values: { load, reps }, status: 'done' as const, notes: '' })),
    })),
  };
}
const state = (ex: Exercise, load: number, updatedAt: string): ProgressionState => ({ lineageId: adHocLineage(ex.id), exerciseId: ex.id, targets: { load }, updatedAt });

/** A small v1 data set with every case: exact, exact through the equipment, probable, none, a duplicate pair, unused and own exercises. */
function v1Data() {
  const bench = v1ex('Barbell Bench Press', 'barbell', { personalNotes: 'banco 3' });
  bench.defaultSets[0].targets.load = { value: 60 };
  const pulldown = v1ex('Bar Lateral Pulldown', 'cable');
  const press1 = v1ex('Sled 45 degrees Leg Press', 'sled');
  const press2 = v1ex('Sled 45° Leg Press', 'sled');
  const pecDeck = v1ex('Lever Pec Deck Fly', 'machine');
  const rowing = v1ex('Rowing', 'machine');
  const pushdown = v1ex('Triceps Pushdown', 'cable');
  const unused = v1ex('Zottman Curl', 'dumbbell');
  const own = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Prensa do meu ginásio', equipment: 'machine' });

  const { plan, version } = newPlan('Hipertrofia');
  const day = newDay('A');
  const pressItem = newPlanItem(press1);
  pressItem.substitutes = [press2.id];
  day.items.push(newPlanItem(bench), newPlanItem(pulldown), pressItem);
  version.days.push(day);
  const old = { ...structuredClone(version), id: uid(), number: 0, locked: true };
  old.days[0].items[2] = { ...newPlanItem(press2), lineageId: pressItem.lineageId };

  const data: DataSet = {
    ...emptyDataSet(),
    exercises: [bench, pulldown, press1, press2, pecDeck, rowing, pushdown, unused, own],
    plans: [plan],
    planVersions: [old, version],
    workouts: [
      workout('2026-11-02', [{ ex: bench, sets: [[60, 10], [60, 9]] }, { ex: press2, sets: [[100, 12]] }, { ex: rowing, sets: [[0, 0]] }]),
      workout('2026-11-09', [{ ex: bench, sets: [[60, 10]] }, { ex: press1, sets: [[110, 10]] }, { ex: pecDeck, sets: [[40, 12]] }, { ex: pushdown, sets: [[25, 12]] }]),
    ],
    progressionStates: [state(press1, 110, '2026-11-09T11:00:00.000Z'), state(press2, 100, '2026-11-02T11:00:00.000Z')],
    goals: [{ id: uid(), exerciseId: press2.id, exerciseName: press2.name, load: 150, createdAt: '2026-11-01T00:00:00.000Z' }],
  };
  return { data, bench, pulldown, press1, press2, pecDeck, rowing, pushdown, unused, own, pressItem };
}

describe('v1 → v2 migration', () => {
  it('reads names as comparable words', () => {
    expect(nameTokens('Sled 45° Leg Press')).toEqual(['sled', '45', 'degrees', 'leg', 'press']);
    expect(nameTokens('Push-Up (Male)')).toEqual(['push', 'up']);
    expect(nameTokens('Dumbbell Bicep Curls')).toEqual(['dumbbell', 'biceps', 'curl']);
  });

  it('suggests library matches: exact, exact through the equipment, probable, none; unused library entries stay in v1', () => {
    const { data, bench, pulldown, press1, press2, pecDeck, rowing, pushdown, unused, own } = v1Data();
    const s = suggestMatches(data, LIB);
    const by = (e: Exercise) => s.find((x) => x.exerciseId === e.id);
    const first = (e: Exercise) => ({ kind: by(e)?.kind, ...by(e)?.candidates[0] });
    expect(first(bench)).toEqual({ kind: 'exact', sid: '0025', score: 1 });
    expect(first(pulldown)).toMatchObject({ kind: 'exact', sid: '0150' });
    expect(first(press1)).toMatchObject({ kind: 'exact', sid: '0739' });
    expect(first(press2)).toMatchObject({ kind: 'exact', sid: '0739' });
    expect(first(pecDeck)).toMatchObject({ kind: 'exact', sid: '0596' }); // "pec deck" reads as "seated fly"
    expect(first(pushdown)).toMatchObject({ kind: 'probable', sid: '0201' });
    expect(by(rowing)?.kind).toBe('none');
    expect(by(own)).toBeDefined();
    expect(by(unused)).toBeUndefined();
    expect(s[0].exerciseId).toBe(bench.id); // most used first
    expect(defaultDecisions(s)[rowing.id]).toBe(KEEP);
  });

  it('migrates with the default decisions: ids, settings and history kept, duplicates joined, library added, checks pass', () => {
    const { data, bench, press1, press2, rowing, own, pressItem } = v1Data();
    const before = structuredClone(data);
    const { data: v2, report } = migrateV1(data, LIB, defaultDecisions(suggestMatches(data, LIB)), DEFAULT_SETTINGS);
    expect(data).toEqual(before); // the input is not changed
    expect(report.ok).toBe(true);
    expect(report.dangling).toEqual([]);
    expect(report.workoutMismatches).toEqual([]);
    expect(report.exercises).toEqual({ v1: 9, migrated: 8, library: 5, own: 2, merged: 1, left: 1, libraryAdded: 1 });

    const ex = (id: string) => v2.exercises.find((e) => e.id === id);
    expect(ex(bench.id)).toMatchObject({ name: 'Supino com barra', personalNotes: 'banco 3', source: { id: '0025' }, primaryMuscles: ['chest'] });
    expect(ex(bench.id)?.aliases).toContain('Barbell Bench Press');
    expect(ex(bench.id)?.defaultSets[0].targets.load).toEqual({ value: 60 });
    expect(ex(bench.id)?.thumb).toMatch(/images\/0025\.jpg$/);
    // The two leg presses are one exercise now; everything that used the second points to the first.
    expect(ex(press2.id)).toBeUndefined();
    expect(ex(press1.id)).toMatchObject({ name: 'Prensa de pernas a 45°', source: { id: '0739' } });
    expect(v2.workouts.flatMap((w) => w.entries).filter((e) => e.exerciseId === press2.id)).toEqual([]);
    expect(v2.goals[0].exerciseId).toBe(press1.id);
    expect(v2.planVersions[0].days[0].items[2].exerciseId).toBe(press1.id);
    expect(v2.planVersions[1].days[0].items.find((i) => i.id === pressItem.id)?.substitutes).toEqual([]);
    expect(v2.progressionStates).toEqual([expect.objectContaining({ lineageId: adHocLineage(press1.id), targets: { load: 110 } })]);
    // Records keep what was logged at the time.
    expect(v2.workouts[0].entries[0].exercise.name).toBe('Barbell Bench Press');
    // Own and unmatched exercises stay as they were; the rest of the library is added.
    expect(ex(rowing.id)).toEqual(rowing);
    expect(ex(own.id)).toEqual(own);
    expect(v2.exercises.find((e) => e.source?.id === '0294')?.name).toBe('Curl de bíceps com halteres');
    expect(v2.exercises.filter((e) => e.source?.id === '0025')).toHaveLength(1);
  });

  it('KEEP leaves the v1 exercise as it is, and the library exercise is added beside it', () => {
    const { data, bench } = v1Data();
    const decisions = { ...defaultDecisions(suggestMatches(data, LIB)), [bench.id]: KEEP };
    const { data: v2, report } = migrateV1(data, LIB, decisions, DEFAULT_SETTINGS);
    expect(report.ok).toBe(true);
    expect(v2.exercises.find((e) => e.id === bench.id)).toEqual(bench);
    expect(v2.exercises.find((e) => e.source?.id === '0025')?.id).not.toBe(bench.id);
  });

  it('the check finds changed sets, lost references and missing records', () => {
    const { data } = v1Data();
    const { data: v2 } = migrateV1(data, LIB, defaultDecisions(suggestMatches(data, LIB)), DEFAULT_SETTINGS);
    const bad = structuredClone(v2);
    bad.workouts[0].entries[0].sets[0].values.reps = 1;
    bad.workouts[1].entries[0].exerciseId = 'missing';
    bad.goals = [];
    const r = checkMigration(data, bad);
    expect(r.ok).toBe(false);
    expect(r.workoutMismatches).toEqual([bad.workouts[0].id]);
    expect(r.dangling.some((x) => x.startsWith(`workout ${bad.workouts[1].id}`))).toBe(true);
    expect(r.tables.find((t) => t.name === 'goals')).toMatchObject({ before: 1, after: 0, ok: false });
  });
});
