import { describe, expect, it } from 'vitest';
import { barOf, barWeightOf, DEFAULT_EQUIPMENT, equipmentOf, platesPerSide, roundToPlates } from './plates';

const KG = DEFAULT_EQUIPMENT.kg.plates;

describe('plate math', () => {
  it('plates per side for a total on a 20 kg bar', () => {
    expect(platesPerSide(62.5, 20, KG)).toEqual({ plates: [20, 1.25], rest: 0 });
    expect(platesPerSide(100, 20, KG)).toEqual({ plates: [25, 15], rest: 0 });
    expect(platesPerSide(20, 20, KG)).toEqual({ plates: [], rest: 0 });
    expect(platesPerSide(61, 20, KG)).toEqual({ plates: [20], rest: 0.5 });
  });

  it('a load already per side has no bar', () => {
    expect(platesPerSide(32.5, 20, KG, true)).toEqual({ plates: [25, 5, 2.5], rest: 0 });
  });

  it('rounds to the nearest load the plates can make', () => {
    expect(roundToPlates(61, 20, KG)).toBe(60);
    expect(roundToPlates(61.5, 20, KG)).toBe(62.5);
    expect(roundToPlates(63.75, 20, [20, 10, 5])).toBe(60);
    expect(roundToPlates(15, 20, KG)).toBe(20);
  });

  it('bar types and defaults per unit', () => {
    expect(barOf('barbell')).toBe('barbell');
    expect(barOf('ez_bar')).toBe('ez_bar');
    expect(barOf('dumbbell')).toBeUndefined();
    expect(equipmentOf({ loadUnit: 'lb' }).bars.barbell).toBe(45);
  });

  it('an exercise can have its own bar weight (V2-D26)', () => {
    const kg = { loadUnit: 'kg' as const };
    expect(barWeightOf({ equipment: 'barbell' }, kg)).toBe(20);
    expect(barWeightOf({ equipment: 'ez_bar' }, kg)).toBe(10);
    expect(barWeightOf({ equipment: 'barbell', barWeight: 15 }, kg)).toBe(15);
    expect(barWeightOf({ equipment: 'barbell', barWeight: 0 }, kg)).toBe(0);
    expect(barWeightOf({ equipment: 'dumbbell', barWeight: 15 }, kg)).toBeUndefined();
  });
});
