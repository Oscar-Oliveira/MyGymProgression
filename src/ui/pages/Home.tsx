import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { generateDemo } from '../../domain/demo';
import { lastEntryFinder, nextDay, startWorkout } from '../../domain/workout';
import { DecisionCard, rxLine } from '../progress';
import { fmtDate, useSettings } from '../util';

export function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const s = useSettings();
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
          <ul className="list" style={{ margin: '0.6rem 0 1rem' }}>
            {preview.entries.map((e) => (
              <li key={e.id} className="row between">
                <span>{e.exercise.name}</span>
                <small className="num">{rxLine(e, t, s.language)}</small>
              </li>
            ))}
          </ul>
          <button className="primary xl" onClick={() => void start()}>
            ▶ {t('home.start')}
          </button>
          <p style={{ textAlign: 'center', marginTop: '0.6rem' }}>
            <Link to="/train" className="muted">
              {t('home.otherDay')}
            </Link>
          </p>
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
          <h2>{t('home.decide')}</h2>
          {pending.map((ev) => {
            const e = entryOf(ev.entryId);
            return e ? <DecisionCard key={ev.id} entry={e} ev={ev} /> : null;
          })}
        </section>
      )}

      {last && (
        <section className="card">
          <div className="row between">
            <h2>{t('home.last')}</h2>
            <Link to={`/workout/${last.id}`} className="muted">
              {fmtDate(last.startedAt, s.language)} ›
            </Link>
          </div>
          <div className="col">
            {last.entries.map((e) => (
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
