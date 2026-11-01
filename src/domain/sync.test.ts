import { describe, expect, it } from 'vitest';
import { bestE1rm, initialLoad, raisesLoad, shouldAsk, syncSuggestion, type SyncItem } from './sync';
import type { ProgressionEvent, SetRecord } from './types';

const item = (goal: SyncItem['goal'], load: number, repsMin: number, repsMax: number): SyncItem => ({
  lineageId: `${goal}-${load}`,
  exerciseId: 'bench',
  planId: 'p',
  planName: 'P',
  dayName: 'A',
  goal,
  targets: { load },
  load,
  repsMin,
  repsMax,
  increment: 2.5,
});
const hyp = (load: number, min = 8, max = 12) => item('hypertrophy', load, min, max);
const str = (load: number, min = 5, max = 5) => item('strength', load, min, max);
const sets = (load: number, reps: number[]): SetRecord[] => reps.map((r, i) => ({ id: String(i), kind: 'working', values: { load, reps: r }, status: 'done', notes: '' }));

describe('syncSuggestion', () => {
  it('hypertrophy → strength by 1RM: 60 × 12 → 1RM 84 → 5 reps 72 → rounded down to 70', () => {
    expect(syncSuggestion(hyp(62.5), str(60), 'e1rm', bestE1rm(sets(60, [12, 12, 12])))).toBe(70);
  });
  it('hypertrophy → strength uses the strength range minimum (4–6 → 4 reps)', () => {
    // 84 / (1 + 4/30) = 74.1 → 72.5.
    expect(syncSuggestion(hyp(62.5), str(60, 4, 6), 'e1rm', 84)).toBe(72.5);
  });
  it('hypertrophy → strength by increment: hypertrophy + 1 increment', () => {
    expect(syncSuggestion(hyp(62.5), str(60), 'increment', 84)).toBe(65);
  });
  it('without a 1RM (more than 12 reps) the increment rule applies', () => {
    expect(syncSuggestion(hyp(62.5), str(60), 'e1rm', bestE1rm(sets(50, [15, 15, 15])))).toBe(65);
  });
  it('strength → hypertrophy by 1RM: to the range minimum', () => {
    // 80 × 5 → 93.3 → 8 reps: 73.7 → 72.5.
    expect(syncSuggestion(str(80), hyp(60), 'e1rm', bestE1rm(sets(80, [5, 5, 5, 5, 5])))).toBe(72.5);
  });
  it('strength → hypertrophy by increment: hypertrophy + 1 increment', () => {
    expect(syncSuggestion(str(80), hyp(60), 'increment', 93)).toBe(62.5);
  });
  it('hypertrophy → hypertrophy: same range → same load; other range → 1RM', () => {
    expect(syncSuggestion(hyp(62.5), hyp(55), 'e1rm', 84)).toBe(62.5);
    // 84 / (1 + 15/30) = 56 → 55.
    expect(syncSuggestion(hyp(62.5), hyp(50, 15, 20), 'e1rm', 84)).toBe(55);
  });
  it('strength → strength: same range → same load; other range → 1RM', () => {
    expect(syncSuggestion(str(80), str(70), 'e1rm', 93)).toBe(80);
    // 80 × 5 → 93.3 → 3 reps: 84.8 → 82.5.
    expect(syncSuggestion(str(80), str(70, 3, 3), 'e1rm', bestE1rm(sets(80, [5, 5, 5, 5, 5])))).toBe(82.5);
    // The method does not change the same-goal rule: 93 → 84.5 → 82.5.
    expect(syncSuggestion(str(80), str(70, 3, 3), 'increment', 93)).toBe(82.5);
  });
});

describe('shouldAsk', () => {
  it('never asks to go down or when off', () => {
    expect(shouldAsk('below', hyp(62.5), str(75), 70)).toBe(false);
    expect(shouldAsk('off', hyp(62.5), str(60), 70)).toBe(false);
  });
  it('below: asks whenever the target is below the suggestion', () => {
    expect(shouldAsk('below', hyp(55), str(60), 65)).toBe(true);
    expect(shouldAsk('below', str(80), hyp(60), 72.5)).toBe(true);
  });
  it('order: only when hypertrophy reaches strength; strength going up never asks', () => {
    expect(shouldAsk('order', hyp(55), str(60), 65)).toBe(false);
    expect(shouldAsk('order', hyp(60), str(60), 70)).toBe(true);
    expect(shouldAsk('order', str(80), hyp(60), 72.5)).toBe(false);
    expect(shouldAsk('order', hyp(62.5), hyp(55), 62.5)).toBe(true);
    expect(shouldAsk('order', str(80), str(70), 80)).toBe(true);
  });
});

describe('raisesLoad', () => {
  const ev = (over: Partial<ProgressionEvent> = {}): ProgressionEvent => ({ id: 'e', lineageId: 'l', exerciseId: 'x', strategy: 'double', outcome: 'ready', reasons: [], decision: 'applied', before: { load: 60 }, after: { load: 62.5 }, createdAt: '', ...over });
  it('applied, reps up and a higher manual value are sources; sync answers are not (no chain)', () => {
    expect(raisesLoad(ev())).toBe(true);
    expect(raisesLoad(ev({ decision: 'reps_up' }))).toBe(true);
    expect(raisesLoad(ev({ decision: 'overridden', after: { load: 65 } }))).toBe(true);
    expect(raisesLoad(ev({ decision: 'overridden', after: { load: 55 } }))).toBe(false);
    expect(raisesLoad(ev({ decision: 'kept' }))).toBe(false);
    expect(raisesLoad(ev({ outcome: 'sync' }))).toBe(false);
  });
});

describe('initialLoad', () => {
  it('strength starts from the hypertrophy history', () => {
    expect(initialLoad({ goal: 'strength', repsMin: 5, repsMax: 5, increment: 2.5 }, [{ item: hyp(62.5), sets: sets(60, [12, 12, 12]) }], 'e1rm')).toBe(70);
  });
  it('strength → hypertrophy needs a 1RM; otherwise the next source or nothing', () => {
    expect(initialLoad({ goal: 'hypertrophy', repsMin: 8, repsMax: 12, increment: 2.5 }, [{ item: str(80) }], 'e1rm')).toBeUndefined();
    expect(initialLoad({ goal: 'hypertrophy', repsMin: 8, repsMax: 12, increment: 2.5 }, [{ item: str(80), sets: sets(80, [5]) }], 'increment')).toBeUndefined();
  });
});
