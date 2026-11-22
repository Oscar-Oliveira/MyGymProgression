import { describe, expect, it } from 'vitest';
import type { BodyWeight, Measurement } from './types';
import { latestMeasurements, weeklyRate, weightChange, weightSeries } from './body';

const w = (date: string, kg: number, at = `${date}T08:00:00.000Z`): BodyWeight => ({ id: `${date}${at}`, date, kg, createdAt: at });

describe('body figures', () => {
  it('one weigh-in per day (the latest), oldest first', () => {
    const s = weightSeries([w('2026-11-02', 79), w('2026-11-01', 79.4), w('2026-11-02', 78.8, '2026-11-02T20:00:00.000Z')]);
    expect(s.map((x) => [x.date, x.kg])).toEqual([
      ['2026-11-01', 79.4],
      ['2026-11-02', 78.8],
    ]);
  });

  it('change over about 30 days and the weekly rate', () => {
    const s = weightSeries([w('2026-10-23', 79.0), w('2026-11-01', 78.8), w('2026-11-08', 78.6), w('2026-11-15', 78.5), w('2026-11-22', 78.4)]);
    expect(weightChange(s, 30)).toBe(-0.6);
    expect(weeklyRate(s)).toBeCloseTo(-0.13, 2);
    expect(weeklyRate(s.slice(-2))).toBeUndefined();
    expect(weightChange(s.slice(-1))).toBeUndefined();
  });

  it('latest value of each part, with the change', () => {
    const m = (date: string, part: Measurement['part'], value: number): Measurement => ({ id: date + part, date, part, value, createdAt: `${date}T08:00:00.000Z` });
    const r = latestMeasurements([m('2026-11-01', 'waist', 85), m('2026-11-16', 'waist', 84), m('2026-11-16', 'chest', 103)]);
    expect(r).toEqual([
      { part: 'waist', value: 84, date: '2026-11-16', change: -1 },
      { part: 'chest', value: 103, date: '2026-11-16' },
    ]);
  });
});
