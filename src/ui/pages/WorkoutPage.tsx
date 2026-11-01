import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import type { Exercise, Workout, WorkoutEntry } from '../../domain/types';
import { coachContext, coachMessage, speaksAfterStep } from '../../domain/coach';
import { COACH_BANKS } from '../../i18n/coach';
import { workoutSteps } from '../../domain/circuit';
import { adHocLineage, entryAdHoc, moveToEnd, shortenWorkout, substitute } from '../../domain/workout';
import { beatsLastTime, rivalOn, rivalRows, rivalWorkout } from '../../domain/trainer';
import { speak } from '../voice';
import { dialog } from '../components/Dialog';
import { CoachAvatar } from '../components/CoachAvatar';
import { ExercisePicker } from '../components/ExercisePicker';
import { Modal } from '../components/Modal';
import { Thumb } from '../components/Thumb';
import { DecisionCard, fmtMetric, rxLine, setsLine, setText, SyncCard } from '../progress';
import { distOut, fmtDate, fmtNum, fmtSeconds, loadOut, useSettings, useThumbs, useUnsavedGuard, useWakeLock } from '../util';
import { workoutRecords, type RecordHit } from '../../domain/analysis';
import { ExerciseItem } from '../components/ExerciseItem';
import { toneStyle, useTones } from '../colors';
import { EntryFocus } from '../components/EntryFocus';
import { CoachCard, coachIncrease, PageCoach } from '../components/CoachCard';
import { CircuitFocus } from '../components/CircuitFocus';
import { CorrectionEditor } from '../components/CorrectionEditor';
import { RivalCard, Speak, trainerLine } from '../components/TrainerBits';
import { drawShareCard, shareImage } from '../shareCard';

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
    const latest = (await db.workouts.orderBy('startedAt').last())?.id;
    return { exercises, version, others, events, revisions, allEvents, latest };
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
  const rootRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLSpanElement>(null);
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
  // A correction that is not saved: ask before leaving.
  const unsaved = useUnsavedGuard();
  unsaved.current = editing && JSON.stringify(draft) !== JSON.stringify(stored);

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
  const coachLine = (seed: string) => (coach ? coachMessage(COACH_BANKS[s.language].start, coach, coachContext(ctx.others, ctx.allEvents, new Date(draft.startedAt), coachIncrease(ctx.exercises, s.language)), seed) : '');

  /** A value of a beaten set, for the live reaction. */
  const beatText = (e: WorkoutEntry, kind: 'load' | 'reps' | 'duration', v: number) => (kind === 'reps' ? `${fmtNum(v, s.language)} reps` : fmtMetric(e.exercise.metrics, kind, v, s.language));
  const upEntries = (es: WorkoutEntry[]) => {
    const next = { ...draft, entries: draft.entries.map((x) => es.find((e) => e.id === x.id) ?? x) };
    // A step that becomes done may get a trainer message (setting "when").
    if (coach && active) {
      workoutSteps(next.entries).forEach((st, i) => {
        const was = st.indexes.every((j) => entryDone(draft.entries[j]));
        const now = st.indexes.every((j) => entryDone(next.entries[j]));
        if (!was && now && speaksAfterStep(coach.when, `${draft.id}:${i}`)) setToast(coachLine(`${draft.id}:${i}`) || undefined);
      });
      // A set done just now that beats the same set of last time: a live reaction (D45), shown instead.
      if (coach.live) {
        for (const e of es) {
          const old = draft.entries.find((x) => x.id === e.id);
          for (const set of e.sets.filter((x) => x.status === 'done' && old?.sets.find((y) => y.id === x.id)?.status !== 'done')) {
            const beat = beatsLastTime(e, set, previousOf(e));
            if (beat) setToast(trainerLine(t, 'live', coach, set.id, { exercise: e.exercise.name, from: beatText(e, beat.kind, beat.from), to: beatText(e, beat.kind, beat.to) }));
          }
        }
      }
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
  const shorten = async () => {
    setMenu(false);
    if (!(await dialog.confirm(t('workout.shortConfirm'), { ok: t('workout.shortOk') }))) return;
    const next = shortenWorkout(draft);
    update(next);
    setCur((c) => Math.min(c, workoutSteps(next.entries).length - 1));
  };
  const finish = async (interrupted = false) => {
    if (!interrupted && pendingSets > 0 && !(await dialog.confirm(t('workout.finishPending', { count: pendingSets })))) return;
    setMenu(false);
    await repo.finishWorkout(draft, interrupted);
    window.scrollTo(0, 0);
  };

  // Technique tips of the open exercise (D48, D54). They come from the library in English: read aloud only in English.
  const tips = coach?.tips && entry ? ctx.exercises.get(entry.exerciseId)?.tips?.map((x) => x.trim()).filter(Boolean) : undefined;
  const readTip = coach?.voice && s.language === 'en' ? (tip: string) => speak(tip, s.language, coach) : undefined;

  if (active) {
    const subs = ctx.version?.days.flatMap((d) => d.items).find((i) => i.lineageId === entry?.lineageId)?.substitutes ?? [];
    return (
      <div className="toned" style={tone}>
        <div className="wk-head">
          <div className="wk-top">
            <Link to="/" className="btn outline wk-pause" title={t('workout.pauseHelp')}>
              ⏸ {t('workout.pause')}
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

        {coach && <CoachCard storageKey={`coach:${draft.id}`} message={coachLine(draft.id)} style={coach.style} gender={coach.gender} />}
        {coach?.voice && !draft.entries.some((e) => e.sets.some((x) => x.status !== 'pending')) && <Speak text={coachLine(draft.id)} lang={s.language} coach={coach} />}
        {!draft.short && !draft.entries.some((e) => e.sets.some((x) => x.status !== 'pending')) && (
          <button className="chip short-chip" onClick={() => void shorten()}>
            ⏱ {t('workout.short')}
          </button>
        )}

        {step?.circuit ? (
          <CircuitFocus key={step.circuit.id} circuit={step.circuit} entries={stepEntries(step)} onChange={upEntries} thumbOf={thumbOf} />
        ) : entry ? (
          <EntryFocus
            key={entry.id}
            entry={entry}
            previous={previousOf(entry)}
            onChange={upEntry}
            onSubstitute={() => setPicker('sub')}
            thumbOf={(eid) => ctx.exercises.get(eid)?.thumb}
            setup={ctx.exercises.get(entry.exerciseId)?.personalNotes || undefined}
            onSetup={ctx.exercises.has(entry.exerciseId) ? (text) => void repo.saveExerciseNote(entry.exerciseId, text) : undefined}
            tips={tips}
            onTip={readTip}
            coach={coach}
          />
        ) : (
          <div className="empty">
            <p>{t('workout.noEntries')}</p>
          </div>
        )}

        {toast && (
          <div className="coach coach-toast" role="status" aria-label={t('coach.title')}>
            <CoachAvatar style={coach?.style ?? 'support'} gender={coach?.gender} />
            <p>{toast}</p>
            {coach?.voice && <Speak text={toast} lang={s.language} coach={coach} />}
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
              <button onClick={() => nav('/')}>⏸ {t('workout.pauseLong')}</button>
              <button onClick={() => (setMenu(false), setPicker('add'))}>+ {t('workout.addExercise')}</button>
              {step && cur < steps.length - 1 && !stepDone(step) && <button onClick={() => (setMenu(false), update(moveToEnd(draft, step.indexes)))}>⤓ {t('workout.later')}</button>}
              {!draft.short && <button onClick={() => void shorten()}>⏱ {t('workout.short')}</button>}
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
  const resume = async () => {
    try {
      await repo.resumeWorkout(draft.id);
    } catch {
      await dialog.alert(t('workout.otherInProgress'));
    }
  };
  /** Saves a correction; for each increase it no longer supports, asks whether to undo it. */
  const saveCorrection = async () => {
    const unsupported = await repo.correctWorkout(draft);
    setEditing(false);
    for (const ev of unsupported) {
      const e = draft.entries.find((x) => x.id === ev.entryId);
      if (!e) continue;
      const range = (r?: { min: number; max: number }) => (r ? `${r.min}–${r.max}` : '');
      const value = (v: number) => fmtMetric(e.exercise.metrics, ev.suggestion!.metric, v, s.language);
      const [from, to] = ev.decision === 'reps_up' ? [range(ev.repsOption?.from), range(ev.repsOption?.to)] : ev.suggestion ? [value(ev.suggestion.from), value(ev.suggestion.to)] : ['', ''];
      if (await dialog.confirm(t('workout.revertAsk', { name: e.exercise.name, from, to }), { ok: t('workout.revertOk') })) await repo.decide(ev.id, { kind: 'revert' });
    }
  };
  const records = workoutRecords(draft, ctx.others);
  // "You vs 3 months ago" (D49, D57): only for the latest workout, when the rival is on.
  const rival = rivalOn(s) && ctx.latest === draft.id ? rivalWorkout(draft, ctx.others) : undefined;
  const rivalList = rival ? rivalRows(draft, rival) : [];
  const fmtRecord = (r: RecordHit, v: number) =>
    r.kind === 'maxDuration'
      ? fmtSeconds(v)
      : r.kind === 'maxDistance'
        ? `${fmtNum(distOut(v, s), s.language)} ${s.distanceUnit}`
        : r.kind === 'maxReps'
          ? fmtNum(v, s.language)
          : `${fmtNum(loadOut(v, s), s.language)} ${s.loadUnit}`;
  /** The workout as an image (D44), with the trainer when it is on. */
  const shareCard = async () => {
    const done = draft.entries.filter((e) => e.sets.some((x) => x.kind === 'working' && x.status === 'done'));
    const withCoach = !!s.coach?.enabled;
    const blob = await drawShareCard({
      title: draft.dayName ?? t('workout.free'),
      subtitle: [fmtDate(draft.startedAt, s.language), draft.planName].filter(Boolean).join(' · '),
      stats: [
        { value: String(draft.entries.length), label: t('nav.exercises') },
        { value: `${doneWorking}/${totalWorking}`, label: t('analysis.workingSets') },
        { value: draft.endedAt ? fmtSeconds((Date.parse(draft.endedAt) - Date.parse(draft.startedAt)) / 1000) : '—', label: t('analysis.duration') },
      ],
      lines: done.slice(0, 6).map((e) => ({ name: e.exercise.name, value: setsLine(e.sets, e.exercise.metrics, s.language) })),
      more: done.length > 6 ? t('workout.shareMore', { count: done.length - 6 }) : undefined,
      records: records.slice(0, withCoach ? 2 : 3).map((r) => ({ name: r.name, value: fmtRecord(r, r.value) })),
      recordsTitle: t('workout.records'),
      coach: withCoach
        ? {
            text: coachMessage(COACH_BANKS[s.language].done, s.coach!, { ...coachContext(ctx.others, ctx.allEvents, new Date(draft.startedAt), coachIncrease(ctx.exercises, s.language)), sets: doneWorking, records: records.length }, draft.id),
            svg: avatarRef.current?.innerHTML,
          }
        : undefined,
      tone: (rootRef.current && getComputedStyle(rootRef.current).getPropertyValue('--tone').trim()) || '#5b4cf5',
      footer: 'MyGymProgression',
    });
    if (blob) await shareImage(blob, `mygymprogression-${draft.startedAt.slice(0, 10)}.png`);
  };
  return (
    <div className="toned" style={tone} ref={rootRef}>
      {s.coach?.enabled && (
        <span ref={avatarRef} hidden>
          <CoachAvatar style={s.coach.style} gender={s.coach.gender} size={104} />
        </span>
      )}
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
            {draft.short && ` · ⏱ ${t('workout.shortened')}`}
          </small>
        </div>
      </div>

      {editing ? (
        <>
          <p className="help">{t('workout.correctHelp')}</p>
          <section className="card">
            <label className="setting-row">
              <span>{t('workout.statusLabel')}</span>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Workout['status'] })}>
                {(['completed', 'partial', 'interrupted'] as const).map((st) => (
                  <option key={st} value={st}>
                    {t(`workout.status.${st}`)}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <CorrectionEditor draft={draft} onChange={setDraft} thumbOf={thumbOf} />
          <div className="wk-nav">
            <button className="outline" onClick={() => (setEditing(false), setDraft(stored))}>
              {t('common.cancel')}
            </button>
            <button className="primary" onClick={() => void saveCorrection()}>
              {t('workout.saveCorrection')}
            </button>
          </div>
        </>
      ) : (
        <>
          {ctx.latest === draft.id && <PageCoach place="done" id={draft.id} extra={{ sets: doneWorking, records: records.length }} />}
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
          {rival && rivalList.length > 0 && <RivalCard rows={rivalList} date={rival.startedAt} coach={coach} />}
          <div className="section-head">
            <h2>{t('workout.nextTime')}</h2>
          </div>
          {draft.entries.map((e) => (
            <DecisionCard key={e.id} entry={e} ev={ctx.events.find((x) => x.entryId === e.id)} />
          ))}
          {ctx.events.some((x) => x.outcome === 'sync') && (
            <>
              <div className="section-head">
                <h2>{t('sync.title')}</h2>
              </div>
              {ctx.events
                .filter((x) => x.outcome === 'sync')
                .map((x) => (
                  <SyncCard key={x.id} ev={x} exercise={ctx.exercises.get(x.exerciseId)} />
                ))}
            </>
          )}
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
          {draft.status === 'interrupted' && ctx.latest === draft.id && (
            <section className="card warn">
              <p style={{ marginTop: 0 }}>{t('workout.resumeHelp')}</p>
              <button className="primary xl" onClick={() => void resume()}>
                ▶ {t('workout.resume')}
              </button>
            </section>
          )}
          <div className="row wrap" style={{ marginTop: '1rem' }}>
            <button className="outline" onClick={() => setEditing(true)}>
              {t('workout.correct')}
            </button>
            <button className="outline" onClick={() => void shareCard()}>
              ⤴ {t('workout.share')}
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
