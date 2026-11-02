import type { CoachBeard, CoachGender, CoachGlasses, CoachHair, CoachHairColor, CoachLook, CoachSkin, CoachStyle } from '../../domain/types';

const INK = '#1d1b26';
const BG: Record<CoachStyle, string> = { support: '#0f766e', spite: '#c2410c', stoic: '#475569', sergeant: '#4d7c0f', energy: '#be185d' };
const SHIRT: Partial<Record<CoachStyle, string>> = { sergeant: '#365314', energy: '#0369a1' };
/** Eye centres (left x, right x, y), for the lashes of the female faces and the glasses. */
const EYES: Record<CoachStyle, [number, number, number]> = { support: [19, 29, 24], spite: [19.5, 28.5, 24], stoic: [19, 29, 23.8], sergeant: [19, 29, 24.5], energy: [19, 29, 23] };

export const SKINS: Record<CoachSkin, string> = { light: '#fde3cf', fair: '#f2c7a5', medium: '#dfa67a', tan: '#c48552', brown: '#8d5a3b', dark: '#5c3a24' };
export const HAIR_COLORS: Record<CoachHairColor, string> = {
  black: INK,
  darkBrown: '#3b2314',
  brown: '#6b3e1f',
  auburn: '#7c2d12',
  ginger: '#d9661f',
  blonde: '#e8c26b',
  grey: '#94a3b8',
  white: '#e5e7eb',
  pink: '#ec4899',
  blue: '#3b82f6',
};
export const HAIRS: CoachHair[] = ['bald', 'buzz', 'short', 'side', 'wavy', 'curly', 'afro', 'spiky', 'mohawk', 'long', 'ponytail', 'bun', 'braids', 'bob'];
export const BEARDS: CoachBeard[] = ['none', 'stubble', 'moustache', 'goatee', 'full'];
export const GLASSES: CoachGlasses[] = ['none', 'round', 'square', 'sun'];

/** The look of each style before the look could be chosen (D63): the default when none is set. */
export function defaultLook(style: CoachStyle, gender: CoachGender = 'male'): CoachLook {
  const f = gender === 'female';
  const base = { skin: 'fair', beard: 'none', glasses: 'none' } as const;
  const looks: Record<CoachStyle, Pick<CoachLook, 'hair' | 'hairColor'> & Partial<CoachLook>> = {
    support: { hair: f ? 'long' : 'short', hairColor: 'auburn' },
    spite: { hair: f ? 'bob' : 'spiky', hairColor: 'black' },
    stoic: { hair: f ? 'bun' : 'short', hairColor: 'grey', beard: f ? 'none' : 'full' },
    sergeant: { hair: f ? 'bob' : 'buzz', hairColor: f ? 'brown' : 'darkBrown' },
    energy: { hair: f ? 'ponytail' : 'spiky', hairColor: f ? 'ginger' : 'blonde' },
  };
  return { ...base, ...looks[style] };
}

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const HAIR_BY_GENDER: Record<CoachGender, CoachHair[]> = {
  male: ['bald', 'buzz', 'short', 'side', 'wavy', 'curly', 'afro', 'spiky', 'mohawk', 'braids'],
  female: ['short', 'wavy', 'curly', 'afro', 'long', 'ponytail', 'bun', 'braids', 'bob'],
};

/** A random look for the other trainers (splash, games). Mostly natural hair colours. */
export function randomLook(gender: CoachGender): CoachLook {
  return {
    skin: pick(Object.keys(SKINS) as CoachSkin[]),
    hair: pick(HAIR_BY_GENDER[gender]),
    hairColor: Math.random() < 0.1 ? pick(['pink', 'blue'] as const) : pick(['black', 'black', 'darkBrown', 'darkBrown', 'brown', 'auburn', 'ginger', 'blonde', 'grey', 'white'] as const),
    beard: gender === 'female' ? 'none' : pick(BEARDS),
    glasses: Math.random() < 0.25 ? pick(GLASSES.slice(1)) : 'none',
  };
}

/** A circle as path data, to join circles in one path. */
const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const SHORT = 'M12.6 21C11.5 6 36.5 6 35.4 21C34 17 31 15.5 24 15.5S14 17 12.6 21z';
const BUZZ = 'M13.2 19.5C12.5 7 35.5 7 34.8 19.5C33 15.5 30 14.5 24 14.5S15 15.5 13.2 19.5z';
/** Hair behind the face (back) and over the forehead (front), with an opacity for short-cut hair. */
const HAIR: Record<CoachHair, { back?: string; front?: { d: string; o?: number }[]; lines?: string }> = {
  bald: {},
  buzz: { front: [{ d: BUZZ, o: 0.7 }] },
  short: { front: [{ d: SHORT }] },
  side: { front: [{ d: 'M12.6 22C11 6 37 6 35.4 21C34 17 31 15 27 14.5C24 17 18 17.5 15 17.5C13.8 18.5 13 20 12.6 22z' }] },
  wavy: {
    front: [{ d: 'M12.4 22C10.5 14 13 9 17 8.5C19 6.5 23 6.5 25 7.5C28 6 32 7.5 33.5 10C36.5 12 36.5 17 35.6 22C34.5 18 32.5 16.5 30 16C28 17.5 25 17.5 23 16C20.5 17.5 17 17.5 15.5 16.5C14 18 13 20 12.4 22z' }],
  },
  curly: { front: [{ d: [circ(14.5, 17, 3), circ(16.5, 12.5, 3.6), circ(21, 9.5, 3.8), circ(27, 9.5, 3.8), circ(31.5, 12.5, 3.6), circ(33.5, 17, 3), circ(24, 12.5, 4.5)].join('') }] },
  afro: { back: circ(24, 17, 15), front: [{ d: [circ(15, 15.5, 3), circ(19.5, 13.5, 3.2), circ(24, 13, 3.2), circ(28.5, 13.5, 3.2), circ(33, 15.5, 3), 'M14 14h20v-6H14z'].join('') }] },
  spiky: { front: [{ d: 'M13 18l1-7 4 3 3-6 3 5 3-6 3 6 4-2 1 7c-6-3-16-3-22 0z' }] },
  mohawk: { front: [{ d: BUZZ, o: 0.4 }, { d: 'M21 16C20.5 10 21.5 5 24 2.5C26.5 5 27.5 10 27 16C25 15 23 15 21 16z' }] },
  long: { back: 'M11 20C11 4 37 4 37 20V35C37 38 34 40 32 40H16C14 40 11 38 11 35z', front: [{ d: 'M12.6 21C11.5 6 36.5 6 35.4 21C33 16.5 28 15 24 15S15 16.5 12.6 21z' }] },
  ponytail: { back: 'M32 12C40 12 41 20 39.5 28C39 32 37 35 35 37C36.5 30 36.5 22 32 18z', front: [{ d: 'M13 20C12.5 6 35.5 6 35 20C33 15.5 29 14 24 14S15 15.5 13 20z' }] },
  bun: { back: circ(24, 7, 5), front: [{ d: 'M13 20C12.5 6 35.5 6 35 20C33 15.5 29 14 24 14S15 15.5 13 20z' }] },
  braids: {
    back: 'M10.5 19h5v20q-2.5 2-5 0zM32.5 19h5v20q-2.5 2-5 0z',
    front: [{ d: 'M12.6 21C11.5 6 36.5 6 35.4 21C33 16 28 14.5 24.5 14.5L24 12.5L23.5 14.5C20 14.5 15 16 12.6 21z' }],
    lines: 'M10.5 25l2.5 1.5 2.5-1.5M10.5 29l2.5 1.5 2.5-1.5M10.5 33l2.5 1.5 2.5-1.5M10.5 37l2.5 1.5 2.5-1.5M32.5 25l2.5 1.5 2.5-1.5M32.5 29l2.5 1.5 2.5-1.5M32.5 33l2.5 1.5 2.5-1.5M32.5 37l2.5 1.5 2.5-1.5',
  },
  bob: {
    back: 'M11.5 20C11.5 5 36.5 5 36.5 20V31Q36.5 34 33.5 34H32V20H16V34H14.5Q11.5 34 11.5 31z',
    front: [{ d: 'M12.8 19.5C12 6 36 6 35.2 19.5C33 18 30 17.5 24 17.5S15 18 12.8 19.5z' }],
  },
};
const JAW = 'M13.5 24c0 9 4.5 12 10.5 12s10.5-3 10.5-12c-2 4.5-5 6-10.5 6s-8.5-1.5-10.5-6z';
const MOUSTACHE = 'M18.5 28.3C20 26.4 22.5 26.4 24 27.4C25.5 26.4 28 26.4 29.5 28.3C27.5 27.7 25.5 28 24 28.6C22.5 28 20.5 27.7 18.5 28.3z';
const BEARD: Record<CoachBeard, { d: string; o?: number }[]> = {
  none: [],
  stubble: [{ d: JAW, o: 0.3 }],
  moustache: [{ d: MOUSTACHE }],
  goatee: [{ d: MOUSTACHE }, { d: 'M20.5 32.5C22 33.5 26 33.5 27.5 32.5C27 35 25.5 36 24 36S21 35 20.5 32.5z' }],
  full: [{ d: JAW }, { d: MOUSTACHE }],
};

function Glasses({ kind, eyes: [l, r, y] }: { kind: CoachGlasses; eyes: [number, number, number] }) {
  if (kind === 'none') return null;
  const w = kind === 'round' ? 3.3 : 3.6;
  const lens = (x: number) =>
    kind === 'round' ? <circle cx={x} cy={y} r={w} /> : <rect x={x - w} y={y - 2.6} width={2 * w} height={kind === 'sun' ? 4.8 : 5.2} rx={kind === 'sun' ? 2 : 1.2} />;
  return (
    <g stroke={INK} strokeWidth="1.1" fill={kind === 'sun' ? '#111827' : 'none'} strokeLinecap="round">
      {lens(l)}
      {lens(r)}
      <path d={`M${l + w} ${y - 0.5}Q24 ${y - 1.8} ${r - w} ${y - 0.5}M${l - w} ${y - 0.5}H13.3M${r + w} ${y - 0.5}H34.7`} fill="none" />
      {kind === 'sun' && <path d={`M${l - 1.8} ${y - 1}l1.6-1M${r - 1.8} ${y - 1}l1.6-1`} stroke="#fff" strokeWidth="0.7" opacity="0.6" />}
    </g>
  );
}

/** Name of the trainer above a message, when it has one (D63). */
export function CoachName({ name }: { name?: string }) {
  return name?.trim() ? <span className="coach-name">{name.trim()}</span> : null;
}

/**
 * Face of the personal trainer. The look (skin, hair, beard, glasses) is free (D63); the style gives the background,
 * the shirt, the expression and the accessory (headband, cap). The mouth moves for a moment when a message appears ("talks").
 */
export function CoachAvatar({ style, gender = 'male', look, size = 44 }: { style: CoachStyle; gender?: CoachGender; look?: CoachLook; size?: number }) {
  const female = gender === 'female';
  const lk = look ?? defaultLook(style, gender);
  const skin = SKINS[lk.skin];
  const hairFill = HAIR_COLORS[lk.hairColor];
  const hair = HAIR[lk.hair];
  const [l, r, y] = EYES[style];
  return (
    <svg className={`coach-avatar ${style}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill={BG[style]} />
      {hair.back && <path d={hair.back} fill={hairFill} />}
      {hair.lines && <path d={hair.lines} stroke="#000" strokeOpacity="0.3" strokeWidth="0.8" fill="none" />}
      {/* Neck and shirt */}
      <path d="M8 48c2-8 8-11 16-11s14 3 16 11z" fill={SHIRT[style] ?? INK} />
      <rect x="20" y="31" width="8" height="7" rx="3" fill={skin} />
      <ellipse cx="24" cy="23" rx="11" ry="12" fill={skin} />
      {BEARD[lk.beard].map((b, i) => (
        <path key={i} d={b.d} fill={hairFill} opacity={b.o} />
      ))}
      {female && (
        <>
          <path d={`M${l - 1.4} ${y - 1}l-1.3-1.1M${r + 1.4} ${y - 1}l1.3-1.1`} stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="17" cy="27.5" r="1.7" fill="#f472b6" opacity="0.35" />
          <circle cx="31" cy="27.5" r="1.7" fill="#f472b6" opacity="0.35" />
          <circle cx="13.2" cy="27" r="1" fill="#fbbf24" />
          <circle cx="34.8" cy="27" r="1" fill="#fbbf24" />
        </>
      )}
      {hair.front?.map((h, i) => (
        <path key={i} d={h.d} fill={hairFill} opacity={h.o} />
      ))}
      {style === 'support' && (
        <>
          <rect x="12.5" y="15.5" width="23" height="3.5" rx="1.7" fill="#fbbf24" />
          <path d="M17 20.5q2-2 4 0M27 20.5q2-2 4 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="19" cy="24" r="1.4" fill={INK} />
          <circle cx="29" cy="24" r="1.4" fill={INK} />
          <path className="mouth" d="M19 29q5 5 10 0z" fill={female ? '#be123c' : '#9f1239'} />
        </>
      )}
      {style === 'spite' && (
        <>
          <path d="M16.5 20l5 1.8M31.5 20l-5 1.8" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="19.5" cy="24" r="1.4" fill={INK} />
          <circle cx="28.5" cy="24" r="1.4" fill={INK} />
          <path className="mouth" d="M19 29.5q6 1.5 10-2q-4 4.5-10 2z" fill="#7f1d1d" stroke="#7f1d1d" strokeWidth="1.2" strokeLinejoin="round" />
        </>
      )}
      {style === 'stoic' && (
        <>
          <path d="M17 23.5q2 1.2 4 0M27 23.5q2 1.2 4 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path className="mouth" d="M21 29.5h6" stroke={female ? '#9f1239' : INK} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {style === 'sergeant' && (
        <>
          <path d="M11.5 17.5C11.5 5 36.5 5 36.5 17.5z" fill="#3f6212" />
          <path d="M11 17h26q-2 3-13 3t-13-3z" fill="#1a2e05" />
          <path d="M16.5 21h5M26.5 21h5" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <circle cx="19" cy="24.5" r="1.4" fill={INK} />
          <circle cx="29" cy="24.5" r="1.4" fill={INK} />
          <rect className="mouth" x="19.5" y="29" width="9" height="2.2" rx="1" fill="#7f1d1d" />
        </>
      )}
      {style === 'energy' && (
        <>
          <path d="M8 9l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1zM40 30l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#fde047" />
          <rect x="12.5" y="15.5" width="23" height="3.5" rx="1.7" fill="#ef4444" />
          <path d="M13 17.25h22" stroke="#fff" strokeWidth="0.8" />
          <path d="M17 23.5q2-2.5 4 0M27 23.5q2-2.5 4 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <g className="mouth">
            <path d="M18 28h12q-1 6.5-6 6.5t-6-6.5z" fill="#7f1d1d" />
            <path d="M19 28h10l-.3 1.6h-9.4z" fill="#fff" />
          </g>
        </>
      )}
      <Glasses kind={lk.glasses} eyes={EYES[style]} />
    </svg>
  );
}
