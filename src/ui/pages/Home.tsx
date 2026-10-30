import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { generateDemo } from '../../domain/demo';
import type { Plan, PlanDay, Workout, WorkoutEntry } from '../../domain/types';
import { lastEntryFinder, nextDay, startWorkout } from '../../domain/workout';
import { toneOf, toneStyle, useTones } from '../colors';
import { DecisionCard, rxLine } from '../progress';
import { ExerciseItem } from '../components/ExerciseItem';
import { Modal } from '../components/Modal';
import { Section } from '../components/Section';
import { fmtDate, useSettings, useThumbs } from '../util';

const PREVIEW = 4;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Monday to Sunday of the current week, each with the finished workouts of that day. */
function week(workouts: Workout[]) {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { date: d, today: dayKey(d) === dayKey(today), past: d < new Date(today.getFullYear(), today.getMonth(), today.getDate()), done: workouts.filter((w) => dayKey(new Date(w.startedAt)) === dayKey(d)) };
  });
}

type Planned = { plan: Plan; day: PlanDay; entries: WorkoutEntry[] };

/** Window for one date of the week: workouts done that day; from today on, also the plan days set to that weekday. */
function DaySheet({ date, done, planned, fallback, active, onStart, onClose }: { date: Date; done: Workout[]; planned: Planned[]; fallback?: Planned; active?: Workout; onStart: (p: Planned) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const thumbOf = useThumbs();
  const toneFor = useTones();
  const sets = (es: WorkoutEntry[]) => es.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);
  const card = (p: Planned) => (
    <section key={`${p.plan.id}:${p.day.id}`} className="card toned day-card" style={toneStyle(toneOf(p.plan, p.day))}>
      <h3>{p.day.name}</h3>
      <p className="muted">
        {p.plan.name} · {t('home.size', { count: p.entries.length, sets: sets(p.entries) })}
      </p>
      {p.entries.map((e) => (
        <ExerciseItem key={e.id} name={e.exercise.name} thumb={thumbOf(e.exerciseId, e.exercise.thumb)} sub={rxLine(e, t, s.language)} size="sm" to={`/exercises/${e.exerciseId}`} />
      ))}
      {active ? (
        <p className="help">{t('home.finishFirst')}</p>
      ) : (
        <button className="primary xl" onClick={() => onStart(p)}>
          ▶ {t('home.start')}
        </button>
      )}
    </section>
  );
  return (
    <Modal title={fmtDate(date.toISOString(), s.language)} onClose={onClose}>
      {done.length > 0 && (
        <>
          <p className="eyebrow">{t('home.dayDone')}</p>
          {done.map((w) => (
            <Link key={w.id} to={`/workout/${w.id}`} className="nav-row toned" style={toneStyle(toneFor(w.planId, w.dayId))}>
              <span className="tone-dot" />
              <span className="main">
                <span className="title">{w.dayName ?? t('workout.free')}</span>
                <span className="meta">
                  {w.planName ?? ''} · {t('home.size', { count: w.entries.length, sets: w.entries.reduce((a, e) => a + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0) })}
                </span>
              </span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </>
      )}
      {planned.length > 0 && (
        <>
          <p className="eyebrow">{t('home.dayPlanned')}</p>
          {planned.map(card)}
        </>
      )}
      {done.length === 0 && planned.length === 0 && (
        <>
          <p className="muted">{fallback ? t('home.nothingPlanned') : t('home.noWorkoutDay')}</p>
          {fallback && (
            <>
              <p className="eyebrow">{t('home.next')}</p>
              {card(fallback)}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const s = useSettings();
  const thumbOf = useThumbs();
  const toneFor = useTones();
  const [open, setOpen] = useState<number>();
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
  const ctx = { exercises: new Map(exercises.map((e) => [e.id, e])), states: new Map(states.map((x) => [x.lineageId, x])), lastEntry: lastEntryFinder(workouts) };
  const preview = plan && version && day ? startWorkout(plan, version, day, ctx) : undefined;
  // Plan days set to a weekday (0 = Monday), in the active plans.
  const plannedOn = (weekday: number): Planned[] =>
    plans.flatMap((p) => {
      const v = versions.find((x) => x.id === p.currentVersionId);
      return v ? v.days.filter((d) => d.weekday === weekday).map((d) => ({ plan: p, day: d, entries: startWorkout(p, v, d, ctx).entries })) : [];
    });

  const pending = events.filter((e) => e.decision === 'pending');
  const entryOf = (entryId?: string) => workouts.flatMap((w) => w.entries).find((e) => e.id === entryId);
  const start = async (planId = plan?.id, dayId = day?.id) => nav(`/workout/${await repo.startWorkout(planId, dayId)}`);
  const demo = async () => {
    await repo.seedLibrary();
    await repo.importMerge(generateDemo(await db.exercises.toArray()));
  };

  const doneSets = active?.entries.reduce((a, e) => a + e.sets.filter((x) => x.status !== 'pending').length, 0) ?? 0;
  const totalSets = active?.entries.reduce((a, e) => a + e.sets.length, 0) ?? 0;

  // This month: workouts, working sets done, increases applied.
  const now = new Date();
  const inMonth = (iso: string) => new Date(iso).getMonth() === now.getMonth() && new Date(iso).getFullYear() === now.getFullYear();
  const month = finished.filter((w) => inMonth(w.startedAt));
  const monthSets = month.reduce((a, w) => a + w.entries.reduce((b, e) => b + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0), 0);
  const monthUps = events.filter((e) => (e.decision === 'applied' || e.decision === 'reps_up') && inMonth(e.decidedAt ?? e.createdAt)).length;
  const days = week(finished);
  const weekdays = t('weekday', { returnObjects: true }) as string[];
  const previewSets = preview?.entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0) ?? 0;

  return (
    <div>
      <div className="home-top">
        <p className="eyebrow">{fmtDate(now.toISOString(), s.language)}</p>
        <div className="week" aria-label={t('home.week')}>
          {days.map((d, i) => {
            const planned = d.past ? undefined : plannedOn(i)[0];
            return (
              <button key={i} className={`week-day ${d.today ? 'today' : ''}`} aria-label={fmtDate(d.date.toISOString(), s.language)} onClick={() => setOpen(i)}>
                <span className="wd">{weekdays[i]}</span>
                <span
                  className={`dot toned ${d.done.length ? 'on' : planned ? 'planned' : ''}`}
                  style={toneStyle(d.done[0] ? toneFor(d.done[0].planId, d.done[0].dayId) : planned ? toneOf(planned.plan, planned.day) : undefined)}
                >
                  {d.date.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open !== undefined && (
        <DaySheet
          date={days[open].date}
          done={days[open].done}
          planned={days[open].past ? [] : plannedOn(open)}
          fallback={!days[open].past && plan && day && preview ? { plan, day, entries: preview.entries } : undefined}
          active={active}
          onStart={(p) => void start(p.plan.id, p.day.id)}
          onClose={() => setOpen(undefined)}
        />
      )}

      {active ? (
        <section className="hero toned" style={toneStyle(toneFor(active.planId, active.dayId))}>
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
        <section className="hero toned" style={toneStyle(toneOf(plan, day))}>
          <p className="eyebrow">{t('home.next')}</p>
          <h1>{day.name}</h1>
          <p className="muted">
            {plan.name} · {t('home.size', { count: preview.entries.length, sets: previewSets })}
          </p>
          <div style={{ margin: '0.6rem 0 1rem' }}>
            {preview.entries.slice(0, PREVIEW).map((e) => (
              <ExerciseItem key={e.id} name={e.exercise.name} thumb={thumbOf(e.exerciseId, e.exercise.thumb)} sub={rxLine(e, t, s.language)} size="sm" to={`/exercises/${e.exerciseId}`} />
            ))}
            {preview.entries.length > PREVIEW && <p className="muted">{t('home.andMore', { count: preview.entries.length - PREVIEW })}</p>}
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

      {finished.length > 0 && (
        <div className="grid3 stats">
          <div className="stat">
            <div className="value">{month.length}</div>
            <div className="label">{t('home.statWorkouts')}</div>
          </div>
          <div className="stat">
            <div className="value">{monthSets}</div>
            <div className="label">{t('home.statSets')}</div>
          </div>
          <div className="stat">
            <div className="value up">{monthUps}</div>
            <div className="label">{t('home.statUps')}</div>
          </div>
        </div>
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
        <Section id="home-last" title={t('home.last')} extra={<Link to={`/workout/${last.id}`}>{fmtDate(last.startedAt, s.language)} ›</Link>}>
          {/* Pending decisions are shown above, once. */}
          {last.entries
            .filter((e) => !pending.some((p) => p.entryId === e.id))
            .map((e) => (
              <DecisionCard key={e.id} entry={e} ev={events.find((x) => x.entryId === e.id)} compact />
            ))}
        </Section>
      )}

      <p className="help" style={{ textAlign: 'center' }}>
        {s.lastBackupAt ? t('home.backup', { date: fmtDate(s.lastBackupAt, s.language) }) : t('home.noBackup')}{' '}
        <Link to="/settings">{t('nav.settings')}</Link>
      </p>
    </div>
  );
}
