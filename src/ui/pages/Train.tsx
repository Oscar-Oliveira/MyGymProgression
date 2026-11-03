import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { nextDay } from '../../domain/workout';
import { ThumbStack } from '../components/ExerciseItem';
import { Empty, PageHead } from '../components/Bits';
import { toneOf, toneStyle } from '../colors';
import { Icon } from '../components/Icon';

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
      <PageHead title={t('train.title')} />
      {data.plans.length === 0 && (
        <Empty
          action={
            <Link className="btn primary" to="/plans">
              {t('home.createPlan')}
            </Link>
          }
        >
          {t('train.noPlans')}
        </Empty>
      )}
      {data.plans.map((p) => {
        const v = data.versions.find((x) => x.id === p.currentVersionId);
        if (!v) return null;
        const next = nextDay(v, data.workouts);
        return (
          <section key={p.id}>
            <div className="section-head toned" style={toneStyle(p.color)}>
              <h2 className="row">
                <span className="tone-dot" />
                {p.name}
              </h2>
            </div>
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
                    <Icon name="play" /> {t('home.start')}
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}
      <button className="ghost xl" onClick={() => void start()}>
        <Icon name="plus" /> {t('workout.free')}
      </button>
    </div>
  );
}
