import { useLiveQuery } from 'dexie-react-hooks';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import type { Exercise, MetricDef, ProgressionEvent, SetPrescription, SetRecord, Workout, WorkoutEntry } from '../../domain/types';
import { validateValue } from '../../domain/units';
import { addSet, entryAdHoc, adHocLineage, substitute } from '../../domain/workout';
import { EvaluationView } from '../components/Bits';
import { ExercisePicker } from '../components/ExercisePicker';
import { NumInput } from '../components/NumInput';
import { fmtDate, fmtNum, fmtValue, metricLabel, useSettings } from '../util';
import { formatSet } from './ExerciseDetail';

/** Short text of a prescription, e.g. "3 × 8–12 reps · 40 kg · RIR 2". */
export function rxSummary(rx: SetPrescription[], metrics: MetricDef[], t: TFunction, lang: string): string {
  const working = rx.filter((s) => s.kind === 'working');
  const first = working[0];
  const parts: string[] = [];
  const warm = rx.filter((s) => s.kind === 'warmup').length;
  if (warm) parts.push(`${warm} × ${t('setKind.warmup')}`);
  if (first) {
    const tg = metrics
      .map((m) => {
        const x = first.targets[m.key];
        if (!x) return undefined;
        if (m.key === 'reps') return x.value !== undefined ? `${x.value} reps` : `${x.min ?? '?'}${x.max !== undefined ? `–${x.max}` : '+'} reps`;
        return x.value !== undefined ? fmtValue(x.value, m.unit, lang) : undefined;
      })
      .filter(Boolean);
    parts.push(`${working.length} × ${tg.join(' · ') || '—'}`);
    if (first.rir !== undefined) parts.push(`RIR ${first.rir}`);
    if (first.restSec) parts.push(`${first.restSec}s`);
  }
  return parts.join(' · ');
}

function stepFor(m: MetricDef): number {
  if (m.key === 'load') return m.unit === 'lb' ? 5 : 2.5;
  if (m.key === 'duration') return m.unit === 'min' ? 1 : 5;
  if (m.key === 'speed' || m.key === 'distance') return 0.5;
  return 1;
}

interface EntryProps {
  entry: WorkoutEntry;
  previous?: WorkoutEntry;
  exercises: Map<string, Exercise>;
  substitutes: string[];
  onChange: (e: WorkoutEntry) => void;
  onRemove: () => void;
  onMove: (d: number) => void;
}

function EntryCard({ entry, previous, exercises, substitutes, onChange, onRemove, onMove }: EntryProps) {
  const { t } = useTranslation();
  const s = useSettings();
  const [picking, setPicking] = useState(false);
  const metrics = entry.exercise.metrics;
  const hasReps = metrics.some((m) => m.key === 'reps');
  const upSet = (i: number, patch: Partial<SetRecord>) => onChange({ ...entry, sets: entry.sets.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const prescribedFor = (i: number) => {
    const kind = entry.sets[i].kind;
    const n = entry.sets.slice(0, i).filter((x) => x.kind === kind).length;
    return entry.prescription.filter((p) => p.kind === kind)[n];
  };
  const workingDone = entry.sets.filter((x) => x.kind === 'working' && x.status === 'done').length;
  const workingRx = entry.prescription.filter((p) => p.kind === 'working').length;
  const original = entry.substitutedFor ? exercises.get(entry.substitutedFor) : undefined;

  return (
    <section className={`card entry ${workingDone >= workingRx && workingRx > 0 ? 'done' : ''}`} aria-label={entry.exercise.name}>
      <div className="row between wrap">
        <h3>
          {entry.group && <span className="group">{entry.group} </span>}
          {entry.exercise.name}
          {entry.role !== 'main' && <small> · {t(`role.${entry.role}`)}</small>}
        </h3>
        <small>{t('workout.setsDone', { done: workingDone, total: workingRx })}</small>
      </div>
      {original && <p className="help">{t('workout.substitutedFor', { name: original.name })}</p>}
      <p className="help">
        {t('workout.prescribed')}: {rxSummary(entry.prescription, metrics, t, s.language)} · {t(`strategy.${entry.progression.strategy}`)}
        {entry.exercise.loadMode === 'perSide' && ` · ${t('workout.perSide')}`}
      </p>
      {previous && (
        <p className="help">
          {t('workout.previous')}: {previous.sets.filter((x) => x.status === 'done' && x.kind === 'working').map((x) => formatSet(x, previous.exercise.metrics, s.language)).join(', ') || '—'}
        </p>
      )}
      {entry.sets.map((set, i) => {
        const rx = prescribedFor(i);
        const errors = metrics.map((m) => validateValue(m, set.values[m.key]));
        const blocked = errors.some(Boolean);
        return (
          <div key={set.id} className={`set-row ${set.status}`}>
            <span className="idx" title={t(`setKind.${set.kind}`)}>
              {set.kind === 'working' ? i + 1 - entry.sets.slice(0, i).filter((x) => x.kind !== 'working').length : t(`setKind.${set.kind}`).slice(0, 1)}
            </span>
            {metrics.map((m, mi) => (
              <span key={m.key} className="field-inline">
                <span>
                  {metricLabel(t, m.key, metrics)} <small>{m.unit !== 'reps' && m.unit}</small>
                </span>
                <NumInput
                  label={`${metricLabel(t, m.key, metrics)} ${i + 1}`}
                  stepper={m.key === 'reps' || m.key === 'load'}
                  step={stepFor(m)}
                  value={set.values[m.key]}
                  invalid={set.status === 'done' && !!errors[mi]}
                  onChange={(v) => upSet(i, { values: { ...set.values, [m.key]: v } })}
                />
              </span>
            ))}
            {hasReps && (
              <span className="field-inline">
                <span>{t('workout.rir')}</span>
                <NumInput label={`${t('workout.rir')} ${i + 1}`} value={set.rir} placeholder={rx?.rir !== undefined ? String(rx.rir) : ''} onChange={(v) => upSet(i, { rir: v })} />
              </span>
            )}
            {hasReps && (
              <span className="field-inline">
                <span>{t('workout.rpe')}</span>
                <NumInput label={`${t('workout.rpe')} ${i + 1}`} value={set.rpe} placeholder={rx?.rpe !== undefined ? String(rx.rpe) : ''} onChange={(v) => upSet(i, { rpe: v })} />
              </span>
            )}
            <span className="spacer" />
            {set.status === 'done' ? (
              <button className="secondary done-btn" onClick={() => upSet(i, { status: 'pending' })}>
                ✓ {t('workout.undo')}
              </button>
            ) : (
              <>
                <button className="done-btn" disabled={blocked} onClick={() => upSet(i, { status: 'done' })}>
                  ✓ {t('workout.done')}
                </button>
                <button className="ghost" onClick={() => upSet(i, { status: set.status === 'skipped' ? 'pending' : 'skipped' })}>
                  {set.status === 'skipped' ? t('workout.undo') : t('workout.skip')}
                </button>
              </>
            )}
            {!rx && (
              <button className="ghost" aria-label={t('common.remove')} onClick={() => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) })}>
                ✕
              </button>
            )}
          </div>
        );
      })}
      <div className="row wrap">
        <button className="secondary" onClick={() => onChange(addSet(entry, 'working'))}>
          + {t('workout.addSet')}
        </button>
        <button className="ghost" onClick={() => onChange({ ...addSet(entry, 'warmup') })}>
          + {t('setKind.warmup')}
        </button>
        <button className="ghost" onClick={() => setPicking(true)}>
          ⇄ {t('workout.substitute')}
        </button>
        <label className="check">
          <input type="checkbox" checked={entry.pain} onChange={(e) => onChange({ ...entry, pain: e.target.checked })} /> {t('workout.pain')}
        </label>
        <label className="check">
          <input type="checkbox" checked={entry.technique} onChange={(e) => onChange({ ...entry, technique: e.target.checked })} /> {t('workout.technique')}
        </label>
      </div>
      <details>
        <summary>{t('common.notes')} / …</summary>
        <div className="stack-sm">
          <textarea aria-label={t('common.notes')} value={entry.notes} onChange={(e) => onChange({ ...entry, notes: e.target.value })} />
          <div className="row wrap">
            <button className="ghost" onClick={() => onMove(-1)}>
              ↑ {t('common.moveUp')}
            </button>
            <button className="ghost" onClick={() => onMove(1)}>
              ↓ {t('common.moveDown')}
            </button>
            <button className="danger" onClick={onRemove}>
              {t('workout.removeEntry')}
            </button>
          </div>
        </div>
      </details>
      {picking && (
        <SubstitutePicker
          substitutes={substitutes}
          exercises={exercises}
          onPick={(ex) => {
            onChange(substitute(entry, ex));
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

function SubstitutePicker({ substitutes, exercises, onPick, onClose }: { substitutes: string[]; exercises: Map<string, Exercise>; onPick: (e: Exercise) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(substitutes.length === 0);
  if (all) return <ExercisePicker onPick={onPick} onClose={onClose} />;
  return (
    <ExercisePickerShort title={t('plan.substitutes')} items={substitutes.map((id) => exercises.get(id)).filter((e): e is Exercise => !!e)} onPick={onPick} onMore={() => setAll(true)} onClose={onClose} />
  );
}

function ExercisePickerShort({ title, items, onPick, onMore, onClose }: { title: string; items: Exercise[]; onPick: (e: Exercise) => void; onMore: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      <div className="row wrap">
        {items.map((e) => (
          <button key={e.id} className="secondary" onClick={() => onPick(e)}>
            {e.name}
          </button>
        ))}
        <button className="ghost" onClick={onMore}>
          {t('common.all')}…
        </button>
        <button className="ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function RecommendationBox({ ev, metrics }: { ev: ProgressionEvent; metrics: MetricDef[] }) {
  const { t } = useTranslation();
  const [other, setOther] = useState(false);
  const [value, setValue] = useState<number | undefined>(ev.recommendation?.to);
  const [reason, setReason] = useState('');
  const rec = ev.recommendation;
  if (!rec) return null;
  const unit = metrics.find((m) => m.key === rec.metric)?.unit ?? '';
  const label = t('progression.recommendation', { metric: metricLabel(t, rec.metric, metrics), from: `${rec.from} ${unit}`, to: `${rec.to} ${unit}` });
  if (ev.decision !== 'pending') {
    return (
      <p className="help">
        {label} — <strong>{t(`decision.${ev.decision}`)}</strong>
        {ev.decision === 'overridden' && ` (${ev.after[rec.metric]} ${unit})`}
        {ev.decisionReason && ` — ${ev.decisionReason}`}
      </p>
    );
  }
  return (
    <div className="rec stack-sm" role="group" aria-label={t('outcome.increase_recommended')}>
      <strong>{label}</strong>
      <div className="row wrap">
        <button onClick={() => void repo.decide(ev.id, { kind: 'accept' })}>{t('progression.accept', { to: `${rec.to} ${unit}` })}</button>
        <button className="secondary" onClick={() => setOther(!other)}>
          {t('progression.overrideWith')}
        </button>
        <button className="ghost" onClick={() => void repo.decide(ev.id, { kind: 'defer' })}>
          {t('progression.defer')}
        </button>
      </div>
      {other && (
        <div className="row wrap">
          <NumInput label={metricLabel(t, rec.metric, metrics)} value={value} onChange={setValue} />
          <input aria-label={t('progression.reason')} placeholder={t('progression.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button disabled={value === undefined || Number.isNaN(value)} onClick={() => void repo.decide(ev.id, { kind: 'override', value: value!, reason })}>
            {t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
}

function moveItem<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

export function WorkoutPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const s = useSettings();
  const stored = useLiveQuery(() => db.workouts.get(id!), [id]);
  const ctx = useLiveQuery(async () => {
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const version = stored?.planVersionId ? await db.planVersions.get(stored.planVersionId) : undefined;
    const others = (await db.workouts.toArray()).filter((w) => w.id !== id && w.status !== 'in_progress' && (!stored || w.startedAt < stored.startedAt));
    const events = await db.progressionEvents.where('workoutId').equals(id!).toArray();
    const revisions = (await db.revisions.where('workoutId').equals(id!).toArray()).sort((a, b) => b.at.localeCompare(a.at));
    return { exercises, version, others, events, revisions };
  }, [id, stored?.planVersionId, stored?.startedAt]);
  const [draft, setDraft] = useState<Workout>();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const loadedFor = useRef<string>(undefined);

  useEffect(() => {
    if (stored && (loadedFor.current !== `${stored.id}:${stored.status}` || (!editing && stored.status !== 'in_progress'))) {
      loadedFor.current = `${stored.id}:${stored.status}`;
      setDraft(stored);
    }
  }, [stored, editing]);

  if (stored === undefined && ctx) return <p>{t('history.empty')}</p>;
  if (!draft || !ctx) return null;
  const active = draft.status === 'in_progress';
  const editable = active || editing;

  const previousOf = (e: WorkoutEntry) => {
    const sorted = [...ctx.others].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const w of sorted) {
      const p = w.entries.find((x) => x.lineageId === e.lineageId);
      if (p) return p;
    }
    return undefined;
  };
  const substitutesOf = (e: WorkoutEntry) => ctx.version?.days.flatMap((d) => d.items).find((i) => i.lineageId === e.lineageId)?.substitutes ?? [];

  const update = (w: Workout) => {
    setDraft(w);
    if (active) void repo.saveWorkout(w);
  };
  const upEntry = (i: number, e: WorkoutEntry) => update({ ...draft, entries: draft.entries.map((x, j) => (j === i ? e : x)) });

  const addExercise = async (ex: Exercise) => {
    setPicking(false);
    const lineage = adHocLineage(ex.id);
    const state = await db.progressionStates.get(lineage);
    update({ ...draft, entries: [...draft.entries, entryAdHoc(ex, state, await repo.lastEntry(lineage))] });
  };
  const finish = async (interrupted: boolean) => {
    await repo.finishWorkout(draft, interrupted);
    window.scrollTo(0, 0);
  };
  const discard = async () => {
    if (!confirm(t('workout.discardConfirm'))) return;
    await repo.discardWorkout(draft.id);
    nav('/');
  };
  const saveCorrection = async () => {
    await repo.correctWorkout(draft);
    setEditing(false);
  };
  const remove = async () => {
    if (!confirm(t('workout.deleteConfirm'))) return;
    await repo.deleteWorkout(draft.id);
    nav('/history');
  };

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>
            {draft.planName ?? t('workout.free')}
            {draft.dayName && ` · ${draft.dayName}`}
          </h1>
          <small>
            {t('workout.started', { date: fmtDate(draft.startedAt, s.language, true) })} · {t(`workout.status.${draft.status}`)}
          </small>
        </div>
        {!active && !editing && (
          <div className="row wrap">
            <button className="secondary" onClick={() => setEditing(true)}>
              {t('workout.correct')}
            </button>
            <button className="danger" onClick={() => void remove()}>
              {t('common.delete')}
            </button>
          </div>
        )}
      </div>
      {active && <p className="help">{t('workout.sessionOnly')}</p>}

      {editable ? (
        <>
          {draft.entries.length === 0 && <p className="muted">{t('workout.noEntries')}</p>}
          {draft.entries.map((e, i) => (
            <EntryCard
              key={e.id}
              entry={e}
              previous={previousOf(e)}
              exercises={ctx.exercises}
              substitutes={substitutesOf(e)}
              onChange={(x) => upEntry(i, x)}
              onRemove={() => update({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })}
              onMove={(d) => update({ ...draft, entries: moveItem(draft.entries, i, d) })}
            />
          ))}
          <button className="secondary" onClick={() => setPicking(true)}>
            + {t('workout.addExercise')}
          </button>
          <label>
            {t('common.notes')}
            <textarea value={draft.notes} onChange={(e) => update({ ...draft, notes: e.target.value })} />
          </label>
          <div className="sticky-actions">
            {active ? (
              <>
                <button onClick={() => void finish(false)}>✓ {t('workout.finish')}</button>
                <button className="secondary" onClick={() => void finish(true)}>
                  {t('workout.interrupt')}
                </button>
                <span className="spacer" />
                <button className="danger" onClick={() => void discard()}>
                  {t('workout.discard')}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => void saveCorrection()}>{t('workout.saveCorrection')}</button>
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(false);
                    setDraft(stored);
                  }}
                >
                  {t('common.cancel')}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <h2>{t('workout.summary')}</h2>
          {draft.entries.map((e) => {
            const ev = ctx.events.find((x) => x.entryId === e.id);
            return (
              <section className="card" key={e.id}>
                <h3>
                  {e.group && <span className="group">{e.group} </span>}
                  <Link to={`/exercises/${e.exerciseId}`}>{e.exercise.name}</Link>
                  {e.substitutedFor && <small> ({t('workout.substitutedFor', { name: ctx.exercises.get(e.substitutedFor)?.name ?? '?' })})</small>}
                </h3>
                <p className="help">
                  {t('workout.prescribed')}: {rxSummary(e.prescription, e.exercise.metrics, t, s.language)}
                </p>
                <ul className="list">
                  {e.sets.map((x, i) => (
                    <li key={x.id} className={x.status === 'skipped' ? 'muted' : ''}>
                      {x.kind !== 'working' && `${t(`setKind.${x.kind}`)} · `}
                      {i + 1}. {x.status === 'skipped' ? t('setStatus.skipped') : formatSet(x, e.exercise.metrics, s.language)}
                      {x.rir !== undefined && ` · RIR ${fmtNum(x.rir, s.language)}`}
                      {x.rpe !== undefined && ` · RPE ${fmtNum(x.rpe, s.language)}`}
                    </li>
                  ))}
                </ul>
                {(e.pain || e.technique) && (
                  <p className="error">
                    {e.pain && t('workout.pain')} {e.technique && t('workout.technique')}
                  </p>
                )}
                {e.notes && <p className="muted">{e.notes}</p>}
                {e.evaluation && <EvaluationView ev={e.evaluation} metrics={e.exercise.metrics} />}
                {ev && <RecommendationBox ev={ev} metrics={e.exercise.metrics} />}
              </section>
            );
          })}
          {draft.notes && <p className="card">{draft.notes}</p>}
          {ctx.revisions.length > 0 && (
            <section className="card">
              <h2>{t('workout.revisions')}</h2>
              <ul className="list">
                {ctx.revisions.map((r) => (
                  <li key={r.id}>
                    <details>
                      <summary>{t('workout.revisionAt', { date: fmtDate(r.at, s.language, true) })}</summary>
                      {r.previous.entries.map((e) => (
                        <p key={e.id} className="help">
                          {e.exercise.name}: {e.sets.filter((x) => x.status === 'done').map((x) => formatSet(x, e.exercise.metrics, s.language)).join(', ')}
                        </p>
                      ))}
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {picking && <ExercisePicker onPick={(ex) => void addExercise(ex)} onClose={() => setPicking(false)} />}
    </div>
  );
}
