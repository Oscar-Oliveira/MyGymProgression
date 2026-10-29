import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { duplicatePlan, newPlan } from '../../domain/factory';
import type { Plan } from '../../domain/types';
import { Empty } from '../components/Bits';

export function PlanList() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [archived, setArchived] = useState(false);
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const versions = useLiveQuery(() => db.planVersions.toArray(), []);
  if (!plans || !versions) return null;
  const list = plans.filter((p) => archived || p.status === 'active').sort((a, b) => a.name.localeCompare(b.name));

  const create = async () => {
    const { plan, version } = newPlan(t('plan.new'));
    await repo.createPlan(plan, version);
    nav(`/plans/${plan.id}`);
  };
  const dup = async (p: Plan) => {
    const v = versions.find((x) => x.id === p.currentVersionId)!;
    const d = duplicatePlan(p, v, t('plan.duplicateName', { name: p.name }));
    await repo.createPlan(d.plan, d.version);
  };
  const toggleArchive = (p: Plan) => db.plans.put({ ...p, status: p.status === 'active' ? 'archived' : 'active' });
  const remove = async (p: Plan) => {
    if (confirm(t('common.confirmDelete', { name: p.name }))) await repo.deletePlan(p.id);
  };

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{t('plan.title')}</h1>
        <button onClick={() => void create()}>+ {t('plan.new')}</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {t('plan.showArchived')}
      </label>
      {list.length === 0 ? (
        <Empty>{t('plan.empty')}</Empty>
      ) : (
        <div className="card">
          <ul className="list">
            {list.map((p) => {
              const v = versions.find((x) => x.id === p.currentVersionId);
              return (
                <li key={p.id} className="row between wrap">
                  <span>
                    <Link to={`/plans/${p.id}`}>
                      <strong>{p.name}</strong>
                    </Link>{' '}
                    {p.status === 'archived' && <span className="badge neutral">{t('plan.archived')}</span>}
                    <br />
                    <small>
                      {t(`goal.${p.goal}`)} · {v?.days.length ?? 0} {t('plan.days').toLowerCase()} · {t('plan.version', { n: v?.number ?? 1 })}
                      {p.phase && ` · ${p.phase}`}
                    </small>
                  </span>
                  <span className="row wrap">
                    <button className="ghost" onClick={() => void dup(p)}>
                      {t('common.duplicate')}
                    </button>
                    <button className="ghost" onClick={() => void toggleArchive(p)}>
                      {p.status === 'active' ? t('common.archive') : t('common.unarchive')}
                    </button>
                    <button className="ghost" onClick={() => void remove(p)}>
                      {t('common.delete')}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
