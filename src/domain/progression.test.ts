import { describe, expect, it } from 'vitest';
import { applyTargets, evaluate, evaluateCompletion, initialTargets, type EvalInput } from './progression';
import type { ProgressionConfig, SetPrescription, SetRecord } from './types';
import { DEFAULT_CRITERIA } from './units';

const double = (increment = 2.5, cap?: number): ProgressionConfig => ({
  strategy: 'double',
  steps: [{ metric: 'load', increment, cap }],
  criteria: { ...DEFAULT_CRITERIA },
});

const rx = (n: number, min: number, max: number, load: number, rir?: number): SetPrescription[] =>
  Array.from({ length: n }, () => ({ kind: 'working', targets: { reps: { min, max }, load: { value: load } }, rir }));

const done = (reps: number[], load: number, rir?: (number | undefined)[]): SetRecord[] =>
  reps.map((r, i) => ({ id: `s${i}`, kind: 'working', values: { reps: r, load }, rir: rir?.[i], status: 'done', notes: '' }));

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
    [[10, 9, 8], 'completed_as_prescribed'],
    [[11, 10, 9], 'progress'],
    [[12, 11, 10], 'progress'],
    [[12, 12, 12], 'increase_recommended'],
  ];
  let previous: EvalInput['previous'];
  for (const [reps, expected] of sessions) {
    it(`${reps.join('/')} @40kg → ${expected}`, () => {
      const ev = evaluate(input({ sets: done(reps, 40), previous }));
      expect(ev.outcome).toBe(expected);
      previous = { prescription: rx(3, 8, 12, 40), sets: done(reps, 40) };
    });
  }

  it('recommends 40 → 42.5 kg only when all sets reach 12', () => {
    const ev = evaluate(input({ sets: done([12, 12, 12], 40) }));
    expect(ev.recommendation).toEqual({ metric: 'load', from: 40, to: 42.5 });
  });

  it('after the increase, 9/8/8 at the new load keeps the load (rebuild)', () => {
    const ev = evaluate(input({ prescription: rx(3, 8, 12, 42.5), sets: done([9, 8, 8], 42.5) }));
    expect(ev.outcome).toBe('completed_as_prescribed');
    expect(ev.recommendation).toBeUndefined();
  });

  it('a lower load than the previous session is not compared as progress', () => {
    const ev = evaluate(
      input({ prescription: rx(3, 8, 12, 42.5), sets: done([11, 10, 9], 42.5), previous: { prescription: rx(3, 8, 12, 40), sets: done([10, 9, 8], 40) } }),
    );
    expect(ev.outcome).toBe('completed_as_prescribed');
  });
});

describe('double progression — strength example (context §6.4)', () => {
  const p = rx(4, 4, 6, 70);
  const cfg = double(1.25);
  it('5/5/4/4 → keep', () => expect(evaluate(input({ config: cfg, prescription: p, sets: done([5, 5, 4, 4], 70) })).outcome).toBe('completed_as_prescribed'));
  it('6/6/6/6 → increase by the configured 1.25 kg', () => {
    const ev = evaluate(input({ config: cfg, prescription: p, sets: done([6, 6, 6, 6], 70) }));
    expect(ev.outcome).toBe('increase_recommended');
    expect(ev.recommendation?.to).toBe(71.25);
  });
  it('6/6/6/5 (boundary max−1) → no increase', () => expect(evaluate(input({ config: cfg, prescription: p, sets: done([6, 6, 6, 5], 70) })).recommendation).toBeUndefined());
});

describe('double progression — exceptions (context §6.5)', () => {
  it('incomplete session never increases', () => {
    const ev = evaluate(input({ sets: done([12, 12], 40) }));
    expect(ev.outcome).toBe('incomplete');
    expect(ev.recommendation).toBeUndefined();
  });
  it('skipped set counts as missing', () => {
    const sets = done([12, 12, 12], 40);
    sets[2].status = 'skipped';
    expect(evaluate(input({ sets })).outcome).toBe('incomplete');
  });
  it('extra sets above the prescription do not block', () => {
    expect(evaluate(input({ sets: done([12, 12, 12, 8], 40) })).outcome).toBe('increase_recommended');
  });
  it('warm-up sets are ignored', () => {
    const sets: SetRecord[] = [{ id: 'w', kind: 'warmup', values: { reps: 5, load: 20 }, status: 'done', notes: '' }, ...done([12, 12, 12], 40)];
    expect(evaluate(input({ sets })).outcome).toBe('increase_recommended');
  });
  it('rep below range min → below_target', () => {
    expect(evaluate(input({ sets: done([10, 8, 7], 40) })).outcome).toBe('below_target');
  });
  it('load below working load → below_target', () => {
    expect(evaluate(input({ sets: done([12, 12, 12], 37.5) })).outcome).toBe('below_target');
  });
  it('substitution blocks the increase', () => {
    expect(evaluate(input({ sets: done([12, 12, 12], 40), substituted: true })).outcome).toBe('restricted');
  });
  it('pain flag blocks the increase', () => {
    const ev = evaluate(input({ sets: done([12, 12, 12], 40), pain: true }));
    expect(ev.outcome).toBe('restricted');
    expect(ev.reasons.map((r) => r.code)).toContain('pain');
  });
  it('pain does not block when the criterion is disabled', () => {
    const cfg = double();
    cfg.criteria.blockOnPain = false;
    expect(evaluate(input({ config: cfg, sets: done([12, 12, 12], 40), pain: true })).outcome).toBe('increase_recommended');
  });
  it('technique flag blocks the increase', () => {
    expect(evaluate(input({ sets: done([12, 12, 12], 40), technique: true })).outcome).toBe('restricted');
  });
  it('recorded RIR below target blocks', () => {
    const ev = evaluate(input({ prescription: rx(3, 8, 12, 40, 2), sets: done([12, 12, 12], 40, [2, 2, 1]) }));
    expect(ev.outcome).toBe('restricted');
    expect(ev.reasons.find((r) => r.code === 'rir_below_target')?.params?.set).toBe(3);
  });
  it('missing RIR does not block (Q3) but is reported', () => {
    const ev = evaluate(input({ prescription: rx(3, 8, 12, 40, 2), sets: done([12, 12, 12], 40) }));
    expect(ev.outcome).toBe('increase_recommended');
    expect(ev.reasons.map((r) => r.code)).toContain('rir_not_recorded');
  });
  it('respects a load cap', () => {
    const ev = evaluate(input({ config: double(2.5, 41), sets: done([12, 12, 12], 40) }));
    expect(ev.recommendation?.to).toBe(41);
    expect(evaluate(input({ config: double(2.5, 40), sets: done([12, 12, 12], 40) })).outcome).toBe('completed_as_prescribed');
  });
  it('uses the new rep range after a plan change', () => {
    expect(evaluate(input({ prescription: rx(3, 6, 10, 40), sets: done([10, 10, 10], 40) })).outcome).toBe('increase_recommended');
  });
  it('works with lb units and per-side loads (values in recorded unit)', () => {
    const ev = evaluate(input({ config: double(5), prescription: rx(3, 8, 12, 45), sets: done([12, 12, 12], 45) }));
    expect(ev.recommendation).toEqual({ metric: 'load', from: 45, to: 50 });
  });
});

describe('non-progressive and target-based exercises (context §4.3–4.5)', () => {
  const warmup: SetPrescription[] = [{ kind: 'working', targets: { duration: { value: 5 } } }];
  const tw = (min: number): SetRecord[] => [{ id: 't', kind: 'working', values: { duration: min, speed: 5.5 }, status: 'done', notes: '' }];
  const none: ProgressionConfig = { strategy: 'none', steps: [], criteria: { ...DEFAULT_CRITERIA } };

  it('treadmill warm-up 5 min with no progression: completed, never recommended', () => {
    for (let i = 0; i < 5; i++) {
      const ev = evaluate(input({ config: none, prescription: warmup, sets: tw(5) }));
      expect(ev.outcome).toBe('no_progression');
      expect(ev.completion).toBe('complete');
      expect(ev.recommendation).toBeUndefined();
    }
  });
  it('treadmill warm-up shorter than prescribed is below target', () => {
    expect(evaluate(input({ config: none, prescription: warmup, sets: tw(4) })).completion).toBe('below_target');
  });

  const walk: SetPrescription[] = [{ kind: 'working', targets: { duration: { value: 10 }, speed: { value: 5 }, incline: { value: 2 } } }];
  const walked = (d: number, s = 5, inc = 2): SetRecord[] => [{ id: 'w', kind: 'working', values: { duration: d, speed: s, incline: inc }, status: 'done', notes: '' }];

  it('treadmill with duration progression recommends 10 → 12 min', () => {
    const cfg: ProgressionConfig = { strategy: 'duration', steps: [{ metric: 'duration', increment: 2 }], criteria: { ...DEFAULT_CRITERIA } };
    const ev = evaluate(input({ config: cfg, prescription: walk, sets: walked(10) }));
    expect(ev.recommendation).toEqual({ metric: 'duration', from: 10, to: 12 });
  });
  it('duration progression does not recommend when incline was lower than prescribed', () => {
    const cfg: ProgressionConfig = { strategy: 'duration', steps: [{ metric: 'duration', increment: 2 }], criteria: { ...DEFAULT_CRITERIA } };
    expect(evaluate(input({ config: cfg, prescription: walk, sets: walked(10, 5, 1) })).outcome).toBe('below_target');
  });
  it('multi-variable progresses duration until its cap, then incline', () => {
    const cfg: ProgressionConfig = {
      strategy: 'multi',
      steps: [
        { metric: 'duration', increment: 2, cap: 20 },
        { metric: 'incline', increment: 1, cap: 8 },
      ],
      criteria: { ...DEFAULT_CRITERIA },
    };
    expect(evaluate(input({ config: cfg, prescription: walk, sets: walked(10) })).recommendation?.metric).toBe('duration');
    const capped = applyTargets(walk, { duration: 20 });
    const ev = evaluate(input({ config: cfg, prescription: capped, sets: walked(20) }));
    expect(ev.recommendation).toEqual({ metric: 'incline', from: 2, to: 3 });
    const all = applyTargets(walk, { duration: 20, incline: 8 });
    expect(evaluate(input({ config: cfg, prescription: all, sets: walked(20, 5, 8) })).outcome).toBe('completed_as_prescribed');
  });

  const plank: SetPrescription[] = Array.from({ length: 3 }, () => ({ kind: 'working' as const, targets: { duration: { value: 30 } } }));
  const planks = (d: number[]): SetRecord[] => d.map((x, i) => ({ id: `p${i}`, kind: 'working', values: { duration: x }, status: 'done', notes: '' }));
  it('plank 3×30 s with duration progression', () => {
    const cfg: ProgressionConfig = { strategy: 'duration', steps: [{ metric: 'duration', increment: 10 }], criteria: { ...DEFAULT_CRITERIA } };
    expect(evaluate(input({ config: cfg, prescription: plank, sets: planks([30, 30, 30]) })).recommendation?.to).toBe(40);
    expect(evaluate(input({ config: cfg, prescription: plank, sets: planks([30, 30, 25]) })).outcome).toBe('below_target');
  });
  it('plank with manual progression records completion only', () => {
    const cfg: ProgressionConfig = { strategy: 'manual', steps: [], criteria: { ...DEFAULT_CRITERIA } };
    const ev = evaluate(input({ config: cfg, prescription: plank, sets: planks([30, 30, 30]) }));
    expect(ev.outcome).toBe('manual');
    expect(ev.recommendation).toBeUndefined();
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
  it('initialTargets reads first working set', () => {
    expect(initialTargets(double(), rx(3, 8, 12, 40))).toEqual({ load: 40 });
  });
});
