import { useTranslation } from 'react-i18next';
import { COLOR_KEYS, type ColorKey } from '../../domain/types';

/** Ten colour swatches as a radio group. `noneLabel` adds a first option without a colour (e.g. "same as plan"). */
export function ColorPicker({ label, value, onChange, noneLabel }: { label: string; value?: ColorKey; onChange: (c: ColorKey | undefined) => void; noneLabel?: string }) {
  const { t } = useTranslation();
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {noneLabel && <button type="button" role="radio" aria-checked={!value} aria-label={noneLabel} title={noneLabel} className={`swatch none ${!value ? 'on' : ''}`} onClick={() => onChange(undefined)} />}
      {COLOR_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          aria-label={t(`color.${k}`)}
          title={t(`color.${k}`)}
          className={`swatch ${value === k ? 'on' : ''}`}
          style={{ background: `var(--c-${k})` }}
          onClick={() => onChange(k)}
        />
      ))}
    </div>
  );
}
