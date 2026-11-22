// Tools (V2-D6): 1RM calculator with percentages, loads for reps at a RIR, plates per side, and strength balance (V2-D19).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { barOf, equipmentOf, platesPerSide, type Equipment } from '../../domain/plates';
import { loadFor, oneRmOf, percentTable, roundTo } from '../../domain/tools';
import { PageHead } from '../components/Bits';
import { NumInput } from '../components/NumInput';
import { StrengthBalance } from '../components/StrengthBalance';
import { fmtNum, useSettings } from '../util';

export function ToolsPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const eq = equipmentOf(s);
  const step = Math.min(...eq.plates, s.loadUnit === 'lb' ? 2.5 : 1.25) * 2;
  const n = (x: number) => fmtNum(Math.round(x * 100) / 100, s.language);
  const [load, setLoad] = useState<number | undefined>();
  const [reps, setReps] = useState<number | undefined>();
  const [rir, setRir] = useState<number | undefined>(0);
  const one = load && reps ? oneRmOf(load, reps, rir ?? 0) : undefined;
  const [total, setTotal] = useState<number | undefined>();
  const [bar, setBar] = useState<keyof Equipment['bars']>('barbell');
  const side = total ? platesPerSide(total, eq.bars[bar], eq.plates) : undefined;
  // The Plates shortcut opens this page at the plates section.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div>
      <PageHead title={t('tools.title')} sub={t('tools.sub')} />

      <section className="card stack" aria-labelledby="t-1rm">
        <h2 id="t-1rm">{t('tools.oneRm')}</h2>
        <div className="form-grid">
          <label>
            {t('metric.load')} ({s.loadUnit})
            <NumInput label={`${t('metric.load')} (${s.loadUnit})`} value={load} onChange={setLoad} />
          </label>
          <label>
            {t('metric.reps')}
            <NumInput label={t('metric.reps')} value={reps} onChange={setReps} />
          </label>
          <label>
            RIR
            <NumInput label="RIR" value={rir} onChange={setRir} />
          </label>
        </div>
        {one ? (
          <>
            <p className="tool-result">
              <span className="big num">{fmtNum(Math.round(one * 10) / 10, s.language)}</span> {s.loadUnit} <small>{t('tools.estimate')}</small>
            </p>
            <div className="table-wrap">
              <table className="tool-table">
                <caption className="vh">{t('tools.percent')}</caption>
                <thead>
                  <tr>
                    <th scope="col">%</th>
                    <th scope="col" className="num">{s.loadUnit}</th>
                    <th scope="col" className="num">{t('tools.repsAt', { rir: 2 })}</th>
                  </tr>
                </thead>
                <tbody>
                  {percentTable(one, (x) => roundTo(x, step)).map((r) => (
                    <tr key={r.pct}>
                      <th scope="row">{r.pct}%</th>
                      <td className="num">{n(r.load)}</td>
                      <td className="num">{repsAt(one, r.load, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="help">{t('tools.oneRmHelp')}</p>
        )}
      </section>

      {one && (
        <section className="card stack" aria-labelledby="t-rir">
          <h2 id="t-rir">{t('tools.byRir')}</h2>
          <div className="table-wrap">
            <table className="tool-table">
              <caption className="vh">{t('tools.byRir')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('metric.reps')}</th>
                  {[0, 1, 2, 3].map((r) => (
                    <th key={r} scope="col" className="num">
                      RIR {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 3, 5, 6, 8, 10, 12, 15].map((rp) => (
                  <tr key={rp}>
                    <th scope="row">{rp}</th>
                    {[0, 1, 2, 3].map((r) => (
                      <td key={r} className="num">
                        {n(roundTo(loadFor(one, rp, r), step))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card stack" id="plates" aria-labelledby="t-plates">
        <h2 id="t-plates">{t('plates.title')}</h2>
        <div className="form-grid">
          <label>
            {t('tools.total')} ({s.loadUnit})
            <NumInput label={`${t('tools.total')} (${s.loadUnit})`} value={total} onChange={setTotal} />
          </label>
          <label>
            {t('tools.bar')}
            <select value={bar} onChange={(e) => setBar(barOf(e.target.value) ?? 'barbell')}>
              {(['barbell', 'ez_bar', 'trap_bar'] as const).map((b) => (
                <option key={b} value={b}>
                  {t(`plates.${b}`)} · {n(eq.bars[b])} {s.loadUnit}
                </option>
              ))}
            </select>
          </label>
        </div>
        {side && side.plates.length > 0 ? (
          <p className="tool-result">
            {t('plates.perSide')} <b className="num">{side.plates.map(n).join(' + ')}</b>
            {side.rest > 0 && <span className="pl-rest"> · {t('plates.rest', { rest: n(side.rest), unit: s.loadUnit })}</span>}
          </p>
        ) : (
          total !== undefined && <p className="help">{t('tools.onlyBar')}</p>
        )}
      </section>

      <StrengthBalance />
    </div>
  );
}

/** Reps that a load allows with `rir` reps left, from a 1RM (whole reps, at least 1). */
function repsAt(oneRm: number, load: number, rir: number): number {
  if (load >= oneRm) return 1;
  return Math.max(1, Math.floor(30 * (oneRm / load - 1) - rir));
}
