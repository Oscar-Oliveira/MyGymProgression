import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { stalledItems } from '../../domain/analysis';
import { nextDay } from '../../domain/workout';
import { Empty, OutcomeBadge } from '../components/Bits';
import { fmtDate, metricLabel, useSettings } from '../util';

export function Dashboard() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const s = useSettings();
  const data = useLiveQuery(async () => ({
    exerciseCount: await db.exercises.count(),
    plans: (await db.plans.toArray()).filter((p) => p.status === 'active'),
    versions: await db.planVersions.toArray(),
    workouts: await db.workouts.orderBy('startedAt').reverse().toArray(),
    pending: await db.progressionEvents.where('decision').equals('pending').toArray(),
  }));
  if (!data) return null;
  const { exerciseCount, plans, versions, workouts, pending } = data;
  const inProgress = workouts.find((w) => w.status === 'in_progress');
  const finished = workouts.filter((w) => w.status !== 'in_progress');
  const stalled = stalledItems(workouts, s.stalledThreshold);
  const start = async (planId?: string, dayId?: string) => nav(`/workout/${await repo.startWorkout(planId, dayId)}`);
  const nameOf = (lineage: string, exerciseId: string) => workouts.flatMap((w) => w.entries).find((e) => e.lineageId === lineage || e.exerciseId === exerciseId)?.exercise;

  return (
    <div className="stack">
      <h1>{t('nav.dashboard')}</h1>
      {exerciseCount === 0 && (
        <div className="card">
          <p>{t('dashboard.welcome')}</p>
          <div className="row wrap">
            <button onClick={() => void repo.seedLibrary()}>{t('dashboard.seed')}</button>
            <Link className="button secondary" to="/exercises/new">
              {t('exercise.new')}
            </Link>
          </div>
        </div>
      )}
      {inProgress && (
        <div className="card">
          <Link className="button" to={`/workout/${inProgress.id}`}>
            ▶ {t('dashboard.resume')}: {inProgress.planName ?? t('workout.free')} {inProgress.dayName ? `· ${inProgress.dayName}` : ''}
          </Link>
        </div>
      )}

      <section className="card">
        <h2>{t('dashboard.next')}</h2>
        {plans.length === 0 && (
          <p className="muted">
            {t('dashboard.noPlans')} <Link to="/plans">{t('dashboard.createPlan')}</Link>
          </p>
        )}
        <ul className="list">
          {plans.map((p) => {
            const v = versions.find((x) => x.id === p.currentVersionId);
            const d = v && nextDay(v, workouts);
            return (
              <li key={p.id} className="row between wrap">
                <span>
                  <strong>{p.name}</strong> · {d ? d.name : t('plan.noDays')}
                  {d && <small> ({d.items.length})</small>}
                </span>
                {d && !inProgress && <button onClick={() => void start(p.id, d.id)}>{t('dashboard.start')}</button>}
              </li>
            );
          })}
        </ul>
        {!inProgress && (
          <button className="secondary" onClick={() => void start()}>
            + {t('dashboard.quick')}
          </button>
        )}
      </section>

      {pending.length > 0 && (
        <section className="card">
          <h2>{t('dashboard.pending')}</h2>
          <ul className="list">
            {pending.map((e) => {
              const ex = nameOf(e.lineageId, e.exerciseId);
              return (
                <li key={e.id} className="row between wrap">
                  <span>
                    <strong>{ex?.name}</strong>{' '}
                    {e.recommendation &&
                      t('progression.recommendation', { metric: metricLabel(t, e.recommendation.metric, ex?.metrics), from: e.recommendation.from, to: e.recommendation.to })}
                  </span>
                  <Link to={`/workout/${e.workoutId}`}>{t('common.details')}</Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {stalled.length > 0 && (
        <section className="card">
          <h2>{t('dashboard.stalled')}</h2>
          <ul className="list">
            {stalled.map((x) => (
              <li key={x.lineageId}>
                <Link to={`/exercises/${x.exerciseId}`}>{x.name}</Link> <small>({x.sessions})</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>{t('dashboard.recent')}</h2>
        {finished.length === 0 ? (
          <Empty>{t('history.empty')}</Empty>
        ) : (
          <ul className="list">
            {finished.slice(0, 5).map((w) => (
              <li key={w.id} className="row between wrap">
                <Link to={`/workout/${w.id}`}>
                  {fmtDate(w.startedAt, s.language)} · {w.planName ?? t('workout.free')} {w.dayName ? `· ${w.dayName}` : ''}
                </Link>
                <span className="row">
                  {w.entries.some((e) => e.evaluation?.outcome === 'increase_recommended') && <OutcomeBadge outcome="increase_recommended" />}
                  <small>{t(`workout.status.${w.status}`)}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="help">{s.lastBackupAt ? t('dashboard.backupReminder', { date: fmtDate(s.lastBackupAt, s.language) }) : t('dashboard.neverBackedUp')}</p>
    </div>
  );
}
