import { describe, expect, it } from 'vitest';
import { backupDue } from './backup';

const now = new Date('2026-10-30T12:00:00Z');

describe('backupDue', () => {
  it('is not due without finished workouts', () => {
    expect(backupDue(undefined, 0, now)).toBeUndefined();
  });
  it('is due when there is no backup yet', () => {
    expect(backupDue(undefined, 1, now)).toBe(Infinity);
  });
  it('is not due within 7 days', () => {
    expect(backupDue('2026-10-23T12:00:00Z', 5, now)).toBeUndefined();
  });
  it('is due after 7 days, with the age in days', () => {
    expect(backupDue('2026-10-22T11:00:00Z', 5, now)).toBe(8);
  });
});
