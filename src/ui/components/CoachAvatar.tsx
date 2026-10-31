import type { CoachGender, CoachStyle } from '../../domain/types';

const SKIN = '#f2c7a5';
const INK = '#1d1b26';
const BG: Record<CoachStyle, string> = { support: '#0f766e', spite: '#c2410c', stoic: '#475569', sergeant: '#4d7c0f', energy: '#be185d' };
const SHIRT: Partial<Record<CoachStyle, string>> = { sergeant: '#365314', energy: '#0369a1' };
/** Eye centres (left x, right x, y), for the lashes of the female faces. */
const EYES: Record<CoachStyle, [number, number, number]> = { support: [19, 29, 24], spite: [19.5, 28.5, 24], stoic: [19, 29, 23.8], sergeant: [19, 29, 24.5], energy: [19, 29, 23] };
/** Hair behind the face (female faces). */
const BACK_HAIR: Record<CoachStyle, { d: string; fill: string }> = {
  support: { d: 'M11 22c0-12 26-12 26 0v13c0 3-3 5-5 5H16c-2 0-5-2-5-5z', fill: '#7c2d12' },
  spite: { d: 'M12 20c0-10 24-10 24 0v11q-2 3-4 3V20H16v14q-2 0-4-3z', fill: INK },
  stoic: { d: 'M19.5 10a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0z', fill: '#94a3b8' },
  sergeant: { d: 'M12.5 17v9q1 2 2.5 2V17zM35.5 17v9q-1 2-2.5 2V17z', fill: '#78350f' },
  energy: { d: 'M29 12q11-3 10 10q-2-5-8-6z', fill: '#f59e0b' },
};

/** Face of the personal trainer, one per style and gender. The mouth moves for a moment when a message appears ("talks"). */
export function CoachAvatar({ style, gender = 'male', size = 44 }: { style: CoachStyle; gender?: CoachGender; size?: number }) {
  const female = gender === 'female';
  const [l, r, y] = EYES[style];
  return (
    <svg className={`coach-avatar ${style}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill={BG[style]} />
      {female && <path d={BACK_HAIR[style].d} fill={BACK_HAIR[style].fill} />}
      {/* Neck and shirt */}
      <path d="M8 48c2-8 8-11 16-11s14 3 16 11z" fill={SHIRT[style] ?? INK} />
      <rect x="20" y="31" width="8" height="7" rx="3" fill={SKIN} />
      <ellipse cx="24" cy="23" rx="11" ry="12" fill={SKIN} />
      {female && (
        <>
          <path d={`M${l - 1.4} ${y - 1}l-1.3-1.1M${r + 1.4} ${y - 1}l1.3-1.1`} stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="17" cy="27.5" r="1.7" fill="#f472b6" opacity="0.35" />
          <circle cx="31" cy="27.5" r="1.7" fill="#f472b6" opacity="0.35" />
          <circle cx="13.2" cy="27" r="1" fill="#fbbf24" />
          <circle cx="34.8" cy="27" r="1" fill="#fbbf24" />
        </>
      )}
      {style === 'support' && (
        <>
          <path d="M13 18c1-8 21-8 22 0-3-3-19-3-22 0z" fill="#7c2d12" />
          <rect x="12.5" y="15.5" width="23" height="3.5" rx="1.7" fill="#fbbf24" />
          <path d="M17 20.5q2-2 4 0M27 20.5q2-2 4 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="19" cy="24" r="1.4" fill={INK} />
          <circle cx="29" cy="24" r="1.4" fill={INK} />
          <path className="mouth" d="M19 29q5 5 10 0z" fill={female ? '#be123c' : '#9f1239'} />
        </>
      )}
      {style === 'spite' && (
        <>
          <path d="M13 17c0-7 22-7 22 0l-2-2-3 2-3-3-3 3-3-3-3 3-3-2z" fill={INK} />
          {female && <path d="M14 17q6-6 14-5" stroke="#db2777" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
          <path d="M16.5 20l5 1.8M31.5 20l-5 1.8" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="19.5" cy="24" r="1.4" fill={INK} />
          <circle cx="28.5" cy="24" r="1.4" fill={INK} />
          <path className="mouth" d="M19 29.5q6 1.5 10-2q-4 4.5-10 2z" fill="#7f1d1d" stroke="#7f1d1d" strokeWidth="1.2" strokeLinejoin="round" />
        </>
      )}
      {style === 'stoic' && (
        <>
          <path d="M13 19c0-9 22-9 22 0-4-4-18-4-22 0z" fill="#94a3b8" />
          {!female && <path d="M14 25c0 8 4 11 10 11s10-3 10-11c-2 4-5 5-10 5s-8-1-10-5z" fill="#94a3b8" />}
          <path d="M17 23.5q2 1.2 4 0M27 23.5q2 1.2 4 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path className="mouth" d="M21 29.5h6" stroke={female ? '#9f1239' : INK} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {style === 'sergeant' && (
        <>
          <path d="M12 17c0-8 24-8 24 0z" fill="#3f6212" />
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
          {female ? <path d="M13 18c1-8 21-8 22 0-3-3-19-3-22 0z" fill="#f59e0b" /> : <path d="M13 18l1-7 4 3 3-6 3 5 3-6 3 6 4-2 1 7c-6-3-16-3-22 0z" fill="#facc15" />}
          <rect x="12.5" y="15.5" width="23" height="3.5" rx="1.7" fill="#ef4444" />
          <path d="M13 17.25h22" stroke="#fff" strokeWidth="0.8" />
          <path d="M17 23.5q2-2.5 4 0M27 23.5q2-2.5 4 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <g className="mouth">
            <path d="M18 28h12q-1 6.5-6 6.5t-6-6.5z" fill="#7f1d1d" />
            <path d="M19 28h10l-.3 1.6h-9.4z" fill="#fff" />
          </g>
        </>
      )}
    </svg>
  );
}
