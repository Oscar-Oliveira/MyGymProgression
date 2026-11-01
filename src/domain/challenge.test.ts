import { describe, expect, it } from 'vitest';
import { challengeProgress, createChallenge, settleChallenges, weekKey } from './challenge';
import type { Challenge, MetricDef, SetRecord, Workout, WorkoutEntry } from './types';
import { DEFAULT_CRITERIA } from './units';

const RL: MetricDef[] = [
  { key: 'reps', unit: 'reps', required: true },
  { key: 'load', unit: 'kg', required: true },
];
const set = (load: number): SetRecord => ({ id: Math.random().toString(), kind: 'working', values: { reps: 8, load }, status: 'done', notes: '' });

function entry(exerciseId: string, loads: number[], muscle = 'chest'): WorkoutEntry {
  return {
    id: Math.random().toString(),
    exerciseId,
    exercise: { name: exerciseId, category: 'compound', metrics: RL, loadMode: 'total', primaryMuscles: [muscle], secondaryMuscles: [] },
    prescription: loads.map(() => ({ kind: 'working', targets: {} })),
    progression: { strategy: 'double', steps: [], criteria: DEFAULT_CRITERIA },
    role: 'main',
    sets: loads.map(set),
    pain: false,
    technique: false,
    notes: '',
  };
}

const workout = (date: string, entries: WorkoutEntry[]): Workout => ({ id: date, startedAt: `${date}T10:00:00`, status: 'completed', notes: '', entries, updatedAt: date });
const NOW = '2026-11-02T08:00:00.000Z';

describe('weekKey', () => {
  it('is the local Monday', () => {
    expect(weekKey(new Date(2026, 10, 1))).toBe('2026-10-26'); // Sunday
    expect(weekKey(new Date(2026, 10, 2))).toBe('2026-11-02'); // Monday
  });
});

describe('createChallenge', () => {
  it('without history: a workouts challenge of 2', () => {
    expect(createChallenge('2026-11-02', [], 'c', NOW)).toMatchObject({ kind: 'workouts', target: 2, status: 'open', week: '2026-11-02' });
  });

  it('with history: targets come from the 4 weeks before', () => {
    // 8 workouts in 4 weeks, 3 bench sets each (24 sets in all, 6 per week); squat once, back less trained.
    const ws = ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28'].map((d) => workout(d, [entry('bench', [60, 60, 62.5])]));
    ws.push(workout('2026-10-29', [entry('row', [50], 'back')]));
    // A workout of the week itself is not history.
    ws.push(workout('2026-11-02', [entry('bench', [100])]));
    const kinds = new Map<string, Challenge>();
    for (let i = 0; i < 60 && kinds.size < 4; i++) {
      const week = weekKey(new Date(2026, 10, 2 + 7 * i));
      // Same history for every week: move the workouts with the week.
      const shift = (w: Workout) => {
        const d = new Date(w.startedAt);
        d.setDate(d.getDate() + 7 * i);
        return { ...w, startedAt: d.toISOString() };
      };
      const c = createChallenge(week, ws.map(shift), 'c', NOW);
      kinds.set(c.kind, c);
    }
    expect(kinds.get('workouts')?.target).toBe(3); // 9 / 4 ≈ 2, + 1
    expect(kinds.get('sets')?.target).toBe(10); // 25 / 4 × 1.1 ≈ 7, at least 10
    expect(kinds.get('record')).toMatchObject({ exerciseId: 'bench', exerciseName: 'bench', target: 62.5 });
    expect(kinds.get('muscle')).toMatchObject({ muscle: 'back', target: 4 });
  });
});

describe('challengeProgress', () => {
  const base: Challenge = { id: 'c', week: '2026-11-02', kind: 'workouts', target: 2, status: 'open', createdAt: NOW };
  const week = [workout('2026-11-02', [entry('bench', [60, 70])]), workout('2026-11-04', [entry('bench', [60])]), workout('2026-11-09', [entry('bench', [90])])];

  it('counts only the week of the challenge', () => {
    expect(challengeProgress(base, week)).toEqual({ value: 2, met: true });
    expect(challengeProgress({ ...base, kind: 'sets', target: 4 }, week)).toEqual({ value: 3, met: false });
    expect(challengeProgress({ ...base, kind: 'muscle', muscle: 'chest', target: 3 }, week)).toEqual({ value: 3, met: true });
  });

  it('a muscle counts only the sets where it is a primary muscle', () => {
    const e = { ...entry('bench', [60, 60]), exercise: { ...entry('bench', []).exercise, secondaryMuscles: ['triceps'] } };
    const ws = [workout('2026-11-03', [e])];
    expect(challengeProgress({ ...base, kind: 'muscle', muscle: 'chest', target: 2 }, ws).value).toBe(2);
    expect(challengeProgress({ ...base, kind: 'muscle', muscle: 'triceps', target: 2 }, ws).value).toBe(0);
  });

  it('a record of a per-side exercise is marked per side', () => {
    const e = { ...entry('curl', [10]), exercise: { ...entry('curl', []).exercise, loadMode: 'perSide' as const } };
    let c: Challenge | undefined;
    for (let i = 0; i < 60 && c?.kind !== 'record'; i++) {
      const d = new Date(2026, 10, 2 + 7 * i);
      c = createChallenge(weekKey(d), [workout(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 3).toLocaleDateString('sv'), [e])], 'c', NOW);
    }
    expect(c).toMatchObject({ kind: 'record', perSide: true, target: 20 }); // total load: 10 per side × 2
  });

  it('a record must be beaten, not equalled', () => {
    expect(challengeProgress({ ...base, kind: 'record', exerciseId: 'bench', target: 70 }, week)).toEqual({ value: 70, met: false });
    expect(challengeProgress({ ...base, kind: 'record', exerciseId: 'bench', target: 65 }, week).met).toBe(true);
  });
});

describe('settleChallenges', () => {
  it('closes open past weeks only: done when met, else missed', () => {
    const ws = [workout('2026-10-27', [entry('bench', [60])]), workout('2026-10-28', [entry('bench', [60])])];
    const c = (id: string, week: string, status: Challenge['status'] = 'open', target = 2): Challenge => ({ id, week, kind: 'workouts', target, status, createdAt: NOW });
    const out = settleChallenges([c('met', '2026-10-26'), c('short', '2026-10-19'), c('marked', '2026-10-12', 'done'), c('now', '2026-11-02')], ws, '2026-11-02', NOW);
    expect(out.map((x) => [x.id, x.status])).toEqual([
      ['met', 'done'],
      ['short', 'missed'],
    ]);
  });
});
