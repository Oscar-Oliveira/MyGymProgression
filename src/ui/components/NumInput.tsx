import { useEffect, useState } from 'react';

interface Props {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label?: string;
  step?: number;
  /** Shows − / + buttons (large touch targets for workout logging). */
  stepper?: boolean;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  id?: string;
}

const parse = (s: string): number | undefined => {
  const t = s.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Number input that accepts "," and "." as decimal separators and keeps partial text while typing. */
export function NumInput({ value, onChange, label, step = 1, stepper, placeholder, invalid, className, id }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    const parsed = parse(text);
    if (parsed !== value && !(Number.isNaN(parsed) && value === undefined)) setText(value === undefined ? '' : String(value));
  }, [value]);

  // Unparseable text is shown as invalid and reported as undefined, so NaN is never stored.
  const bad = invalid || Number.isNaN(parse(text));
  const input = (
    <input
      id={id}
      className={`num ${bad ? 'invalid' : ''} ${className ?? ''}`}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad || undefined}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        onChange(Number.isNaN(n) ? undefined : n);
      }}
      onFocus={(e) => e.target.select()}
    />
  );
  if (!stepper) return input;
  const bump = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <span className="stepper">
      <button type="button" className="step" aria-label={`${label ?? ''} −${step}`} onClick={() => bump(-step)}>
        −
      </button>
      {input}
      <button type="button" className="step" aria-label={`${label ?? ''} +${step}`} onClick={() => bump(step)}>
        +
      </button>
    </span>
  );
}
