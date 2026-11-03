import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { duplicatePlan, newPlan } from '../../domain/factory';
import type { Plan } from '../../domain/types';
import { Empty, PageHead } from '../components/Bits';
import { ThumbStack } from '../components/ExerciseItem';
import { Modal } from '../components/Modal';
import { ActionMenu } from '../components/ActionMenu';
import { toast } from '../components/Toast';
import { dialog } from '../components/Dialog';
import { toneStyle } from '../colors';
import { dayShare, encodeCompact, planShare, encodeShare, qrLink } from '../../domain/share';
import { QrCode } from '../components/Qr';
import { shareFile } from '../util';
import { Icon } from '../components/Icon';

/** QR codes of a plan, one per day (D60): the other person reads one day, or all of them for the whole plan. */
function QrSheet({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { t } = useTranslation();
  const [codes, setCodes] = useState<{ name: string; link: string }[]>();
  const [i, setI] = useState(0);
  useEffect(() => {
    void (async () => {
      const all = await repo.readAll();
      const v = all.planVersions.find((x) => x.id === plan.currentVersionId);
      const days = v?.days ?? [];
      const base = `${location.origin}${location.pathname}`;
      // The version id groups the days: after an edit of the plan, its codes are a new group.
      const group = v?.id.slice(0, 8) ?? '';
      const code = async (dayId: string) => encodeCompact(dayShare(all, plan.id, dayId, __APP_VERSION__)!);
      setCodes(await Promise.all(days.map(async (d, index) => ({ name: d.name, link: qrLink(base, { code: await code(d.id), group, index, total: days.length }) }))));
    })();
  }, [plan]);
  const day = codes?.[i];
  return (
    <Modal title={`${t('share.qr')}: ${plan.name}`} onClose={onClose}>
      {codes && !day && <p className="muted">{t('plan.noDays')}</p>}
      {day && (
        <>
          <div className="pager" style={{ marginTop: 0 }}>
            <button className="outline" disabled={i <= 0} aria-label={t('history.prev')} onClick={() => setI(i - 1)}>
              <Icon name="chevronLeft" />
            </button>
            <span className="pager-info" aria-live="polite">
              {t('share.qrDay', { i: i + 1, n: codes.length, name: day.name })}
            </span>
            <button className="outline" disabled={i >= codes.length - 1} aria-label={t('history.next')} onClick={() => setI(i + 1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
          <QrCode text={day.link} label={day.name} fallback={<p className="help">{t('share.qrTooBig')}</p>} />
          <p className="help">{t('share.qrHelp')}</p>
        </>
      )}
    </Modal>
  );
}

/** Share window of one plan: QR codes, a link (without library text and images, to stay short) or a file (complete). */
function ShareSheet({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState(false);
  const file = async () => {
    const b = planShare(await repo.readAll(), plan.id, __APP_VERSION__);
    if (b) await shareFile(`${plan.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.mygymprogression.json`, JSON.stringify(b, null, 2));
  };
  const link = async () => {
    const b = planShare(await repo.readAll(), plan.id, __APP_VERSION__, true);
    if (!b) return;
    const url = `${location.origin}${location.pathname}#/share?d=${await encodeShare(b)}`;
    if (matchMedia('(pointer: coarse)').matches && navigator.share) {
      try {
        return await navigator.share({ title: plan.name, url });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share.copied'));
    } catch {
      toast(t('common.copyFailed'));
    }
  };
  if (qr) return <QrSheet plan={plan} onClose={onClose} />;
  return (
    <Modal title={`${t('share.menu')}: ${plan.name}`} onClose={onClose}>
      <p className="help" style={{ marginTop: 0 }}>{t('share.help2')}</p>
      <div className="sheet">
        <button onClick={() => setQr(true)}><Icon name="qr" /> {t('share.qr')}</button>
        <button onClick={() => void link()}><Icon name="link" /> {t('share.link')}</button>
        <button onClick={() => void file()}><Icon name="download" /> {t('share.file')}</button>
      </div>
      <p className="help">{t('share.fileHelp')}</p>
    </Modal>
  );
}

export function PlanList() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [archived, setArchived] = useState(false);
  const [sharing, setSharing] = useState<Plan>();
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
  const duplicate = async (p: Plan) => {
    const v = versions.find((x) => x.id === p.currentVersionId)!;
    const d = duplicatePlan(p, v, t('plan.duplicateName', { name: p.name }));
    await repo.createPlan(d.plan, d.version);
  };
  const remove = async (p: Plan) => {
    if (await dialog.confirm(t('common.confirmDelete', { name: p.name }), { danger: true, ok: t('common.delete') })) await repo.deletePlan(p.id);
  };

  return (
    <div>
      <PageHead
        title={t('plan.title')}
        count={t('plan.count', { count: plans.filter((p) => p.status === 'active').length })}
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
      {list.length === 0 ? (
        <Empty>{t('plan.empty')}</Empty>
      ) : (
        list.map((p) => {
          const v = versions.find((x) => x.id === p.currentVersionId);
          const items = (v?.days ?? []).flatMap((d) => d.items).map((i) => exercises.get(i.exerciseId)).filter((e) => !!e);
          return (
            <div key={p.id} className="card nav-row toned tone-bar" style={{ padding: '0.8rem 1rem', marginBottom: '0.5rem', ...toneStyle(p.color) }}>
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
              <ActionMenu
                title={p.name}
                actions={[
                  { label: t('common.duplicate'), onClick: () => void duplicate(p) },
                  { label: t('share.menu'), onClick: () => setSharing(p) },
                  { label: p.status === 'active' ? t('common.archive') : t('common.unarchive'), onClick: () => void db.plans.put({ ...p, status: p.status === 'active' ? 'archived' : 'active' }) },
                  { label: t('common.delete'), danger: true, onClick: () => void remove(p) },
                ]}
              />
            </div>
          );
        })
      )}
      <label className="check">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {t('plan.showArchived')}
      </label>

      {sharing && <ShareSheet plan={sharing} onClose={() => setSharing(undefined)} />}
    </div>
  );
}
