import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import type { GameId, GameScore } from '../../domain/types';
import { CoachAvatar, CoachName } from '../components/CoachAvatar';
import { dialog } from '../components/Dialog';
import { ActionMenu } from '../components/ActionMenu';
import { PageHead } from '../components/Bits';
import { fmtDate, fmtNum, useSettings } from '../util';
import type { GameProps } from './canvas';
import { Flappy } from './Flappy';
import { Memory } from './Memory';
import { Muscle } from './Muscle';
import { Runner } from './Runner';
import { Starship } from './Starship';
import { Whack } from './Whack';
import { LegDay } from './LegDay';
import { Rerack } from './Rerack';
import { fx } from './feedback';
import { canSpeak, speak } from '../voice';

/** `lower`: a lower score is better (memory counts moves). `secret`: listed only once unlocked by the "1987" easter egg (D59). */
const GAMES: { id: GameId; icon: string; lower?: boolean; secret?: boolean; Game: (p: GameProps) => React.ReactNode }[] = [
  { id: 'memory', icon: '🃏', lower: true, Game: Memory },
  { id: 'whack', icon: '🔨', Game: Whack },
  { id: 'muscle', icon: '💪', Game: Muscle },
  { id: 'flappy', icon: '🏋️', Game: Flappy },
  { id: 'runner', icon: '🏃', Game: Runner },
  { id: 'starship', icon: '🚀', Game: Starship },
  { id: 'legday', icon: '🦵', Game: LegDay },
  { id: 'rerack', icon: '🕹️', secret: true, Game: Rerack },
];
const visible = (s: { secretGame?: boolean }) => GAMES.filter((g) => !g.secret || s.secretGame);
const LAST = 10;

const bestOf = (lower: boolean | undefined, scores: GameScore[]) => (scores.length ? (lower ? Math.min : Math.max)(...scores.map((s) => s.score)) : undefined);

/** The trainer chosen on the trainer page plays; without one, the energetic trainer. It speaks only when its voice is on. */
function useTrainer() {
  const s = useSettings();
  const style = s.coach?.style ?? 'energy';
  const gender = s.coach?.gender;
  const look = s.coach?.look;
  const voice = !!(s.coach?.enabled && s.coach.voice && canSpeak());
  return { style, gender, look, name: s.coach?.name, say: voice ? (text: string) => speak(text, s.language, { style, gender }) : undefined };
}

export function GamesPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const scores = useLiveQuery(() => db.gameScores.toArray(), [], []);
  const resetAll = async () => {
    if (await dialog.confirm(t('games.resetAllConfirm'), { danger: true, ok: t('games.resetAll') })) await repo.resetScores();
  };
  return (
    <div>
      <PageHead title={t('games.title')} aside={scores.length > 0 && <ActionMenu title={t('games.title')} actions={[{ label: t('games.resetAll'), danger: true, onClick: () => void resetAll() }]} />} />
      <ul className="menu card" style={{ padding: 0 }}>
        {visible(s).map((g) => {
          const best = bestOf(g.lower, scores.filter((x) => x.game === g.id));
          return (
            <li key={g.id}>
              <Link to={`/games/${g.id}`}>
                <span className="ico game-ico" aria-hidden="true">
                  {g.icon}
                </span>
                <span>
                  {t(`games.names.${g.id}`)}
                  <small>{best === undefined ? t('games.noScore') : `${t('games.best')}: ${fmtNum(best, s.language)} ${t(`games.unit.${g.id}`)}`}</small>
                </span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One game: start, play, then the score, the trainer's reaction and the last scores. */
export function GamePage() {
  const { id } = useParams();
  // A new game id starts a new page (no game left running).
  return <OneGame key={id} id={id} />;
}

function OneGame({ id }: { id?: string }) {
  const { t } = useTranslation();
  const s = useSettings();
  const trainer = useTrainer();
  const game = visible(s).find((g) => g.id === id);
  const scores = useLiveQuery(() => db.gameScores.where('game').equals(id ?? '').toArray(), [id], []);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<{ score: number; record: boolean }>();
  if (!game) return null;
  const name = t(`games.names.${game.id}`);
  const best = bestOf(game.lower, scores);
  const last = [...scores].sort((a, b) => b.at.localeCompare(a.at)).slice(0, LAST);
  const unit = t(`games.unit.${game.id}`);
  const fmt = (n: number) => `${fmtNum(n, s.language)} ${unit}`;

  const end = async (score: number) => {
    // The first game is a record, except a score of 0.
    const record = best === undefined ? game.lower || score > 0 : game.lower ? score < best : score > best;
    await repo.addScore(game.id, score);
    fx(record ? 'record' : 'end');
    trainer.say?.(t(`games.react.${trainer.style}.${record ? 'record' : 'score'}`, { score: fmt(score) }));
    setResult({ score, record });
    setRun(0);
  };
  const play = () => {
    setResult(undefined);
    setRun((r) => r + 1);
  };
  const reset = async () => {
    if (await dialog.confirm(t('games.resetConfirm', { name }), { danger: true, ok: t('games.reset') })) await repo.resetScores(game.id);
  };

  return (
    <div className="game-page">
      <PageHead
        title={name}
        count={best !== undefined ? `${t('games.best')}: ${fmt(best)}` : undefined}
        aside={last.length > 0 && <ActionMenu title={name} actions={[{ label: t('games.reset'), danger: true, onClick: () => void reset() }]} />}
      />
      {run > 0 ? (
        <game.Game key={run} style={trainer.style} gender={trainer.gender} look={trainer.look} onEnd={(n) => void end(n)} onSay={trainer.say} />
      ) : (
        <>
          {result && (
            <div className="coach" role="status">
              <CoachAvatar style={trainer.style} gender={trainer.gender} look={trainer.look} />
              <p>
                <CoachName name={trainer.name} />
                {t(`games.react.${trainer.style}.${result.record ? 'record' : 'score'}`, { score: fmt(result.score) })}
              </p>
            </div>
          )}
          <p className="help">{t(`games.help.${game.id}`)}</p>
          <button className="primary xl" style={{ width: '100%' }} onClick={play}>
            ▶ {result ? t('games.again') : t('games.play')}
          </button>
          {last.length > 0 && (
            <section className="card" style={{ marginTop: '1rem' }}>
              <h2>{t('games.last')}</h2>
              <ul className="score-list">
                {last.map((x) => (
                  <li key={x.id}>
                    <span>{fmtDate(x.at, s.language, true)}</span>
                    <b>{fmt(x.score)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
