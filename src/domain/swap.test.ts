import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, newExercise } from './factory';
import { swapPlanExercise, type SwapInput } from './swap';
import type { Workout } from './types';
import { snapshot } from './workout';

const wrong = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Wrong' });
const right = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Right' });
const other = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Other' });
const entry = (id: string, ex: typeof wrong, lineageId: string, substitutedFor?: string) => ({ id, exerciseId: ex.id, exercise: snapshot(ex), lineageId, substitutedFor, sets: [] });
const input = (workouts: Workout[], over: Partial<SwapInput> = {}): SwapInput => ({
  lineageId: 'L', fromId: wrong.id, to: right, fromMetrics: wrong.metrics, versions: [], workouts, states: [], events: [], revisions: [], ...over,
});

describe('swapPlanExercise (V2-D32)', () => {
  it('moves the entries of the item, its substitutes and its corrections; other lineages stay', () => {
    const w = {
      id: 'w',
      entries: [entry('a', wrong, 'L'), entry('b', other, 'L', wrong.id), entry('c', right, 'L', wrong.id), entry('d', wrong, 'M')],
    } as unknown as Workout;
    const r = swapPlanExercise(input([w], { revisions: [{ id: 'r', workoutId: 'w', at: '', previous: w }] }));
    const [a, b, c, d] = r.workouts[0].entries;
    expect([a.exerciseId, a.exercise.name]).toEqual([right.id, 'Right']);
    expect([b.exerciseId, b.substitutedFor]).toEqual([other.id, right.id]);
    expect(c.exerciseId).toBe(right.id);
    expect('substitutedFor' in c).toBe(false);
    expect(d).toBe(w.entries[3]);
    expect(r.revisions[0].previous.entries[0].exerciseId).toBe(right.id);
    expect(r.counts.workouts).toBe(1);
  });

  it('leaves workouts without the item unchanged and compares the metrics', () => {
    const w = { id: 'w', entries: [entry('d', wrong, 'M')] } as unknown as Workout;
    const plank = newExercise('duration', DEFAULT_SETTINGS, { name: 'Plank' });
    const r = swapPlanExercise(input([w], { to: plank }));
    expect(r.workouts).toEqual([]);
    expect(r.sameMetrics).toBe(false);
    expect(swapPlanExercise(input([w])).sameMetrics).toBe(true);
  });
});
