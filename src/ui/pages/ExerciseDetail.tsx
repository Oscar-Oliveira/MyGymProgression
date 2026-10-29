import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { db } from '../../data/db';
import { exerciseHistory, personalRecords, type HistoryPoint } from '../../domain/analysis';
import type { MetricDef, SetRecord } from '../../domain/types';
import { Empty, OutcomeBadge, TrendChart } from '../components/Bits';
import { distOut, fmtDate, fmtNum, fmtSeconds, fmtValue, loadOut, metricLabel, paceOut, tr, useSettings } from '../util';

export function formatSet(s: SetRecord, metrics: MetricDef[], lang: string): string {
  const v = s.values;
  const hasRL = metrics.some((m) => m.key === 'reps') && metrics.some((m) => m.key === 'load');
  if (hasRL && v.reps !== undefined) {
    const unit = metrics.find((m) => m.key === 'load')?.unit ?? '';
    const rest = metrics.filter((m) => m.key !== 'reps' && m.key !== 'load' && v[m.key] !== undefined).map((m) => fmtValue(v[m.key], m.unit, lang));
    return [v.load !== undefined ? `${fmtNum(v.reps, lang)} × ${fmtValue(v.load, unit, lang)}` : `${fmtNum(v.reps, lang)}`, ...rest].join(' · ');
  }
  return metrics
    .filter((m) => v[m.key] !== undefined)
    .map((m) => fmtValue(v[m.key], m.unit, lang))
    .join(' · ');
}

/** Charts that fit the exercise's metrics. Volume only for load+reps. */
export function ExerciseCharts({ history, t }: { history: HistoryPoint[]; t: TFunction }) {
  const s = useSettings();
  if (!history.length) return null;
  const metrics = history[history.length - 1].entry.exercise.metrics;
  const has = (k: string) => metrics.some((m) => m.key === k);
  const pts = (f: (h: HistoryPoint) => number | undefined) => history.map((h) => ({ date: h.date.slice(5, 10), value: f(h) }));
  const nonProgressive = history[history.length - 1].entry.progression.strategy === 'none';
  return (
    <div className="grid">
      {has('load') && <TrendChart title={t('analysis.topLoad')} unit={s.loadUnit} kind="actual" data={pts((h) => loadOut(h.metrics.topLoad, s))} />}
      {has('load') && has('reps') && <TrendChart title={t('analysis.e1rm')} unit={s.loadUnit} kind="estimated" data={pts((h) => loadOut(h.metrics.bestE1rm, s))} />}
      {has('load') && has('reps') && <TrendChart title={t('analysis.volume')} unit={s.loadUnit} kind="derived" data={pts((h) => loadOut(h.metrics.volume, s))} />}
      {has('reps') && <TrendChart title={t('analysis.totalReps')} kind="actual" data={pts((h) => h.metrics.totalReps)} />}
      {has('duration') && <TrendChart title={t('analysis.maxDuration')} unit="m:ss" kind="actual" format={fmtSeconds} data={pts((h) => h.metrics.maxDuration)} />}
      {has('distance') && <TrendChart title={t('analysis.distance')} unit={s.distanceUnit} kind="actual" data={pts((h) => distOut(h.metrics.totalDistance, s))} />}
      {has('distance') && has('duration') && <TrendChart title={t('analysis.pace')} unit={`m:ss/${s.distanceUnit}`} kind="derived" format={fmtSeconds} data={pts((h) => paceOut(h.metrics.pace, s))} />}
      {has('speed') && <TrendChart title={t('analysis.avgSpeed')} unit="km/h" kind="actual" data={pts((h) => h.metrics.avgSpeed)} />}
      {has('incline') && <TrendChart title={t('analysis.avgIncline')} unit="%" kind="actual" data={pts((h) => h.metrics.avgIncline)} />}
      {nonProgressive && <TrendChart title={t('analysis.completionRate')} unit="%" kind="derived" data={pts((h) => Math.round(h.metrics.completionRate * 100))} />}
    </div>
  );
}

export function ExerciseDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const s = useSettings();
  const data = useLiveQuery(async () => {
    const ex = await db.exercises.get(id!);
    const workouts = await db.workouts.toArray();
    const events = (await db.progressionEvents.where('exerciseId').equals(id!).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const parent = ex?.variationOf ? await db.exercises.get(ex.variationOf) : undefined;
    return { ex, workouts, events, parent };
  }, [id]);
  if (!data) return null;
  const { ex, workouts, events, parent } = data;
  const history = exerciseHistory(workouts, id!);
  if (!ex && !history.length) return <Empty>{t('exercise.noResults')}</Empty>;
  const metrics = ex?.metrics ?? history[history.length - 1].entry.exercise.metrics;
  const pr = personalRecords(history);
  const prRows: [string, string | undefined][] = [
    [t('analysis.topLoad'), pr.topLoad !== undefined ? fmtValue(loadOut(pr.topLoad, s), s.loadUnit, s.language) : undefined],
    [`${t('analysis.e1rm')} (${t('common.estimated')})`, pr.bestE1rm !== undefined ? fmtValue(loadOut(pr.bestE1rm, s), s.loadUnit, s.language) : undefined],
    [t('analysis.volume'), pr.maxVolume !== undefined ? fmtValue(loadOut(pr.maxVolume, s), s.loadUnit, s.language) : undefined],
    [t('metric.reps'), pr.maxReps !== undefined ? fmtNum(pr.maxReps, s.language) : undefined],
    [t('analysis.maxDuration'), pr.maxDuration !== undefined ? fmtSeconds(pr.maxDuration) : undefined],
    [t('analysis.distance'), pr.maxDistance !== undefined ? fmtValue(distOut(pr.maxDistance, s), s.distanceUnit, s.language) : undefined],
    [t('analysis.pace'), pr.bestPace !== undefined ? `${fmtSeconds(paceOut(pr.bestPace, s))}/${s.distanceUnit}` : undefined],
  ];

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{ex?.name ?? history[0].entry.exercise.name}</h1>
        {ex && (
          <Link className="button secondary" to={`/exercises/${ex.id}/edit`}>
            {t('common.edit')}
          </Link>
        )}
      </div>
      {ex && (
        <section className="card stack-sm">
          {parent && (
            <p>
              <Link to={`/exercises/${parent.id}`}>{t('exercise.variationOf', { name: parent.name })}</Link>
            </p>
          )}
          {ex.aliases.length > 0 && <p className="muted">{ex.aliases.join(', ')}</p>}
          <p>
            {t(`category.${ex.category}`)} · {tr(t, 'equipment', ex.equipment)} · {ex.primaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')}
            {ex.secondaryMuscles.length > 0 && <small> (+ {ex.secondaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')})</small>}
          </p>
          <p>
            <strong>{t('exercise.metrics')}:</strong> {metrics.map((m) => `${metricLabel(t, m.key, metrics)} (${m.unit})`).join(', ')}
            {ex.loadMode === 'perSide' && ` · ${t('loadMode.perSide')}`}
          </p>
          <p>
            <strong>{t(`strategy.${ex.progression.strategy}`)}</strong> — <span className="help">{t(`strategy.help.${ex.progression.strategy}`)}</span>
          </p>
          {ex.instructions && <p style={{ whiteSpace: 'pre-wrap' }}>{ex.instructions}</p>}
          {ex.safetyNotes && <p className="error" style={{ whiteSpace: 'pre-wrap' }}>⚠ {ex.safetyNotes}</p>}
          {ex.personalNotes && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{ex.personalNotes}</p>}
          {ex.links.length > 0 && (
            <ul>
              {ex.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label || l.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {ex.tags.length > 0 && <p>{ex.tags.map((x) => <span key={x} className="tag">{x}</span>)}</p>}
        </section>
      )}

      <section className="card">
        <h2>{t('exercise.prs')}</h2>
        {history.length === 0 ? (
          <p className="muted">{t('exercise.noHistory')}</p>
        ) : (
          <table>
            <tbody>
              {prRows.filter(([, v]) => v !== undefined).map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <ExerciseCharts history={history} t={t} />
      </section>

      <section className="card">
        <h2>{t('exercise.history')}</h2>
        {history.length === 0 ? (
          <p className="muted">{t('exercise.noHistory')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.from')}</th>
                  <th>{t('prescription.sets')}</th>
                  <th>{t('strategy.label')}</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => (
                  <tr key={h.entryId}>
                    <td>
                      <Link to={`/workout/${h.workoutId}`}>{fmtDate(h.date, s.language)}</Link>
                    </td>
                    <td>
                      {h.entry.sets
                        .filter((x) => x.status === 'done')
                        .map((x) => (x.kind === 'working' ? '' : `${t(`setKind.${x.kind}`)} `) + formatSet(x, h.entry.exercise.metrics, s.language))
                        .join(', ')}
                      {h.entry.substitutedFor && <small> ({t('workout.substitute')})</small>}
                    </td>
                    <td>{h.entry.evaluation && <OutcomeBadge outcome={h.entry.evaluation.outcome} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {events.length > 0 && (
        <section className="card">
          <h2>{t('analysis.loadEvents')}</h2>
          <ul className="list">
            {events
              .filter((e) => e.decision !== 'none')
              .map((e) => (
                <li key={e.id}>
                  {fmtDate(e.createdAt, s.language)} · <strong>{t(`decision.${e.decision}`)}</strong>{' '}
                  {Object.entries(e.before).map(([k, v]) => `${metricLabel(t, k as MetricDef['key'], metrics)} ${v}`).join(', ')}
                  {JSON.stringify(e.after) !== JSON.stringify(e.before) && ` → ${Object.entries(e.after).map(([, v]) => v).join(', ')}`}
                  {e.decisionReason && <small> — {e.decisionReason}</small>}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
