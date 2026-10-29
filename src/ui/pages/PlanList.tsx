import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { duplicatePlan, newPlan } from '../../domain/factory';
import type { Plan } from '../../domain/types';
import { Empty } from '../components/Bits';
import { ThumbStack } from '../components/ExerciseItem';
import { Modal } from '../components/Modal';
import { dialog } from '../components/Dialog';

export function PlanList() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [archived, setArchived] = useState(false);
  const [menu, setMenu] = useState<Plan>();
  const data = useLiveQuery(async () => ({
    plans: await db.plans.toArray(),
    versions: await db.planVersions.toArray(),
    exercises: new Map((await db.exercises.toArray()).map((e) => [e.id, e])),
  }));
  if (!data) return null;
  const { plans, versions, exercises } = data;
  const list = plans.filter((p) => archived || p.status === 'active').sort((a, b) => a.name.localeCompare(b.name));

  const create = async () => {
    const { plan, version } = newPlan(t('plan.new'));
    await repo.createPlan(plan, version);
    nav(`/plans/${plan.id}`);
  };
  const act = async (f: () => Promise<unknown>) => {
    setMenu(undefined);
    await f();
  };

  return (
    <div>
      <div className="page-head">
        <h1>{t('plan.title')}</h1>
        <button className="primary" onClick={() => void create()}>
          + {t('plan.new')}
        </button>
      </div>
      {list.length === 0 ? (
        <Empty>{t('plan.empty')}</Empty>
      ) : (
        list.map((p) => {
          const v = versions.find((x) => x.id === p.currentVersionId);
          const items = (v?.days ?? []).flatMap((d) => d.items).map((i) => exercises.get(i.exerciseId)).filter((e) => !!e);
          return (
            <div key={p.id} className="card nav-row" style={{ padding: '0.8rem 1rem', marginBottom: '0.5rem' }}>
              <Link to={`/plans/${p.id}`} className="main" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="title">
                  {p.name} {p.status === 'archived' && <span className="pill">{t('plan.archived')}</span>}
                </span>
                <span className="meta">
                  <span className="pill">{t(`goal.${p.goal}`)}</span>
                  {(v?.days ?? []).map((d) => d.name).join(' · ') || t('plan.noDays')}
                </span>
                <span className="meta">
                  <ThumbStack items={items.map((e) => ({ name: e.name, thumb: e.thumb }))} />
                </span>
              </Link>
              <button className="ghost" aria-label={`${t('plan.actions')} ${p.name}`} onClick={() => setMenu(p)}>
                ⋯
              </button>
            </div>
          );
        })
      )}
      <label className="check">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {t('plan.showArchived')}
      </label>

      {menu && (
        <Modal title={menu.name} onClose={() => setMenu(undefined)}>
          <div className="sheet">
            <button
              onClick={() =>
                void act(async () => {
                  const v = versions.find((x) => x.id === menu.currentVersionId)!;
                  const d = duplicatePlan(menu, v, t('plan.duplicateName', { name: menu.name }));
                  await repo.createPlan(d.plan, d.version);
                })
              }
            >
              {t('common.duplicate')}
            </button>
            <button onClick={() => void act(() => db.plans.put({ ...menu, status: menu.status === 'active' ? 'archived' : 'active' }))}>
              {menu.status === 'active' ? t('common.archive') : t('common.unarchive')}
            </button>
            <button className="danger" onClick={() => void act(async () => (await dialog.confirm(t('common.confirmDelete', { name: menu.name }), { danger: true, ok: t('common.delete') })) && repo.deletePlan(menu.id))}>
              {t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
