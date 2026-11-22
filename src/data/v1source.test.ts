import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { GymDB } from './db';
import { readV1 } from './v1source';
import { DEFAULT_SETTINGS, newExercise } from '../domain/factory';

describe('reading the v1 database (read-only)', () => {
  it('returns nothing and creates nothing when there is no v1 database', async () => {
    const name = `v1-missing-${crypto.randomUUID()}`;
    expect(await readV1(name)).toBeUndefined();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(name);
  });

  it('reads every table and the settings, and leaves the database and its version as they were', async () => {
    const name = `v1-${crypto.randomUUID()}`;
    const v1 = new GymDB(name);
    const ex = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Barbell Bench Press' });
    await v1.exercises.add(ex);
    await v1.settings.put({ ...DEFAULT_SETTINGS, gymName: 'Ginásio' });
    const version = v1.verno;
    v1.close();

    const data = await readV1(name);
    expect(data?.exercises).toEqual([ex]);
    expect(data?.workouts).toEqual([]);
    expect(data?.settings?.gymName).toBe('Ginásio');

    const again = new GymDB(name);
    await again.open();
    expect(again.verno).toBe(version);
    expect(await again.exercises.count()).toBe(1);
    again.close();
  });

  it('an empty v1 database counts as none', async () => {
    const name = `v1-empty-${crypto.randomUUID()}`;
    const v1 = new GymDB(name);
    await v1.open();
    v1.close();
    expect(await readV1(name)).toBeUndefined();
  });
});
