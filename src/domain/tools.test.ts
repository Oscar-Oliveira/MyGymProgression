import { describe, expect, it } from 'vitest';
import { loadFor, oneRmOf, percentTable, roundTo } from './tools';

describe('tools', () => {
  it('estimated 1RM from a set, RIR counts as reps left', () => {
    expect(oneRmOf(100, 1)).toBe(100);
    expect(oneRmOf(100, 10)).toBeCloseTo(133.33, 2);
    expect(oneRmOf(100, 8, 2)).toBeCloseTo(133.33, 2);
    expect(oneRmOf(100, 0)).toBeUndefined();
  });

  it('load for reps at a RIR is the inverse', () => {
    const one = 133.33;
    expect(loadFor(one, 10)).toBeCloseTo(100, 1);
    expect(loadFor(one, 8, 2)).toBeCloseTo(100, 1);
    expect(loadFor(one, 1)).toBe(one);
  });

  it('percentages, rounded to the plates step', () => {
    const table = percentTable(100, (x) => roundTo(x, 2.5));
    expect(table[0]).toEqual({ pct: 100, load: 100 });
    expect(table.find((r) => r.pct === 85)?.load).toBe(85);
    expect(table.find((r) => r.pct === 55)?.load).toBe(55);
    expect(roundTo(83.4, 2.5)).toBe(82.5);
  });
});
