import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { addCircuit, addToCircuit, blocks, moveCircuit, moveItem, removeCircuit, removeFromCircuit, updateCircuit } from '../../domain/circuit';
import { newDay, newPlanItem } from '../../domain/factory';
import { dayGoal, followsGoal, goalProgression, goalSets } from '../../domain/goals';
import type { Circuit, DayGoal, Exercise, ItemRole, MetricKey, Plan, PlanDay, PlanGoal, PlanItem, ProgressionState, SetPrescription, StrengthMode } from '../../domain/types';
import { PrescriptionEditor, ProgressionEditor } from '../components/Editors';
import { ExercisePicker } from '../components/ExercisePicker';
import { NumInput } from '../components/NumInput';
import { Thumb } from '../components/Thumb';
import { fmtValue, metricLabel, useSettings } from '../util';
import { ColorPicker } from '../components/ColorPicker';
import { toneStyle } from '../colors';
import { dialog } from '../components/Dialog';

const GOALS: PlanGoal[] = ['hypertrophy', 'strength', 'mixed'];
const MODES: StrengthMode[] = ['fixed', 'range'];
/** Day goals of a mixed plan; 'free' = each exercise uses its own rule. */
const DAY_GOALS: (DayGoal | 'free')[] = ['hypertrophy', 'strength', 'free'];
type Goal = Pick<Plan, 'goal' | 'strengthMode'>;
const setsLabel = (g: Goal) => (g.goal === 'hypertrophy' ? '3×8–12' : g.strengthMode === 'range' ? '4×4–6' : '5×5');
const ROLES: ItemRole[] = ['warmup', 'main', 'optional'];
type Targets = Partial<Record<MetricKey, number>>;

const working = (sets: SetPrescription[]) => sets.filter((s) => s.kind === 'working');

/** Applies a change to every working set; other sets are not changed. */
function eachWorking(sets: SetPrescription[], f: (s: SetPrescription) => SetPrescription): SetPrescription[] {
  return sets.map((s) => (s.kind === 'working' ? f(structuredClone(s)) : s));
}

function setCount(sets: SetPrescription[], n: number): SetPrescription[] {
  const w = working(sets);
  const template = w[w.length - 1] ?? { kind: 'working' as const, targets: {} };
  const others = sets.filter((s) => s.kind !== 'working');
  const next = Array.from({ length: Math.max(1, Math.min(20, n)) }, (_, i) => w[i] ?? structuredClone(template));
  return [...others.filter((s) => s.kind === 'warmup'), ...next, ...others.filter((s) => s.kind === 'backoff')];
}

interface ItemProps {
  /** Goal of the item's day (plan goal, or the day goal in a mixed plan). */
  plan: Goal;
  item: PlanItem;
  ex: Exercise;
  state?: ProgressionState;
  edits?: Targets;
  exercises: Map<string, Exercise>;
  onChange: (i: PlanItem) => void;
  onTarget: (metric: MetricKey, v: number | undefined) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  onAddSubstitute: () => void;
  /** Collapsed: one line with image, name and summary; open: the editor. */
  open: boolean;
  onToggle: () => void;
  /** Circuits of the day; the item may belong to one (its sets are then the circuit rounds). */
  circuits: Circuit[];
  onCircuit: (circuitId: string | undefined) => void;
}

function ItemCard({ plan, item, ex, state, edits, exercises, onChange, onTarget, onRemove, onMove, onAddSubstitute, open, onToggle, circuits, onCircuit }: ItemProps) {
  const { t } = useTranslation();
  const s = useSettings();
  const inCircuit = circuits.some((c) => c.id === item.circuitId);
  const cfg = goalProgression(plan, ex, item.progression);
  const first = working(item.sets)[0];
  const step = cfg.steps[0];
  const hasReps = ex.metrics.some((m) => m.key === 'reps');
  const valueMetrics = ex.metrics.filter((m) => m.key !== 'reps' && (first?.targets[m.key]?.value !== undefined || m.key === step?.metric || m.key === 'load'));
  const valueOf = (k: MetricKey) => edits?.[k] ?? state?.targets[k] ?? first?.targets[k]?.value;
  const setValue = (k: MetricKey, v: number | undefined) => {
    if (state?.targets[k] !== undefined) return onTarget(k, v);
    onChange({ ...item, sets: eachWorking(item.sets, (s) => ({ ...s, targets: { ...s.targets, [k]: v === undefined ? undefined : { value: v } } })) });
  };
  const setReps = (field: 'min' | 'max', v: number | undefined) =>
    onChange({ ...item, sets: eachWorking(item.sets, (s) => ({ ...s, targets: { ...s.targets, reps: { min: s.targets.reps?.min ?? s.targets.reps?.value, max: s.targets.reps?.max, [field]: v } } })) });
  const setIncrement = (v: number | undefined) => {
    if (!step) return;
    onChange({ ...item, progression: { ...cfg, steps: [{ ...step, increment: v ?? 0 }, ...cfg.steps.slice(1)] } });
  };

  // Collapsed summary, e.g. "3×8–12 · 40 kg" (inside a circuit the sets are the rounds, so only reps and values).
  const r = first?.targets.reps;
  const range = r ? (r.max !== undefined && r.max !== (r.min ?? r.value) ? `${r.min ?? r.value}–${r.max}` : `${r.min ?? r.value ?? r.max}`) : '';
  const values = valueMetrics.map((m) => valueOf(m.key)).map((v, i) => (v === undefined ? '' : fmtValue(v, valueMetrics[i].unit, s.language))).filter(Boolean);
  const count = inCircuit ? '' : `${working(item.sets).length}×`;
  const summary = (hasReps ? [`${count}${range} ${t('plan.reps').toLowerCase()}`, ...values] : [`${count} ${values.join(' · ')}`.trim()]).filter(Boolean).join(' · ');

  if (!open) {
    return (
      <section className="card item" aria-label={ex.name}>
        <button type="button" className="item-toggle" aria-expanded={false} onClick={onToggle}>
          <Thumb src={ex.thumb} name={ex.name} size={44} />
          <span className="xitem-text">
            <span className="xitem-name">
              {item.group && <span className="group">{item.group} </span>}
              {ex.name}
            </span>
            <span className="xitem-sub">{summary}</span>
          </span>
          <span className="fold-chev" aria-hidden="true">
            ⌄
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="card item open" aria-label={ex.name}>
      <div className="item-head">
        <button type="button" className="item-toggle" aria-expanded={true} onClick={onToggle}>
          <Thumb src={ex.thumb} name={ex.name} size={44} />
          <span className="name">{ex.name}</span>
          <span className="fold-chev" aria-hidden="true">
            ⌄
          </span>
        </button>
        <button className="ghost sm" aria-label={t('common.moveUp')} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="ghost sm" aria-label={t('common.moveDown')} onClick={() => onMove(1)}>
          ↓
        </button>
        <button className="ghost sm" aria-label={`${t('common.remove')} ${ex.name}`} onClick={onRemove}>
          ✕
        </button>
      </div>
      <small className="muted">
        {cfg.onTop ? t(`plan.rule.${cfg.onTop}`) : t(`strategy.${cfg.strategy}`)}
        {item.role !== 'main' && ` · ${t(`role.${item.role}`)}`}
        {state?.repsRange && ` · reps ${state.repsRange.min}–${state.repsRange.max} (${t('plan.current')})`}
      </small>
      <div className="item-grid">
        {!inCircuit && (
          <span className="field-inline">
            <span>{t('plan.sets')}</span>
            <NumInput label={`${ex.name} ${t('plan.sets')}`} value={working(item.sets).length} onChange={(v) => v && onChange({ ...item, sets: setCount(item.sets, v) })} />
          </span>
        )}
        {hasReps && (
          <span className="field-inline">
            <span>{t('plan.reps')}</span>
            <span className="row">
              <NumInput label={`${ex.name} ${t('plan.repsMin')}`} value={first?.targets.reps?.min ?? first?.targets.reps?.value} onChange={(v) => setReps('min', v)} />
              –
              <NumInput label={`${ex.name} ${t('plan.repsMax')}`} value={first?.targets.reps?.max} onChange={(v) => setReps('max', v)} />
            </span>
          </span>
        )}
        {valueMetrics.map((m) => (
          <span key={m.key} className="field-inline">
            <span>
              {metricLabel(t, m.key, ex.metrics)} ({m.unit}){state?.targets[m.key] !== undefined && ` · ${t('plan.current')}`}
            </span>
            <NumInput label={`${ex.name} ${metricLabel(t, m.key, ex.metrics)}`} value={valueOf(m.key)} onChange={(v) => setValue(m.key, v)} />
          </span>
        ))}
        {step && (
          <span className="field-inline">
            <span>
              {t('plan.increment')} ({ex.metrics.find((m) => m.key === step.metric)?.unit})
            </span>
            <NumInput label={`${ex.name} ${t('plan.increment')}`} value={step.increment} onChange={setIncrement} />
          </span>
        )}
      </div>

      <details>
        <summary>{t('plan.advanced')}</summary>
        <div className="stack">
          <div className="row wrap">
            <label>
              {t('plan.role')}
              <select value={item.role} onChange={(e) => onChange({ ...item, role: e.target.value as ItemRole })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            {circuits.length > 0 && (
              <label>
                {t('circuit.label')}
                <select value={item.circuitId ?? ''} onChange={(e) => onCircuit(e.target.value || undefined)}>
                  <option value="">—</option>
                  {circuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div>
            <h3>{t('plan.setBySet')}</h3>
            <PrescriptionEditor sets={item.sets} metrics={ex.metrics} onChange={(sets) => onChange({ ...item, sets })} />
          </div>
          <div>
            <h3>{t('strategy.label')}</h3>
            <ProgressionEditor config={cfg} metrics={ex.metrics} onChange={(progression) => onChange({ ...item, progression })} />
          </div>
          <div>
            <h3>{t('plan.substitutes')}</h3>
            <div className="row wrap">
              {item.substitutes.map((sid) => (
                <button key={sid} className="chip" onClick={() => onChange({ ...item, substitutes: item.substitutes.filter((x) => x !== sid) })}>
                  {exercises.get(sid)?.name ?? '?'} ✕
                </button>
              ))}
              <button className="chip" onClick={onAddSubstitute}>
                + {t('common.add')}
              </button>
            </div>
          </div>
          <label>
            {t('common.notes')}
            <input value={item.notes} onChange={(e) => onChange({ ...item, notes: e.target.value })} />
          </label>
        </div>
      </details>
    </section>
  );
}

export function PlanEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const stored = useLiveQuery(async () => {
    const plan = await db.plans.get(id!);
    const version = plan ? await db.planVersions.get(plan.currentVersionId) : undefined;
    return { plan, version };
  }, [id]);
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), []);
  const states = useLiveQuery(async () => new Map((await db.progressionStates.toArray()).map((s) => [s.lineageId, s])), []);
  const [plan, setPlan] = useState<Plan>();
  const [days, setDays] = useState<PlanDay[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [edits, setEdits] = useState<Record<string, Targets>>({});
  // Picker target: substitutes of an item, a circuit, or the day.
  const [picker, setPicker] = useState<{ item?: string; circuit?: string }>();
  const [openId, setOpenId] = useState<string>();
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (stored?.plan && stored.version && (!plan || plan.currentVersionId !== stored.plan.currentVersionId)) {
      setPlan(stored.plan);
      setDays(structuredClone(stored.version.days));
    }
  }, [stored, plan]);
  if (!stored || !exercises || !states) return null;
  if (!stored.plan || !plan || !stored.version) return <p className="empty">{t('plan.empty')}</p>;
  const version = stored.version;
  const meta = (p: Plan) => JSON.stringify({ ...p, updatedAt: '', currentVersionId: '' });
  const dirty = JSON.stringify(days) !== JSON.stringify(version.days) || meta(plan) !== meta(stored.plan) || Object.keys(edits).length > 0;
  const day = days[Math.min(dayIdx, days.length - 1)];

  /** Offers to re-apply the goal's default sets to the load exercises of the changed days, keeping their loads. */
  const offerDefaults = async (p: Plan, ds: PlanDay[], onlyDay?: string) => {
    const goalOf = (d: PlanDay) => dayGoal(p, d)!;
    const touched = ds.filter(
      (d) => (!onlyDay || d.id === onlyDay) && ['hypertrophy', 'strength'].includes(goalOf(d).goal) && d.items.some((i) => { const ex = exercises.get(i.exerciseId); return ex && followsGoal(ex); }),
    );
    if (!touched.length) return;
    const label = [...new Set(touched.map((d) => setsLabel(goalOf(d))))].join(', ');
    if (!(await dialog.confirm(t('plan.applyDefaults', { sets: label })))) return;
    setDays(
      ds.map((d) =>
        !touched.includes(d)
          ? d
          : {
              ...d,
              items: d.items.map((i) => {
                const ex = exercises.get(i.exerciseId);
                if (!ex || !followsGoal(ex)) return i;
                const load = working(i.sets)[0]?.targets.load;
                const sets = goalSets(goalOf(d), ex).map((s) => (s.kind === 'working' && load ? { ...s, targets: { ...s.targets, load } } : s));
                return { ...i, sets };
              }),
            },
      ),
    );
  };

  /** Changes the plan goal or strength mode. */
  const changeGoal = async (patch: Partial<Goal>) => {
    const next = { ...plan, ...patch };
    if (next.goal === plan.goal && (next.strengthMode ?? 'fixed') === (plan.strengthMode ?? 'fixed')) return;
    setPlan(next);
    await offerDefaults(next, days);
  };

  /** Changes the goal of the current day (mixed plans). */
  const changeDayGoal = async (patch: Pick<PlanDay, 'goal' | 'strengthMode'>) => {
    const next = { ...day, ...patch };
    if (next.goal === day.goal && (next.strengthMode ?? 'fixed') === (day.strengthMode ?? 'fixed')) return;
    const nextDays = days.map((d) => (d.id === day.id ? next : d));
    setDays(nextDays);
    await offerDefaults(plan, nextDays, day.id);
  };

  const upDay = (f: (d: PlanDay) => PlanDay) => setDays(days.map((d) => (d.id === day.id ? f(structuredClone(d)) : d)));
  const upItem = (it: PlanItem) => upDay((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) }));

  const save = async () => {
    if (!plan.name.trim()) return;
    await repo.savePlan(plan, days);
    for (const [lineage, targets] of Object.entries(edits)) {
      const it = days.flatMap((d) => d.items).find((x) => x.lineageId === lineage);
      const ex = it && exercises.get(it.exerciseId);
      if (it && ex) await repo.manualAdjust(lineage, ex.id, targets, t('plan.editReason'), (it.progression ?? ex.progression).strategy);
    }
    setEdits({});
    setMsg(t('common.saved'));
    setTimeout(() => setMsg(''), 1500);
  };
  const startDay = async () => {
    if (dirty) await save();
    nav(`/workout/${await repo.startWorkout(plan.id, day.id)}`);
  };
  const pick = (ex: Exercise) => {
    if (!picker) return;
    if (picker.item) {
      const it = day.items.find((x) => x.id === picker.item);
      if (it) upItem({ ...it, substitutes: [...it.substitutes, ex.id] });
    } else {
      const item = newPlanItem(ex, dayGoal(plan, day));
      upDay((d) => (picker.circuit ? addToCircuit(d, item, picker.circuit) : { ...d, items: [...d.items, item] }));
      setOpenId(item.id);
    }
    setPicker(undefined);
  };
  const newCircuit = () => upDay((d) => addCircuit(d, `${t('circuit.label')} ${(d.circuits?.length ?? 0) + 1}`).day);
  const workingSets = day ? day.items.reduce((a, i) => a + working(i.sets).length, 0) : 0;
  const addDay = () => {
    setDays([...days, newDay(`${t('plan.day')} ${String.fromCharCode(65 + days.length)}`)]);
    setDayIdx(days.length);
  };

  const itemCard = (it: PlanItem) => {
    const ex = exercises.get(it.exerciseId);
    if (!ex) return null;
    return (
      <ItemCard
        key={it.id}
        plan={dayGoal(plan, day)!}
        item={it}
        ex={ex}
        state={states.get(it.lineageId)}
        edits={edits[it.lineageId]}
        exercises={exercises}
        onChange={upItem}
        onTarget={(k, v) => v !== undefined && setEdits({ ...edits, [it.lineageId]: { ...edits[it.lineageId], [k]: v } })}
        onRemove={() => upDay((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))}
        onMove={(dd) => upDay((d) => moveItem(d, it.id, dd))}
        onAddSubstitute={() => setPicker({ item: it.id })}
        open={openId === it.id}
        onToggle={() => setOpenId(openId === it.id ? undefined : it.id)}
        circuits={day.circuits ?? []}
        onCircuit={(cid) => upDay((d) => (cid ? addToCircuit(d, d.items.find((x) => x.id === it.id)!, cid) : removeFromCircuit(d, it.id)))}
      />
    );
  };

  return (
    <div className="toned" style={toneStyle(plan.color)}>
      <div className="page-head">
        <input aria-label={t('plan.name')} style={{ fontSize: '1.4rem', fontWeight: 800, flex: 1 }} value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
      </div>
      <section className="card tight">
        <p className="eyebrow">{t('plan.color')}</p>
        <ColorPicker label={t('plan.color')} value={plan.color} onChange={(color) => setPlan({ ...plan, color })} />
        <p className="eyebrow" style={{ marginTop: '0.9rem' }}>
          {t('goal.label')}
        </p>
        <div className="seg" role="radiogroup" aria-label={t('goal.label')}>
          {[...GOALS, ...(plan.goal === 'other' ? ['other' as const] : [])].map((g) => (
            <button key={g} role="radio" aria-checked={plan.goal === g} className={plan.goal === g ? 'on' : ''} onClick={() => void changeGoal({ goal: g })}>
              {t(`goal.${g}`)}
            </button>
          ))}
        </div>
        {plan.goal === 'strength' && (
          <div className="seg" role="radiogroup" aria-label={t('plan.strengthMode')} style={{ marginTop: '0.5rem' }}>
            {MODES.map((m) => (
              <button key={m} role="radio" aria-checked={(plan.strengthMode ?? 'fixed') === m} className={(plan.strengthMode ?? 'fixed') === m ? 'on' : ''} onClick={() => void changeGoal({ strengthMode: m })}>
                {t(`plan.mode.${m}`)}
              </button>
            ))}
          </div>
        )}
        <p className="help" style={{ marginTop: '0.5rem' }}>
          {t(`plan.goalHelp.${plan.goal}`)} <small>· {t('plan.version', { n: version.number })}</small>
        </p>
      </section>
      <details>
        <summary>{t('plan.more')}</summary>
        <div className="form-grid">
          <label>
            {t('plan.phase')}
            <input value={plan.phase} onChange={(e) => setPlan({ ...plan, phase: e.target.value })} />
          </label>
          <label>
            {t('common.description')}
            <textarea value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
          </label>
        </div>
      </details>
      {version.locked && dirty && <p className="help">{t('plan.versionLocked', { next: version.number + 1 })}</p>}

      <div className="seg" role="tablist" style={{ margin: '0.75rem 0' }}>
        {days.map((d, i) => (
          <button key={d.id} role="tab" aria-selected={d.id === day?.id} className={`toned ${d.id === day?.id ? 'on' : ''}`} style={toneStyle(d.color)} onClick={() => (setDayIdx(i), setOpenId(undefined))}>
            {d.name || '—'}
          </button>
        ))}
        <button onClick={addDay}>+ {t('plan.addDay')}</button>
      </div>

      {!day ? (
        <div className="empty">{t('plan.noDays')}</div>
      ) : (
        <>
          <p className="help day-summary">{t('plan.daySummary', { count: day.items.length, sets: workingSets })}</p>
          <div className="row wrap" style={{ marginBottom: '0.75rem' }}>
            <label style={{ flex: 1 }}>
              {t('plan.dayName')}
              <input value={day.name} onChange={(e) => upDay((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <label>
              {t('plan.weekday')}
              <select value={day.weekday ?? ''} onChange={(e) => upDay((d) => ({ ...d, weekday: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                <option value="">—</option>
                {(t('weekday', { returnObjects: true }) as string[]).map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginBottom: '0.9rem' }}>
            <p className="eyebrow">{t('plan.dayColor')}</p>
            <ColorPicker label={t('plan.dayColor')} value={day.color} noneLabel={t('plan.samePlanColor')} onChange={(color) => upDay((d) => ({ ...d, color }))} />
          </div>

          {plan.goal === 'mixed' && (
            <section className="card tight">
              <p className="eyebrow">{t('plan.dayGoal')}</p>
              <div className="seg" role="radiogroup" aria-label={t('plan.dayGoal')}>
                {DAY_GOALS.map((g) => (
                  <button
                    key={g}
                    role="radio"
                    aria-checked={(day.goal ?? 'free') === g}
                    className={(day.goal ?? 'free') === g ? 'on' : ''}
                    onClick={() => void changeDayGoal(g === 'free' ? { goal: undefined, strengthMode: undefined } : { goal: g, strengthMode: day.strengthMode })}
                  >
                    {g === 'free' ? t('plan.dayFree') : t(`goal.${g}`)}
                  </button>
                ))}
              </div>
              {day.goal === 'strength' && (
                <div className="seg" role="radiogroup" aria-label={t('plan.strengthMode')} style={{ marginTop: '0.5rem' }}>
                  {MODES.map((m) => (
                    <button key={m} role="radio" aria-checked={(day.strengthMode ?? 'fixed') === m} className={(day.strengthMode ?? 'fixed') === m ? 'on' : ''} onClick={() => void changeDayGoal({ goal: 'strength', strengthMode: m })}>
                      {t(`plan.mode.${m}`)}
                    </button>
                  ))}
                </div>
              )}
              <p className="help" style={{ marginTop: '0.5rem' }}>
                {t(`plan.goalHelp.${day.goal ?? 'other'}`)}
              </p>
            </section>
          )}

          {day.items.length === 0 && !day.circuits?.length && <p className="empty">{t('plan.noItems')}</p>}
          {blocks(day).map((b) =>
            b.circuit ? (
              <section key={b.circuit.id} className="circuit-block" aria-label={b.circuit.name}>
                <div className="circuit-head">
                  <span className="badge">⟳ {t('circuit.label')}</span>
                  <input aria-label={t('circuit.name')} value={b.circuit.name} onChange={(e) => upDay((d) => updateCircuit(d, b.circuit!.id, { name: e.target.value }))} />
                  <button className="ghost sm" aria-label={`${t('common.moveUp')} ${b.circuit.name}`} onClick={() => upDay((d) => moveCircuit(d, b.circuit!.id, -1))}>
                    ↑
                  </button>
                  <button className="ghost sm" aria-label={`${t('common.moveDown')} ${b.circuit.name}`} onClick={() => upDay((d) => moveCircuit(d, b.circuit!.id, 1))}>
                    ↓
                  </button>
                  <button className="ghost sm" aria-label={`${t('common.remove')} ${b.circuit.name}`} onClick={() => upDay((d) => removeCircuit(d, b.circuit!.id))}>
                    ✕
                  </button>
                </div>
                <div className="circuit-rounds">
                  <span>{t('circuit.rounds')}</span>
                  <NumInput label={`${b.circuit.name} ${t('circuit.rounds')}`} value={b.circuit.rounds} onChange={(v) => v && v >= 1 && v <= 50 && upDay((d) => updateCircuit(d, b.circuit!.id, { rounds: Math.round(v) }))} />
                  <small>{t('circuit.help')}</small>
                </div>
                {b.items.map(itemCard)}
                <button className="outline" onClick={() => setPicker({ circuit: b.circuit!.id })}>
                  + {t('circuit.addExercise')}
                </button>
              </section>
            ) : (
              itemCard(b.items[0])
            ),
          )}
          <div className="add-row">
            <button className="outline xl" onClick={() => setPicker({})}>
              + {t('plan.addExercise')}
            </button>
            <button className="outline xl" onClick={newCircuit}>
              ⟳ {t('circuit.new')}
            </button>
          </div>
          <div className="row wrap" style={{ marginTop: '0.75rem' }}>
            <button className="danger sm" onClick={async () => (await dialog.confirm(t('common.confirmDelete', { name: day.name }), { danger: true, ok: t('common.delete') })) && (setDays(days.filter((d) => d.id !== day.id)), setDayIdx(0))}>
              {t('plan.removeDay')}
            </button>
          </div>
        </>
      )}

      <div className="wk-nav">
        <button className={dirty ? 'primary' : 'outline'} disabled={!dirty} onClick={() => void save()}>
          {msg || (dirty ? t('common.save') : t('common.saved'))}
        </button>
        {day && day.items.length > 0 && (
          <button className="outline" onClick={() => void startDay()}>
            ▶ {t('plan.startDay')}
          </button>
        )}
      </div>

      {picker && <ExercisePicker onPick={pick} onClose={() => setPicker(undefined)} />}
    </div>
  );
}
