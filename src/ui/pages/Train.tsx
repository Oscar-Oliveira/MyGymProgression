import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { nextDay } from '../../domain/workout';

/** Choose what to train: an active workout opens directly; otherwise every day of every active plan. */
export function Train() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const data = useLiveQuery(async () => ({
    active: await db.workouts.where('status').equals('in_progress').first(),
    plans: (await db.plans.toArray()).filter((p) => p.status === 'active'),
    versions: await db.planVersions.toArray(),
    workouts: await db.workouts.toArray(),
  }));
  if (!data) return null;
  if (data.active) return <Navigate to={`/workout/${data.active.id}`} replace />;
  const start = async (planId?: string, dayId?: string) => nav(`/workout/${await repo.startWorkout(planId, dayId)}`);

  return (
    <div>
      <div className="page-head">
        <h1>{t('train.title')}</h1>
      </div>
      {data.plans.length === 0 && (
        <div className="empty">
          <p>{t('train.noPlans')}</p>
          <Link className="btn btn-primary" to="/plans">
            {t('home.createPlan')}
          </Link>
        </div>
      )}
      {data.plans.map((p) => {
        const v = data.versions.find((x) => x.id === p.currentVersionId);
        if (!v) return null;
        const next = nextDay(v, data.workouts);
        return (
          <section className="card" key={p.id}>
            <p className="eyebrow">{p.name}</p>
            <div className="col">
              {v.days.map((d) => (
                <button key={d.id} className={`${d.id === next?.id ? 'primary' : 'outline'} xl`} disabled={!d.items.length} onClick={() => void start(p.id, d.id)}>
                  <span>{d.name}</span>
                  <small style={{ color: 'inherit', opacity: 0.8 }}>
                    · {t('train.exercises', { count: d.items.length })}
                    {d.id === next?.id && ` · ${t('train.next')}`}
                  </small>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button className="outline xl" onClick={() => void start()}>
        + {t('workout.free')}
      </button>
    </div>
  );
}
