// Tests for D38–D49: warm-up, short on time, do it later, goals, consistency map and the trainer functions.
import { describe, expect, it } from 'vitest';
import { consistencyMap, weekStreak } from './analysis';
import { goalStatus, linearFit } from './goal';
import { evaluate } from './progression';
import { beatsLastTime, pickTip, reportWeek, rivalRows, rivalWorkout, weekReport } from './trainer';
import type { Challenge, MetricDef, ProgressionEvent, SetRecord, Workout, WorkoutEntry } from './types';
import { DEFAULT_CRITERIA } from './units';
import { addWarmups, warmupLoads } from './warmup';
import { moveToEnd, shortenWorkout } from './workout';

const RL: MetricDef[] = [
  { key: 'reps', unit: 'reps', required: true },
  { key: 'load', unit: 'kg', required: true },
];
const set = (load: number, reps = 8, status: SetRecord['status'] = 'done', kind: SetRecord['kind'] = 'working'): SetRecord => ({
  id: Math.random().toString(),
  kind,
  values: { reps, load },
  status,
  notes: '',
});

function entry(exerciseId: string, sets: SetRecord[], over: Partial<WorkoutEntry> = {}, muscle = 'chest'): WorkoutEntry {
  return {
    id: Math.random().toString(),
    exerciseId,
    exercise: { name: exerciseId, category: 'compound', metrics: RL, loadMode: 'total', primaryMuscles: [muscle], secondaryMuscles: [] },
    prescription: sets.map((s) => ({ kind: s.kind, targets: { reps: { min: 8, max: 12 }, load: { value: s.values.load } } })),
    progression: { strategy: 'double', steps: [{ metric: 'load', increment: 2.5 }], criteria: DEFAULT_CRITERIA },
    role: 'main',
    sets,
    pain: false,
    technique: false,
    notes: '',
    ...over,
  };
}

const workout = (date: string, entries: WorkoutEntry[], over: Partial<Workout> = {}): Workout => ({
  id: date,
  startedAt: `${date}T10:00:00`,
  status: 'completed',
  notes: '',
  entries,
  updatedAt: date,
  ...over,
});

describe('warm-up (D38)', () => {
  it('ramp 50/70/85 % rounded down to the step; no repeats, nothing at 0 or at the working load', () => {
    expect(warmupLoads(100, 2.5)).toEqual([
      { load: 50, reps: 8 },
      { load: 70, reps: 5 },
      { load: 85, reps: 3 },
    ]);
    expect(warmupLoads(62.5, 2.5)).toEqual([
      { load: 30, reps: 8 },
      { load: 42.5, reps: 5 },
      { load: 52.5, reps: 3 },
    ]);
    expect(warmupLoads(5, 2.5)).toEqual([{ load: 2.5, reps: 8 }]);
    expect(warmupLoads(2, 2.5)).toEqual([]);
  });

  it('only the first compound exercise of each main muscle, outside circuits', () => {
    const pend = (l: number) => set(l, 8, 'pending');
    const w = workout('2026-11-02', [
      entry('bench', [pend(80), pend(80)]),
      entry('incline', [pend(60)]),
      entry('fly', [pend(20)], { exercise: { name: 'fly', category: 'isolation', metrics: RL, loadMode: 'total', primaryMuscles: ['back'], secondaryMuscles: [] } }),
      entry('squat', [pend(100)], { circuit: { id: 'c', name: 'C', rounds: 1 } }, 'quads'),
      entry('row', [pend(70)], {}, 'back'),
    ]);
    const out = addWarmups(w).entries;
    const warm = (e: WorkoutEntry) => e.sets.filter((s) => s.kind === 'warmup').map((s) => s.values.load);
    expect(warm(out[0])).toEqual([40, 55, 67.5]);
    expect(out[0].prescription.slice(0, 3).every((p) => p.kind === 'warmup')).toBe(true);
    expect(out[0].prescription).toHaveLength(out[0].sets.length);
    expect(warm(out[1])).toEqual([]);
    expect(warm(out[2])).toEqual([]);
    expect(warm(out[3])).toEqual([]);
    expect(warm(out[4])).toEqual([35, 47.5, 57.5]);
  });

  it('warm-up sets do not count for progression', () => {
    const e = addWarmups(workout('d', [entry('bench', [set(80, 12, 'pending'), set(80, 12, 'pending')])])).entries[0];
    const done = e.sets.map((s) => (s.kind === 'warmup' ? { ...s, status: 'done' as const } : { ...s, status: 'done' as const }));
    const ev = evaluate({ config: e.progression, prescription: e.prescription, sets: done, pain: false, technique: false, substituted: false });
    expect(ev.outcome).toBe('increase');
  });
});

describe('short on time (D40)', () => {
  it('removes optional exercises not started, and one pending working set from exercises with 3 or more', () => {
    const w = workout('d', [
      entry('a', [set(50, 8, 'pending'), set(50, 8, 'pending'), set(50, 8, 'pending')]),
      entry('b', [set(50, 8, 'pending'), set(50, 8, 'pending')]),
      entry('c', [set(10, 8, 'pending')], { role: 'optional' }),
      entry('d', [set(10)], { role: 'optional' }),
      entry('e', [set(50, 8, 'pending'), set(50, 8, 'pending'), set(50, 8, 'pending')], { circuit: { id: 'c', name: 'C', rounds: 3 } }),
      entry('f', [set(50), set(50), set(50)]),
    ]);
    const out = shortenWorkout(w);
    expect(out.short).toBe(true);
    expect(out.entries.map((e) => e.exerciseId)).toEqual(['a', 'b', 'd', 'e', 'f']);
    expect(out.entries[0]).toMatchObject({ short: true });
    expect(out.entries[0].sets).toHaveLength(2);
    expect(out.entries[0].prescription).toHaveLength(2);
    expect(out.entries[1].short).toBeUndefined();
    expect(out.entries[3].sets).toHaveLength(3);
    // The last set is already done: nothing to remove.
    expect(out.entries[4].sets).toHaveLength(3);
  });

  it('a short exercise does not go up; missed reps still ask', () => {
    const e = shortenWorkout(workout('d', [entry('a', [set(50, 12, 'pending'), set(50, 12, 'pending'), set(50, 12, 'pending')])])).entries[0];
    const done = e.sets.map((s) => ({ ...s, status: 'done' as const }));
    const input = { config: e.progression, prescription: e.prescription, sets: done, pain: false, technique: false, substituted: false, short: true };
    expect(evaluate(input)).toMatchObject({ outcome: 'restricted', reasons: [{ code: 'top_reached' }, { code: 'short' }] });
    const low = done.map((s) => ({ ...s, values: { ...s.values, reps: 6 } }));
    expect(evaluate({ ...input, sets: low }).outcome).toBe('missed');
  });
});

describe('do it later (D41)', () => {
  it('moves one entry, or a whole circuit, to the end', () => {
    const w = workout('d', ['a', 'b', 'c', 'd'].map((x) => entry(x, [])));
    expect(moveToEnd(w, [0]).entries.map((e) => e.exerciseId)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveToEnd(w, [1, 2]).entries.map((e) => e.exerciseId)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('goals (D42)', () => {
  const goal = { id: 'g', exerciseId: 'bench', exerciseName: 'Bench', load: 100, createdAt: '2026-01-01T00:00:00Z' };
  const at = (date: string, load: number, reps = 8) => workout(date, [entry('bench', [set(load, reps)])]);

  it('least squares line', () => {
    const f = linearFit([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(f.slope).toBeCloseTo(2);
    expect(f.at(3)).toBeCloseTo(7);
  });

  it('met when a working set reaches the load', () => {
    expect(goalStatus(goal, [at('2026-10-01', 90), at('2026-10-08', 100)], new Date('2026-11-01'))).toEqual({ best: 100, metAt: '2026-10-08T10:00:00' });
  });

  it('projects the date from the estimated 1RM trend of the last 8 weeks', () => {
    // 80, 82.5, 85 kg × 8 every week: +2.5 kg/week on the load, so 100 kg about 6 weeks after the last session.
    // (Dates after the change to winter time, so every day has 24 hours.)
    const ws = [at('2026-11-01', 80), at('2026-11-08', 82.5), at('2026-11-15', 85)];
    const st = goalStatus(goal, ws, new Date('2026-11-15T12:00:00'));
    expect(st.best).toBe(85);
    expect(st.projected).toBe('2026-12-27');
  });

  it('no projection with fewer than 3 sessions or a flat trend', () => {
    expect(goalStatus(goal, [at('2026-10-18', 80), at('2026-10-25', 82.5)], new Date('2026-10-26'))).toMatchObject({ fewPoints: true });
    expect(goalStatus(goal, [at('2026-10-11', 80), at('2026-10-18', 80), at('2026-10-25', 80)], new Date('2026-10-26'))).toMatchObject({ noTrend: true });
    expect(goalStatus(goal, [], new Date())).toEqual({ fewPoints: true });
  });
});

describe('consistency map (D43)', () => {
  it('whole weeks up to today, workouts per local day', () => {
    const now = new Date(2026, 10, 4, 12); // Wednesday
    const map = consistencyMap([workout('2026-11-02', []), workout('2026-11-02', [], { id: 'x' }), workout('2026-10-28', [])], now, 2);
    expect(map).toHaveLength(2);
    expect(map[0].map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(map[1].map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(map[1][0].workouts).toHaveLength(2);
    expect(map[0][2].workouts).toHaveLength(1);
  });

  it('week streak: this week counts once it has a workout; best run ever', () => {
    const ws = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-10-20', '2026-10-27'].map((d) => workout(d, [], { id: d }));
    expect(weekStreak(ws, new Date(2026, 10, 3))).toEqual({ current: 2, best: 3 });
    expect(weekStreak([...ws, workout('2026-11-02', [], { id: 'n' })], new Date(2026, 10, 3))).toEqual({ current: 3, best: 3 });
    expect(weekStreak([], new Date())).toEqual({ current: 0, best: 0 });
  });
});

describe('live reaction (D45)', () => {
  it('more load (reps at least the minimum), or more reps at the same load, than the same set last time', () => {
    const prev = entry('bench', [set(60, 10), set(60, 9)]);
    const now = (sets: SetRecord[]) => entry('bench', sets);
    const a = now([set(60, 11)]);
    expect(beatsLastTime(a, a.sets[0], prev)).toEqual({ kind: 'reps', from: 10, to: 11 });
    const b = now([set(60, 10), set(62.5, 8)]);
    expect(beatsLastTime(b, b.sets[1], prev)).toEqual({ kind: 'load', from: 60, to: 62.5 });
    const c = now([set(62.5, 6)]);
    expect(beatsLastTime(c, c.sets[0], prev)).toBeUndefined();
    const d = now([set(60, 10)]);
    expect(beatsLastTime(d, d.sets[0], prev)).toBeUndefined();
    expect(beatsLastTime(a, a.sets[0], undefined)).toBeUndefined();
    expect(beatsLastTime(a, a.sets[0], entry('other', [set(10, 1)]))).toBeUndefined();
  });
});

describe('tips (D48)', () => {
  it('same seed, same tip; nothing without tips', () => {
    const tips = ['a', 'b', 'c'];
    expect(pickTip(tips, 'x')).toBe(pickTip(tips, 'x'));
    expect(tips).toContain(pickTip(tips, 'y'));
    expect(pickTip([' ', ''], 'x')).toBeUndefined();
    expect(pickTip(undefined, 'x')).toBeUndefined();
  });
});

describe('rival (D49)', () => {
  const day = { planId: 'p', dayId: 'd' };
  const now = workout('2026-11-01', [entry('bench', [set(80), set(80)]), entry('squat', [set(100)]), entry('row', [set(50)])], { id: 'now', ...day });
  it('same plan day nearest to 90 days within 75–105; else the oldest at least 28 days before', () => {
    const ws = [
      workout('2026-08-10', [], { id: 'd83', ...day }),
      workout('2026-08-01', [], { id: 'd92', ...day }),
      workout('2026-07-01', [], { id: 'd123', ...day }),
      workout('2026-08-03', [], { id: 'other', planId: 'p', dayId: 'x' }),
    ];
    expect(rivalWorkout(now, ws)?.id).toBe('d92');
    expect(rivalWorkout(now, [ws[2], workout('2026-10-20', [], { id: 'd12', ...day })])?.id).toBe('d123');
    expect(rivalWorkout(now, [workout('2026-10-20', [], { id: 'd12', ...day })])).toBeUndefined();
    expect(rivalWorkout({ ...now, planId: undefined }, ws)).toBeUndefined();
  });

  it('compares the top set of each exercise in both', () => {
    const then = workout('2026-08-01', [entry('bench', [set(70)]), entry('squat', [set(100)]), entry('row', [set(55)]), entry('curl', [set(10)])], day);
    expect(rivalRows(now, then).map((r) => [r.exerciseId, r.result, r.now, r.then])).toEqual([
      ['bench', 'won', 80, 70],
      ['squat', 'tie', 100, 100],
      ['row', 'lost', 50, 55],
    ]);
  });
});

describe('week report (D46)', () => {
  it('only on Sundays', () => {
    expect(reportWeek(new Date(2026, 10, 1))).toBe('2026-10-26');
    expect(reportWeek(new Date(2026, 10, 2))).toBeUndefined();
  });

  it('workouts, sets, heaviest set, increases, least trained muscle and challenge of Monday–Sunday', () => {
    const ws = [
      workout('2026-10-12', [entry('row', [set(50)], {}, 'back'), entry('squat', [set(90)], {}, 'quads')], { id: 'old' }),
      workout('2026-10-27', [entry('bench', [set(80, 6), set(85, 5)]), entry('squat', [set(100)], {}, 'quads')], { id: 'a' }),
      workout('2026-10-30', [entry('bench', [set(80)])], { id: 'b' }),
      workout('2026-11-02', [entry('bench', [set(200)])], { id: 'next' }),
    ];
    const ev = (decision: ProgressionEvent['decision'], at: string) => ({ id: at, lineageId: 'l', exerciseId: 'bench', strategy: 'double', outcome: 'increase', reasons: [], decision, before: {}, after: {}, createdAt: at, decidedAt: at }) as ProgressionEvent;
    const ch: Challenge = { id: 'c', week: '2026-10-26', kind: 'workouts', target: 2, status: 'open', createdAt: '2026-10-26T08:00:00Z' };
    const r = weekReport(new Date(2026, 10, 1, 20), ws, [ev('applied', '2026-10-27T11:00:00'), ev('reps_up', '2026-10-30T11:00:00'), ev('kept', '2026-10-30T11:00:00'), ev('applied', '2026-10-20T11:00:00')], ch, 'r');
    expect(r).toMatchObject({ id: 'r', week: '2026-10-26', workouts: 2, sets: 4, best: { exerciseName: 'squat', load: 100, reps: 8 }, ups: 2, weak: 'back', challenge: 'done' });
  });
});
