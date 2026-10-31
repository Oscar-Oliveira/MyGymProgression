import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GymDB } from './db';
import { createRepo, type Repo } from './repo';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlan, newPlanItem } from '../domain/factory';
import { buildBundle, parseBundle, planMerge } from '../domain/interchange';

let db: GymDB;
let repo: Repo;

beforeEach(async () => {
  db = new GymDB(`test-${crypto.randomUUID()}`);
  repo = createRepo(db);
});

async function setupPlan() {
  const ex = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Bench' });
  ex.defaultSets.forEach((s) => (s.targets.load = { value: 40 }));
  await repo.saveExercise(ex);
  const { plan, version } = newPlan('P');
  plan.goal = 'strength';
  const day = newDay('A');
  day.items.push(newPlanItem(ex));
  version.days.push(day);
  await repo.createPlan(plan, version);
  return { ex, plan, version, day };
}

async function doSession(planId: string, dayId: string, reps: number[]) {
  const id = await repo.startWorkout(planId, dayId);
  const w = (await db.workouts.get(id))!;
  w.entries[0].sets = w.entries[0].sets.map((s, i) => ({ ...s, values: { ...s.values, reps: reps[i] }, status: 'done' }));
  await repo.finishWorkout(w, false);
  return id;
}

describe('repo (IndexedDB)', () => {
  it('seeds the library once, without duplicates', async () => {
    const n = await repo.seedLibrary();
    expect(n).toBeGreaterThanOrEqual(40);
    expect(await repo.seedLibrary()).toBe(0);
  });

  it('full cycle: start locks version, success applies the increase, next session uses it; undo reverts', async () => {
    const { plan, day } = await setupPlan();
    await doSession(plan.id, day.id, [12, 12, 12]);
    expect((await db.planVersions.get(plan.currentVersionId))!.locked).toBe(true);
    const ev = (await db.progressionEvents.toArray())[0];
    expect(ev.outcome).toBe('increase');
    expect(ev.decision).toBe('applied');
    const id2 = await repo.startWorkout(plan.id, day.id);
    const w2 = (await db.workouts.get(id2))!;
    expect(w2.entries[0].prescription[0].targets.load?.value).toBe(42.5);
    expect(w2.entries[0].sets.map((s) => s.goal?.reps)).toEqual([8, 8, 8]);
    await repo.discardWorkout(id2);
    await repo.decide(ev.id, { kind: 'revert' });
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(40);
  });

  it('missed reps wait for a decision; step back lowers the load', async () => {
    const { plan, day } = await setupPlan();
    await doSession(plan.id, day.id, [9, 7, 6]);
    const ev = (await db.progressionEvents.toArray())[0];
    expect(ev.decision).toBe('pending');
    await repo.decide(ev.id, { kind: 'stepBack' });
    expect((await db.progressionEvents.get(ev.id))!.decision).toBe('stepped_back');
    const id2 = await repo.startWorkout(plan.id, day.id);
    expect((await db.workouts.get(id2))!.entries[0].prescription[0].targets.load?.value).toBe(37.5);
  });

  it('migrates a v1 database (RIR/RPE, old outcomes) to v2', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const { default: Dexie } = await import('dexie');
    const old = new Dexie(name);
    old.version(1).stores({ exercises: 'id', plans: 'id', planVersions: 'id', progressionStates: 'lineageId', workouts: 'id', progressionEvents: 'id', revisions: 'id', settings: 'id' });
    await old.table('progressionEvents').add({ id: 'e1', lineageId: 'L', exerciseId: 'X', strategy: 'double', outcome: 'increase_recommended', recommendation: { metric: 'load', from: 40, to: 42.5 }, reasons: [], decision: 'accepted', before: {}, after: {}, createdAt: '2026-01-01T00:00:00Z' });
    await old.table('workouts').add({ id: 'w1', startedAt: '2026-01-01T00:00:00Z', status: 'completed', notes: '', updatedAt: '2026-01-01T00:00:00Z', entries: [{ id: 'n', prescription: [{ kind: 'working', targets: {}, rir: 2 }], progression: { strategy: 'double', steps: [], criteria: { blockOnPain: true, blockOnTechnique: true, blockOnSubstitution: true, useRir: true } }, sets: [{ id: 's', kind: 'working', values: { reps: 10 }, rir: 1, status: 'done', notes: '' }], evaluation: { strategy: 'double', outcome: 'completed_as_prescribed', completion: 'complete', reasons: [] } }] });
    old.close();
    const db2 = new GymDB(name);
    const ev = (await db2.progressionEvents.get('e1'))!;
    expect(ev.outcome).toBe('increase');
    expect(ev.decision).toBe('applied');
    expect(ev.suggestion).toEqual({ metric: 'load', from: 40, to: 42.5, kind: 'increase' });
    const w = (await db2.workouts.get('w1'))!;
    expect(w.entries[0].sets[0]).not.toHaveProperty('rir');
    expect(w.entries[0].prescription[0]).not.toHaveProperty('rir');
    expect(w.entries[0].progression.criteria).not.toHaveProperty('useRir');
    expect(w.entries[0].evaluation?.outcome).toBe('keep');
  });

  it('plan edit after use creates a new version; old workout keeps its version and prescription', async () => {
    const { plan, day } = await setupPlan();
    const wid = await doSession(plan.id, day.id, [10, 10, 10]);
    const v1 = (await db.planVersions.get(plan.currentVersionId))!;
    const days = structuredClone(v1.days);
    days[0].items[0].sets.forEach((s) => (s.targets.reps = { min: 5, max: 8 }));
    await repo.savePlan((await db.plans.get(plan.id))!, days);
    const p2 = (await db.plans.get(plan.id))!;
    expect(p2.currentVersionId).not.toBe(v1.id);
    const w = (await db.workouts.get(wid))!;
    expect(w.planVersionId).toBe(v1.id);
    expect(w.entries[0].prescription[0].targets.reps).toEqual({ min: 8, max: 12 });
    expect(await db.planVersions.get(v1.id)).toBeDefined();
  });

  it('adds an exercise to a plan day from the exercise; a used version gets a new version', async () => {
    const { plan, day } = await setupPlan();
    const squat = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Squat' });
    await repo.saveExercise(squat);
    await repo.addToPlanDay(plan.id, day.id, squat.id);
    const v1 = (await db.planVersions.get((await db.plans.get(plan.id))!.currentVersionId))!;
    expect(v1.id).toBe(plan.currentVersionId);
    expect(v1.days[0].items.map((i) => i.exerciseId)).toEqual([day.items[0].exerciseId, squat.id]);
    // Strength plan: the new item gets the goal's sets.
    expect(v1.days[0].items[1].sets.length).toBeGreaterThan(0);
    await doSession(plan.id, day.id, [5, 5, 5]);
    await repo.addToPlanDay(plan.id, day.id, squat.id);
    const v2 = (await db.planVersions.get((await db.plans.get(plan.id))!.currentVersionId))!;
    expect(v2.number).toBe(2);
    expect(v2.days[0].items).toHaveLength(3);
    expect((await db.planVersions.get(v1.id))!.days[0].items).toHaveLength(2);
  });

  it('correction keeps a revision and re-evaluates', async () => {
    const { plan, day } = await setupPlan();
    const wid = await doSession(plan.id, day.id, [12, 12, 11]);
    const w = (await db.workouts.get(wid))!;
    expect(w.entries[0].evaluation?.outcome).toBe('keep');
    w.entries[0].sets[2].values.reps = 12;
    await repo.correctWorkout(w);
    expect((await db.workouts.get(wid))!.entries[0].evaluation?.outcome).toBe('increase');
    const revs = await db.revisions.where('workoutId').equals(wid).toArray();
    expect(revs).toHaveLength(1);
    expect(revs[0].previous.entries[0].sets[2].values.reps).toBe(11);
  });

  it('export → import into an empty DB round-trips; merge skips identical', async () => {
    const { plan, day } = await setupPlan();
    await doSession(plan.id, day.id, [12, 12, 12]);
    const data = await repo.readAll();
    const parsed = parseBundle(JSON.stringify(buildBundle(data, 'full', 't')));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const db2 = new GymDB(`test-${crypto.randomUUID()}`);
    const repo2 = createRepo(db2);
    await repo2.importReplace(parsed.bundle.data);
    const data2 = await repo2.readAll();
    expect(data2.workouts).toEqual(data.workouts);
    expect(data2.planVersions).toEqual(data.planVersions);

    const merge = planMerge(parsed.bundle.data, data2, 'skip', 'import');
    expect(merge.workouts).toHaveLength(0);
    await repo2.importMerge(merge);
    expect(await db2.workouts.count()).toBe(1);
  });

  it('delete plan keeps versions used by workouts', async () => {
    const { plan, day } = await setupPlan();
    await doSession(plan.id, day.id, [10, 10, 10]);
    await repo.deletePlan(plan.id);
    expect(await db.plans.get(plan.id)).toBeUndefined();
    expect(await db.planVersions.count()).toBe(1);
    expect(await db.workouts.count()).toBe(1);
  });

  it('exerciseUsage lists plans', async () => {
    const { ex } = await setupPlan();
    expect(await repo.exerciseUsage(ex.id)).toEqual(['P']);
  });

  it('correction recreates an undecided decision from the new values', async () => {
    const { plan, day } = await setupPlan();
    const wid = await doSession(plan.id, day.id, [9, 7, 6]);
    expect((await db.progressionEvents.toArray())[0].decision).toBe('pending');
    const w = (await db.workouts.get(wid))!;
    w.entries[0].sets.forEach((s) => (s.values.reps = 12));
    await repo.correctWorkout(w);
    const evs = await db.progressionEvents.toArray();
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ outcome: 'increase', decision: 'applied' });
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(42.5);
  });

  it('correction keeps a decision already taken', async () => {
    const { plan, day } = await setupPlan();
    const wid = await doSession(plan.id, day.id, [9, 7, 6]);
    const ev = (await db.progressionEvents.toArray())[0];
    await repo.decide(ev.id, { kind: 'stepBack' });
    const w = (await db.workouts.get(wid))!;
    w.entries[0].sets.forEach((s) => (s.values.reps = 12));
    await repo.correctWorkout(w);
    const evs = await db.progressionEvents.toArray();
    expect(evs).toHaveLength(1);
    expect(evs[0].decision).toBe('stepped_back');
  });

  it('deleting a workout undoes its automatic increase', async () => {
    const { plan, day } = await setupPlan();
    const wid = await doSession(plan.id, day.id, [12, 12, 12]);
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(42.5);
    await repo.deleteWorkout(wid);
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(40);
    expect(await db.progressionEvents.count()).toBe(0);
  });

  it('resuming an interrupted workout undoes its increase, keeps a revision, and reopens it', async () => {
    const { plan, day } = await setupPlan();
    const id = await repo.startWorkout(plan.id, day.id);
    const w = (await db.workouts.get(id))!;
    w.entries[0].sets = w.entries[0].sets.map((s) => ({ ...s, values: { ...s.values, reps: 12 }, status: 'done' }));
    await repo.finishWorkout(w, true);
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(42.5);
    await repo.resumeWorkout(id);
    expect((await db.workouts.get(id))!.status).toBe('in_progress');
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(40);
    expect(await db.progressionEvents.count()).toBe(0);
    expect(await db.revisions.where('workoutId').equals(id).count()).toBe(1);
    // Finishing again evaluates it again.
    await repo.finishWorkout((await db.workouts.get(id))!, false);
    expect((await db.progressionStates.toArray())[0].targets.load).toBe(42.5);
  });

  it('database v3 removes old rest times from saved data', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const { default: Dexie } = await import('dexie');
    const old = new Dexie(name);
    old.version(2).stores({ exercises: 'id', plans: 'id', planVersions: 'id', progressionStates: 'lineageId', workouts: 'id', progressionEvents: 'id', revisions: 'id', settings: 'id' });
    const ex = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Old' });
    await old.table('exercises').add({ ...ex, defaultSets: ex.defaultSets.map((s) => ({ ...s, restSec: 90 })) });
    old.close();
    const db2 = new GymDB(name);
    const got = (await db2.exercises.get(ex.id))!;
    expect(got.defaultSets[0]).not.toHaveProperty('restSec');
    expect(got.name).toBe('Old');
  });

  it('two library imports at the same time do not duplicate exercises', async () => {
    const rec = { sid: '1', slug: 'x-1', url: 'u', name: 'Library Only', bodyParts: ['Chest'], equipment: ['Barbell'], type: 'weight_reps', primary: [], secondary: [], overview: '', steps: [], tips: [], video: '', related: [] };
    await Promise.all([repo.importLibrary([rec]), repo.importLibrary([rec])]);
    expect((await db.exercises.toArray()).filter((e) => e.name === 'Library Only')).toHaveLength(1);
  });
});

describe('joining duplicate exercises (D19)', () => {
  it('moves plans, workouts, progression and its own progression to the kept exercise, then deletes the duplicate', async () => {
    const t = await setupPlan();
    const dup = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Supino', aliases: ['Flat bench', 'bench'] });
    dup.defaultSets.forEach((s) => (s.targets.load = { value: 40 }));
    dup.video = 'https://www.youtube.com/watch?v=abc';
    await repo.saveExercise(dup);
    const q = newPlan('Q');
    q.plan.goal = 'strength';
    const day = newDay('B');
    const item = newPlanItem(dup);
    item.substitutes = [t.ex.id];
    day.items.push(item);
    q.version.days.push(day);
    await repo.createPlan(q.plan, q.version);
    await doSession(q.plan.id, day.id, [12, 12, 12]);
    await db.progressionStates.put({ lineageId: `exercise:${dup.id}`, exerciseId: dup.id, targets: { load: 50 }, updatedAt: '2026-10-30T00:00:00.000Z' });

    const preview = await repo.joinPreview(t.ex.id, dup.id);
    expect(preview).toMatchObject({ plans: 1, workouts: 1 });
    expect(preview!.progression).toBeGreaterThanOrEqual(2);

    await repo.joinExercises(t.ex.id, dup.id);
    expect(await db.exercises.get(dup.id)).toBeUndefined();
    const kept = (await db.exercises.get(t.ex.id))!;
    expect(kept.aliases).toEqual(['Supino', 'Flat bench']);
    expect(kept.video).toBe(dup.video);
    const v = (await db.planVersions.get((await db.plans.get(q.plan.id))!.currentVersionId))!;
    expect(v.days[0].items[0].exerciseId).toBe(t.ex.id);
    expect(v.days[0].items[0].substitutes).toEqual([]);
    const w = (await db.workouts.toArray()).flatMap((x) => x.entries);
    expect(w.every((e) => e.exerciseId === t.ex.id)).toBe(true);
    expect(w[0].exercise.name).toBe('Supino'); // history keeps what was logged
    expect((await db.progressionEvents.toArray()).every((e) => e.exerciseId === t.ex.id)).toBe(true);
    const states = await db.progressionStates.toArray();
    expect(states.some((s) => s.exerciseId === dup.id || s.lineageId === `exercise:${dup.id}`)).toBe(false);
    expect(states.find((s) => s.lineageId === `exercise:${t.ex.id}`)?.targets.load).toBe(50);
  });

  it('joining an exercise with itself or a missing one does nothing', async () => {
    const t = await setupPlan();
    expect(await repo.joinPreview(t.ex.id, t.ex.id)).toBeUndefined();
    await expect(repo.joinExercises(t.ex.id, 'missing')).rejects.toThrow('exercise_missing');
    expect(await db.exercises.get(t.ex.id)).toBeDefined();
  });
});
