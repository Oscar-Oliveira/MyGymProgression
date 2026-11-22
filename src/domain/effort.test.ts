import { describe, expect, it } from 'vitest';
import { effortBand, effortScale, effortText, meanRir, toScale } from './effort';
import { setRecordSchema } from './schema';

describe('effort per set (RIR / RPE)', () => {
  it('stores RIR and shows RIR or RPE; off hides it', () => {
    expect(effortScale({})).toBe('rir');
    expect(effortScale({ effort: 'rpe' })).toBe('rpe');
    expect(effortScale({ effort: 'off' })).toBeUndefined();
    expect(toScale(2, 'rpe')).toBe(8);
    expect(effortText(2, 'rir')).toBe('RIR 2');
    expect(effortText(5, 'rir')).toBe('RIR 5+');
    expect(effortText(0, 'rpe')).toBe('RPE 10');
  });

  it('bands and mean', () => {
    expect([0, 1, 2, 3, 4, 6].map(effortBand)).toEqual(['failure', 'hard', 'good', 'good', 'easy', 'easy']);
    expect(meanRir([{ status: 'done', rir: 1 }, { status: 'done', rir: 2 }, { status: 'skipped', rir: 0 }, { status: 'done' }])).toBe(1.5);
    expect(meanRir([{ status: 'done' }])).toBeUndefined();
  });

  it('a set with RIR and a drop set pass the backup schema', () => {
    const set = { id: 's1', kind: 'drop', values: { load: 40, reps: 8 }, status: 'done', notes: '', rir: 0 };
    expect(setRecordSchema.safeParse(set).success).toBe(true);
    expect(setRecordSchema.safeParse({ ...set, rir: 11 }).success).toBe(false);
  });
});
