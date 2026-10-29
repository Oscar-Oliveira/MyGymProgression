import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { Empty } from '../components/Bits';
import { fmtDate, useSettings } from '../util';

export function History() {
  const { t } = useTranslation();
  const s = useSettings();
  const workouts = useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().toArray(), []);
  if (!workouts) return null;
  return (
    <div className="stack">
      <h1>{t('history.title')}</h1>
      {workouts.length === 0 ? (
        <Empty>{t('history.empty')}</Empty>
      ) : (
        <div className="card">
          <ul className="list">
            {workouts.map((w) => {
              const done = w.entries.reduce((a, e) => a + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0);
              const total = w.entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);
              const recs = w.entries.filter((e) => e.evaluation?.outcome === 'increase').length;
              return (
                <li key={w.id} className="row between wrap">
                  <span>
                    <Link to={`/workout/${w.id}`}>
                      <strong>{fmtDate(w.startedAt, s.language, true)}</strong>
                    </Link>{' '}
                    · {w.planName ?? t('workout.free')}
                    {w.dayName && ` · ${w.dayName}`}
                    <br />
                    <small>
                      {w.entries.map((e) => e.exercise.name).join(', ')} · {t('workout.setsDone', { done, total })}
                    </small>
                  </span>
                  <span className="row">
                    {recs > 0 && <span className="badge up">⬆ {recs}</span>}
                    <span className={`badge ${w.status === 'completed' ? 'up' : w.status === 'in_progress' ? '' : 'warn'}`}>{t(`workout.status.${w.status}`)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
