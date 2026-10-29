import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import type { Workout } from '../../domain/types';
import { Empty } from '../components/Bits';
import { ThumbStack } from '../components/ExerciseItem';
import { fmtDate, useSettings, useThumbs } from '../util';

const STATUS_TONE: Record<Workout['status'], string> = { completed: 'up', partial: 'warn', interrupted: 'warn', in_progress: '' };

export function History() {
  const { t } = useTranslation();
  const s = useSettings();
  const thumbOf = useThumbs();
  const workouts = useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().toArray(), []);
  if (!workouts) return null;
  const locale = s.language === 'pt' ? 'pt-PT' : 'en-GB';
  const month = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="page-head">
        <h1>{t('history.title')}</h1>
      </div>
      {workouts.length === 0 ? (
        <Empty>{t('history.empty')}</Empty>
      ) : (
        workouts.map((w, i) => {
          const done = w.entries.reduce((a, e) => a + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0);
          const total = w.entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);
          const ups = w.entries.filter((e) => e.evaluation?.outcome === 'increase' || e.evaluation?.outcome === 'ready').length;
          const newMonth = i === 0 || month(workouts[i - 1].startedAt) !== month(w.startedAt);
          return (
            <div key={w.id}>
              {newMonth && <p className="month">{month(w.startedAt)}</p>}
              <Link to={`/workout/${w.id}`} className="card nav-row" style={{ padding: '0.8rem 1rem', marginBottom: '0.5rem' }}>
                <span className="main">
                  <span className="title">
                    {w.dayName ?? t('workout.free')}
                    <small> · {fmtDate(w.startedAt, s.language)}</small>
                  </span>
                  <span className="meta">
                    <ThumbStack items={w.entries.map((e) => ({ name: e.exercise.name, thumb: thumbOf(e.exerciseId, e.exercise.thumb) }))} />
                    {t('workout.setsDone', { done, total })}
                  </span>
                </span>
                <span className="col" style={{ alignItems: 'flex-end', gap: '0.3rem' }}>
                  <span className={`pill ${STATUS_TONE[w.status]}`}>{t(`workout.status.${w.status}`)}</span>
                  {ups > 0 && <span className="pill up">⬆ {ups}</span>}
                </span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </Link>
            </div>
          );
        })
      )}
    </div>
  );
}
