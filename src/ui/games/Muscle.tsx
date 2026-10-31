import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { MUSCLES } from '../../domain/challenge';
import type { Exercise } from '../../domain/types';
import { Thumb } from '../components/Thumb';
import { tr } from '../util';
import { pick, useEnd, type GameProps } from './canvas';

const LIVES = 3;
const OPTIONS = 4;
/** The answer stays visible this long. */
const SHOW_MS = 900;

interface Question {
  exercise: Exercise;
  answer: string;
  options: string[];
}

const shuffle = <T,>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** A question for a random exercise: its main muscle and 3 muscles it does not work as a main muscle. */
function question(pool: Exercise[]): Question {
  const exercise = pick(pool);
  const answer = exercise.primaryMuscles.find((m) => MUSCLES.includes(m))!;
  const wrong = shuffle(MUSCLES.filter((m) => !exercise.primaryMuscles.includes(m))).slice(0, OPTIONS - 1);
  return { exercise, answer, options: shuffle([answer, ...wrong]) };
}

/** Guess the muscle: the main muscle of exercises from the library, with 3 lives. Score: right answers. */
export function Muscle({ onEnd }: GameProps) {
  const { t } = useTranslation();
  const pool = useLiveQuery(async () => (await db.exercises.toArray()).filter((e) => e.active && e.primaryMuscles.some((m) => MUSCLES.includes(m))), []);
  if (!pool) return null;
  if (!pool.length) return <p className="muted">{t('games.noExercises')}</p>;
  return <Quiz pool={pool} onEnd={onEnd} />;
}

function Quiz({ pool, onEnd }: { pool: Exercise[]; onEnd: (score: number) => void }) {
  const { t } = useTranslation();
  const end = useEnd(onEnd);
  const [current, setQ] = useState(() => question(pool));
  const [chosen, setChosen] = useState<string>();
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);

  const answer = (m: string) => {
    if (chosen) return;
    setChosen(m);
    const right = m === current.answer;
    const nextScore = score + (right ? 1 : 0);
    const nextLives = lives - (right ? 0 : 1);
    setScore(nextScore);
    setLives(nextLives);
    setTimeout(() => {
      if (nextLives <= 0) return end(nextScore);
      setChosen(undefined);
      setQ(question(pool));
    }, SHOW_MS);
  };

  return (
    <div>
      <p className="game-hud">
        <span>
          {t('games.lives')}: <b>{'❤️'.repeat(lives) || '—'}</b>
        </span>
        <span>
          <b>{score}</b>
        </span>
      </p>
      <section className="card muscle-q">
        <Thumb src={current.exercise.thumb} name={current.exercise.name} size={64} />
        <div>
          <p className="eyebrow">{t('games.mainMuscle')}</p>
          <h2>{current.exercise.name}</h2>
        </div>
      </section>
      <div className="muscle-options">
        {current.options.map((m) => (
          <button key={m} className={`outline xl ${chosen && m === current.answer ? 'right' : chosen === m ? 'wrong' : ''}`} onClick={() => answer(m)}>
            {tr(t, 'muscle', m)}
          </button>
        ))}
      </div>
    </div>
  );
}
