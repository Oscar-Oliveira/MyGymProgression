// Plates per side for the load of a set on a bar (V2-D6): "Bar 20 kg · per side 20 + 1.25", with a small drawing.
import { useTranslation } from 'react-i18next';
import { barWeightOf, equipmentOf, platesPerSide } from '../../domain/plates';
import type { LoadMode } from '../../domain/types';
import { fmtNum, useSettings } from '../util';

/** Drawn height of a plate: heavier plates are taller. */
const height = (p: number, max: number) => Math.round(12 + 30 * Math.sqrt(p / max));

/** `barWeight`: the exercise's own bar weight (V2-D26); not set = the setting for its bar type. */
export function PlateLine({ load, equipment, barWeight, loadMode }: { load?: number; equipment?: string; barWeight?: number; loadMode: LoadMode }) {
  const { t } = useTranslation();
  const s = useSettings();
  const barKg = equipment ? barWeightOf({ equipment, barWeight }, s) : undefined;
  if (barKg === undefined || !load) return null;
  const eq = equipmentOf(s);
  const perSide = loadMode === 'perSide';
  if (!perSide && load <= barKg) return null;
  const { plates, rest } = platesPerSide(load, barKg, eq.plates, perSide);
  if (!plates.length) return null;
  const max = Math.max(...eq.plates);
  const n = (x: number) => fmtNum(x, s.language);
  return (
    <p className="plates" aria-label={t('plates.line', { bar: n(barKg), unit: s.loadUnit, plates: plates.map(n).join(' + ') })}>
      <span className="pl-vis" aria-hidden="true">
        <span className="pl-bar" />
        {plates.map((p, i) => (
          <span key={i} className="pl" style={{ height: height(p, max) }} />
        ))}
      </span>
      <span className="num">
        {!perSide && `${t('plates.bar', { bar: n(barKg), unit: s.loadUnit })} · `}
        {t('plates.perSide')} <b>{plates.map(n).join(' + ')}</b>
        {rest > 0 && <span className="pl-rest"> · {t('plates.rest', { rest: n(rest), unit: s.loadUnit })}</span>}
      </span>
    </p>
  );
}
