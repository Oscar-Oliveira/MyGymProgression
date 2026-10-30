import { useTranslation } from 'react-i18next';
import type { Circuit, WorkoutEntry } from '../../domain/types';
import { validateValue } from '../../domain/units';
import { NumInput } from './NumInput';
import { Thumb } from './Thumb';
import { metricLabel, metricShort } from '../util';

/** A whole circuit on one screen: every round with its exercises, pre-filled; one "done" at the end marks all sets. */
export function CircuitFocus({ circuit, entries, onChange, thumbOf }: { circuit: Circuit; entries: WorkoutEntry[]; onChange: (es: WorkoutEntry[]) => void; thumbOf: (id: string, fallback?: string) => string | undefined }) {
  const { t } = useTranslation();
  const rounds = Math.max(0, ...entries.map((e) => e.sets.length));
  const done = entries.every((e) => e.sets.every((x) => x.status !== 'pending'));
  const blocked = entries.some((e) => e.sets.some((x) => e.exercise.metrics.some((m) => validateValue(m, x.values[m.key]))));
  const setValue = (ei: number, si: number, key: string, v: number | undefined) =>
    onChange(entries.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j !== si ? x : { ...x, values: { ...x.values, [key]: v } })) })));
  return (
    <section aria-label={circuit.name} className="circuit-focus">
      <span className="badge">⟳ {t('circuit.label')}</span>
      <h1 className="ex-title">{circuit.name}</h1>
      <div className="ex-meta">
        {t('circuit.roundsCount', { count: rounds })} · {entries.map((e) => e.exercise.name).join(' → ')}
      </div>
      <div className="hint">{t('circuit.workoutHelp', { rounds })}</div>
      {Array.from({ length: rounds }, (_, r) => (
        <div key={r} className="round">
          <p className="eyebrow">{t('circuit.roundN', { n: r + 1 })}</p>
          {entries.map((e, ei) => {
            const x = e.sets[r];
            if (!x) return null;
            return (
              <div key={e.id} className={`round-row ${x.status}`}>
                <Thumb src={thumbOf(e.exerciseId, e.exercise.thumb)} name={e.exercise.name} size={36} />
                <span className="name">{e.exercise.name}</span>
                <span className="vals">
                  {e.exercise.metrics.map((m) => (
                    <span key={m.key} className="mini">
                      <NumInput label={`${e.exercise.name} ${metricLabel(t, m.key, e.exercise.metrics)} ${r + 1}`} value={x.values[m.key]} onChange={(v) => setValue(ei, r, m.key, v)} />
                      <small>{m.unit === 'reps' ? metricShort(t, m.key, e.exercise.metrics).toLowerCase() : m.unit}</small>
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <button className={done ? 'outline xl' : 'primary xl'} disabled={blocked || done} onClick={() => onChange(entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, status: 'done' as const })) })))}>
        ✓ {done ? t('circuit.doneAll') : t('circuit.done')}
      </button>
    </section>
  );
}
