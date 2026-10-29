import { describe, expect, it } from 'vitest';
import { applyTargets, evaluate, evaluateCompletion, initialTargets, setGoals, type EvalInput } from './progression';
import type { ProgressionConfig, SetPrescription, SetRecord } from './types';
import { DEFAULT_CRITERIA } from './units';

const double = (increment = 2.5, cap?: number): ProgressionConfig => ({
  strategy: 'double',
  steps: [{ metric: 'load', increment, cap }],
  criteria: { ...DEFAULT_CRITERIA },
});

const rx = (n: number, min: number, max: number, load: number): SetPrescription[] =>
  Array.from({ length: n }, () => ({ kind: 'working', targets: { reps: { min, max }, load: { value: load } } }));

const done = (reps: number[], load: number): SetRecord[] =>
  reps.map((r, i) => ({ id: `s${i}`, kind: 'working', values: { reps: r, load }, status: 'done', notes: '' }));

const input = (over: Partial<EvalInput>): EvalInput => ({
  config: double(),
  prescription: rx(3, 8, 12, 40),
  sets: [],
  pain: false,
  technique: false,
  substituted: false,
  ...over,
});

describe('double progression — hypertrophy example (context §6.3)', () => {
  const sessions: [number[], string][] = [
    [[10, 9, 8], 'keep'],
    [[11, 10, 9], 'progress'],
    [[12, 11, 10], 'progress'],
    [[12, 12, 12], 'increase'],
  ];
  let previous: EvalInput['previous'];
  for (const [reps, expected] of sessions) {
    it(`${reps.join('/')} @40kg → ${expected}`, () => {
      const ev = evaluate(input({ sets: done(reps, 40), previous }));
      expect(ev.outcome).toBe(expected);
      previous = { prescription: rx(3, 8, 12, 40), sets: done(reps, 40) };
    });
  }

  it('all sets at 12 → increase 40 → 42.5 kg', () => {
    expect(evaluate(input({ sets: done([12, 12, 12], 40) })).suggestion).toEqual({ metric: 'load', from: 40, to: 42.5, kind: 'increase' });
  });

  it('after the increase, 9/8/8 at the new load keeps the load (rebuild)', () => {
    const ev = evaluate(input({ prescription: rx(3, 8, 12, 42.5), sets: done([9, 8, 8], 42.5) }));
    expect(ev.outcome).toBe('keep');
    expect(ev.suggestion).toBeUndefined();
  });
});

describe('hypertrophy (onTop ask)', () => {
  const ask = (): ProgressionConfig => ({ ...double(), onTop: 'ask' });
  it('top of the range → ready with load and reps options', () => {
    const ev = evaluate(input({ config: ask(), sets: done([12, 12, 12], 40) }));
    expect(ev.outcome).toBe('ready');
    expect(ev.suggestion?.to).toBe(42.5);
    expect(ev.repsOption).toEqual({ from: { min: 8, max: 12 }, to: { min: 9, max: 13 } });
  });
  it('at the load cap only the reps option remains', () => {
    const ev = evaluate(input({ config: { ...double(2.5, 40), onTop: 'ask' }, sets: done([12, 12, 12], 40) }));
    expect(ev.outcome).toBe('ready');
    expect(ev.suggestion).toBeUndefined();
  });
  it('within the range → keep', () => expect(evaluate(input({ config: ask(), sets: done([12, 11, 12], 40) })).outcome).toBe('keep'));
  it('applyTargets applies a reps range override to working sets', () => {
    expect(applyTargets(rx(1, 8, 12, 40), { load: 40 }, { min: 9, max: 13 })[0].targets.reps).toEqual({ min: 9, max: 13 });
  });
});

describe('double progression — strength example (context §6.4)', () => {
  const p = rx(4, 4, 6, 70);
  const cfg = double(1.25);
  it('5/5/4/4 → keep', () => expect(evaluate(input({ config: cfg, prescription: p, sets: done([5, 5, 4, 4], 70) })).outcome).toBe('keep'));
  it('6/6/6/6 → increase by 1.25 kg', () => expect(evaluate(input({ config: cfg, prescription: p, sets: done([6, 6, 6, 6], 70) })).suggestion?.to).toBe(71.25));
  it('6/6/6/5 (max−1) → no increase', () => expect(evaluate(input({ config: cfg, prescription: p, sets: done([6, 6, 6, 5], 70) })).outcome).toBe('keep'));
});

describe('missed reps → keep or step back (D8)', () => {
  it('a set below the minimum → missed, step back one increment', () => {
    const ev = evaluate(input({ sets: done([10, 8, 7], 40) }));
    expect(ev.outcome).toBe('missed');
    expect(ev.suggestion).toEqual({ metric: 'load', from: 40, to: 37.5, kind: 'decrease' });
    expect(ev.reasons[0]).toEqual({ code: 'set_below_min', params: { set: 3, reps: 7, min: 8 } });
  });
  it('boundary: exactly the minimum is not missed', () => {
    expect(evaluate(input({ sets: done([8, 8, 8], 40) })).outcome).toBe('keep');
  });
  it('missed reps with a skipped set still asks', () => {
    const sets = done([9, 6, 0], 40);
    sets[2].status = 'skipped';
    expect(evaluate(input({ sets })).outcome).toBe('missed');
  });
  it('step back never goes below 0', () => {
    expect(evaluate(input({ prescription: rx(3, 8, 12, 2), sets: done([5, 5, 5], 2) })).suggestion?.to).toBe(0);
  });
});

describe('keep without a question', () => {
  it('skipped set (incomplete) → keep, no suggestion', () => {
    const sets = done([12, 12, 12], 40);
    sets[2].status = 'skipped';
    const ev = evaluate(input({ sets }));
    expect(ev.outcome).toBe('incomplete');
    expect(ev.suggestion).toBeUndefined();
  });
  it('fewer sets than prescribed → incomplete', () => expect(evaluate(input({ sets: done([12, 12], 40) })).outcome).toBe('incomplete'));
  it('lower load than the working load → restricted', () => expect(evaluate(input({ sets: done([12, 12, 12], 37.5) })).outcome).toBe('restricted'));
  it('substitution → restricted, even with missed reps', () => {
    expect(evaluate(input({ sets: done([12, 12, 12], 40), substituted: true })).outcome).toBe('restricted');
    expect(evaluate(input({ sets: done([5, 5, 5], 40), substituted: true })).outcome).toBe('restricted');
  });
  it('substitution does not block when the condition is disabled', () => {
    const cfg = double();
    cfg.criteria.blockOnSubstitution = false;
    expect(evaluate(input({ config: cfg, sets: done([12, 12, 12], 40), substituted: true })).outcome).toBe('increase');
  });
  it('pain blocks the increase', () => {
    const ev = evaluate(input({ sets: done([12, 12, 12], 40), pain: true }));
    expect(ev.outcome).toBe('restricted');
    expect(ev.reasons.map((r) => r.code)).toContain('pain');
  });
  it('pain does not block when the condition is disabled', () => {
    const cfg = double();
    cfg.criteria.blockOnPain = false;
    expect(evaluate(input({ config: cfg, sets: done([12, 12, 12], 40), pain: true })).outcome).toBe('increase');
  });
  it('technique issue blocks the increase', () => expect(evaluate(input({ sets: done([12, 12, 12], 40), technique: true })).outcome).toBe('restricted'));
});

describe('other double-progression edge cases', () => {
  it('extra sets do not block', () => expect(evaluate(input({ sets: done([12, 12, 12, 8], 40) })).outcome).toBe('increase'));
  it('warm-up sets are ignored', () => {
    const sets: SetRecord[] = [{ id: 'w', kind: 'warmup', values: { reps: 5, load: 20 }, status: 'done', notes: '' }, ...done([12, 12, 12], 40)];
    expect(evaluate(input({ sets })).outcome).toBe('increase');
  });
  it('cap', () => {
    expect(evaluate(input({ config: double(2.5, 41), sets: done([12, 12, 12], 40) })).suggestion?.to).toBe(41);
    expect(evaluate(input({ config: double(2.5, 40), sets: done([12, 12, 12], 40) })).outcome).toBe('at_cap');
  });
  it('uses the new rep range after a plan change', () => expect(evaluate(input({ prescription: rx(3, 6, 10, 40), sets: done([10, 10, 10], 40) })).outcome).toBe('increase'));
  it('lb increments (values in recorded unit)', () => {
    expect(evaluate(input({ config: double(5), prescription: rx(3, 8, 12, 45), sets: done([12, 12, 12], 45) })).suggestion?.to).toBe(50);
  });
});

describe('non-progressive and target-based exercises (context §4.3–4.5)', () => {
  const none: ProgressionConfig = { strategy: 'none', steps: [], criteria: { ...DEFAULT_CRITERIA } };
  const warmup: SetPrescription[] = [{ kind: 'working', targets: { duration: { value: 5 } } }];
  const tw = (min: number): SetRecord[] => [{ id: 't', kind: 'working', values: { duration: min, speed: 5.5 }, status: 'done', notes: '' }];

  it('treadmill warm-up 5 min, no progression: never a suggestion, even when short', () => {
    for (const d of [5, 5, 4]) {
      const ev = evaluate(input({ config: none, prescription: warmup, sets: tw(d) }));
      expect(ev.outcome).toBe('no_progression');
      expect(ev.suggestion).toBeUndefined();
    }
    expect(evaluate(input({ config: none, prescription: warmup, sets: tw(4) })).completion).toBe('below_target');
  });

  const walk: SetPrescription[] = [{ kind: 'working', targets: { duration: { value: 10 }, speed: { value: 5 }, incline: { value: 2 } } }];
  const walked = (d: number, sp = 5, inc = 2): SetRecord[] => [{ id: 'w', kind: 'working', values: { duration: d, speed: sp, incline: inc }, status: 'done', notes: '' }];
  const dur: ProgressionConfig = { strategy: 'duration', steps: [{ metric: 'duration', increment: 2 }], criteria: { ...DEFAULT_CRITERIA } };

  it('treadmill duration progression 10 → 12 min', () => {
    expect(evaluate(input({ config: dur, prescription: walk, sets: walked(10) })).suggestion).toEqual({ metric: 'duration', from: 10, to: 12, kind: 'increase' });
  });
  it('duration short of target → missed, step back 10 → 8', () => {
    const ev = evaluate(input({ config: dur, prescription: walk, sets: walked(9) }));
    expect(ev.outcome).toBe('missed');
    expect(ev.suggestion).toEqual({ metric: 'duration', from: 10, to: 8, kind: 'decrease' });
  });
  it('lower incline than prescribed (not the progressed variable) → keep', () => {
    expect(evaluate(input({ config: dur, prescription: walk, sets: walked(10, 5, 1) })).outcome).toBe('keep');
  });
  it('multi-variable: duration to its cap, then incline, then at_cap', () => {
    const cfg: ProgressionConfig = {
      strategy: 'multi',
      steps: [
        { metric: 'duration', increment: 2, cap: 20 },
        { metric: 'incline', increment: 1, cap: 8 },
      ],
      criteria: { ...DEFAULT_CRITERIA },
    };
    expect(evaluate(input({ config: cfg, prescription: walk, sets: walked(10) })).suggestion?.metric).toBe('duration');
    expect(evaluate(input({ config: cfg, prescription: applyTargets(walk, { duration: 20 }), sets: walked(20) })).suggestion).toEqual({ metric: 'incline', from: 2, to: 3, kind: 'increase' });
    expect(evaluate(input({ config: cfg, prescription: applyTargets(walk, { duration: 20, incline: 8 }), sets: walked(20, 5, 8) })).outcome).toBe('at_cap');
  });

  const plank: SetPrescription[] = Array.from({ length: 3 }, () => ({ kind: 'working' as const, targets: { duration: { value: 30 } } }));
  const planks = (d: number[]): SetRecord[] => d.map((x, i) => ({ id: `p${i}`, kind: 'working', values: { duration: x }, status: 'done', notes: '' }));
  it('plank 3×30 s with duration progression', () => {
    const cfg: ProgressionConfig = { strategy: 'duration', steps: [{ metric: 'duration', increment: 10 }], criteria: { ...DEFAULT_CRITERIA } };
    expect(evaluate(input({ config: cfg, prescription: plank, sets: planks([30, 30, 30]) })).suggestion?.to).toBe(40);
    expect(evaluate(input({ config: cfg, prescription: plank, sets: planks([30, 30, 25]) })).outcome).toBe('missed');
  });
  it('manual progression: no suggestion', () => {
    const cfg: ProgressionConfig = { strategy: 'manual', steps: [], criteria: { ...DEFAULT_CRITERIA } };
    const ev = evaluate(input({ config: cfg, prescription: plank, sets: planks([30, 30, 30]) }));
    expect(ev.outcome).toBe('manual');
    expect(ev.suggestion).toBeUndefined();
  });
});

describe("today's goals", () => {
  it('last time + 1 rep at the same load, capped at the max', () => {
    expect(setGoals(double(), rx(3, 8, 12, 40), { prescription: rx(3, 8, 12, 40), sets: done([10, 12, 8], 40) }).map((g) => g.reps)).toEqual([11, 12, 9]);
  });
  it('after a load increase: the range minimum', () => {
    expect(setGoals(double(), rx(3, 8, 12, 42.5), { prescription: rx(3, 8, 12, 40), sets: done([12, 12, 12], 40) }).map((g) => g.reps)).toEqual([8, 8, 8]);
  });
  it('no history: the minimum; fixed targets: the value', () => {
    const g = setGoals(double(), rx(1, 8, 12, 40));
    expect(g[0]).toEqual({ reps: 8, load: 40 });
  });
  it('never below the minimum after a bad session', () => {
    expect(setGoals(double(), rx(1, 8, 12, 40), { prescription: rx(1, 8, 12, 40), sets: done([5], 40) })[0].reps).toBe(8);
  });
});

describe('helpers', () => {
  it('evaluateCompletion reports missing values', () => {
    const r = evaluateCompletion(rx(1, 8, 12, 40), [{ id: 'a', kind: 'working', values: { reps: 10 }, status: 'done', notes: '' }]);
    expect(r.completion).toBe('below_target');
    expect(r.reasons[0].code).toBe('value_missing');
  });
  it('applyTargets changes only working sets', () => {
    const sets: SetPrescription[] = [{ kind: 'warmup', targets: { load: { value: 20 } } }, ...rx(1, 8, 12, 40)];
    const out = applyTargets(sets, { load: 45 });
    expect(out[0].targets.load?.value).toBe(20);
    expect(out[1].targets.load).toEqual({ value: 45 });
    expect(sets[1].targets.load?.value).toBe(40);
  });
  it('initialTargets reads first working set', () => expect(initialTargets(double(), rx(3, 8, 12, 40))).toEqual({ load: 40 }));
});
