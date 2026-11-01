import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { nextDay } from '../../domain/workout';
import { ThumbStack } from '../components/ExerciseItem';
import { toneOf, toneStyle } from '../colors';

/** Choose what to train: an active workout opens directly; otherwise every day of every active plan. */
export function Train() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const data = useLiveQuery(async () => ({
    active: await db.workouts.where('status').equals('in_progress').first(),
    plans: (await db.plans.toArray()).filter((p) => p.status === 'active'),
    versions: await db.planVersions.toArray(),
    workouts: await db.workouts.toArray(),
    exercises: new Map((await db.exercises.toArray()).map((e) => [e.id, e])),
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
          <section key={p.id}>
            <p className="month toned row" style={toneStyle(p.color)}>
              <span className="tone-dot" />
              {p.name}
            </p>
            {v.days.map((d) => {
              const items = d.items.map((i) => data.exercises.get(i.exerciseId)).filter((e) => !!e);
              const isNext = d.id === next?.id;
              return (
                <div key={d.id} className={`card day-card toned tone-bar ${isNext ? 'next' : ''}`} style={toneStyle(toneOf(p, d))}>
                  <div className="row between">
                    <div>
                      <h2 style={{ margin: 0 }}>
                        {d.name} {isNext && <span className="pill tone">{t('train.next')}</span>}
                      </h2>
                      <small>{t('train.exercises', { count: d.items.length })}</small>
                    </div>
                    <ThumbStack items={items.map((e) => ({ name: e.name, thumb: e.thumb }))} />
                  </div>
                  <p className="help" style={{ margin: '0.5rem 0 0.75rem' }}>
                    {items.map((e) => e.name).join(' · ')}
                  </p>
                  <button className={isNext ? 'primary xl' : 'outline xl'} disabled={!d.items.length} onClick={() => void start(p.id, d.id)}>
                    ▶ {t('home.start')}
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}
      <button className="ghost xl" onClick={() => void start()}>
        + {t('workout.free')}
      </button>
    </div>
  );
}
