import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { duplicatePlan, newPlan } from '../../domain/factory';
import type { Plan } from '../../domain/types';
import { lastEntryFinder, nextDay, startWorkout } from '../../domain/workout';
import { Empty, PageHead } from '../components/Bits';
import { ActionMenu } from '../components/ActionMenu';
import { DayCard } from '../components/DayCard';
import { dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { PlanAuditCard } from '../components/PlanAuditCard';
import { ShareSheet } from '../components/PlanShare';
import { toneStyle } from '../colors';
import { planText } from '../planText';
import { useStart } from '../start';
import { toast as notify } from '../components/Toast';
import { useSettings } from '../util';

/**
 * Train (D77): the plans and their days in one place. Each day starts a workout; each plan opens its editor,
 * shows its balance and has the other actions in ⋯. Archived plans are listed below when asked.
 */
export function Train() {
  const { t } = useTranslation();
  const s = useSettings();
  const nav = useNavigate();
  const start = useStart();
  const [archived, setArchived] = useState(false);
  const [sharing, setSharing] = useState<Plan>();
  const data = useLiveQuery(async () => {
    const [plans, versions, workouts, exercises, states] = await Promise.all([db.plans.toArray(), db.planVersions.toArray(), db.workouts.toArray(), db.exercises.toArray(), db.progressionStates.toArray()]);
    return { plans: plans.sort((a, b) => a.name.localeCompare(b.name)), versions, workouts, exercises: new Map(exercises.map((e) => [e.id, e])), states: new Map(states.map((s) => [s.lineageId, s])) };
  });
  if (!data) return null;
  const active = data.plans.filter((p) => p.status === 'active');
  const old = data.plans.filter((p) => p.status === 'archived');
  const ctx = { exercises: data.exercises, states: data.states, lastEntry: lastEntryFinder(data.workouts) };

  const create = async () => {
    const { plan, version } = newPlan(t('plan.new'));
    await repo.createPlan(plan, version);
    nav(`/plans/${plan.id}`);
  };
  const duplicate = async (p: Plan) => {
    const v = data.versions.find((x) => x.id === p.currentVersionId)!;
    const d = duplicatePlan(p, v, t('plan.duplicateName', { name: p.name }));
    await repo.createPlan(d.plan, d.version);
  };
  const remove = async (p: Plan) => {
    if (await dialog.confirm(t('common.confirmDelete', { name: p.name }), { danger: true, ok: t('common.delete') })) await repo.deletePlan(p.id);
  };
  /** Plans as text (D81), to paste in an AI chat. */
  const copyText = async (plans: Plan[]) => {
    const text = plans.flatMap((p) => {
      const v = data.versions.find((x) => x.id === p.currentVersionId);
      return v ? [planText(p, v, ctx, t, s.language)] : [];
    });
    try {
      await navigator.clipboard.writeText(text.join('\n\n'));
      notify(t('workout.textCopied'));
    } catch {
      notify(t('common.copyFailed'));
    }
  };
  const actions = (p: Plan) => (
    <ActionMenu
      title={p.name}
      actions={[
        { label: t('common.duplicate'), onClick: () => void duplicate(p) },
        { label: t('share.menu'), onClick: () => setSharing(p) },
        { label: t('plan.copyText'), onClick: () => void copyText([p]) },
        { label: p.status === 'active' ? t('common.archive') : t('common.unarchive'), onClick: () => void db.plans.put({ ...p, status: p.status === 'active' ? 'archived' : 'active' }) },
        { label: t('common.delete'), danger: true, onClick: () => void remove(p) },
      ]}
    />
  );

  return (
    <div>
      <PageHead
        title={t('train.title')}
        count={active.length > 0 ? t('plan.count', { count: active.length }) : undefined}
        aside={
          <>
            <Link className="btn outline" to="/plans/scan">
              <Icon name="qr" /> {t('scan.open')}
            </Link>
            <button className="primary" onClick={() => void create()}>
              <Icon name="plus" /> {t('plan.new')}
            </button>
          </>
        }
      />
      {active.length === 0 && (
        <Empty
          action={
            <button className="btn primary" onClick={() => void create()}>
              {t('home.createPlan')}
            </button>
          }
        >
          {t('train.noPlans')}
        </Empty>
      )}
      {active.map((p) => {
        const v = data.versions.find((x) => x.id === p.currentVersionId);
        if (!v) return null;
        const next = nextDay(v, data.workouts);
        return (
          <section key={p.id} className="plan-block">
            <div className="section-head toned plan-head" style={toneStyle(p.color)}>
              <h2 className="row">
                <span className="tone-dot" />
                <Link to={`/plans/${p.id}`}>{p.name}</Link>
              </h2>
              <span className="row">
                <span className="pill">{t(`goal.${p.goal}`)}</span>
                <Link className="btn outline sm" to={`/plans/${p.id}`}>
                  {t('common.edit')}
                </Link>
                {actions(p)}
              </span>
            </div>
            {v.days.length === 0 ? (
              <Empty>{t('plan.noDays')}</Empty>
            ) : (
              v.days.map((d) => <DayCard key={d.id} plan={p} day={d} entries={startWorkout(p, v, d, ctx).entries} exercises={data.exercises} next={d.id === next?.id} onStart={() => void start(p.id, d.id)} />)
            )}
            {v.days.some((d) => d.items.length > 0) && <PlanAuditCard id={`plan-audit:${p.id}`} days={v.days} exercises={data.exercises} />}
          </section>
        );
      })}
      <button className="ghost xl" onClick={() => void start()}>
        <Icon name="plus" /> {t('workout.free')}
      </button>
      {active.length > 1 && (
        <button className="ghost" onClick={() => void copyText(active)}>
          {t('plan.copyAll')}
        </button>
      )}

      {old.length > 0 && (
        <label className="check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {t('plan.showArchived')}
        </label>
      )}
      {archived &&
        old.map((p) => (
          <div key={p.id} className="card nav-row toned tone-bar plan-row" style={toneStyle(p.color)}>
            <Link to={`/plans/${p.id}`} className="main">
              <span className="title">
                {p.name} <span className="pill">{t('plan.archived')}</span>
              </span>
              <span className="meta">{t(`goal.${p.goal}`)}</span>
            </Link>
            {actions(p)}
          </div>
        ))}

      {sharing && <ShareSheet plan={sharing} onClose={() => setSharing(undefined)} />}
    </div>
  );
}
