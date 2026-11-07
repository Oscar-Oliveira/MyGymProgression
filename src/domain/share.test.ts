import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './factory';
import { generateDemo } from './demo';
import { emptyDataSet, parseBundle, planMerge } from './interchange';
import { seedExercises } from './seed';
import { dayShare, decodeShare, encodeCompact, encodeShare, joinDays, parseQrLink, planShare, qrLink } from './share';

const exercises = seedExercises(DEFAULT_SETTINGS).map((e, i) => (i === 0 ? { ...e, personalNotes: 'private', overview: 'long text' } : e)).map((e) => ({ ...e, favorite: true }));
const data = { ...generateDemo(exercises), exercises };
const plan = data.plans[0];
const used = new Set(data.planVersions.find((v) => v.id === plan.currentVersionId)!.days.flatMap((d) => d.items.map((i) => i.exerciseId)));

describe('planShare', () => {
  const b = planShare(data, plan.id, '0.1.0')!;
  it('copies the plan with new ids, its exercises, and no personal records', () => {
    expect(b.data.plans).toHaveLength(1);
    expect(b.data.plans[0].id).not.toBe(plan.id);
    expect(b.data.plans[0]).toMatchObject({ name: plan.name, goal: plan.goal, color: plan.color });
    expect(b.data.planVersions[0].planId).toBe(b.data.plans[0].id);
    expect(new Set(b.data.exercises.map((e) => e.id))).toEqual(used);
    expect(b.data.workouts).toHaveLength(0);
    expect(b.data.progressionStates).toHaveLength(0);
    expect(b.data.exercises.every((e) => e.personalNotes === '')).toBe(true);
    expect(b.data.exercises.some((e) => e.favorite)).toBe(false);
  });
  it('leaves library text out of a link', () => {
    const lite = planShare(data, plan.id, '0.1.0', true)!;
    expect(lite.data.exercises.some((e) => e.overview)).toBe(false);
  });
  it('round trips through a link, and imports as a new plan that reuses existing exercises', async () => {
    const lite = planShare(data, plan.id, '0.1.0', true)!;
    const code = await encodeShare(lite);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const parsed = parseBundle((await decodeShare(code))!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = planMerge(parsed.bundle.data, data, 'skip', 'useExisting');
    expect(merged.plans).toHaveLength(1);
    expect(merged.planVersions).toHaveLength(1);
    // The exercises already exist (same ids): the local ones are kept.
    expect(merged.exercises).toHaveLength(0);
  });
  it('rejects a damaged link', async () => {
    expect(await decodeShare('not*valid')).toBeUndefined();
  });
});

describe('QR codes, one per day (D60)', () => {
  const version = data.planVersions.find((v) => v.id === plan.currentVersionId)!;
  const read = async (code: string) => {
    const r = parseBundle((await decodeShare(code))!);
    if (!r.ok) throw new Error('not a bundle');
    return r.bundle;
  };

  it('a day code holds only that day and its exercises', () => {
    const b = dayShare(data, plan.id, version.days[1].id, '0.1.0')!;
    expect(b.data.planVersions[0].days.map((d) => d.name)).toEqual([version.days[1].name]);
    expect(new Set(b.data.exercises.map((e) => e.name))).toEqual(new Set(version.days[1].items.map((i) => data.exercises.find((e) => e.id === i.exerciseId)!.name)));
  });

  it('the short form is smaller, round trips with new ids, and keeps a text that starts with "~"', async () => {
    const b = dayShare({ ...data, plans: data.plans.map((p) => ({ ...p, description: '~ not an id' })) }, plan.id, version.days[0].id, '0.1.0')!;
    const short = await encodeCompact(b);
    expect(short.startsWith('~')).toBe(true);
    expect(short.length).toBeLessThan((await encodeShare(b)).length * 0.8);
    const back = await read(short);
    expect(back.data.plans[0]).toMatchObject({ name: plan.name, description: '~ not an id' });
    expect(back.data.plans[0].id).not.toBe(b.data.plans[0].id);
    expect(back.data.planVersions[0].planId).toBe(back.data.plans[0].id);
    expect(back.data.planVersions[0].days[0].items.map((i) => i.sets)).toEqual(b.data.planVersions[0].days[0].items.map((i) => i.sets));
    const ids = new Set(back.data.exercises.map((e) => e.id));
    expect(back.data.planVersions[0].days[0].items.every((i) => ids.has(i.exerciseId))).toBe(true);
  });

  it('the link carries the plan group and the day; a plain share link is day 1 of 1', () => {
    const link = qrLink('https://x.test/app/', { code: '~abc', group: 'g1', index: 1, total: 2 });
    expect(parseQrLink(link)).toEqual({ code: '~abc', group: 'g1', index: 1, total: 2 });
    expect(parseQrLink('https://x.test/#/share?d=abc')).toMatchObject({ code: 'abc', index: 0, total: 1 });
    expect(parseQrLink('https://example.com')).toBeUndefined();
    expect(parseQrLink('https://x.test/#/share?d=a&i=2&n=2')).toBeUndefined();
  });

  it('days read one by one join into one plan; an exercise in two days is kept once', async () => {
    const both = data.planVersions.map((v) => (v.id === version.id ? { ...v, days: [version.days[0], { ...version.days[1], items: [...version.days[1].items, version.days[0].items[1]] }] } : v));
    const all = { ...data, planVersions: both };
    const parts = await Promise.all(version.days.map(async (d) => read(await encodeCompact(dayShare(all, plan.id, d.id, '0.1.0')!))));
    const joined = joinDays(parts);
    expect(joined.data.planVersions[0].days.map((d) => d.name)).toEqual(version.days.map((d) => d.name));
    const names = joined.data.exercises.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = new Set(joined.data.exercises.map((e) => e.id));
    expect(joined.data.planVersions[0].days.flatMap((d) => d.items).every((i) => ids.has(i.exerciseId))).toBe(true);
    expect(parseBundle(JSON.stringify(joined)).ok).toBe(true);
    const merged = planMerge(joined.data, emptyDataSet(), 'skip', 'useExisting');
    expect(merged.plans).toHaveLength(1);
    expect(merged.exercises).toHaveLength(names.length);
  });
});
