import { describe, expect, it } from 'vitest';
import { bestLifts, liftOf, strengthBalance } from './balance';
import { muscleFatigue, recoveryLevel } from './recovery';
import type { Exercise, MetricDef, SetRecord, Workout, WorkoutEntry } from './types';
import { DEFAULT_CRITERIA } from './units';

const kg: MetricDef[] = [
  { key: 'reps', unit: 'reps', required: true },
  { key: 'load', unit: 'kg', required: true },
];
const set = (values: SetRecord['values'], extra: Partial<SetRecord> = {}): SetRecord => ({ id: Math.random().toString(), kind: 'working', values, status: 'done', notes: '', ...extra });
const entry = (exerciseId: string, sets: SetRecord[], over: Partial<WorkoutEntry['exercise']> = {}): WorkoutEntry => ({
  id: Math.random().toString(),
  exerciseId,
  exercise: { name: exerciseId, category: 'compound', metrics: kg, loadMode: 'total', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], ...over },
  prescription: [],
  progression: { strategy: 'double', steps: [], criteria: DEFAULT_CRITERIA },
  role: 'main',
  sets,
  pain: false,
  technique: false,
  notes: '',
});
const workout = (iso: string, entries: WorkoutEntry[], over: Partial<Workout> = {}): Workout => ({ id: iso, startedAt: iso, status: 'completed', notes: '', entries, updatedAt: iso, ...over });
const ex = (id: string, name: string, aliases: string[] = []) => [id, { id, name, aliases } as unknown as Exercise] as const;

describe('strength balance (V2-D19)', () => {
  it('finds the main barbell lifts by name or English alias, and not their variants', () => {
    const lift = (name: string, aliases: string[] = []) => liftOf({ name, aliases });
    expect(lift('Barbell Back Squat')).toBe('squat');
    expect(lift('Agachamento completo com barra', ['Barbell Full Squat (Side Pov)'])).toBe('squat');
    expect(lift('Deadlift')).toBe('deadlift');
    expect(lift('Barbell Sumo Deadlift')).toBe('deadlift');
    expect(lift('Supino com barra', ['Barbell Bench Press'])).toBe('bench');
    expect(lift('Overhead Press')).toBe('ohp');
    expect(lift('Barbell Standing Close Grip Military Press')).toBe('ohp');
    expect(lift('Barbell Pendlay Row')).toBe('row');
    expect(lift('Bent Over Barbell Row')).toBe('row');
    for (const n of ['Barbell Front Squat', 'Barbell Romanian Deadlift', 'Barbell Incline Bench Press', 'Barbell Upright Row', 'Dumbbell Bench Press', 'Barbell Hack Squat']) expect(lift(n)).toBeUndefined();
  });

  it('keeps the best estimated 1RM per lift in the window: RIR counts as reps, per-side loads double, pounds convert', () => {
    const exercises = new Map([ex('sq', 'Barbell Back Squat'), ex('bp', 'Barbell Bench Press'), ex('row', 'Barbell Row'), ex('curl', 'Barbell Curl')]);
    const now = new Date('2026-11-22T12:00:00Z');
    const best = bestLifts(
      [
        workout('2026-11-20T10:00:00Z', [
          entry('sq', [set({ load: 100, reps: 5 }), set({ load: 100, reps: 3 }, { rir: 2 }), set({ load: 120, reps: 5 }, { status: 'skipped' })]),
          entry('bp', [set({ load: 30, reps: 5 })], { loadMode: 'perSide' }),
          entry('curl', [set({ load: 40, reps: 10 })]),
        ]),
        workout('2026-11-21T10:00:00Z', [entry('row', [set({ load: 154, reps: 1 })], { metrics: [kg[0], { key: 'load', unit: 'lb', required: true }] })]),
        workout('2026-11-22T10:00:00Z', [entry('sq', [set({ load: 200, reps: 1 })])], { status: 'in_progress' }),
        workout('2026-08-01T10:00:00Z', [entry('sq', [set({ load: 200, reps: 1 })])]),
      ],
      exercises,
      now,
    );
    expect(best.squat?.e1rm).toBeCloseTo(100 * (1 + 5 / 30), 5);
    expect(best.squat?.exerciseId).toBe('sq');
    expect(best.bench?.e1rm).toBeCloseTo(60 * (1 + 5 / 30), 5);
    expect(best.row?.e1rm).toBeCloseTo(154 * 0.45359237, 3);
    expect(best.deadlift).toBeUndefined();
    expect(Object.keys(best).sort()).toEqual(['bench', 'row', 'squat']);
  });

  it('compares the pairs with the reference ranges; a pair without both lifts is missing', () => {
    const at = (e1rm: number) => ({ e1rm, exerciseId: 'x', date: '2026-11-22' });
    const rows = strengthBalance({ squat: at(100), bench: at(60), deadlift: at(120), row: at(70) });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.bench_squat).toMatchObject({ status: 'aLow', ratio: 0.6 });
    expect(by.deadlift_squat).toMatchObject({ status: 'ok' });
    expect(by.ohp_bench.status).toBe('missing');
    expect(by.row_bench.status).toBe('bLow');
  });
});

describe('recovery map (V2-D20)', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const sets = (n: number) => Array.from({ length: n }, () => set({ load: 50, reps: 8 }));

  it('counts recent working sets per muscle (secondary half), fading to zero in 72 h from the end of the workout', () => {
    const f = muscleFatigue(
      [
        workout('2026-11-22T10:00:00Z', [entry('bp', sets(6))], { endedAt: '2026-11-22T12:00:00Z' }),
        workout('2026-11-21T00:00:00Z', [entry('sq', sets(4), { primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] })]),
        workout('2026-11-18T00:00:00Z', [entry('dl', sets(8), { primaryMuscles: ['back'], secondaryMuscles: [] })]),
      ],
      now,
    );
    expect(f.chest).toBeCloseTo(6, 5);
    expect(f.triceps).toBeCloseTo(3, 5);
    expect(f.quads).toBeCloseTo(4 * (1 - 36 / 72), 5);
    expect(f.glutes).toBeCloseTo(1, 5);
    expect(f.back).toBeUndefined();
  });

  it('skipped and warm-up sets do not count; done sets of a workout in progress do', () => {
    const f = muscleFatigue(
      [workout('2026-11-22T11:00:00Z', [entry('bp', [set({ load: 50, reps: 8 }), set({ load: 50, reps: 8 }, { status: 'skipped' }), set({ load: 20, reps: 10 }, { kind: 'warmup' })])], { status: 'in_progress' })],
      now,
    );
    expect(f.chest).toBeCloseTo(1 - 1 / 72, 5);
  });

  it('levels: recovered under 2 faded sets, tired from 5', () => {
    expect([undefined, 0, 1.9, 2, 4.9, 5, 9].map(recoveryLevel)).toEqual(['fresh', 'fresh', 'fresh', 'recovering', 'recovering', 'tired', 'tired']);
  });
});
