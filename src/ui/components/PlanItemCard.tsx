import { useTranslation } from 'react-i18next';
import { goalProgression } from '../../domain/goals';
import type { Circuit, Exercise, ItemRole, MetricKey, Plan, PlanItem, ProgressionState, SetPrescription } from '../../domain/types';
import { PrescriptionEditor, ProgressionEditor } from './Editors';
import { NumInput } from './NumInput';
import { Thumb } from './Thumb';
import { fmtValue, metricLabel, useSettings } from '../util';


type Goal = Pick<Plan, 'goal'>;
const ROLES: ItemRole[] = ['warmup', 'main', 'optional'];
export type Targets = Partial<Record<MetricKey, number>>;

export const working = (sets: SetPrescription[]) => sets.filter((s) => s.kind === 'working');
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

export function ItemCard({ plan, item, ex, state, edits, exercises, onChange, onTarget, onRemove, onMove, onAddSubstitute, open, onToggle, circuits, onCircuit }: ItemProps) {
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