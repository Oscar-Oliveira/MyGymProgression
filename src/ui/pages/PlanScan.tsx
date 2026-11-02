import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseBundle, type Bundle } from '../../domain/interchange';
import { decodeShare, joinDays, parseQrLink } from '../../domain/share';
import { QrScanner } from '../components/Qr';
import { SharePreview } from './ShareImport';

interface Group {
  id: string;
  total: number;
  days: Map<number, Bundle>;
}

/**
 * Reads the QR codes of a shared plan, one per day (D60), in any order. Codes of the same plan are joined;
 * a code of another plan starts again with that plan. "Import" shows the usual preview with the days read.
 */
export function PlanScan() {
  const { t } = useTranslation();
  const [group, setGroup] = useState<Group>();
  // The latest group, for codes read before the page draws again.
  const current = useRef<Group>(undefined);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState<Bundle>();

  const onText = async (text: string) => {
    const q = parseQrLink(text);
    const json = q && (await decodeShare(q.code));
    const r = json ? parseBundle(json) : undefined;
    if (!q || !r?.ok || r.bundle.data.plans.length !== 1) return setMsg(t('scan.notPlan'));
    const g = current.current;
    const same = g?.id === q.group;
    if (same && g.days.has(q.index)) return;
    const next = { id: q.group, total: q.total, days: new Map(same ? g.days : []).set(q.index, r.bundle) };
    current.current = next;
    setGroup(next);
    setMsg(g && !same ? t('scan.other', { name: r.bundle.data.plans[0].name }) : t('scan.read', { name: r.bundle.data.planVersions[0]?.days[0]?.name ?? '' }));
    navigator.vibrate?.(40);
  };

  if (preview)
    return (
      <>
        <button type="button" className="outline" style={{ marginBottom: '0.75rem' }} onClick={() => setPreview(undefined)}>
          ‹ {t('scan.more')}
        </button>
        <SharePreview bundle={preview} />
      </>
    );
  const read = group ? [...group.days].sort(([a], [b]) => a - b).map(([, b]) => b) : [];
  return (
    <div>
      <div className="page-head">
        <h1>{t('scan.title')}</h1>
      </div>
      <p className="help">{t('scan.help')}</p>
      <QrScanner onText={(x) => void onText(x)} />
      {msg && (
        <p role="status" className="muted">
          {msg}
        </p>
      )}
      {group && (
        <section className="card">
          <h2>{read[0].data.plans[0].name}</h2>
          <ul className="scan-days">
            {Array.from({ length: group.total }, (_, i) => {
              const b = group.days.get(i);
              return b ? (
                <li key={i} className="ok">
                  ✓ {b.data.planVersions[0]?.days[0]?.name}
                </li>
              ) : (
                <li key={i} className="muted">
                  {t('scan.missing', { i: i + 1 })}
                </li>
              );
            })}
          </ul>
          <button className="primary xl" style={{ width: '100%' }} onClick={() => setPreview(joinDays(read))}>
            {t('scan.import', { count: group.days.size })}
          </button>
        </section>
      )}
    </div>
  );
}
