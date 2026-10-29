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
});
