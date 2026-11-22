import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutEntry } from './types';
import { adjustRest, endRest, restAfterChange, restFor, restLeft, startRest } from './rest';

const NOW = Date.parse('2026-11-22T10:00:00.000Z');
const set = (status: 'pending' | 'done', id: string) => ({ id, kind: 'working' as const, values: { load: 50, reps: 10 }, status, notes: '' });
const entry = (id: string, statuses: ('pending' | 'done')[], restSec?: number) =>
  ({ id, exerciseId: id, sets: statuses.map((s, i) => set(s, `${id}${i}`)), restSec }) as unknown as WorkoutEntry;
const workout = (entries: WorkoutEntry[]): Workout => ({ id: 'w', startedAt: '2026-11-22T09:30:00.000Z', status: 'in_progress', notes: '', updatedAt: '', entries });

describe('rest timer', () => {
  it('rest length: plan item, else setting, else 90 s; 0 is off', () => {
    expect(restFor(entry('a', [], 120), {})).toBe(120);
    expect(restFor(entry('a', []), { restSec: 60 })).toBe(60);
    expect(restFor(entry('a', []), {})).toBe(90);
    expect(startRest(workout([]), 0, NOW).restUntil).toBeUndefined();
  });

  it('starts, adjusts (never before now), counts down and ends', () => {
    let w = startRest(workout([]), 90, NOW);
    expect(restLeft(w, NOW)).toBe(90);
    expect(restLeft(w, NOW + 30_500)).toBe(60);
    w = adjustRest(w, 15, NOW);
    expect(restLeft(w, NOW)).toBe(105);
    expect(restLeft(adjustRest(w, -500, NOW), NOW)).toBe(0);
    expect(endRest(w).restUntil).toBeUndefined();
    expect(restLeft(endRest(w), NOW)).toBe(0);
  });

  it('a set marked done starts the rest of its entry; other changes keep the timer; no rest after the last set', () => {
    const before = workout([entry('a', ['done', 'pending'], 120), entry('b', ['pending'])]);
    const done = workout([entry('a', ['done', 'done'], 120), entry('b', ['pending'])]);
    expect(restLeft(restAfterChange(before, done, { restSec: 60 }, NOW), NOW)).toBe(120);
    expect(restAfterChange(before, before, {}, NOW).restUntil).toBeUndefined();
    const last = workout([entry('a', ['done', 'done'], 120), entry('b', ['done'])]);
    expect(restAfterChange(done, last, {}, NOW).restUntil).toBeUndefined();
    expect(restAfterChange(before, done, { restSec: 0 }, NOW).restUntil).toBe(startRest(done, 120, NOW).restUntil);
  });
});
