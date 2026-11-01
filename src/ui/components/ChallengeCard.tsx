import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { challengeProgress, weekKey } from '../../domain/challenge';
import type { Challenge, Settings } from '../../domain/types';
import { fmtNum, fmtValue, loadOut, tr, useSettings } from '../util';
import { CoachAvatar } from './CoachAvatar';

const fmtLoad = (kg: number, s: Settings) => fmtValue(loadOut(kg, s), s.loadUnit, s.language);
/** A record load as the user logs it: per side for a per-side exercise (the stored value is the total). */
const load = (t: TFunction, ch: Challenge, kg: number, s: Settings) => (ch.perSide ? t('challenge.perSide', { load: fmtLoad(kg / 2, s) }) : fmtLoad(kg, s));

/** The challenge as a sentence. */
export function challengeText(t: TFunction, ch: Challenge, s: Settings): string {
  return t(`challenge.kinds.${ch.kind}`, { target: ch.target, exercise: ch.exerciseName, load: load(t, ch, ch.target, s), muscle: tr(t, 'muscle', ch.muscle ?? '') });
}

/** This week's challenge on Home, when the weekly challenge is on. It is created on the first visit of the week. Closed until the next week (D58). */
export function ChallengeCard() {
  const { t } = useTranslation();
  const s = useSettings();
  const on = !!s.challenge;
  useEffect(() => {
    if (on) void repo.ensureChallenge();
  }, [on]);
  const data = useLiveQuery(async () => (on ? { ch: await db.challenges.where('week').equals(weekKey(new Date())).first(), workouts: await db.workouts.toArray() } : undefined), [on]);
  const [closed, setClosed] = useState<string>(() => {
    try {
      return localStorage.getItem('challenge:closed') ?? '';
    } catch {
      return '';
    }
  });
  if (!data?.ch || closed === data.ch.week) return null;
  const { ch } = data;
  const close = () => {
    setClosed(ch.week);
    try {
      localStorage.setItem('challenge:closed', ch.week);
    } catch {
      // Without storage the card only hides for this visit.
    }
  };
  const { value, met } = challengeProgress(ch, data.workouts);
  const style = s.coach?.style ?? 'energy';
  const done = ch.status === 'done';
  const share = ch.kind === 'record' ? (value > ch.target ? 1 : 0) : Math.min(1, value / ch.target);

  return (
    <section className="card challenge" aria-label={t('challenge.title')}>
      <div className="challenge-head">
        <CoachAvatar style={style} gender={s.coach?.gender} size={40} />
        <div style={{ flex: 1 }}>
          <p className="eyebrow">{t('challenge.title')}</p>
          <p className="help">{t(`challenge.intro.${style}`)}</p>
        </div>
        <button className="ghost sm" aria-label={t('common.close')} onClick={close}>
          ✕
        </button>
      </div>
      <h2>{challengeText(t, ch, s)}</h2>
      <div className="challenge-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((done ? 1 : share) * 100)}>
        <span style={{ width: `${(done ? 1 : share) * 100}%` }} />
      </div>
      <p className="muted">
        {ch.kind === 'record' ? t('challenge.progressRecord', { value: value ? load(t, ch, value, s) : '—' }) : t('challenge.progress', { value: fmtNum(value, s.language, 1), target: ch.target })}
      </p>
      {done ? (
        <div className="challenge-actions">
          <button className="ghost" onClick={() => void repo.setChallengeDone(ch.id, false)}>
            {t('challenge.undo')}
          </button>
          {/* The status on the right, as in the week report and the challenge history. */}
          <span className="pill up">✓ {t('challenge.status.done')}</span>
        </div>
      ) : (
        <>
          {met && <p className="hint">{t('challenge.met')}</p>}
          <button className={met ? 'primary' : 'outline'} style={{ width: '100%' }} onClick={() => void repo.setChallengeDone(ch.id, true)}>
            ✓ {t('challenge.markDone')}
          </button>
        </>
      )}
      <Link to="/challenges" className="challenge-link">
        {t('challenge.history')} ›
      </Link>
    </section>
  );
}
