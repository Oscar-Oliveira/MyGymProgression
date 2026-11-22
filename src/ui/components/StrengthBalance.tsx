// Strength balance card (V2-D19): best estimated 1RM of the main barbell lifts and the four ratios against reference ranges.
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { BALANCE_DAYS, bestLifts, LIFTS, strengthBalance, type BalanceRow, type Lift } from '../../domain/balance';
import { convert } from '../../domain/units';
import { fmtNum, useSettings } from '../util';

/** Position (0–100 %) of a ratio on the bar: the reference range takes the middle third. */
const at = (row: BalanceRow, v: number) => {
  const span = row.max - row.min;
  return Math.min(100, Math.max(0, ((v - (row.min - span)) / (3 * span)) * 100));
};

export function StrengthBalance() {
  const { t } = useTranslation();
  const s = useSettings();
  const data = useLiveQuery(async () => {
    const [workouts, exercises] = await Promise.all([db.workouts.toArray(), db.exercises.toArray()]);
    return { workouts, exercises: new Map(exercises.map((e) => [e.id, e])) };
  });
  if (!data) return null;
  const best = bestLifts(data.workouts, data.exercises, new Date());
  const rows = strengthBalance(best);
  const lift = (l: Lift) => t(`balance.lift.${l}`);
  const pct = (x: number) => fmtNum(Math.round(x * 100), s.language);
  const status = (r: BalanceRow) => {
    if (r.status === 'ok') return t('balance.ok');
    if (r.status === 'missing') return t('balance.noData');
    return t('balance.behind', { lift: lift(r.status === 'aLow' ? r.a : r.b) });
  };

  return (
    <section className="card stack" id="balance" aria-labelledby="t-balance">
      <h2 id="t-balance">{t('balance.title')}</h2>
      <p className="help">{t('balance.help', { weeks: BALANCE_DAYS / 7 })}</p>
      <ul className="balance-lifts">
        {LIFTS.map((l) => {
          const b = best[l];
          return (
            <li key={l}>
              <span>{lift(l)}</span>
              <b className="num">{b ? `${fmtNum(Math.round(convert(b.e1rm, 'kg', s.loadUnit)), s.language)} ${s.loadUnit}` : '—'}</b>
              {b && <span className="help">{data.exercises.get(b.exerciseId)?.name}</span>}
            </li>
          );
        })}
      </ul>
      <ul className="balance-rows">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="balance-head">
              <span>
                {lift(r.a)} / {lift(r.b)}
              </span>
              <span className={`balance-status ${r.status}`}>{status(r)}</span>
            </div>
            {r.ratio === undefined ? (
              <p className="help">{t('balance.missing', { list: [r.a, r.b].filter((l) => !best[l]).map(lift).join(', ') })}</p>
            ) : (
              <>
                <div className="balance-bar" aria-hidden="true">
                  <span className="band" style={{ left: `${at(r, r.min)}%`, width: `${at(r, r.max) - at(r, r.min)}%` }} />
                  <span className="mark" style={{ left: `${at(r, r.ratio)}%` }} />
                </div>
                <p className="help">{t('balance.ratio', { pct: pct(r.ratio), min: pct(r.min), max: pct(r.max) })}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="help">{t('balance.note')}</p>
    </section>
  );
}
