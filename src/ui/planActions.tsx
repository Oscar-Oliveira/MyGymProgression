// Plans (V2-D24): the data and the ⋯ actions of a plan, shared by the plan list (Plan tab) and the page of one plan.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/db';
import { repo } from '../data/repo';
import { duplicatePlan } from '../domain/factory';
import type { Plan, PlanVersion } from '../domain/types';
import { lastEntryFinder } from '../domain/workout';
import { ActionMenu } from './components/ActionMenu';
import { dialog } from './components/Dialog';
import { ShareSheet } from './components/PlanShare';
import { toast as notify } from './components/Toast';
import { planText } from './planText';
import { useSettings } from './util';

/** Plans (sorted by name), their versions, workouts, exercises and progression states. */
export function usePlanData() {
  return useLiveQuery(async () => {
    const [plans, versions, workouts, exercises, states] = await Promise.all([db.plans.toArray(), db.planVersions.toArray(), db.workouts.toArray(), db.exercises.toArray(), db.progressionStates.toArray()]);
    return {
      plans: plans.sort((a, b) => a.name.localeCompare(b.name)),
      versions,
      workouts,
      exercises: new Map(exercises.map((e) => [e.id, e])),
      states: new Map(states.map((s) => [s.lineageId, s])),
    };
  });
}
export type PlanData = NonNullable<ReturnType<typeof usePlanData>>;

/** The ⋯ menu of a plan and the share sheet it can open. `onGone`: after the plan is deleted (the plan page leaves). */
export function usePlanActions(data: PlanData | undefined, onGone?: () => void) {
  const { t } = useTranslation();
  const s = useSettings();
  const nav = useNavigate();
  const [sharing, setSharing] = useState<Plan>();
  const ctx = data && { exercises: data.exercises, states: data.states, lastEntry: lastEntryFinder(data.workouts) };

  const duplicate = async (p: Plan) => {
    const v = data?.versions.find((x) => x.id === p.currentVersionId);
    if (!v) return;
    const d = duplicatePlan(p, v, t('plan.duplicateName', { name: p.name }));
    await repo.createPlan(d.plan, d.version);
    notify(t('plan.duplicated', { name: d.plan.name }));
  };
  const remove = async (p: Plan) => {
    if (!(await dialog.confirm(t('common.confirmDelete', { name: p.name }), { danger: true, ok: t('common.delete') }))) return;
    await repo.deletePlan(p.id);
    onGone?.();
  };
  /** Plans as text (D81), to paste in an AI chat. `only`: one version (or one day of it). */
  const copyText = async (plans: Plan[], only?: PlanVersion) => {
    if (!data || !ctx) return;
    const text = plans.flatMap((p) => {
      const v = only ?? data.versions.find((x) => x.id === p.currentVersionId);
      return v ? [planText(p, v, ctx, t, s.language)] : [];
    });
    try {
      await navigator.clipboard.writeText(text.join('\n\n'));
      notify(t('workout.textCopied'));
    } catch {
      notify(t('common.copyFailed'));
    }
  };
  const menu = (p: Plan) => (
    <ActionMenu
      title={p.name}
      actions={[
        { label: t('common.edit'), icon: 'edit', sub: t('menu.editPlanSub'), onClick: () => nav(`/plans/${p.id}`) },
        { label: t('common.duplicate'), icon: 'copy', sub: t('menu.duplicateSub'), onClick: () => void duplicate(p) },
        { label: t('share.menu'), icon: 'share', sub: t('menu.shareSub'), onClick: () => setSharing(p) },
        { label: t('plan.copyText'), icon: 'note', sub: t('menu.copyTextSub'), onClick: () => void copyText([p]) },
        {
          label: p.status === 'active' ? t('common.archive') : t('common.unarchive'),
          icon: 'archive',
          sub: p.status === 'active' ? t('menu.archiveSub') : undefined,
          onClick: () => void db.plans.put({ ...p, status: p.status === 'active' ? 'archived' : 'active' }),
        },
        { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => void remove(p) },
      ]}
    />
  );
  const sheets = sharing ? <ShareSheet plan={sharing} onClose={() => setSharing(undefined)} /> : null;
  return { menu, sheets, copyText, ctx };
}
