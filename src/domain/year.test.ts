import { describe, expect, it } from 'vitest';
import type { MetricDef, SetRecord, Workout, WorkoutEntry } from './types';
import { DEFAULT_CRITERIA } from './units';
import { reviewYears, yearReview } from './year';

const RL: MetricDef[] = [
  { key: 'reps', unit: 'reps', required: true },
  { key: 'load', unit: 'kg', required: true },
];
const set = (load: number, reps = 10): SetRecord => ({ id: Math.random().toString(), kind: 'working', values: { reps, load }, status: 'done', notes: '' });

function entry(exerciseId: string, load: number, muscle = 'chest'): WorkoutEntry {
  return {
    id: Math.random().toString(),
    exerciseId,
    exercise: { name: exerciseId, category: 'compound', metrics: RL, loadMode: 'total', primaryMuscles: [muscle], secondaryMuscles: [] },
    prescription: [],
    progression: { strategy: 'double', steps: [], criteria: DEFAULT_CRITERIA },
    role: 'main',
    sets: [set(load), set(load)],
    pain: false,
    technique: false,
    notes: '',
  };
}
/** A one-hour workout at a local date and hour. */
function workout(id: string, y: number, m: number, d: number, h: number, entries: WorkoutEntry[]): Workout {
  const start = new Date(y, m - 1, d, h);
  return { id, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 3600000).toISOString(), status: 'completed', notes: '', entries, updatedAt: '' };
}

describe('year in review (D74)', () => {
  // 2025: one bench workout. 2026: Monday 18h, Tuesday 18h and Monday a week later 7h.
  const ws = [
    workout('old', 2025, 12, 1, 18, [entry('bench', 40)]),
    workout('a', 2026, 3, 2, 18, [entry('bench', 40), entry('squat', 60, 'quads')]),
    workout('b', 2026, 3, 3, 18, [entry('bench', 50), { ...entry('bike', 0, 'calves'), role: 'warmup' }]),
    workout('c', 2026, 3, 9, 7, [entry('bench', 45), entry('squat', 75, 'quads'), { ...entry('bike', 0, 'calves'), role: 'warmup' }]),
    { ...workout('open', 2026, 3, 10, 18, [entry('bench', 90)]), status: 'in_progress' as const },
  ];
  const r = yearReview(ws, 2026, new Date(2026, 5, 30));

  it('lists the years with workouts, newest first', () => {
    expect(reviewYears(ws)).toEqual([2026, 2025]);
  });
  it('adds workouts, hours, sets and volume of the year only', () => {
    expect(r).toMatchObject({ workouts: 3, hours: 3, sets: 14, volume: (40 + 60 + 50 + 45 + 75) * 20 });
  });
  it('finds the most done exercise (not a warm-up), the largest 1RM rise, the favourite weekday and hour, and the best run of weeks', () => {
    expect(r.topExercise).toEqual({ id: 'bench', name: 'bench', sessions: 3 });
    // Bench 40 → 50 kg × 10 is +13.3 kg e1RM; squat 60 → 75 kg × 10 is +20.
    expect(r.topGain).toMatchObject({ id: 'squat' });
    expect(r.topGain!.to).toBeGreaterThan(r.topGain!.from);
    expect(r.weekday).toBe(0);
    expect(r.hour).toBe(18);
    expect(r.bestStreak).toBe(2);
  });
  it('leaves warm-up exercises out of the favourite', () => {
    const warm = [1, 2, 3].map((d) => workout(`w${d}`, 2026, 4, d, 18, [{ ...entry('bike', 0, 'calves'), role: 'warmup' }, entry(`x${d}`, 40)]));
    expect(yearReview(warm, 2026, new Date(2026, 5, 30)).topExercise?.id).not.toBe('bike');
  });
  it('counts records against the whole history (the 2025 bench counts as the earlier best)', () => {
    // a: bench 40 = 2025 best, no record; squat first time, no record. b: bench 50, record. c: squat 75, record.
    expect(r.records).toBe(2);
  });
  it('gives sets per muscle per week to today and the top main muscle; medals of the year only', () => {
    expect(r.topMuscle).toBe('chest');
    expect(r.muscles.chest).toBeCloseTo(6 / (181 / 7));
    expect(r.medals.map((m) => m.id)).not.toContain('workouts-1');
  });
});
