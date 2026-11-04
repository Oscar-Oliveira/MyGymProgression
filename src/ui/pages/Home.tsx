import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { generateDemo } from '../../domain/demo';
import type { Exercise, Plan, PlanDay, Workout, WorkoutEntry } from '../../domain/types';
import { canDecide, lastEntryFinder, nextPlanned, startWorkout } from '../../domain/workout';
import { toneOf, toneStyle, useTones } from '../colors';
import { DecisionCard, SyncCard } from '../progress';
import { DayCard } from '../components/DayCard';
import { useStart } from '../start';
import { PageCoach } from '../components/CoachCard';
import { ChallengeCard } from '../components/ChallengeCard';
import { HomeReport } from '../components/TrainerBits';
import { Modal } from '../components/Modal';
import { Section } from '../components/Section';
import { fmtDate, saveBackup, useSettings } from '../util';
import { backupDue } from '../../domain/backup';
import { localDay, muscleSetsPerWeek } from '../../domain/analysis';
import { BodyMap } from '../components/BodyMap';
import { Icon } from '../components/Icon';

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
function DaySheet({ date, done, planned, fallback, exercises, onStart, onClose }: { date: Date; done: Workout[]; planned: Planned[]; fallback?: Planned; exercises: Map<string, Exercise>; onStart: (p: Planned) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const toneFor = useTones();
  const card = (p: Planned) => <DayCard key={`${p.plan.id}:${p.day.id}`} plan={p.plan} day={p.day} entries={p.entries} exercises={exercises} showPlan all onStart={() => onStart(p)} />;
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
                  {[w.planName, t('home.size', { count: w.entries.length, sets: w.entries.reduce((a, e) => a + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0) })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="chev" aria-hidden="true">
                <Icon name="chevronRight" />
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
  const s = useSettings();
  const toneFor = useTones();
  const startDay = useStart();
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
  const due = backupDue(s.lastBackupAt, finished.length);

  // Next workout: the nearest day set to a weekday, else the plan used most recently.
  const { plan, version, day } = nextPlanned(plans, versions, workouts) ?? {};
  const ctx = { exercises: new Map(exercises.map((e) => [e.id, e])), states: new Map(states.map((x) => [x.lineageId, x])), lastEntry: lastEntryFinder(workouts) };
  const preview = plan && version && day ? startWorkout(plan, version, day, ctx) : undefined;
  // Plan days set to a weekday (0 = Monday), in the active plans.
  const plannedOn = (weekday: number): Planned[] =>
    plans.flatMap((p) => {
      const v = versions.find((x) => x.id === p.currentVersionId);
      return v ? v.days.filter((d) => d.weekday === weekday).map((d) => ({ plan: p, day: d, entries: startWorkout(p, v, d, ctx).entries })) : [];
    });

  // Questions that newer progress has made out of date are not asked.
  const pending = events.filter((e) => canDecide(e, ctx.states.get(e.lineageId)));
  const entryOf = (entryId?: string) => workouts.flatMap((w) => w.entries).find((e) => e.id === entryId);

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
  const weekMuscles = muscleSetsPerWeek(finished.filter((w) => w.startedAt >= days[0].date.toISOString()), localDay(days[0].date), localDay(now));

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
          exercises={ctx.exercises}
          onStart={(p) => void startDay(p.plan.id, p.day.id)}
          onClose={() => setOpen(undefined)}
        />
      )}

      {active ? (
        <section className="hero toned" style={toneStyle(toneFor(active.planId, active.dayId))}>
          <p className="eyebrow">{t('home.inProgress')}</p>
          <h1>{active.dayName ?? t('workout.free')}</h1>
          <p className="muted">
            {[active.planName, t('home.setsProgress', { done: doneSets, total: totalSets })].filter(Boolean).join(' · ')}
          </p>
          <Link className="btn primary xl" to={`/workout/${active.id}`}>
            <Icon name="play" /> {t('home.continue')}
          </Link>
        </section>
      ) : preview && plan && day ? (
        <DayCard hero eyebrow={t('home.next')} plan={plan} day={day} entries={preview.entries} exercises={ctx.exercises} showPlan onStart={() => void startDay(plan.id, day.id)}>
          <Link to="/train" className="btn ghost xl">
            {t('home.otherDay')}
          </Link>
        </DayCard>
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
          <Link className="btn primary xl" to="/plans">
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
            if (ev.outcome === 'sync') return <SyncCard key={ev.id} ev={ev} exercise={ctx.exercises.get(ev.exerciseId)} />;
            const e = entryOf(ev.entryId);
            return e ? <DecisionCard key={ev.id} entry={e} ev={ev} /> : null;
          })}
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

      {finished.length > 0 && (
        <Section id="home-muscles" title={t('bodyMap.week')} extra={<Link to="/reports">{t('nav.reports')} <Icon name="chevronRight" /></Link>}>
          <p className="help">{t('bodyMap.weekHelp')}</p>
          <BodyMap sets={weekMuscles} lang={s.language} small />
        </Section>
      )}

      {last && (
        <Section id="home-last" title={t('home.last')} extra={<Link to={`/workout/${last.id}`}>{fmtDate(last.startedAt, s.language)} <Icon name="chevronRight" /></Link>}>
          {/* Pending decisions are shown above, once. */}
          {last.entries
            .filter((e) => !pending.some((p) => p.entryId === e.id))
            .map((e) => (
              <DecisionCard key={e.id} entry={e} ev={events.find((x) => x.entryId === e.id)} compact />
            ))}
        </Section>
      )}

      <PageCoach place="home" extra={{ day: active ? undefined : day?.name }} />
      <HomeReport />
      <ChallengeCard />

      {due !== undefined ? (
        <section className="card warn" role="status">
          <p style={{ marginTop: 0 }}>{due === Infinity ? t('home.noBackup') : t('home.backupDue', { count: due })}</p>
          <button className="primary" onClick={() => void saveBackup()}>
            <Icon name="download" /> {t('home.saveBackup')}
          </button>
        </section>
      ) : (
        <p className="help" style={{ textAlign: 'center' }}>
          {s.lastBackupAt ? t('home.backup', { date: fmtDate(s.lastBackupAt, s.language) }) : t('home.noBackup')}{' '}
          <Link to="/settings">{t('nav.settings')}</Link>
        </p>
      )}
    </div>
  );
}
