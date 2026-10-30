import { describe, expect, it } from 'vitest';
import { adherence, completionByExercise, e1rm, entryMetrics, exerciseHistory, mondayOf, muscleDistribution, personalRecords, stalledItems, workoutRecords, workoutsByWeek } from './analysis';
import type { Evaluation, MetricDef, Outcome, ProgressionStrategy, SetRecord, Workout, WorkoutEntry } from './types';
import { DEFAULT_CRITERIA } from './units';

const metrics = {
  rl: [
    { key: 'reps', unit: 'reps', required: true },
    { key: 'load', unit: 'kg', required: true },
  ] as MetricDef[],
  tread: [
    { key: 'duration', unit: 'min', required: true },
    { key: 'distance', unit: 'km', required: false },
    { key: 'speed', unit: 'km/h', required: true },
  ] as MetricDef[],
};

const set = (values: SetRecord['values'], status: SetRecord['status'] = 'done'): SetRecord => ({ id: Math.random().toString(), kind: 'working', values, status, notes: '' });

function entry(over: Partial<WorkoutEntry> & { strategy?: ProgressionStrategy; outcome?: Outcome }): WorkoutEntry {
  const strategy = over.strategy ?? 'double';
  const evaluation: Evaluation | undefined = over.outcome ? { strategy, outcome: over.outcome, completion: 'complete', reasons: [] } : undefined;
  return {
    id: Math.random().toString(),
    exerciseId: 'ex1',
    exercise: { name: 'Bench', category: 'compound', metrics: metrics.rl, loadMode: 'total', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] },
    lineageId: 'L1',
    prescription: [{ kind: 'working', targets: {} }, { kind: 'working', targets: {} }, { kind: 'working', targets: {} }],
    progression: { strategy, steps: [], criteria: DEFAULT_CRITERIA },
    role: 'main',
    sets: [],
    pain: false,
    technique: false,
    notes: '',
    evaluation,
    ...over,
  };
}

const workout = (date: string, entries: WorkoutEntry[], status: Workout['status'] = 'completed'): Workout => ({
  id: date,
  startedAt: `${date}T10:00:00.000Z`,
  status,
  notes: '',
  entries,
  updatedAt: date,
});

describe('e1rm', () => {
  it('uses Epley and limits reps', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(100, 13)).toBeUndefined();
    expect(e1rm(0, 5)).toBeUndefined();
  });
});

describe('entryMetrics', () => {
  it('computes volume, top load and completion for resistance work', () => {
    const m = entryMetrics(entry({ sets: [set({ reps: 10, load: 40 }), set({ reps: 9, load: 40 }), set({ reps: 8, load: 40 }, 'skipped')] }));
    expect(m.volume).toBe(760);
    expect(m.topLoad).toBe(40);
    expect(m.totalReps).toBe(19);
    expect(m.completionRate).toBeCloseTo(2 / 3);
  });
  it('converts lb to kg and doubles per-side loads', () => {
    const lb = entryMetrics(entry({ exercise: { ...entry({}).exercise, metrics: [metrics.rl[0], { key: 'load', unit: 'lb', required: true }] }, sets: [set({ reps: 1, load: 100 })] }));
    expect(lb.topLoad).toBeCloseTo(45.36, 2);
    const ps = entryMetrics(entry({ exercise: { ...entry({}).exercise, loadMode: 'perSide' }, sets: [set({ reps: 10, load: 20 })] }));
    expect(ps.volume).toBe(400);
  });
  it('does not compute load volume for cardio', () => {
    const m = entryMetrics(entry({ exercise: { ...entry({}).exercise, metrics: metrics.tread }, sets: [set({ duration: 30, distance: 5, speed: 10 })] }));
    expect(m.volume).toBeUndefined();
    expect(m.totalDuration).toBe(1800);
    expect(m.totalDistance).toBe(5000);
    expect(m.pace).toBe(360);
    expect(m.avgSpeed).toBe(10);
  });
});

describe('history, PRs and distribution', () => {
  const ws = [
    workout('2026-01-01', [entry({ sets: [set({ reps: 10, load: 40 })] })]),
    workout('2026-01-08', [entry({ sets: [set({ reps: 8, load: 50 })] })]),
    workout('2026-01-15', [entry({ sets: [set({ reps: 12, load: 60 })] })], 'in_progress'),
  ];
  it('ignores in-progress workouts and sorts by date', () => {
    const h = exerciseHistory(ws, 'ex1');
    expect(h.map((x) => x.date.slice(0, 10))).toEqual(['2026-01-01', '2026-01-08']);
    expect(personalRecords(h).topLoad).toBe(50);
  });
  it('weights secondary muscles 0.5', () => {
    expect(muscleDistribution(ws)).toEqual({ chest: 2, triceps: 1 });
  });
  it('completion by exercise', () => {
    expect(completionByExercise(ws)[0]).toMatchObject({ sessions: 2, prescribed: 6, done: 2 });
  });
});

describe('stalledItems', () => {
  const run = (strategy: ProgressionStrategy, outcomes: Outcome[]) =>
    stalledItems(
      outcomes.map((o, i) => workout(`2026-02-0${i + 1}`, [entry({ strategy, outcome: o })])),
      3,
    );
  it('flags progression-enabled items without progress for 3 sessions', () => {
    expect(run('double', ['keep', 'missed', 'keep'])).toHaveLength(1);
  });
  it('does not flag when there was progress', () => {
    expect(run('double', ['keep', 'progress', 'keep'])).toHaveLength(0);
  });
  it('never flags non-progressive exercises (treadmill warm-up)', () => {
    expect(run('none', ['no_progression', 'no_progression', 'no_progression', 'no_progression'])).toHaveLength(0);
  });
  it('needs at least threshold sessions', () => {
    expect(run('duration', ['keep', 'keep'])).toHaveLength(0);
  });
});

describe('adherence', () => {
  it('= finished / (weeks × days per week)', () => {
    expect(adherence(6, 3, '2026-01-01', '2026-01-14')).toBe(1);
    expect(adherence(3, 3, '2026-01-01', '2026-01-14')).toBe(0.5);
  });
});

describe('filterWorkouts', () => {
  it('keeps only the filtered exercise entries', async () => {
    const { filterWorkouts, periodSummary } = await import('./analysis');
    const w = workout('2026-03-01', [entry({ sets: [set({ reps: 10, load: 40 })] }), entry({ exerciseId: 'ex2', sets: [set({ reps: 5, load: 10 })] })]);
    const f = filterWorkouts([w], { exerciseId: 'ex2' });
    expect(f[0].entries).toHaveLength(1);
    expect(periodSummary(f).volume).toBe(50);
    expect(filterWorkouts([w], { from: '2026-03-02' })).toHaveLength(0);
  });
});

describe('workouts by week', () => {
  it('Monday-first weeks from the first to the last date, empty weeks included', () => {
    const w = (iso: string) => ({ startedAt: iso }) as Workout;
    expect(mondayOf(new Date(2026, 9, 25)).getDate()).toBe(19); // Sunday 25 Oct → Monday 19 Oct
    const weeks = workoutsByWeek([w(new Date(2026, 9, 30, 10).toISOString()), w(new Date(2026, 9, 13, 18).toISOString()), w(new Date(2026, 9, 12, 7).toISOString())], new Date(2026, 9, 14), new Date(2026, 9, 30));
    expect(weeks.map((x) => x.start.getDate())).toEqual([12, 19, 26]);
    expect(weeks.map((x) => x.workouts.length)).toEqual([2, 0, 1]);
  });
});

describe('workoutRecords', () => {
  const earlier = [workout('2026-01-01', [entry({ sets: [set({ reps: 10, load: 40 })] })]), workout('2026-01-08', [entry({ sets: [set({ reps: 8, load: 50 })] })])];
  it('reports a heavier set as a load record, not also as an e1RM record', () => {
    const w = workout('2026-01-15', [entry({ sets: [set({ reps: 5, load: 55 })] })]);
    expect(workoutRecords(w, earlier)).toEqual([{ exerciseId: 'ex1', name: 'Bench', kind: 'topLoad', value: 55, previous: 50 }]);
  });
  it('reports an e1RM record at the same top load', () => {
    const w = workout('2026-01-15', [entry({ sets: [set({ reps: 10, load: 50 })] })]);
    expect(workoutRecords(w, earlier).map((r) => r.kind)).toEqual(['bestE1rm']);
  });
  it('sets no record the first time, and ignores later workouts', () => {
    const w = workout('2026-01-01', [entry({ sets: [set({ reps: 12, load: 90 })] })]);
    expect(workoutRecords(w, [])).toEqual([]);
    expect(workoutRecords(earlier[0], earlier)).toEqual([]);
  });
  it('counts reps only for exercises without load', () => {
    const bw = (reps: number) => entry({ exercise: { name: 'Pull-up', category: 'compound', metrics: [metrics.rl[0]], loadMode: 'total', primaryMuscles: [], secondaryMuscles: [] }, sets: [set({ reps })] });
    expect(workoutRecords(workout('2026-01-15', [bw(9)]), [workout('2026-01-01', [bw(7)])]).map((r) => r.kind)).toEqual(['maxReps']);
  });
});
