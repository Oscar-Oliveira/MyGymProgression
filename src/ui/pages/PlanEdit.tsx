import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { newDay, newPlanItem } from '../../domain/factory';
import { initialTargets } from '../../domain/progression';
import type { Exercise, ItemRole, MetricKey, Plan, PlanDay, PlanGoal, PlanItem, ProgressionState } from '../../domain/types';
import { ProgressionEditor } from '../components/Editors';
import { PrescriptionEditor } from '../components/Editors';
import { ExercisePicker } from '../components/ExercisePicker';
import { Modal } from '../components/Modal';
import { NumInput } from '../components/NumInput';
import { metricLabel } from '../util';

const GOALS: PlanGoal[] = ['hypertrophy', 'strength', 'mixed', 'other'];
const ROLES: ItemRole[] = ['warmup', 'main', 'optional'];

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/** Metrics whose current target can be adjusted: progression variables, or (manual) any fixed-value target. */
function adjustableMetrics(item: PlanItem, ex: Exercise): MetricKey[] {
  const cfg = item.progression ?? ex.progression;
  if (cfg.steps.length) return cfg.steps.map((s) => s.metric);
  const w = item.sets.find((s) => s.kind === 'working');
  return (Object.keys(w?.targets ?? {}) as MetricKey[]).filter((k) => w?.targets[k]?.value !== undefined);
}

function AdjustModal({ item, ex, state, onClose }: { item: PlanItem; ex: Exercise; state?: ProgressionState; onClose: () => void }) {
  const { t } = useTranslation();
  const keys = adjustableMetrics(item, ex);
  const base = state?.targets ?? initialTargets({ ...(item.progression ?? ex.progression), steps: keys.map((k) => ({ metric: k, increment: 0 })) }, item.sets);
  const [vals, setVals] = useState<Partial<Record<MetricKey, number>>>(base);
  const [reason, setReason] = useState('');
  const save = async () => {
    await repo.manualAdjust(item.lineageId, ex.id, vals, reason, (item.progression ?? ex.progression).strategy);
    onClose();
  };
  return (
    <Modal title={t('progression.adjust')} onClose={onClose}>
      <div className="stack-sm">
        {keys.map((k) => (
          <label key={k}>
            {metricLabel(t, k, ex.metrics)} ({ex.metrics.find((m) => m.key === k)?.unit})
            <NumInput label={metricLabel(t, k, ex.metrics)} value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} />
          </label>
        ))}
        <label>
          {t('progression.reason')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button onClick={() => void save()}>{t('common.save')}</button>
      </div>
    </Modal>
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
  const [picker, setPicker] = useState<{ day: number; item?: number }>();
  const [adjust, setAdjust] = useState<PlanItem>();
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (stored?.plan && stored.version && (!plan || plan.currentVersionId !== stored.plan.currentVersionId)) {
      setPlan(stored.plan);
      setDays(structuredClone(stored.version.days));
    }
  }, [stored, plan]);
  if (!stored || !exercises || !states) return null;
  if (!stored.plan || !plan || !stored.version) return <p>{t('plan.empty')}</p>;
  const version = stored.version;
  const meta = (p: Plan) => JSON.stringify({ ...p, updatedAt: '', currentVersionId: '' });
  const dirty = JSON.stringify(days) !== JSON.stringify(version.days) || meta(plan) !== meta(stored.plan);

  const upDay = (i: number, f: (d: PlanDay) => PlanDay) => setDays(days.map((d, j) => (j === i ? f(structuredClone(d)) : d)));
  const upItem = (di: number, ii: number, patch: Partial<PlanItem>) => upDay(di, (d) => ({ ...d, items: d.items.map((x, j) => (j === ii ? { ...x, ...patch } : x)) }));

  const save = async () => {
    if (!plan.name.trim()) return;
    await repo.savePlan(plan, days);
    setMsg(t('common.saved'));
    setTimeout(() => setMsg(''), 1500);
  };
  const startDay = async (dayId: string) => {
    if (dirty) await repo.savePlan(plan, days);
    nav(`/workout/${await repo.startWorkout(plan.id, dayId)}`);
  };
  const pick = (ex: Exercise) => {
    if (!picker) return;
    if (picker.item === undefined) upDay(picker.day, (d) => ({ ...d, items: [...d.items, newPlanItem(ex)] }));
    else {
      const it = days[picker.day].items[picker.item];
      upItem(picker.day, picker.item, { substitutes: [...it.substitutes, ex.id] });
    }
    setPicker(undefined);
  };

  return (
    <div className="stack">
      <h1>{plan.name || t('plan.new')}</h1>
      {version.locked && dirty && <p className="help">{t('plan.versionLocked', { n: version.number, next: version.number + 1 })}</p>}
      <section className="card form-grid">
        <label>
          {t('plan.name')}
          <input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
        </label>
        <label>
          {t('goal.label')}
          <select value={plan.goal} onChange={(e) => setPlan({ ...plan, goal: e.target.value as PlanGoal })}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {t(`goal.${g}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('plan.phase')}
          <input value={plan.phase} onChange={(e) => setPlan({ ...plan, phase: e.target.value })} />
        </label>
        <label>
          {t('common.description')}
          <textarea value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
        </label>
        <p className="muted">{t('plan.version', { n: version.number })}</p>
      </section>

      <h2>{t('plan.days')}</h2>
      {days.length === 0 && <p className="muted">{t('plan.noDays')}</p>}
      {days.map((d, di) => (
        <section className="card stack-sm" key={d.id}>
          <div className="row wrap">
            <label>
              {t('plan.dayName')}
              <input value={d.name} onChange={(e) => upDay(di, (x) => ({ ...x, name: e.target.value }))} />
            </label>
            <label>
              {t('plan.weekday')}
              <select value={d.weekday ?? ''} onChange={(e) => upDay(di, (x) => ({ ...x, weekday: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                <option value="">—</option>
                {(t('weekday', { returnObjects: true }) as string[]).map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <span className="spacer" />
            <button className="ghost" aria-label={t('common.moveUp')} onClick={() => setDays(move(days, di, -1))}>
              ↑
            </button>
            <button className="ghost" aria-label={t('common.moveDown')} onClick={() => setDays(move(days, di, 1))}>
              ↓
            </button>
            <button className="ghost" onClick={() => confirm(t('common.confirmDelete', { name: d.name })) && setDays(days.filter((_, j) => j !== di))}>
              {t('common.remove')}
            </button>
            {d.items.length > 0 && <button onClick={() => void startDay(d.id)}>▶ {t('plan.startDay')}</button>}
          </div>

          {d.items.length === 0 && <p className="muted">{t('plan.noItems')}</p>}
          {d.items.map((it, ii) => {
            const ex = exercises.get(it.exerciseId);
            if (!ex) return null;
            const cfg = it.progression ?? ex.progression;
            const st = states.get(it.lineageId);
            return (
              <details className="card" key={it.id} open={!it.sets.length}>
                <summary className="row wrap">
                  {it.group && <span className="group">{it.group}</span>}
                  <strong>{ex.name}</strong>
                  <small>
                    {it.sets.filter((s) => s.kind === 'working').length} × · {t(`role.${it.role}`)} · {t(`strategy.${cfg.strategy}`)}
                    {st && ` · ${Object.entries(st.targets).map(([k, v]) => `${metricLabel(t, k as MetricKey, ex.metrics)} ${v}`).join(', ')}`}
                  </small>
                </summary>
                <div className="stack-sm">
                  <div className="row wrap">
                    <label>
                      {t('plan.role')}
                      <select value={it.role} onChange={(e) => upItem(di, ii, { role: e.target.value as ItemRole })}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`role.${r}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('plan.group')}
                      <input className="w-4" placeholder="A" value={it.group ?? ''} onChange={(e) => upItem(di, ii, { group: e.target.value.trim() || undefined })} />
                    </label>
                    <span className="spacer" />
                    <button className="ghost" aria-label={t('common.moveUp')} onClick={() => upDay(di, (x) => ({ ...x, items: move(x.items, ii, -1) }))}>
                      ↑
                    </button>
                    <button className="ghost" aria-label={t('common.moveDown')} onClick={() => upDay(di, (x) => ({ ...x, items: move(x.items, ii, 1) }))}>
                      ↓
                    </button>
                    <button className="ghost" onClick={() => upDay(di, (x) => ({ ...x, items: x.items.filter((_, j) => j !== ii) }))}>
                      {t('common.remove')}
                    </button>
                  </div>
                  <PrescriptionEditor sets={it.sets} metrics={ex.metrics} onChange={(sets) => upItem(di, ii, { sets })} />
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!it.progression}
                      onChange={(e) => upItem(di, ii, { progression: e.target.checked ? structuredClone(ex.progression) : undefined })}
                    />
                    {t('plan.customProgression')}
                  </label>
                  {it.progression ? (
                    <ProgressionEditor config={it.progression} metrics={ex.metrics} onChange={(progression) => upItem(di, ii, { progression })} />
                  ) : (
                    <p className="help">
                      {t(`strategy.${ex.progression.strategy}`)}: {t(`strategy.help.${ex.progression.strategy}`)}
                    </p>
                  )}
                  {cfg.strategy !== 'none' && (
                    <div className="row wrap">
                      <span>
                        {t('plan.state')}:{' '}
                        {st ? Object.entries(st.targets).map(([k, v]) => `${metricLabel(t, k as MetricKey, ex.metrics)} ${v}`).join(', ') : '—'}
                      </span>
                      <button className="secondary" onClick={() => setAdjust(it)}>
                        {t('progression.adjust')}
                      </button>
                    </div>
                  )}
                  <div>
                    <strong>{t('plan.substitutes')}:</strong>{' '}
                    {it.substitutes.map((sid) => (
                      <span key={sid} className="tag">
                        {exercises.get(sid)?.name ?? sid}{' '}
                        <button className="ghost" aria-label={t('common.remove')} onClick={() => upItem(di, ii, { substitutes: it.substitutes.filter((x) => x !== sid) })}>
                          ✕
                        </button>
                      </span>
                    ))}
                    <button className="ghost" onClick={() => setPicker({ day: di, item: ii })}>
                      + {t('common.add')}
                    </button>
                  </div>
                  <label>
                    {t('common.notes')}
                    <input value={it.notes} onChange={(e) => upItem(di, ii, { notes: e.target.value })} />
                  </label>
                </div>
              </details>
            );
          })}
          <button className="secondary" onClick={() => setPicker({ day: di })}>
            + {t('plan.addExercise')}
          </button>
        </section>
      ))}
      <button className="secondary" onClick={() => setDays([...days, newDay(`${t('plan.dayName')} ${days.length + 1}`)])}>
        + {t('plan.addDay')}
      </button>

      <div className="sticky-actions">
        <button disabled={!dirty} onClick={() => void save()}>
          {t('common.save')}
        </button>
        {dirty && <span className="muted">{t('plan.unsaved')}</span>}
        {msg && <span role="status">{msg}</span>}
      </div>

      {picker && <ExercisePicker onPick={pick} onClose={() => setPicker(undefined)} />}
      {adjust && exercises.get(adjust.exerciseId) && (
        <AdjustModal item={adjust} ex={exercises.get(adjust.exerciseId)!} state={states.get(adjust.lineageId)} onClose={() => setAdjust(undefined)} />
      )}
    </div>
  );
}
