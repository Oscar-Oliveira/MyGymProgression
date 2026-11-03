import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { parseBundle, planMerge, type Bundle, type DataSet } from '../../domain/interchange';
import { decodeShare } from '../../domain/share';
import { toneStyle } from '../colors';
import { Empty, PageHead } from '../components/Bits';
import { Icon } from '../components/Icon';

/** Page opened by a shared plan link (#/share?d=…): shows the plan, then imports it as a new plan. */
export function ShareImport() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [bundle, setBundle] = useState<Bundle>();
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      const text = await decodeShare(params.get('d') ?? '');
      const r = text ? parseBundle(text) : undefined;
      if (!r?.ok || r.bundle.data.plans.length !== 1) return setError(true);
      setBundle(r.bundle);
    })();
  }, [params]);

  if (error)
    return (
      <Empty
        action={
          <Link className="btn outline" to="/">
            {t('nav.home')}
          </Link>
        }
      >
        {t('share.invalid')}
      </Empty>
    );
  return bundle ? <SharePreview bundle={bundle} /> : null;
}

/** A shared plan (from a link or QR codes): its days and exercises, then "import" adds it as a new plan. */
export function SharePreview({ bundle }: { bundle: Bundle }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [merged, setMerged] = useState<DataSet>();

  useEffect(() => {
    // The shared plan has new ids; exercises already in the library (same id, or same name and equipment) are reused.
    void (async () => setMerged(planMerge(bundle.data, await repo.readAll(), 'skip', 'useExisting')))();
  }, [bundle]);

  if (!merged) return null;
  const plan = bundle.data.plans[0];
  const days = bundle.data.planVersions[0]?.days ?? [];
  const names = new Map(bundle.data.exercises.map((e) => [e.id, e.name]));
  const commit = async () => {
    await repo.importMerge(merged);
    nav(`/plans/${merged.plans[0]?.id ?? plan.id}`, { replace: true });
  };

  return (
    <div className="toned" style={toneStyle(plan.color)}>
      <PageHead eyebrow={t('share.title')} title={plan.name} sub={t(`goal.${plan.goal}`)} />
      {days.map((d) => (
        <section key={d.id} className="card">
          <h3>{d.name}</h3>
          <p className="muted">{d.items.map((i) => names.get(i.exerciseId) ?? '?').join(' · ')}</p>
        </section>
      ))}
      <p className="help">{t('share.exercises', { added: merged.exercises.length, existing: bundle.data.exercises.length - merged.exercises.length })}</p>
      <p className="help">{t('share.help')}</p>
      <button className="primary xl" onClick={() => void commit()}>
        <Icon name="upload" /> {t('share.import')}
      </button>
    </div>
  );
}
