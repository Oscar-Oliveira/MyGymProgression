import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { parseBundle, planMerge, type Bundle, type DataSet } from '../../domain/interchange';
import { decodeShare } from '../../domain/share';
import { toneStyle } from '../colors';

/** Page opened by a shared plan link (#/share?d=…): shows the plan, then imports it as a new plan. */
export function ShareImport() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [bundle, setBundle] = useState<Bundle>();
  const [merged, setMerged] = useState<DataSet>();
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      const text = await decodeShare(params.get('d') ?? '');
      const r = text ? parseBundle(text) : undefined;
      if (!r?.ok || r.bundle.data.plans.length !== 1) return setError(true);
      setBundle(r.bundle);
      // The shared plan has new ids; exercises already in the library (same id, or same name and equipment) are reused.
      setMerged(planMerge(r.bundle.data, await repo.readAll(), 'skip', 'useExisting'));
    })();
  }, [params]);

  if (error)
    return (
      <div className="empty">
        <p>{t('share.invalid')}</p>
        <Link to="/">{t('nav.home')}</Link>
      </div>
    );
  if (!bundle || !merged) return null;
  const plan = bundle.data.plans[0];
  const days = bundle.data.planVersions[0]?.days ?? [];
  const names = new Map(bundle.data.exercises.map((e) => [e.id, e.name]));
  const commit = async () => {
    await repo.importMerge(merged);
    nav(`/plans/${merged.plans[0]?.id ?? plan.id}`, { replace: true });
  };

  return (
    <div className="toned" style={toneStyle(plan.color)}>
      <div className="page-head">
        <div>
          <p className="eyebrow">{t('share.title')}</p>
          <h1>{plan.name}</h1>
          <small>{t(`goal.${plan.goal}`)}</small>
        </div>
      </div>
      {days.map((d) => (
        <section key={d.id} className="card">
          <h3 style={{ marginTop: 0 }}>{d.name}</h3>
          <p className="muted">{d.items.map((i) => names.get(i.exerciseId) ?? '?').join(' · ')}</p>
        </section>
      ))}
      <p className="help">{t('share.exercises', { added: merged.exercises.length, existing: bundle.data.exercises.length - merged.exercises.length })}</p>
      <p className="help">{t('share.help')}</p>
      <button className="primary xl" onClick={() => void commit()}>
        ⤒ {t('share.import')}
      </button>
    </div>
  );
}
