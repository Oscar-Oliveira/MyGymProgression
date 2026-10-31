import { useEffect, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CoachGender, CoachStyle } from '../../domain/types';
import { CoachAvatar } from '../components/CoachAvatar';
import { pick, rand, useEnd, type GameProps } from './canvas';

const HOLES = 9;
const SECONDS = 30;
const TICK_MS = 100;
const STYLES: CoachStyle[] = ['support', 'spite', 'stoic', 'sergeant', 'energy'];
const GENDERS: CoachGender[] = ['male', 'female'];
/** Points per style: the sergeant is worth 2, the support trainer must not be hit. */
const POINTS: Record<CoachStyle, number> = { support: -3, spite: 1, stoic: 1, sergeant: 2, energy: 1 };

interface Mole {
  style: CoachStyle;
  gender: CoachGender;
  /** Time left (s) when it hides. */
  until: number;
}

/** Whack-a-PT: tap the trainers that pop up, for 30 seconds. Score: points (never below 0). */
export function Whack({ onEnd }: GameProps) {
  const { t } = useTranslation();
  const end = useEnd(onEnd);
  const [, render] = useReducer((x: number) => x + 1, 0);
  const st = useRef({ left: SECONDS, score: 0, next: 0, holes: Array<Mole | undefined>(HOLES).fill(undefined), hits: Array<string | undefined>(HOLES).fill(undefined) });

  useEffect(() => {
    const id = setInterval(() => {
      const s = st.current;
      s.left = Math.max(0, s.left - TICK_MS / 1000);
      // Faster towards the end: a new trainer every 0.9 s → 0.45 s, visible 1.1 s → 0.65 s.
      const pace = s.left / SECONDS;
      s.holes = s.holes.map((m) => (m && m.until < s.left ? m : undefined));
      s.next -= TICK_MS / 1000;
      const free = s.holes.flatMap((m, i) => (m ? [] : [i]));
      if (s.next <= 0 && free.length) {
        s.next = 0.45 + 0.45 * pace;
        s.holes[pick(free)] = { style: pick(STYLES), gender: pick(GENDERS), until: s.left - rand(0.65, 0.65 + 0.45 * pace) };
      }
      render();
      if (s.left <= 0) {
        clearInterval(id);
        end(s.score);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const hit = (i: number) => {
    const s = st.current;
    const m = s.holes[i];
    if (!m || s.left <= 0) return;
    const p = POINTS[m.style];
    s.score = Math.max(0, s.score + p);
    s.holes[i] = undefined;
    s.hits[i] = p < 0 ? `${t('games.ouch')} ${p}` : `+${p}`;
    setTimeout(() => {
      s.hits[i] = undefined;
      render();
    }, 450);
    render();
  };

  const s = st.current;
  return (
    <div>
      <p className="game-hud">
        <span>
          {t('games.time')}: <b>{Math.ceil(s.left)}</b>
        </span>
        <span>
          <b>{s.score}</b>
        </span>
      </p>
      <div className="whack-grid">
        {s.holes.map((m, i) => (
          <button key={i} className={`whack-hole ${m ? 'up' : ''}`} aria-label={m ? t(`coach.styles.${m.style}`) : t('games.card', { n: i + 1 })} onPointerDown={() => hit(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && hit(i)}>
            {m && <CoachAvatar style={m.style} gender={m.gender} size={64} />}
            {s.hits[i] && <span className={`whack-hit ${s.hits[i]!.startsWith('+') ? 'up' : 'down'}`}>{s.hits[i]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
