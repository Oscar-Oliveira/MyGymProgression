import type { CoachStyle } from '../../domain/types';

const SKIN = '#f2c7a5';
const INK = '#1d1b26';
const BG: Record<CoachStyle, string> = { support: '#0f766e', spite: '#c2410c', stoic: '#475569', sergeant: '#4d7c0f' };

/** Face of the personal trainer, one per style. The mouth moves for a moment when a message appears ("talks"). */
export function CoachAvatar({ style, size = 44 }: { style: CoachStyle; size?: number }) {
  return (
    <svg className={`coach-avatar ${style}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill={BG[style]} />
      {/* Neck and shirt */}
      <path d="M8 48c2-8 8-11 16-11s14 3 16 11z" fill={style === 'sergeant' ? '#365314' : INK} />
      <rect x="20" y="31" width="8" height="7" rx="3" fill={SKIN} />
      <ellipse cx="24" cy="23" rx="11" ry="12" fill={SKIN} />
      {style === 'support' && (
        <>
          <path d="M13 18c1-8 21-8 22 0-3-3-19-3-22 0z" fill="#7c2d12" />
          <rect x="12.5" y="15.5" width="23" height="3.5" rx="1.7" fill="#fbbf24" />
          <path d="M17 20.5q2-2 4 0M27 20.5q2-2 4 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="19" cy="24" r="1.4" fill={INK} />
          <circle cx="29" cy="24" r="1.4" fill={INK} />
          <path className="mouth" d="M19 29q5 5 10 0z" fill="#9f1239" />
        </>
      )}
      {style === 'spite' && (
        <>
          <path d="M13 17c0-7 22-7 22 0l-2-2-3 2-3-3-3 3-3-3-3 3-3-2z" fill={INK} />
          <path d="M16.5 20l5 1.8M31.5 20l-5 1.8" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="19.5" cy="24" r="1.4" fill={INK} />
          <circle cx="28.5" cy="24" r="1.4" fill={INK} />
          <path className="mouth" d="M19 29.5q6 1.5 10-2q-4 4.5-10 2z" fill="#7f1d1d" stroke="#7f1d1d" strokeWidth="1.2" strokeLinejoin="round" />
        </>
      )}
      {style === 'stoic' && (
        <>
          <path d="M13 19c0-9 22-9 22 0-4-4-18-4-22 0z" fill="#94a3b8" />
          <path d="M14 25c0 8 4 11 10 11s10-3 10-11c-2 4-5 5-10 5s-8-1-10-5z" fill="#94a3b8" />
          <path d="M17 23.5q2 1.2 4 0M27 23.5q2 1.2 4 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path className="mouth" d="M21 29.5h6" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
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
    </svg>
  );
}
