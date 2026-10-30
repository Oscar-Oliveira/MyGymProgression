import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { addCircuit, addToCircuit, blocks, moveCircuit, moveItem, removeCircuit, removeFromCircuit, updateCircuit } from '../../domain/circuit';
import { newDay, newPlanItem } from '../../domain/factory';
import { dayGoal, followsGoal, goalSets } from '../../domain/goals';
import type { DayGoal, Exercise, Plan, PlanDay, PlanGoal, PlanItem } from '../../domain/types';
import { ExercisePicker } from '../components/ExercisePicker';
import { NumInput } from '../components/NumInput';
import { ColorPicker } from '../components/ColorPicker';
import { toneStyle } from '../colors';
import { dialog } from '../components/Dialog';
import { ItemCard, working, type Targets } from '../components/PlanItemCard';

const GOALS: PlanGoal[] = ['hypertrophy', 'strength', 'mixed'];
/** Day goals of a mixed plan; 'free' = each exercise uses its own rule. */
const DAY_GOALS: (DayGoal | 'free')[] = ['hypertrophy', 'strength', 'free'];
type Goal = Pick<Plan, 'goal'>;
const setsLabel = (g: Goal) => (g.goal === 'hypertrophy' ? '3×8–12' : '5×5');

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
    if (next.goal === plan.goal) return;
    setPlan(next);
    await offerDefaults(next, days);
  };

  /** Changes the goal of the current day (mixed plans). */
  const changeDayGoal = async (patch: Pick<PlanDay, 'goal'>) => {
    const next = { ...day, ...patch };
    if (next.goal === day.goal) return;
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
                    onClick={() => void changeDayGoal({ goal: g === 'free' ? undefined : g })}
                  >
                    {g === 'free' ? t('plan.dayFree') : t(`goal.${g}`)}
                  </button>
                ))}
              </div>
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
