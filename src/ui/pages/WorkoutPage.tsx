import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import type { Circuit, Exercise, MetricDef, MetricKey, ProgressionEvent, SetRecord, Workout, WorkoutEntry } from '../../domain/types';
import { coachContext, coachMessage } from '../../domain/coach';
import { COACH_BANKS } from '../../i18n/coach';
import { workoutSteps } from '../../domain/circuit';
import { validateValue } from '../../domain/units';
import { addSet, adHocLineage, entryAdHoc, substitute } from '../../domain/workout';
import { dialog } from '../components/Dialog';
import { ExercisePicker } from '../components/ExercisePicker';
import { Modal } from '../components/Modal';
import { NumInput } from '../components/NumInput';
import { Thumb } from '../components/Thumb';
import { DecisionCard, progressHint, rxLine, setsLine, setText } from '../progress';
import { fmtDate, fmtNum, fmtSeconds, fmtValue, metricLabel, metricShort, useSettings, useThumbs } from '../util';
import { ExerciseItem } from '../components/ExerciseItem';
import { toneStyle, useTones } from '../colors';

function stepFor(m: MetricDef): number {
  if (m.key === 'load') return m.unit === 'lb' ? 5 : 2.5;
  if (m.key === 'duration') return m.unit === 'min' ? 1 : 5;
  if (m.key === 'speed' || m.key === 'distance') return 0.5;
  return 1;
}

function BigStepper({ def, metrics, value, goal, onChange }: { def: MetricDef; metrics: MetricDef[]; value?: number; goal?: number; onChange: (v: number | undefined) => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const step = stepFor(def);
  const label = metricLabel(t, def.key, metrics);
  const bump = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <div className="bigstep">
      <span className="lbl">
        {label} {def.unit !== 'reps' && <span>({def.unit})</span>}
      </span>
      <div className="ctl">
        <button type="button" aria-label={`${label} −${step}`} onClick={() => bump(-step)}>
          −
        </button>
        <NumInput label={label} value={value} onChange={onChange} />
        <button type="button" aria-label={`${label} +${step}`} onClick={() => bump(step)}>
          +
        </button>
      </div>
      {goal !== undefined && <span className="goal">{t('workout.goal', { value: fmtNum(goal, s.language) })}</span>}
    </div>
  );
}

function SetList({ entry, activeId, onActivate, onChange }: { entry: WorkoutEntry; activeId?: string; onActivate: (id: string) => void; onChange: (e: WorkoutEntry) => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const metrics = entry.exercise.metrics;
  const up = (id: string, patch: Partial<SetRecord>) => onChange({ ...entry, sets: entry.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  let working = 0;
  return (
    <div className="sets">
      {entry.sets.map((set) => {
        const label = set.kind === 'working' ? String(++working) : t(`setKind.${set.kind}`).slice(0, 1);
        const min = entry.prescription.find((p) => p.kind === 'working')?.targets.reps?.min;
        const miss = set.status === 'done' && set.kind === 'working' && min !== undefined && (set.values.reps ?? 0) < min;
        if (set.id === activeId) {
          const blocked = metrics.some((m) => validateValue(m, set.values[m.key]));
          return (
            <div key={set.id} className="set active" role="group" aria-label={t('workout.setN', { n: label })}>
              <div className="top">
                <span className="n">{label}</span>
                <strong>{set.kind === 'working' ? t('workout.setN', { n: label }) : t(`setKind.${set.kind}`)}</strong>
              </div>
              <div className="steppers">
                {metrics.map((m) => (
                  <BigStepper key={m.key} def={m} metrics={metrics} value={set.values[m.key]} goal={m.key === 'reps' ? set.goal?.reps : undefined} onChange={(v) => up(set.id, { values: { ...set.values, [m.key]: v } })} />
                ))}
              </div>
              <div className="row">
                <button className="primary xl" disabled={blocked} onClick={() => up(set.id, { status: 'done' })}>
                  ✓ {t('workout.setDone')}
                </button>
              </div>
              <div className="row between">
                <button className="ghost sm" onClick={() => up(set.id, { status: 'skipped' })}>
                  {t('workout.skip')}
                </button>
                {!entry.prescription[entry.sets.indexOf(set)] && (
                  <button className="ghost sm" onClick={() => onChange({ ...entry, sets: entry.sets.filter((x) => x.id !== set.id) })}>
                    {t('common.remove')}
                  </button>
                )}
              </div>
            </div>
          );
        }
        return (
          <button key={set.id} className={`set ${set.status} ${miss ? 'miss' : ''}`} onClick={() => onActivate(set.id)} aria-label={`${t('workout.setN', { n: label })}: ${set.status === 'skipped' ? t('setStatus.skipped') : setText(set, metrics, s.language)}`}>
            <span className="n">{set.status === 'done' ? '✓' : label}</span>
            <span className="v">{set.status === 'skipped' ? t('setStatus.skipped') : setText(set, metrics, s.language) || '—'}</span>
            {set.status === 'pending' && set.goal?.reps !== undefined && <span className="g">{t('workout.goal', { value: set.goal.reps })}</span>}
          </button>
        );
      })}
    </div>
  );
}

function EntryFocus({ entry, previous, onChange, onSubstitute, thumbOf }: { entry: WorkoutEntry; previous?: WorkoutEntry; onChange: (e: WorkoutEntry) => void; onSubstitute: () => void; thumbOf: (id: string) => string | undefined }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [chosen, setChosen] = useState<string>();
  const [notes, setNotes] = useState(!!entry.notes);
  const firstPending = entry.sets.find((x) => x.status === 'pending')?.id;
  const chosenSet = entry.sets.find((x) => x.id === chosen);
  // The chosen set stays open until it is marked done or skipped; otherwise the first pending set is open.
  const activeId = chosenSet?.status === 'pending' ? chosen : firstPending;

  return (
    <section aria-label={entry.exercise.name}>
      {entry.group && <span className="badge">{t('plan.group')} {entry.group}</span>}
      <div className="ex-head">
        <Thumb src={thumbOf(entry.exerciseId) ?? entry.exercise.thumb} name={entry.exercise.name} size={76} />
        <div style={{ minWidth: 0 }}>
          <h1 className="ex-title">{entry.exercise.name}</h1>
          <div className="ex-meta num">{rxLine(entry, t, s.language)}</div>
          <div className="ex-last">
            {t('workout.lastTime')}: {previous ? setsLine(previous.sets, previous.exercise.metrics, s.language) : t('workout.firstTime')}
          </div>
        </div>
      </div>
      {entry.substitutedFor && <p className="help">{t('workout.substituted')}</p>}
      <div className="hint">{progressHint(entry, t, s.language)}</div>

      <SetList
        entry={entry}
        activeId={activeId}
        onActivate={(id) => {
          const x = entry.sets.find((y) => y.id === id);
          if (x && x.status !== 'pending') onChange({ ...entry, sets: entry.sets.map((y) => (y.id === id ? { ...y, status: 'pending' } : y)) });
          setChosen(id);
        }}
        onChange={(e) => {
          onChange(e);
          setChosen(undefined);
        }}
      />

      <div className="wk-actions">
        <button className="chip" onClick={() => onChange(addSet(entry, 'working'))}>
          + {t('workout.addSet')}
        </button>
        <button className="chip" onClick={onSubstitute}>
          ⇄ {t('workout.substitute')}
        </button>
        <button className={`chip ${entry.pain ? 'on' : ''}`} aria-pressed={entry.pain} onClick={() => onChange({ ...entry, pain: !entry.pain })}>
          {t('workout.pain')}
        </button>
        <button className={`chip ${entry.technique ? 'on' : ''}`} aria-pressed={entry.technique} onClick={() => onChange({ ...entry, technique: !entry.technique })}>
          {t('workout.technique')}
        </button>
        <button className={`chip ${notes ? 'on' : ''}`} onClick={() => setNotes(!notes)}>
          {t('common.notes')}
        </button>
      </div>
      {notes && <textarea style={{ marginTop: '0.6rem' }} aria-label={t('common.notes')} value={entry.notes} onChange={(e) => onChange({ ...entry, notes: e.target.value })} />}
    </section>
  );
}

/** Personal trainer message at the top of the workout; can be closed (remembered for this workout). */
function CoachCard({ workout, others, events, exercises }: { workout: Workout; others: Workout[]; events: ProgressionEvent[]; exercises: Map<string, Exercise> }) {
  const { t } = useTranslation();
  const s = useSettings();
  const key = `coach:${workout.id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !s.coach?.enabled) return null;
  const format = (ev: ProgressionEvent) => {
    const ex = exercises.get(ev.exerciseId);
    const k = (Object.keys(ev.after) as MetricKey[]).find((m) => ev.after[m] !== ev.before[m]);
    if (!ex || !k) return undefined;
    const unit = ex.metrics.find((m) => m.key === k)?.unit ?? '';
    return { exercise: ex.name, from: fmtValue(ev.before[k], unit, s.language), to: fmtValue(ev.after[k], unit, s.language) };
  };
  const msg = coachMessage(COACH_BANKS[s.language], s.coach, coachContext(others, events, new Date(workout.startedAt), format), workout.id);
  if (!msg) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      // Without storage the message only hides for this visit.
    }
  };
  return (
    <div className="coach" role="note" aria-label={t('coach.title')}>
      <span className="coach-ico" aria-hidden="true">
        PT
      </span>
      <p>{msg}</p>
      <button className="ghost sm" aria-label={t('common.close')} onClick={close}>
        ✕
      </button>
    </div>
  );
}

/** A whole circuit on one screen: every round with its exercises, pre-filled; one "done" at the end marks all sets. */
function CircuitFocus({ circuit, entries, onChange, thumbOf }: { circuit: Circuit; entries: WorkoutEntry[]; onChange: (es: WorkoutEntry[]) => void; thumbOf: (id: string, fallback?: string) => string | undefined }) {
  const { t } = useTranslation();
  const rounds = Math.max(0, ...entries.map((e) => e.sets.length));
  const done = entries.every((e) => e.sets.every((x) => x.status !== 'pending'));
  const blocked = entries.some((e) => e.sets.some((x) => e.exercise.metrics.some((m) => validateValue(m, x.values[m.key]))));
  const setValue = (ei: number, si: number, key: string, v: number | undefined) =>
    onChange(entries.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j !== si ? x : { ...x, values: { ...x.values, [key]: v } })) })));
  return (
    <section aria-label={circuit.name} className="circuit-focus">
      <span className="badge">⟳ {t('circuit.label')}</span>
      <h1 className="ex-title">{circuit.name}</h1>
      <div className="ex-meta">
        {t('circuit.roundsCount', { count: rounds })} · {entries.map((e) => e.exercise.name).join(' → ')}
      </div>
      <div className="hint">{t('circuit.workoutHelp', { rounds })}</div>
      {Array.from({ length: rounds }, (_, r) => (
        <div key={r} className="round">
          <p className="eyebrow">{t('circuit.roundN', { n: r + 1 })}</p>
          {entries.map((e, ei) => {
            const x = e.sets[r];
            if (!x) return null;
            return (
              <div key={e.id} className={`round-row ${x.status}`}>
                <Thumb src={thumbOf(e.exerciseId, e.exercise.thumb)} name={e.exercise.name} size={36} />
                <span className="name">{e.exercise.name}</span>
                <span className="vals">
                  {e.exercise.metrics.map((m) => (
                    <span key={m.key} className="mini">
                      <NumInput label={`${e.exercise.name} ${metricLabel(t, m.key, e.exercise.metrics)} ${r + 1}`} value={x.values[m.key]} onChange={(v) => setValue(ei, r, m.key, v)} />
                      <small>{m.unit === 'reps' ? metricShort(t, m.key, e.exercise.metrics).toLowerCase() : m.unit}</small>
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <button className={done ? 'outline xl' : 'primary xl'} disabled={blocked || done} onClick={() => onChange(entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, status: 'done' as const })) })))}>
        ✓ {done ? t('circuit.doneAll') : t('circuit.done')}
      </button>
    </section>
  );
}

function CorrectionEditor({ draft, onChange, thumbOf }: { draft: Workout; onChange: (w: Workout) => void; thumbOf: (id: string, fallback?: string) => string | undefined }) {
  const { t } = useTranslation();
  const upSet = (ei: number, si: number, patch: Partial<SetRecord>) =>
    onChange({ ...draft, entries: draft.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, ...patch } : x)) } : e)) });
  return (
    <div>
      {draft.entries.map((e, ei) => {
        const metrics = e.exercise.metrics;
        const cols = { gridTemplateColumns: `2rem repeat(${metrics.length}, minmax(0, 1fr)) 3.2rem` };
        return (
          <section className="card" key={e.id} aria-label={e.exercise.name}>
            <ExerciseItem name={e.exercise.name} thumb={thumbOf(e.exerciseId, e.exercise.thumb)} size="sm" />
            <div className="gtable" role="table">
              <div className="gtable-row head" role="row" style={cols}>
                <span role="columnheader">#</span>
                {metrics.map((m) => (
                  <span key={m.key} role="columnheader" title={metricLabel(t, m.key, metrics)}>
                    {metricShort(t, m.key, metrics)}
                    {m.unit !== 'reps' && <small>{m.unit}</small>}
                  </span>
                ))}
                <span role="columnheader">{t('setStatus.done')}</span>
              </div>
              {e.sets.map((x, si) => (
                <div key={x.id} className="gtable-row" role="row" style={cols}>
                  <span className="n">{si + 1}</span>
                  {metrics.map((m) => (
                    <NumInput key={m.key} label={`${metricLabel(t, m.key, metrics)} ${si + 1}`} value={x.values[m.key]} onChange={(v) => upSet(ei, si, { values: { ...x.values, [m.key]: v } })} />
                  ))}
                  <input
                    type="checkbox"
                    className="big-check"
                    aria-label={`${t('setStatus.done')} ${si + 1}`}
                    checked={x.status === 'done'}
                    onChange={(ev) => upSet(ei, si, { status: ev.target.checked ? 'done' : 'skipped' })}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

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
  const upEntries = (es: WorkoutEntry[]) => update({ ...draft, entries: draft.entries.map((x) => es.find((e) => e.id === x.id) ?? x) });
  const upEntry = (e: WorkoutEntry) => upEntries([e]);
  const entryDone = (e: WorkoutEntry) => e.sets.length > 0 && e.sets.every((x) => x.status !== 'pending');
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

        <CoachCard workout={draft} others={ctx.others} events={ctx.allEvents} exercises={ctx.exercises} />

        {step?.circuit ? (
          <CircuitFocus key={step.circuit.id} circuit={step.circuit} entries={stepEntries(step)} onChange={upEntries} thumbOf={thumbOf} />
        ) : entry ? (
          <EntryFocus key={entry.id} entry={entry} previous={previousOf(entry)} onChange={upEntry} onSubstitute={() => setPicker('sub')} thumbOf={(eid) => ctx.exercises.get(eid)?.thumb} />
        ) : (
          <div className="empty">
            <p>{t('workout.noEntries')}</p>
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

  // Finished workout: summary with decisions, or correction mode.
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
