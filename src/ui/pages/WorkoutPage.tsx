import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import type { Exercise, MetricKey, ProgressionEvent, Workout, WorkoutEntry } from '../../domain/types';
import { coachContext, coachMessage, speaksAfterStep } from '../../domain/coach';
import { COACH_BANKS } from '../../i18n/coach';
import { workoutSteps } from '../../domain/circuit';
import { adHocLineage, entryAdHoc, substitute } from '../../domain/workout';
import { dialog } from '../components/Dialog';
import { CoachAvatar } from '../components/CoachAvatar';
import { ExercisePicker } from '../components/ExercisePicker';
import { Modal } from '../components/Modal';
import { Thumb } from '../components/Thumb';
import { DecisionCard, rxLine, setsLine, setText } from '../progress';
import { distOut, fmtDate, fmtNum, fmtSeconds, fmtValue, loadOut, useSettings, useThumbs, useWakeLock } from '../util';
import { workoutRecords, type RecordHit } from '../../domain/analysis';
import { ExerciseItem } from '../components/ExerciseItem';
import { toneStyle, useTones } from '../colors';
import { EntryFocus } from '../components/EntryFocus';
import { CoachCard } from '../components/CoachCard';
import { CircuitFocus } from '../components/CircuitFocus';
import { CorrectionEditor } from '../components/CorrectionEditor';

export function WorkoutPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const s = useSettings();
  const thumbOf = useThumbs();
  const toneFor = useTones();
  const stored = useLiveQuery(() => db.workouts.get(id!), [id]);
  const ctx = useLiveQuery(async () => {
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const version = stored?.planVersionId ? await db.planVersions.get(stored.planVersionId) : undefined;
    const others = (await db.workouts.toArray()).filter((w) => w.id !== id && w.status !== 'in_progress' && (!stored || w.startedAt < stored.startedAt));
    const events = await db.progressionEvents.where('workoutId').equals(id!).toArray();
    const revisions = (await db.revisions.where('workoutId').equals(id!).toArray()).sort((a, b) => b.at.localeCompare(a.at));
    const allEvents = await db.progressionEvents.toArray();
    return { exercises, version, others, events, revisions, allEvents };
  }, [id, stored?.planVersionId, stored?.startedAt]);
  const [draft, setDraft] = useState<Workout>();
  const [cur, setCur] = useState(0);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<'add' | 'sub'>();
  const [menu, setMenu] = useState(false);
  const [list, setList] = useState(false);
  // Personal trainer message shown for a few seconds after an exercise or circuit is done.
  const [toast, setToast] = useState<string>();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const loadedFor = useRef<string>(undefined);
  const chipsRef = useRef<HTMLDivElement>(null);

  // On each exercise change: show it from the top and keep its tab visible in the scrolling row.
  useEffect(() => {
    window.scrollTo(0, 0);
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (row && chip) row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.clientWidth) / 2, behavior: 'smooth' });
  }, [cur]);

  useEffect(() => {
    if (stored && (loadedFor.current !== `${stored.id}:${stored.status}` || (!editing && stored.status !== 'in_progress'))) {
      if (loadedFor.current !== `${stored.id}:${stored.status}`) {
        const first = stored.entries.findIndex((e) => e.sets.some((x) => x.status === 'pending'));
        setCur(Math.max(0, workoutSteps(stored.entries).findIndex((st) => st.indexes.includes(first))));
      }
      loadedFor.current = `${stored.id}:${stored.status}`;
      setDraft(stored);
    }
  }, [stored, editing]);

  // The screen stays on during a workout.
  useWakeLock(stored?.status === 'in_progress');

  if (stored === undefined && ctx) return <p className="empty">{t('history.empty')}</p>;
  if (!draft || !ctx) return null;
  const active = draft.status === 'in_progress';
  const tone = toneStyle(toneFor(draft.planId, draft.dayId));

  const previousOf = (e: WorkoutEntry) => {
    const sorted = [...ctx.others].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const w of sorted) {
      const p = w.entries.find((x) => x.lineageId === e.lineageId && x.exerciseId === e.exerciseId);
      if (p) return p;
    }
    return undefined;
  };
  const update = (w: Workout) => {
    setDraft(w);
    if (active) void repo.saveWorkout(w);
  };
  // Steps: one per exercise, or one per circuit (its exercises together).
  const steps = workoutSteps(draft.entries);
  type Step = (typeof steps)[number];
  const step: Step | undefined = steps[Math.min(cur, steps.length - 1)];
  const stepEntries = (st: Step) => st.indexes.map((i) => draft.entries[i]);
  const entry = step && !step.circuit ? draft.entries[step.indexes[0]] : undefined;
  const entryDone = (e: WorkoutEntry) => e.sets.length > 0 && e.sets.every((x) => x.status !== 'pending');

  // Personal trainer: the same context for every message of this workout; the seed picks the message.
  const coach = s.coach?.enabled ? s.coach : undefined;
  const increase = (ev: ProgressionEvent) => {
    const ex = ctx.exercises.get(ev.exerciseId);
    const k = (Object.keys(ev.after) as MetricKey[]).find((m) => ev.after[m] !== ev.before[m]);
    if (!ex || !k) return undefined;
    const unit = ex.metrics.find((m) => m.key === k)?.unit ?? '';
    return { exercise: ex.name, from: fmtValue(ev.before[k], unit, s.language), to: fmtValue(ev.after[k], unit, s.language) };
  };
  const coachLine = (seed: string) => (coach ? coachMessage(COACH_BANKS[s.language], coach, coachContext(ctx.others, ctx.allEvents, new Date(draft.startedAt), increase), seed) : '');

  const upEntries = (es: WorkoutEntry[]) => {
    const next = { ...draft, entries: draft.entries.map((x) => es.find((e) => e.id === x.id) ?? x) };
    // A step that becomes done may get a trainer message (setting "when").
    if (coach && active) {
      workoutSteps(next.entries).forEach((st, i) => {
        const was = st.indexes.every((j) => entryDone(draft.entries[j]));
        const now = st.indexes.every((j) => entryDone(next.entries[j]));
        if (!was && now && speaksAfterStep(coach.when, `${draft.id}:${i}`)) setToast(coachLine(`${draft.id}:${i}`) || undefined);
      });
    }
    update(next);
  };
  const upEntry = (e: WorkoutEntry) => upEntries([e]);
  const stepDone = (st: Step) => stepEntries(st).every(entryDone);
  const stepName = (st: Step) => st.circuit?.name ?? draft.entries[st.indexes[0]].exercise.name;
  const pendingSets = draft.entries.reduce((a, e) => a + e.sets.filter((x) => x.status === 'pending').length, 0);
  const doneWorking = draft.entries.reduce((a, e) => a + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0);
  const totalWorking = draft.entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);

  const pick = async (ex: Exercise) => {
    const mode = picker;
    setPicker(undefined);
    if (mode === 'sub' && entry) return upEntry(substitute(entry, ex));
    const lineage = adHocLineage(ex.id);
    const e = entryAdHoc(ex, await db.progressionStates.get(lineage), await repo.lastEntry(lineage));
    update({ ...draft, entries: [...draft.entries, e] });
    setCur(steps.length);
  };
  const finish = async (interrupted = false) => {
    if (!interrupted && pendingSets > 0 && !(await dialog.confirm(t('workout.finishPending', { count: pendingSets })))) return;
    setMenu(false);
    await repo.finishWorkout(draft, interrupted);
    window.scrollTo(0, 0);
  };

  if (active) {
    const subs = ctx.version?.days.flatMap((d) => d.items).find((i) => i.lineageId === entry?.lineageId)?.substitutes ?? [];
    return (
      <div className="toned" style={tone}>
        <div className="wk-head">
          <div className="wk-top">
            <Link to="/" className="btn ghost icon" aria-label={t('nav.home')}>
              ‹
            </Link>
            <button className="wk-title" onClick={() => setList(true)} aria-label={t('workout.allExercises')} disabled={!draft.entries.length}>
              <span className="title">{draft.dayName ?? t('workout.free')}</span>
              <span className="sub">
                {steps.length ? `${Math.min(cur, steps.length - 1) + 1}/${steps.length} · ` : ''}
                {t('workout.setsDone', { done: doneWorking, total: totalWorking })} ▾
              </span>
            </button>
            <button className="ghost icon" aria-label={t('workout.menu')} onClick={() => setMenu(true)}>
              ⋯
            </button>
          </div>
          <div className="wk-progress" aria-hidden="true">
            {steps.map((st, i) => (
              <span key={st.indexes[0]} className={i === cur ? 'cur' : stepDone(st) ? 'done' : ''} />
            ))}
          </div>
          <div className="wk-chips" role="tablist" ref={chipsRef}>
            {steps.map((st, i) => {
              const e = draft.entries[st.indexes[0]];
              return (
                <button key={st.indexes[0]} role="tab" aria-selected={i === cur} aria-label={stepName(st)} className={`wk-chip ${i === cur ? 'cur' : stepDone(st) ? 'done' : ''}`} onClick={() => setCur(i)}>
                  {st.circuit ? <span className="chip-ico">⟳</span> : <Thumb src={thumbOf(e.exerciseId, e.exercise.thumb)} name={e.exercise.name} size={22} />}
                  <span>
                    {stepDone(st) ? '✓ ' : ''}
                    {stepName(st)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {coach && <CoachCard workoutId={draft.id} message={coachLine(draft.id)} style={coach.style} />}

        {step?.circuit ? (
          <CircuitFocus key={step.circuit.id} circuit={step.circuit} entries={stepEntries(step)} onChange={upEntries} thumbOf={thumbOf} />
        ) : entry ? (
          <EntryFocus key={entry.id} entry={entry} previous={previousOf(entry)} onChange={upEntry} onSubstitute={() => setPicker('sub')} thumbOf={(eid) => ctx.exercises.get(eid)?.thumb} />
        ) : (
          <div className="empty">
            <p>{t('workout.noEntries')}</p>
          </div>
        )}

        {toast && (
          <div className="coach coach-toast" role="status" aria-label={t('coach.title')}>
            <CoachAvatar style={coach?.style ?? 'support'} />
            <p>{toast}</p>
            <button className="ghost sm" aria-label={t('common.close')} onClick={() => setToast(undefined)}>
              ✕
            </button>
          </div>
        )}

        <div className="wk-nav">
          {cur > 0 && (
            <button className="outline" onClick={() => setCur(cur - 1)}>
              ‹ {t('workout.prev')}
            </button>
          )}
          {cur < steps.length - 1 ? (
            <button className={step && stepDone(step) ? 'primary' : 'outline'} onClick={() => setCur(cur + 1)}>
              {t('workout.next')} ›
            </button>
          ) : (
            <button className={pendingSets === 0 ? 'primary' : 'outline'} onClick={() => void finish()}>
              ✓ {t('workout.finish')}
            </button>
          )}
        </div>

        {menu && (
          <Modal title={t('workout.menu')} onClose={() => setMenu(false)}>
            <div className="sheet">
              <button onClick={() => (setMenu(false), setPicker('add'))}>+ {t('workout.addExercise')}</button>
              {entry && (
                <button onClick={() => (setMenu(false), update({ ...draft, entries: draft.entries.filter((x) => x.id !== entry.id) }), setCur(Math.max(0, cur - 1)))}>
                  {t('workout.removeEntry')}
                </button>
              )}
              <button onClick={() => void finish(false)}>✓ {t('workout.finish')}</button>
              <button onClick={() => void finish(true)}>{t('workout.interrupt')}</button>
              <button
                className="danger"
                onClick={async () => {
                  if (!(await dialog.confirm(t('workout.discardConfirm'), { danger: true, ok: t('workout.discard') }))) return;
                  await repo.discardWorkout(draft.id);
                  nav('/');
                }}
              >
                {t('workout.discard')}
              </button>
            </div>
          </Modal>
        )}
        {list && (
          <Modal title={t('workout.allExercises')} onClose={() => setList(false)}>
            <ul className="wk-list">
              {steps.map((st, i) => {
                const es = stepEntries(st);
                const e = es[0];
                const done = es.reduce((a, x) => a + x.sets.filter((y) => y.status !== 'pending').length, 0);
                const total = es.reduce((a, x) => a + x.sets.length, 0);
                return (
                  <li key={st.indexes[0]}>
                    <button className={`${i === cur ? 'cur' : ''} ${stepDone(st) ? 'done' : ''}`} onClick={() => (setCur(i), setList(false))}>
                      <span className="idx">{stepDone(st) ? '✓' : i + 1}</span>
                      <Thumb src={thumbOf(e.exerciseId, e.exercise.thumb)} name={e.exercise.name} size={40} />
                      <span className="xitem-text">
                        <span className="xitem-name">{st.circuit ? `⟳ ${st.circuit.name}` : e.exercise.name}</span>
                        <span className="xitem-sub">{st.circuit ? es.map((x) => x.exercise.name).join(' → ') : rxLine(e, t, s.language)}</span>
                      </span>
                      <span className="xitem-trail">
                        {done}/{total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Modal>
        )}
        {picker === 'add' && <ExercisePicker onPick={(ex) => void pick(ex)} onClose={() => setPicker(undefined)} />}
        {picker === 'sub' && <ExercisePicker preferred={subs} onPick={(ex) => void pick(ex)} onClose={() => setPicker(undefined)} />}
      </div>
    );
  }

  // Finished workout: summary with records and decisions, or correction mode.
  const records = workoutRecords(draft, ctx.others);
  const fmtRecord = (r: RecordHit, v: number) =>
    r.kind === 'maxDuration'
      ? fmtSeconds(v)
      : r.kind === 'maxDistance'
        ? `${fmtNum(distOut(v, s), s.language)} ${s.distanceUnit}`
        : r.kind === 'maxReps'
          ? fmtNum(v, s.language)
          : `${fmtNum(loadOut(v, s), s.language)} ${s.loadUnit}`;
  return (
    <div className="toned" style={tone}>
      <div className="page-head">
        <div>
          <p className="eyebrow">{fmtDate(draft.startedAt, s.language, true)}</p>
          <h1>
            {draft.status === 'completed' ? '✓ ' : ''}
            {draft.dayName ?? t('workout.free')}
          </h1>
          <small>
            {draft.planName && `${draft.planName} · `}
            {t(`workout.status.${draft.status}`)}
          </small>
        </div>
      </div>

      {editing ? (
        <>
          <p className="help">{t('workout.correctHelp')}</p>
          <CorrectionEditor draft={draft} onChange={setDraft} thumbOf={thumbOf} />
          <div className="wk-nav">
            <button className="outline" onClick={() => (setEditing(false), setDraft(stored))}>
              {t('common.cancel')}
            </button>
            <button className="primary" onClick={() => void repo.correctWorkout(draft).then(() => setEditing(false))}>
              {t('workout.saveCorrection')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid3" style={{ margin: '0.25rem 0 0.5rem' }}>
            <div className="stat">
              <div className="value">{draft.entries.length}</div>
              <div className="label">{t('nav.exercises')}</div>
            </div>
            <div className="stat">
              <div className="value">
                {doneWorking}/{totalWorking}
              </div>
              <div className="label">{t('analysis.workingSets')}</div>
            </div>
            <div className="stat">
              <div className="value">{draft.endedAt ? fmtSeconds((Date.parse(draft.endedAt) - Date.parse(draft.startedAt)) / 1000) : '—'}</div>
              <div className="label">{t('analysis.duration')}</div>
            </div>
          </div>
          {records.length > 0 && (
            <section className="card up">
              <h2 style={{ marginTop: 0 }}>🏆 {t('workout.records')}</h2>
              {records.map((r) => (
                <ExerciseItem
                  key={`${r.exerciseId}:${r.kind}`}
                  name={r.name}
                  thumb={thumbOf(r.exerciseId)}
                  sub={`${t(`workout.recordKind.${r.kind}`)} · ${t('workout.recordWas', { value: fmtRecord(r, r.previous) })}`}
                  size="sm"
                  to={`/exercises/${r.exerciseId}`}
                  trailing={<strong className="num">{fmtRecord(r, r.value)}</strong>}
                />
              ))}
            </section>
          )}
          <div className="section-head">
            <h2>{t('workout.nextTime')}</h2>
          </div>
          {draft.entries.map((e) => (
            <DecisionCard key={e.id} entry={e} ev={ctx.events.find((x) => x.entryId === e.id)} />
          ))}
          {draft.notes && <p className="card">{draft.notes}</p>}
          <details className="card tight">
            <summary>{t('workout.details')}</summary>
            {draft.entries.map((e) => (
              <div key={e.id} style={{ marginBottom: '0.6rem' }}>
                <ExerciseItem
                  name={e.exercise.name}
                  thumb={thumbOf(e.exerciseId, e.exercise.thumb)}
                  sub={`${t('workout.prescribed')}: ${rxLine(e, t, s.language)}`}
                  size="sm"
                  to={`/exercises/${e.exerciseId}`}
                />
                <div className="num">
                  {e.sets.map((x, i) => (
                    <div key={x.id} className={x.status === 'skipped' ? 'muted' : ''}>
                      {i + 1}. {x.status === 'skipped' ? t('setStatus.skipped') : setText(x, e.exercise.metrics, s.language)}
                      {x.goal?.reps !== undefined && x.status === 'done' && <small> ({t('workout.goal', { value: x.goal.reps })})</small>}
                    </div>
                  ))}
                </div>
                {(e.pain || e.technique) && (
                  <small className="error">
                    {e.pain && t('workout.pain')} {e.technique && t('workout.technique')}
                  </small>
                )}
                {e.notes && <p className="muted">{e.notes}</p>}
              </div>
            ))}
          </details>
          {ctx.revisions.length > 0 && (
            <details className="card tight">
              <summary>
                {t('workout.revisions')} ({ctx.revisions.length})
              </summary>
              <ul className="list">
                {ctx.revisions.map((r) => (
                  <li key={r.id}>
                    <small>{t('workout.revisionAt', { date: fmtDate(r.at, s.language, true) })}</small>
                    {r.previous.entries.map((e) => (
                      <div key={e.id} className="help">
                        {e.exercise.name}: {setsLine(e.sets, e.exercise.metrics, s.language)}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="row wrap" style={{ marginTop: '1rem' }}>
            <button className="outline" onClick={() => setEditing(true)}>
              {t('workout.correct')}
            </button>
            <span className="spacer" />
            <button
              className="danger"
              onClick={async () => {
                if (!(await dialog.confirm(t('workout.deleteConfirm'), { danger: true, ok: t('common.delete') }))) return;
                await repo.deleteWorkout(draft.id);
                nav('/history');
              }}
            >
              {t('common.delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
