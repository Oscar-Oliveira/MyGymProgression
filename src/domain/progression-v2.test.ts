// v2 progression rules: RIR brake (V2-D15), triple progression (V2-D16), deload question (V2-D17).
import { describe, expect, it } from 'vitest';
import { deloadEvent } from './deload';
import { applyTargets, evaluate, EXTRA_SETS, type EvalInput } from './progression';
import type { ProgressionConfig, ProgressionEvent, SetPrescription, SetRecord } from './types';
import { DEFAULT_CRITERIA } from './units';
import { eventsFor } from './workout';

const config = (strategy: 'double' | 'triple'): ProgressionConfig => ({ strategy, steps: [{ metric: 'load', increment: 2.5 }], criteria: { ...DEFAULT_CRITERIA } });
const rx = (n: number, load = 40): SetPrescription[] => Array.from({ length: n }, () => ({ kind: 'working', targets: { reps: { min: 8, max: 12 }, load: { value: load } } }));
const done = (reps: number[], load = 40, rir?: (number | undefined)[]): SetRecord[] =>
  reps.map((r, i) => ({ id: `s${i}`, kind: 'working', values: { reps: r, load }, status: 'done', notes: '', ...(rir?.[i] !== undefined ? { rir: rir[i] } : {}) }));
const input = (over: Partial<EvalInput>): EvalInput => ({ config: config('double'), prescription: rx(3), sets: [], pain: false, technique: false, substituted: false, ...over });

describe('RIR brake (V2-D15)', () => {
  it('top of the range with the last set to failure: no increase this time', () => {
    const e = evaluate(input({ sets: done([12, 12, 12], 40, [2, 1, 0]) }));
    expect(e.outcome).toBe('restricted');
    expect(e.reasons.map((r) => r.code)).toEqual(['top_reached', 'rir_zero']);
    expect(e.suggestion).toBeUndefined();
  });

  it('RIR 1 or no RIR: the usual increase', () => {
    expect(evaluate(input({ sets: done([12, 12, 12], 40, [2, 1, 1]) })).outcome).toBe('increase');
    expect(evaluate(input({ sets: done([12, 12, 12]) })).outcome).toBe('increase');
  });

  it('RIR 0 below the top changes nothing (the rule is a brake on increases only)', () => {
    expect(evaluate(input({ sets: done([10, 9, 9], 40, [0, 0, 0]) })).outcome).toBe('keep');
  });
});

describe('triple progression (V2-D16)', () => {
  const triple = (over: Partial<EvalInput>) => input({ config: config('triple'), ...over });

  it('top of the range: one more set, up to two above the plan', () => {
    const first = evaluate(triple({ sets: done([12, 12, 12]) }));
    expect(first).toMatchObject({ outcome: 'increase', suggestion: { metric: EXTRA_SETS, from: 0, to: 1 } });
    const second = evaluate(triple({ prescription: rx(4), extraSets: 1, sets: done([12, 12, 12, 12]) }));
    expect(second.suggestion).toMatchObject({ metric: EXTRA_SETS, from: 1, to: 2 });
  });

  it('with the sets at the maximum: the load goes up', () => {
    const e = evaluate(triple({ prescription: rx(5), extraSets: 2, sets: done([12, 12, 12, 12, 12]) }));
    expect(e).toMatchObject({ outcome: 'increase', suggestion: { metric: 'load', from: 40, to: 42.5 } });
  });

  it('the added sets copy the last working set; the key is not a target of the sets', () => {
    const sets = applyTargets(rx(3), { load: 45, [EXTRA_SETS]: 2 });
    expect(sets).toHaveLength(5);
    expect(sets.every((s) => s.targets.load?.value === 45 && !(EXTRA_SETS in s.targets))).toBe(true);
    const withWarmup: SetPrescription[] = [{ kind: 'warmup', targets: { reps: { value: 8 } } }, ...rx(2), { kind: 'drop', targets: { reps: { value: 10 } } }];
    expect(applyTargets(withWarmup, { [EXTRA_SETS]: 1 }).map((s) => s.kind)).toEqual(['warmup', 'working', 'working', 'working', 'drop']);
  });

  it('a load increase goes back to the plan’s sets; a set increase keeps the load', () => {
    const entry = (extraSets: number, reps: number[]) => ({
      id: `e${extraSets}`,
      exerciseId: 'x',
      lineageId: 'L',
      exercise: { name: 'Squat', category: 'compound', metrics: [], loadMode: 'total', primaryMuscles: [], secondaryMuscles: [] },
      prescription: rx(3 + extraSets),
      progression: config('triple'),
      role: 'main',
      sets: done(reps),
      pain: false,
      technique: false,
      notes: '',
      extraSets,
    });
    const run = (extraSets: number, reps: number[], targets: Record<string, number>) => {
      const e = entry(extraSets, reps);
      const evaluated = { ...e, evaluation: evaluate({ config: e.progression, prescription: e.prescription, sets: e.sets, pain: false, technique: false, substituted: false, extraSets }) };
      const w = { id: 'w', startedAt: '', status: 'completed', notes: '', updatedAt: '', entries: [evaluated] } as never;
      return eventsFor(w, new Map([['L', { lineageId: 'L', exerciseId: 'x', targets, updatedAt: '' }]])).states[0].targets;
    };
    expect(run(0, [12, 12, 12], { load: 40 })).toEqual({ load: 40, [EXTRA_SETS]: 1 });
    expect(run(2, [12, 12, 12, 12, 12], { load: 40, [EXTRA_SETS]: 2 })).toEqual({ load: 42.5 });
  });
});

describe('deload question (V2-D17)', () => {
  const ev = (id: string, outcome: ProgressionEvent['outcome'], createdAt: string, workoutId = `w-${id}`): ProgressionEvent => ({
    id,
    workoutId,
    lineageId: 'L',
    exerciseId: 'x',
    strategy: 'double',
    outcome,
    reasons: [],
    decision: 'none',
    before: { load: 60 },
    after: { load: 60 },
    createdAt,
  });
  const step = { metric: 'load' as const, increment: 2.5 };

  it('the third session in a row without progress asks for −10 % (rounded down to the increment)', () => {
    const history = [ev('a', 'keep', '2026-11-01'), ev('b', 'missed', '2026-11-03')];
    const d = deloadEvent(ev('c', 'keep', '2026-11-05'), history, 3, step);
    expect(d).toMatchObject({ outcome: 'deload', decision: 'pending', suggestion: { metric: 'load', from: 60, to: 52.5, kind: 'decrease' } });
    expect(d.reasons[0]).toEqual({ code: 'stalled', params: { n: 3 } });
  });

  it('progress or an earlier deload question restarts the count; other strategies and outcomes are left as they are', () => {
    expect(deloadEvent(ev('c', 'keep', '2026-11-05'), [ev('a', 'keep', '2026-11-01'), ev('b', 'progress', '2026-11-03')], 3, step).outcome).toBe('keep');
    expect(deloadEvent(ev('c', 'keep', '2026-11-05'), [ev('a', 'keep', '2026-10-28'), ev('d', 'deload', '2026-11-01'), ev('b', 'keep', '2026-11-03')], 3, step).outcome).toBe('keep');
    expect(deloadEvent({ ...ev('c', 'keep', '2026-11-05'), strategy: 'duration' }, [ev('a', 'keep', '2026-11-01'), ev('b', 'keep', '2026-11-03')], 3, step).outcome).toBe('keep');
    expect(deloadEvent(ev('c', 'increase', '2026-11-05'), [ev('a', 'keep', '2026-11-01'), ev('b', 'keep', '2026-11-03')], 3, step).outcome).toBe('increase');
  });

  it('events of the same workout (a correction) do not count twice', () => {
    const history = [ev('a', 'keep', '2026-11-01'), ev('old', 'keep', '2026-11-05', 'w-c')];
    expect(deloadEvent(ev('c', 'keep', '2026-11-06', 'w-c'), history, 3, step).outcome).toBe('keep');
  });
});
