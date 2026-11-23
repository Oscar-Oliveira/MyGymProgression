// Last page of a workout (V2-D30): what was done (numbers, records, each exercise) and the button that finishes it.
import { useTranslation } from 'react-i18next';
import { entryMetrics, workoutRecords } from '../../domain/analysis';
import { workoutSteps } from '../../domain/circuit';
import type { Workout } from '../../domain/types';
import { RecordsCard, setsLine } from '../progress';
import { fmtNum, fmtSeconds, loadOut, useSettings } from '../util';
import { Icon } from './Icon';
import { Thumb } from './Thumb';

/** `earlier`: the finished workouts before this one (for the records). `onOpen`: shows that step. */
export function FinishStep({
  workout,
  earlier,
  thumbOf,
  onOpen,
  onFinish,
}: {
  workout: Workout;
  earlier: Workout[];
  thumbOf: (id: string, fallback?: string) => string | undefined;
  onOpen: (step: number) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const s = useSettings();
  const lang = s.language;
  const steps = workoutSteps(workout.entries);
  const metrics = workout.entries.map(entryMetrics);
  const done = metrics.reduce((a, m) => a + m.doneWorkingSets, 0);
  const planned = metrics.reduce((a, m) => a + m.prescribedWorkingSets, 0);
  const volume = metrics.reduce((a, m) => a + (m.volume ?? 0), 0);
  const reps = metrics.reduce((a, m) => a + (m.totalReps ?? 0), 0);
  const pending = workout.entries.reduce((a, e) => a + e.sets.filter((x) => x.status === 'pending').length, 0);
  const seconds = Math.max(0, (Date.now() - Date.parse(workout.startedAt)) / 1000);
  const records = workoutRecords(workout, earlier);

  return (
    <section aria-label={t('workout.finish')} className="finish-step">
      <h1 className="ex-title">{t('workout.finish')}</h1>
      <div className="finish-stats">
        <div className="stat">
          <div className="value num">{fmtSeconds(seconds)}</div>
          <div className="label">{t('analysis.duration')}</div>
        </div>
        <div className="stat">
          <div className="value num">
            {done}/{planned}
          </div>
          <div className="label">{t('analysis.workingSets')}</div>
        </div>
        {volume > 0 && (
          <div className="stat">
            <div className="value num">
              {fmtNum(loadOut(volume, s), lang, 0)} <small>{s.loadUnit}</small>
            </div>
            <div className="label">{t('analysis.volume')}</div>
          </div>
        )}
        {reps > 0 && (
          <div className="stat">
            <div className="value num">{fmtNum(reps, lang)}</div>
            <div className="label">{t('metric.reps')}</div>
          </div>
        )}
      </div>
      {pending > 0 && <p className="card warn">{t('workout.finishLeft', { count: pending })}</p>}
      <RecordsCard records={records} />
      <ul className="wk-list">
        {steps.map((st, i) => {
          const es = st.indexes.map((j) => workout.entries[j]);
          const e = es[0];
          const left = es.reduce((a, x) => a + x.sets.filter((y) => y.status === 'pending').length, 0);
          return (
            <li key={st.indexes[0]}>
              <button className={left ? 'left' : 'done'} onClick={() => onOpen(i)}>
                <span className="idx">{left ? i + 1 : <Icon name="check" />}</span>
                <Thumb src={thumbOf(e.exerciseId, e.exercise.thumb)} name={e.exercise.name} size={40} />
                <span className="xitem-text">
                  <span className="xitem-name">
                    {st.circuit ? (
                      <>
                        <Icon name="circuit" /> {st.circuit.name}
                      </>
                    ) : (
                      e.exercise.name
                    )}
                  </span>
                  <span className="xitem-sub">{st.circuit ? es.map((x) => x.exercise.name).join(' → ') : setsLine(e.sets, e.exercise.metrics, lang)}</span>
                </span>
                {left > 0 && <span className="xitem-trail finish-left">{t('workout.leftN', { count: left })}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <button className="primary xl finish-go" onClick={onFinish}>
        <Icon name="check" /> {t('workout.finish')}
      </button>
    </section>
  );
}
