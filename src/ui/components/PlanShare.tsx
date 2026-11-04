import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { repo } from '../../data/repo';
import type { Plan } from '../../domain/types';
import { Modal } from './Modal';
import { toast } from './Toast';
import { dayShare, encodeCompact, planShare, encodeShare, qrLink } from '../../domain/share';
import { QrCode } from './Qr';
import { shareFile } from '../util';
import { Icon } from './Icon';

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
export function ShareSheet({ plan, onClose }: { plan: Plan; onClose: () => void }) {
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
