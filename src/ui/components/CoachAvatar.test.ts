import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { settingsSchema } from '../../domain/schema';
import { DEFAULT_SETTINGS } from '../../domain/factory';
import { BEARDS, CoachAvatar, defaultLook, GLASSES, HAIR_COLORS, HAIRS, randomLook, SKINS } from './CoachAvatar';

const valid = (look: ReturnType<typeof defaultLook>) => settingsSchema.safeParse({ ...DEFAULT_SETTINGS, coach: { enabled: true, style: 'support', profanity: false, look } }).success;

describe('trainer look (D63)', () => {
  it('the default and random looks are valid for the schema', () => {
    for (const style of ['support', 'spite', 'stoic', 'sergeant', 'energy'] as const) for (const g of ['male', 'female'] as const) expect(valid(defaultLook(style, g))).toBe(true);
    for (let i = 0; i < 50; i++) expect(valid(randomLook(i % 2 ? 'male' : 'female'))).toBe(true);
    expect(randomLook('female').beard).toBe('none');
  });

  it('every option draws, and the chosen look changes the face', () => {
    const svg = (look?: ReturnType<typeof defaultLook>) => renderToStaticMarkup(createElement(CoachAvatar, { style: 'support', look }));
    const base = defaultLook('support');
    const all = [
      ...HAIRS.map((hair) => ({ ...base, hair })),
      ...BEARDS.map((beard) => ({ ...base, beard })),
      ...GLASSES.map((glasses) => ({ ...base, glasses })),
      ...(Object.keys(SKINS) as (keyof typeof SKINS)[]).map((skin) => ({ ...base, skin })),
      ...(Object.keys(HAIR_COLORS) as (keyof typeof HAIR_COLORS)[]).map((hairColor) => ({ ...base, hairColor })),
    ];
    for (const look of all) expect(valid(look)).toBe(true);
    expect(new Set(all.map(svg)).size).toBe(HAIRS.length + BEARDS.length + GLASSES.length + Object.keys(SKINS).length + Object.keys(HAIR_COLORS).length - 4);
    expect(svg()).toBe(svg(base));
    expect(svg({ ...base, skin: 'dark' })).toContain(SKINS.dark);
  });
});
