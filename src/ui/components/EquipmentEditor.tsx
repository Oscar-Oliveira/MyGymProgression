// Settings → bars and plates (V2-D6): bar weights and the plates the user has, in the load unit.
import { useTranslation } from 'react-i18next';
import { repo } from '../../data/repo';
import { equipmentOf, PLATE_CHOICES, type Equipment } from '../../domain/plates';
import { fmtNum, useSettings } from '../util';
import { NumInput } from './NumInput';

const BARS: (keyof Equipment['bars'])[] = ['barbell', 'ez_bar', 'trap_bar'];

export function EquipmentEditor() {
  const { t } = useTranslation();
  const s = useSettings();
  const eq = equipmentOf(s);
  const save = (next: Equipment) => void repo.saveSettings({ equipment: next });
  return (
    <div className="stack">
      <p className="help">{t('plates.sub')}</p>
      <div className="form-grid">
        {BARS.map((b) => (
          <label key={b}>
            {t(`plates.${b}`)} ({s.loadUnit})
            <NumInput label={`${t(`plates.${b}`)} (${s.loadUnit})`} value={eq.bars[b]} onChange={(v) => v !== undefined && v >= 0 && save({ ...eq, bars: { ...eq.bars, [b]: v } })} />
          </label>
        ))}
      </div>
      <fieldset>
        <legend>{t('plates.have')}</legend>
        <div className="plate-chips">
          {PLATE_CHOICES[s.loadUnit].map((p) => {
            const on = eq.plates.includes(p);
            return (
              <button
                key={p}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => save({ ...eq, plates: on ? eq.plates.filter((x) => x !== p) : [...eq.plates, p].sort((a, b) => b - a) })}
              >
                {fmtNum(p, s.language)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
