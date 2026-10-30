import { useTranslation } from 'react-i18next';
import type { SetRecord, Workout } from '../../domain/types';
import { NumInput } from './NumInput';
import { metricLabel, metricShort } from '../util';
import { ExerciseItem } from './ExerciseItem';

export function CorrectionEditor({ draft, onChange, thumbOf }: { draft: Workout; onChange: (w: Workout) => void; thumbOf: (id: string, fallback?: string) => string | undefined }) {
  const { t } = useTranslation();
  const upSet = (ei: number, si: number, patch: Partial<SetRecord>) =>
    onChange({ ...draft, entries: draft.entries.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, ...patch } : x)) } : e)) });
  return (
    <div>
      {draft.entries.map((e, ei) => {
        const metrics = e.exercise.metrics;
        const cols = { gridTemplateColumns: `2rem repeat(${metrics.length}, minmax(0, 1fr)) 3.2rem` };
        return (
          <section className="card" key={e.id} aria-label={e.exercise.name}>
            <ExerciseItem name={e.exercise.name} thumb={thumbOf(e.exerciseId, e.exercise.thumb)} size="sm" />
            <div className="gtable" role="table">
              <div className="gtable-row head" role="row" style={cols}>
                <span role="columnheader">#</span>
                {metrics.map((m) => (
                  <span key={m.key} role="columnheader" title={metricLabel(t, m.key, metrics)}>
                    {metricShort(t, m.key, metrics)}
                    {m.unit !== 'reps' && <small>{m.unit}</small>}
                  </span>
                ))}
                <span role="columnheader">{t('setStatus.done')}</span>
              </div>
              {e.sets.map((x, si) => (
                <div key={x.id} className="gtable-row" role="row" style={cols}>
                  <span className="n">{si + 1}</span>
                  {metrics.map((m) => (
                    <NumInput key={m.key} label={`${metricLabel(t, m.key, metrics)} ${si + 1}`} value={x.values[m.key]} onChange={(v) => upSet(ei, si, { values: { ...x.values, [m.key]: v } })} />
                  ))}
                  <input
                    type="checkbox"
                    className="big-check"
                    aria-label={`${t('setStatus.done')} ${si + 1}`}
                    checked={x.status === 'done'}
                    onChange={(ev) => upSet(ei, si, { status: ev.target.checked ? 'done' : 'skipped' })}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
