// Splash (D51): the trainers pop up in a random order and look, take turns to say something in their style, and react when
// tapped; a line shows one of your numbers or a tip. A tap elsewhere (or a key) closes it (see main.tsx).
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { weekStreak } from '../../domain/analysis';
import type { CoachGender, CoachStyle } from '../../domain/types';
import { CoachAvatar } from './CoachAvatar';

const STYLES: CoachStyle[] = ['support', 'energy', 'spite', 'sergeant', 'stoic'];
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T,>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Seconds between two trainers talking. */
const TURN = 2200;

export function SplashCrew() {
  const { t } = useTranslation();
  const settings = useLiveQuery(() => repo.getSettings(), []);
  const workouts = useLiveQuery(() => db.workouts.where('status').notEqual('in_progress').toArray(), []);
  const lng = settings?.language;
  // A new crew on every start: random order and faces.
  const [crew] = useState(() => shuffle(STYLES).map((style) => ({ style, gender: (Math.random() < 0.5 ? 'male' : 'female') as CoachGender })));
  const [talk, setTalk] = useState<{ i: number; text: string; at: number }>();
  const [poked, setPoked] = useState<{ i: number; at: number }>();
  const pokedAt = useRef(0);

  const say = (i: number) => setTalk({ i, text: pick(t(`splash.say.${crew[i].style}`, { lng, returnObjects: true }) as string[]), at: Date.now() });
  useEffect(() => {
    if (!lng) return;
    let last = -1;
    const next = () => {
      // A tapped trainer keeps talking for a whole turn.
      if (Date.now() - pokedAt.current < TURN) return;
      last = pick([0, 1, 2, 3, 4].filter((i) => i !== last));
      say(last);
    };
    const first = setTimeout(next, 900);
    const turns = setInterval(next, TURN);
    return () => (clearTimeout(first), clearInterval(turns));
  }, [lng]);

  // One line: a number of yours (this month, all, weeks in a row) or a tip, chosen at random.
  const line = useMemo(() => {
    if (!lng || !workouts) return undefined;
    const now = new Date();
    const month = workouts.filter((w) => {
      const d = new Date(w.startedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const streak = weekStreak(workouts, now).current;
    const stats = [
      ...(month ? [t('splash.stat.month', { lng, count: month })] : []),
      ...(workouts.length ? [t('splash.stat.total', { lng, count: workouts.length })] : []),
      ...(streak > 1 ? [t('splash.stat.streak', { lng, count: streak })] : []),
    ];
    return stats.length && Math.random() < 0.5 ? pick(stats) : pick(t('splash.tips', { lng, returnObjects: true }) as string[]);
  }, [lng, !!workouts]);

  const poke = (i: number) => (e: MouseEvent) => {
    // A trainer reacts; the splash stays open.
    e.stopPropagation();
    pokedAt.current = Date.now();
    setPoked({ i, at: pokedAt.current });
    say(i);
  };

  return (
    <>
      {lng && (
        <div className="splash-text">
          <p className="splash-tap">{t('splash.tap', { lng })}</p>
          {line && <p className="splash-line">{line}</p>}
        </div>
      )}
      <div className="splash-crew">
        {crew.map(({ style, gender }, i) => (
          <span key={style} className={`crew-${style} ${i < 2 ? 'left' : i > 2 ? 'right' : ''}`} style={{ '--i': i } as React.CSSProperties}>
            <button type="button" className={poked?.i === i ? 'poked' : ''} key={poked?.i === i ? poked.at : 0} onClick={poke(i)} aria-label={t(`coach.styles.${style}`, { lng })}>
              <CoachAvatar style={style} gender={gender} size={54} />
            </button>
            {talk?.i === i && (
              <span key={talk.at} className="bubble">
                {talk.text}
              </span>
            )}
          </span>
        ))}
      </div>
    </>
  );
}
