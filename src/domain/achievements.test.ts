import { describe, expect, it } from 'vitest';
import { achievements } from './achievements';
import { MUSCLES } from './challenge';
import type { MetricDef, SetRecord, Workout, WorkoutEntry } from './types';
import { DEFAULT_CRITERIA } from './units';

const RL: MetricDef[] = [
  { key: 'reps', unit: 'reps', required: true },
  { key: 'load', unit: 'kg', required: true },
];
const set = (load: number, reps = 10): SetRecord => ({ id: Math.random().toString(), kind: 'working', values: { reps, load }, status: 'done', notes: '' });

function entry(exerciseId: string, sets: SetRecord[], muscle = 'chest'): WorkoutEntry {
  return {
    id: Math.random().toString(),
    exerciseId,
    exercise: { name: exerciseId, category: 'compound', metrics: RL, loadMode: 'total', primaryMuscles: [muscle], secondaryMuscles: [] },
    prescription: sets.map(() => ({ kind: 'working', targets: {} })),
    progression: { strategy: 'double', steps: [{ metric: 'load', increment: 2.5 }], criteria: DEFAULT_CRITERIA },
    role: 'main',
    sets,
    pain: false,
    technique: false,
    notes: '',
  };
}
const workout = (id: string, startedAt: string, entries: WorkoutEntry[], status: Workout['status'] = 'completed'): Workout => ({ id, startedAt, status, notes: '', entries, updatedAt: startedAt });
const get = (list: ReturnType<typeof achievements>, id: string) => list.find((a) => a.id === id)!;

describe('achievements (D73)', () => {
  it('earns the workout counts at the workout that reaches them; a workout in progress does not count', () => {
    const ws = Array.from({ length: 10 }, (_, i) => workout(`w${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00`, []));
    const list = achievements([...ws, workout('open', '2026-10-20T10:00:00', [], 'in_progress')]);
    expect(get(list, 'workouts-1')).toMatchObject({ workoutId: 'w0', progress: 1 });
    expect(get(list, 'workouts-10')).toMatchObject({ workoutId: 'w9', earnedAt: '2026-10-10T10:00:00' });
    expect(get(list, 'workouts-50')).toMatchObject({ progress: 10 });
    expect(get(list, 'workouts-50').earnedAt).toBeUndefined();
  });

  it('keeps the best run of weeks in a row', () => {
    // 3 weeks in a row, a gap, then 4 weeks in a row (Mondays from 2026-08-03).
    const mondays = [0, 1, 2, 4, 5, 6, 7].map((k) => new Date(2026, 7, 3 + 7 * k, 18).toISOString());
    const list = achievements(mondays.map((d, i) => workout(`w${i}`, d, [])));
    expect(get(list, 'streak-4')).toMatchObject({ workoutId: 'w6' });
    expect(get(list, 'streak-12').progress).toBe(4);
  });

  it('adds the volume of one workout and of all workouts', () => {
    const big = entry('squat', Array.from({ length: 5 }, () => set(100, 10)));
    const list = achievements([workout('a', '2026-10-01T10:00:00', [big]), workout('b', '2026-10-02T10:00:00', [big])]);
    expect(get(list, 'session-5000')).toMatchObject({ workoutId: 'a' });
    expect(get(list, 'session-10000').progress).toBe(5000);
    expect(get(list, 'total-100000').progress).toBe(10000);
  });

  it('counts new personal records against the earlier workouts', () => {
    const ws = [40, 42.5, 45].map((load, i) => workout(`w${i}`, `2026-10-0${i + 1}T10:00:00`, [entry('bench', [set(load)])]));
    expect(get(achievements(ws), 'records-10').progress).toBe(2);
  });

  it('needs all 12 muscles as primary muscles in one week (Monday to Sunday)', () => {
    const first = MUSCLES.slice(0, 6).map((m) => entry(m, [set(10)], m));
    const rest = MUSCLES.slice(6).map((m) => entry(m, [set(10)], m));
    // Thursday and Sunday of the same week, then the next Monday.
    expect(get(achievements([workout('a', '2026-10-01T10:00:00', first), workout('b', '2026-10-04T10:00:00', rest)]), 'muscles-12').workoutId).toBe('b');
    expect(get(achievements([workout('a', '2026-10-01T10:00:00', first), workout('b', '2026-10-05T10:00:00', rest)]), 'muscles-12').progress).toBe(6);
  });

  it('early bird before 07:00 and night owl from 22:00, local time', () => {
    const list = achievements([workout('a', new Date(2026, 9, 1, 6, 59).toISOString(), []), workout('b', new Date(2026, 9, 2, 21, 59).toISOString(), [])]);
    expect(get(list, 'early-1').workoutId).toBe('a');
    expect(get(list, 'late-1').workoutId).toBeUndefined();
  });
});
