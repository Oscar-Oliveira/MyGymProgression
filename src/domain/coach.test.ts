import { describe, expect, it } from 'vitest';
import { COACH_BANKS } from '../i18n/coach';
import { coachContext, coachMessage, coachOnPages, dayPart, speaksAfterStep } from './coach';
import type { ProgressionEvent, Settings, Workout } from './types';

const bank = { support: ['Go!', 'Month {{month}}', 'Up {{exercise}} {{from}}→{{to}}'], spite: ['clean'], spiteProfane: ['f*ck'], stoic: ['Back after {{days}} days'], sergeant: ['Move'] };

describe('personal trainer', () => {
  it('only uses messages whose data exists, and fills the data in', () => {
    const none = { month: 0 };
    for (let i = 0; i < 20; i++) expect(coachMessage(bank, { style: 'support', profanity: false }, none, `w${i}`)).toBe('Go!');
    const all = new Set(Array.from({ length: 40 }, (_, i) => coachMessage(bank, { style: 'support', profanity: false }, { month: 3, increase: { exercise: 'Squat', from: '60 kg', to: '62.5 kg' } }, `w${i}`)));
    expect(all).toEqual(new Set(['Go!', 'Month 3', 'Up Squat 60 kg→62.5 kg']));
    expect(coachMessage(bank, { style: 'stoic', profanity: false }, none, 'x')).toBe('');
  });

  it('profanity only changes the spite style', () => {
    expect(coachMessage(bank, { style: 'spite', profanity: true }, { month: 0 }, 'a')).toBe('f*ck');
    expect(coachMessage(bank, { style: 'spite', profanity: false }, { month: 0 }, 'a')).toBe('clean');
    expect(coachMessage(bank, { style: 'sergeant', profanity: true }, { month: 0 }, 'a')).toBe('Move');
  });

  it('the same workout always gets the same message', () => {
    const ctx = { month: 2, days: 4 };
    expect(coachMessage(COACH_BANKS.pt.start, { style: 'stoic', profanity: false }, ctx, 'id-1')).toBe(coachMessage(COACH_BANKS.pt.start, { style: 'stoic', profanity: false }, ctx, 'id-1'));
  });

  it('every place and style has messages in both languages that work without data', () => {
    for (const lang of ['pt', 'en'] as const)
      for (const place of ['start', 'home', 'done', 'analysis', 'history'] as const)
        for (const style of ['support', 'spite', 'stoic', 'sergeant'] as const)
          for (const profanity of [false, true]) expect(coachMessage(COACH_BANKS[lang][place], { style, profanity }, { month: 0 }, 'seed')).not.toBe('');
  });

  it('the same places, styles and placeholders in both languages', () => {
    const shape = (b: (typeof COACH_BANKS)['pt']) =>
      Object.entries(b).map(([place, styles]) => [place, Object.entries(styles).map(([st, list]) => [st, Array.isArray(list) ? list.map((m) => [...m.matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]).join()) : Object.keys(list)])]);
    expect(shape(COACH_BANKS.en)).toEqual(shape(COACH_BANKS.pt));
  });

  it('page data fills the page placeholders', () => {
    const bank = { support: ['{{day}}|{{sets}}|{{records}}|{{ups}}|{{total}}'], spite: [], spiteProfane: [], stoic: [], sergeant: [] };
    expect(coachMessage(bank, { style: 'support', profanity: false }, { month: 0, day: 'Legs', sets: 12, records: 2, ups: 3, total: 40 }, 's')).toBe('Legs|12|2|3|40');
    expect(coachMessage(bank, { style: 'support', profanity: false }, { month: 0, day: 'Legs', sets: 12, records: 0, ups: 3, total: 40 }, 's')).toBe('');
  });

  it('time of day for the greeting', () => {
    const at = (h: number) => dayPart(new Date(2026, 9, 30, h));
    expect([4, 5, 11, 12, 19, 20, 23].map(at)).toEqual(['evening', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
  });

  it('other pages: only when the trainer is on, and not switched off for pages', () => {
    const s = (coach?: Settings['coach']) => ({ coach }) as Settings;
    const on = { enabled: true, style: 'stoic', profanity: false } as const;
    expect(coachOnPages(s(on))).toBe(on);
    expect(coachOnPages(s({ ...on, pages: true }))).toBeDefined();
    expect(coachOnPages(s({ ...on, pages: false }))).toBeUndefined();
    expect(coachOnPages(s({ ...on, enabled: false }))).toBeUndefined();
    expect(coachOnPages(s())).toBeUndefined();
  });

  it('context: workouts this month, days since the last one, latest increase', () => {
    const w = (startedAt: string, status: Workout['status'] = 'completed') => ({ startedAt, status }) as Workout;
    const ev = (decidedAt: string, decision: ProgressionEvent['decision']) => ({ decidedAt, createdAt: decidedAt, decision, exerciseId: decidedAt }) as ProgressionEvent;
    const now = new Date('2026-10-30T12:00:00Z');
    const ctx = coachContext(
      [w('2026-10-20T10:00:00Z'), w('2026-10-25T10:00:00Z'), w('2026-09-30T10:00:00Z'), w('2026-10-30T09:00:00Z', 'in_progress')],
      [ev('2026-10-20T11:00:00Z', 'applied'), ev('2026-10-25T11:00:00Z', 'kept')],
      now,
      (e) => ({ exercise: e.exerciseId, from: 'a', to: 'b' }),
    );
    expect(ctx).toEqual({ month: 2, days: 5, increase: { exercise: '2026-10-20T11:00:00Z', from: 'a', to: 'b' }, ups: 1, total: 3 });
  });

  it('between exercises: always, never, or about 4 in 10 (stable per step)', () => {
    const seeds = Array.from({ length: 500 }, (_, i) => `w:${i}`);
    expect(seeds.every((x) => speaksAfterStep('each', x))).toBe(true);
    expect(seeds.some((x) => speaksAfterStep('start', x))).toBe(false);
    const n = seeds.filter((x) => speaksAfterStep('random', x)).length;
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(250);
    expect(speaksAfterStep(undefined, 'w:7')).toBe(speaksAfterStep('random', 'w:7'));
  });
});
