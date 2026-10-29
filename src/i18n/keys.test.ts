import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { pt } from './pt';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.tsx') || f.endsWith('.ts') ? [join(dir, f)] : []));
const get = (obj: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
const leaves = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k)) : [p];

describe('i18n', () => {
  const src = files(join(__dirname, '..', 'ui')).map((f) => readFileSync(f, 'utf8')).join('\n');
  const keys = [...new Set([...src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];

  it('every static key used in the UI exists in EN and PT', () => {
    const missing = keys.flatMap((k) => [...(get(en, k) === undefined ? [`en:${k}`] : []), ...(get(pt, k) === undefined ? [`pt:${k}`] : [])]);
    expect(missing).toEqual([]);
  });

  it('EN and PT have the same keys', () => {
    expect(leaves(pt).sort()).toEqual(leaves(en).sort());
  });

  it('dynamic groups cover their values', () => {
    for (const g of ['outcome', 'decision']) for (const lang of [en, pt]) expect(Object.keys(get(lang, g) as object).length).toBeGreaterThan(5);
    for (const o of ['increase', 'progress', 'keep', 'incomplete', 'restricted', 'missed', 'at_cap', 'manual', 'no_progression']) expect(get(pt, `outcome.${o}`)).toBeDefined();
    for (const d of ['applied', 'reverted', 'pending', 'kept', 'stepped_back', 'overridden', 'none']) expect(get(pt, `decision.${d}`)).toBeDefined();
    for (const p of [28, 84, 182, 0]) expect(get(pt, `analysis.p${p}`)).toBeDefined();
  });
});
