import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { generateDemo } from '../../domain/demo';
import { lastEntryFinder, nextDay, startWorkout } from '../../domain/workout';
import { DecisionCard, rxLine } from '../progress';
import { ExerciseItem } from '../components/ExerciseItem';
import { fmtDate, useSettings, useThumbs } from '../util';

export function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const s = useSettings();
  const thumbOf = useThumbs();
  const data = useLiveQuery(async () => {
    const [exercises, plans, versions, workouts, states, events] = await Promise.all([
      db.exercises.toArray(),
      db.plans.toArray(),
      db.planVersions.toArray(),
      db.workouts.orderBy('startedAt').reverse().toArray(),
      db.progressionStates.toArray(),
      db.progressionEvents.toArray(),
    ]);
    return { exercises, plans: plans.filter((p) => p.status === 'active'), versions, workouts, states, events };
  });
  if (!data) return null;
  const { exercises, plans, versions, workouts, states, events } = data;
  const active = workouts.find((w) => w.status === 'in_progress');
  const finished = workouts.filter((w) => w.status !== 'in_progress');
  const last = finished[0];

  // Next workout: the plan used most recently, else the first active plan.
  const plan = plans.find((p) => p.id === finished.find((w) => w.planId && plans.some((x) => x.id === w.planId))?.planId) ?? plans[0];
  const version = plan && versions.find((v) => v.id === plan.currentVersionId);
  const day = version && nextDay(version, workouts);
  const preview =
    plan && version && day
      ? startWorkout(plan, version, day, {
          exercises: new Map(exercises.map((e) => [e.id, e])),
          states: new Map(states.map((x) => [x.lineageId, x])),
          lastEntry: lastEntryFinder(workouts),
        })
      : undefined;

  const pending = events.filter((e) => e.decision === 'pending');
  const entryOf = (entryId?: string) => workouts.flatMap((w) => w.entries).find((e) => e.id === entryId);
  const start = async () => nav(`/workout/${await repo.startWorkout(plan?.id, day?.id)}`);
  const demo = async () => {
    await repo.seedLibrary();
    await repo.importMerge(generateDemo(await db.exercises.toArray()));
  };

  const doneSets = active?.entries.reduce((a, e) => a + e.sets.filter((x) => x.status !== 'pending').length, 0) ?? 0;
  const totalSets = active?.entries.reduce((a, e) => a + e.sets.length, 0) ?? 0;

  return (
    <div>
      <p className="eyebrow">{fmtDate(new Date().toISOString(), s.language)}</p>

      {active ? (
        <section className="hero">
          <p className="eyebrow">{t('home.inProgress')}</p>
          <h1>{active.dayName ?? t('workout.free')}</h1>
          <p className="muted">
            {active.planName ?? ''} · {t('home.setsProgress', { done: doneSets, total: totalSets })}
          </p>
          <Link className="btn btn-primary xl" to={`/workout/${active.id}`}>
            ▶ {t('home.continue')}
          </Link>
        </section>
      ) : preview && day ? (
        <section className="hero">
          <p className="eyebrow">{t('home.next')}</p>
          <h1>{day.name}</h1>
          <p className="muted">{plan.name}</p>
          <div style={{ margin: '0.6rem 0 1rem' }}>
            {preview.entries.map((e) => (
              <ExerciseItem key={e.id} name={e.exercise.name} thumb={thumbOf(e.exerciseId, e.exercise.thumb)} sub={rxLine(e, t, s.language)} size="sm" to={`/exercises/${e.exerciseId}`} />
            ))}
          </div>
          <button className="primary xl" onClick={() => void start()}>
            ▶ {t('home.start')}
          </button>
          <Link to="/train" className="btn ghost xl" style={{ marginTop: '0.25rem' }}>
            {t('home.otherDay')}
          </Link>
        </section>
      ) : (
        <section className="hero stack">
          <p className="eyebrow">{t('home.getStarted')}</p>
          <h1>{t('home.welcome')}</h1>
          <p className="muted">{t('home.welcomeText')}</p>
          {exercises.length === 0 && (
            <button className="outline xl" onClick={() => void repo.seedLibrary()}>
              {t('home.seed')}
            </button>
          )}
          <Link className="btn btn-primary xl" to="/plans">
            {t('home.createPlan')}
          </Link>
          <button className="ghost" onClick={() => void demo()}>
            {t('home.demo')}
          </button>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <div className="section-head">
            <h2>{t('home.decide')}</h2>
          </div>
          {pending.map((ev) => {
            const e = entryOf(ev.entryId);
            return e ? <DecisionCard key={ev.id} entry={e} ev={ev} /> : null;
          })}
        </section>
      )}

      {last && (
        <section className="card">
          <div className="section-head">
            <h2>{t('home.last')}</h2>
            <Link to={`/workout/${last.id}`}>{fmtDate(last.startedAt, s.language)} ›</Link>
          </div>
          <div>
            {/* Pending decisions are shown above, once. */}
            {last.entries
              .filter((e) => !pending.some((p) => p.entryId === e.id))
              .map((e) => (
                <DecisionCard key={e.id} entry={e} ev={events.find((x) => x.entryId === e.id)} compact />
              ))}
          </div>
        </section>
      )}

      <p className="help" style={{ textAlign: 'center' }}>
        {s.lastBackupAt ? t('home.backup', { date: fmtDate(s.lastBackupAt, s.language) }) : t('home.noBackup')}{' '}
        <Link to="/settings">{t('nav.settings')}</Link>
      </p>
    </div>
  );
}
