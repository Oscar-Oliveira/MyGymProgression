import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { adherence, completionByExercise, entryMetrics, filterWorkouts, muscleDistribution, periodSummary, stalledItems, type EntryMetrics } from '../../domain/analysis';
import { currentTarget } from '../../domain/progression';
import type { MetricKey, WorkoutEntry } from '../../domain/types';
import { fmtMetric, TrendMark, type Trend } from '../progress';
import { Thumb } from '../components/Thumb';
import { distOut, fmtNum, fmtSeconds, loadOut, tr, useSettings } from '../util';

const PERIODS = [28, 84, 182, 0] as const;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The main performance number of an entry, chosen by its metrics: top load, longest set, distance or reps. */
function mainMetric(e: WorkoutEntry): { key: 'topLoad' | 'maxDuration' | 'totalDistance' | 'totalReps'; label: string } {
  const has = (k: MetricKey) => e.exercise.metrics.some((m) => m.key === k);
  if (has('load') && has('reps')) return { key: 'topLoad', label: 'analysis.topLoad' };
  if (has('duration')) return { key: 'maxDuration', label: 'analysis.maxDuration' };
  if (has('distance')) return { key: 'totalDistance', label: 'analysis.distance' };
  return { key: 'totalReps', label: 'analysis.totalReps' };
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className="spark" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80 + 2},${max === min ? 15 : 27 - ((v - min) / (max - min)) * 24}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 84 30" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Analysis() {
  const { t } = useTranslation();
  const s = useSettings();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(84);
  const [planId, setPlanId] = useState('');
  const data = useLiveQuery(
    async () => ({ workouts: await db.workouts.toArray(), plans: await db.plans.toArray(), versions: await db.planVersions.toArray(), states: await db.progressionStates.toArray() }),
    [],
  );

  const computed = useMemo(() => {
    if (!data) return undefined;
    const from = days ? isoDay(new Date(Date.now() - (days - 1) * 86400000)) : undefined;
    const current = filterWorkouts(data.workouts, { from, planId: planId || undefined }).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const stalled = new Set(stalledItems(data.workouts, s.stalledThreshold).map((x) => x.exerciseId));
    const byEx = new Map<string, { entry: WorkoutEntry; m: EntryMetrics }[]>();
    for (const w of current) for (const e of w.entries) byEx.set(e.exerciseId, [...(byEx.get(e.exerciseId) ?? []), { entry: e, m: entryMetrics(e) }]);
    const rows = [...byEx].map(([id, list]) => {
      const last = list[list.length - 1].entry;
      const main = mainMetric(last);
      const series = list.map((x) => x.m[main.key]).filter((v): v is number => v !== undefined);
      const fixed = last.progression.strategy === 'none';
      const step = last.progression.steps[0];
      // Current target: the progression state (after any increase), else the last prescription.
      const state = data.states.find((x) => x.lineageId === last.lineageId);
      const target = step ? (state?.targets[step.metric] ?? currentTarget(last.prescription, step.metric)) : undefined;
      let trend: Trend = 'same';
      if (fixed) trend = list.every((x) => x.m.completionRate >= 1) ? 'done' : 'short';
      else if (series.length >= 2) trend = series[series.length - 1] > series[0] ? 'up' : series[series.length - 1] < series[0] ? 'down' : 'same';
      const rate = list.reduce((a, x) => a + Math.min(x.m.doneWorkingSets, x.m.prescribedWorkingSets), 0) / Math.max(1, list.reduce((a, x) => a + x.m.prescribedWorkingSets, 0));
      return { id, name: last.exercise.name, sessions: list.length, main, series, last, fixed, step, target, trend, rate, stalled: stalled.has(id) };
    });
    rows.sort((a, b) => Number(a.fixed) - Number(b.fixed) || b.sessions - a.sessions || a.name.localeCompare(b.name));
    // Adherence per active plan over the period (all time: from the first workout of the plan).
    const today = isoDay(new Date());
    const adherenceRows = data.plans
      .filter((p) => p.status === 'active' && (!planId || p.id === planId))
      .map((p) => {
        const v = data.versions.find((x) => x.id === p.currentVersionId);
        const done = filterWorkouts(data.workouts, { from, planId: p.id });
        const start = from ?? done.map((w) => w.startedAt.slice(0, 10)).sort()[0] ?? today;
        return { plan: p, done: done.length, perWeek: v?.days.length ?? 0, rate: adherence(done.length, v?.days.length ?? 0, start, today) };
      })
      .filter((r) => r.perWeek > 0);
    return { current, rows, adherenceRows, summary: periodSummary(current), muscles: Object.entries(muscleDistribution(current)).sort((a, b) => b[1] - a[1]), completion: completionByExercise(current) };
  }, [data, days, planId, s.stalledThreshold]);
  if (!data || !computed) return null;
  const { rows, adherenceRows, summary, muscles, completion } = computed;
  const maxMuscle = Math.max(1, ...muscles.map(([, v]) => v));

  const fmtMain = (key: string, v: number | undefined) =>
    key === 'topLoad' ? `${fmtNum(loadOut(v, s), s.language)} ${s.loadUnit}` : key === 'maxDuration' ? fmtSeconds(v) : key === 'totalDistance' ? `${fmtNum(distOut(v, s), s.language)} ${s.distanceUnit}` : fmtNum(v, s.language);

  return (
    <div>
      <div className="page-head">
        <h1>{t('analysis.title')}</h1>
      </div>
      <div className="seg" role="tablist" aria-label={t('analysis.period')}>
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={days === p} className={days === p ? 'on' : ''} onClick={() => setDays(p)}>
            {t(`analysis.p${p}`)}
          </button>
        ))}
      </div>
      {data.plans.length > 1 && (
        <label style={{ margin: '0.6rem 0' }}>
          {t('analysis.plan')}
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {data.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid3" style={{ margin: '0.8rem 0' }}>
        <div className="stat">
          <div className="value">{summary.workouts}</div>
          <div className="label">{t('analysis.workouts')}</div>
        </div>
        <div className="stat">
          <div className="value">{summary.workingSets}</div>
          <div className="label">{t('analysis.workingSets')}</div>
        </div>
        <div className="stat">
          <div className="value">{fmtNum(summary.completionRate * 100, s.language, 0)}%</div>
          <div className="label">{t('analysis.completionRate')}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">{t('analysis.noData')}</div>
      ) : (
        <section className="card">
          <h2>{t('analysis.byExercise')}</h2>
          {rows.map((r) => (
            <Link key={r.id} to={`/exercises/${r.id}`} className="ex-row">
              <TrendMark trend={r.trend} />
              <Thumb src={r.last.exercise.thumb} name={r.name} size={40} />
              <div className="main">
                <div className="name">{r.name}</div>
                <div className="sub">
                  {r.fixed
                    ? `${t('analysis.fixed')} · ${t('analysis.completionShort', { pct: fmtNum(r.rate * 100, s.language, 0) })}`
                    : `${t(r.main.label)}: ${fmtMain(r.main.key, r.series[0])} → ${fmtMain(r.main.key, r.series[r.series.length - 1])}`}
                  {' · '}
                  {t('analysis.sessionsN', { count: r.sessions })}
                  {r.stalled && <span className="badge warn"> {t('analysis.stalledShort')}</span>}
                </div>
              </div>
              {!r.fixed && <Spark values={r.series} />}
              {!r.fixed && r.step && r.target !== undefined && (
                <div className="now">
                  {fmtMetric(r.last.exercise.metrics, r.step.metric, r.target, s.language)}
                  <div className="sub">{t('analysis.now')}</div>
                </div>
              )}
            </Link>
          ))}
        </section>
      )}

      {summary.workouts > 0 && (
        <details className="card tight">
          <summary>{t('analysis.moreDetails')}</summary>
          {adherenceRows.length > 0 && (
            <>
              <h3>{t('analysis.adherence')}</h3>
              <table>
                <tbody>
                  {adherenceRows.map((r) => (
                    <tr key={r.plan.id}>
                      <th>{r.plan.name}</th>
                      <td className="num">{r.rate === undefined ? '—' : `${fmtNum(Math.min(1, r.rate) * 100, s.language, 0)}%`}</td>
                      <td className="muted">{t('analysis.adherenceDetail', { done: r.done, n: r.perWeek })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <h3 style={{ marginTop: '1rem' }}>{t('analysis.muscles')}</h3>
          <table>
            <tbody>
              {muscles.map(([m, v]) => (
                <tr key={m}>
                  <th>{tr(t, 'muscle', m)}</th>
                  <td className="num">{fmtNum(v, s.language, 1)}</td>
                  <td style={{ width: '55%' }}>
                    <div className="bar" style={{ width: `${(v / maxMuscle) * 100}%` }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: '1rem' }}>{t('analysis.completion')}</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {completion.map((c) => (
                  <tr key={c.exerciseId}>
                    <td>{c.name}</td>
                    <td className="num">
                      {fmtNum(c.rate * 100, s.language, 0)}% <small>({c.done}/{c.prescribed})</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="help" style={{ marginTop: '1rem' }}>
            {t('analysis.volume')}: {fmtNum(loadOut(summary.volume, s), s.language, 0)} {s.loadUnit} · {t('analysis.duration')}: {fmtSeconds(summary.duration)}
          </p>
          <h3 style={{ marginTop: '1rem' }}>{t('analysis.formulas')}</h3>
          <ul className="help">
            <li>{t('analysis.formula.trend')}</li>
            <li>{t('analysis.formula.volume')}</li>
            <li>{t('analysis.formula.e1rm')}</li>
            <li>{t('analysis.formula.completion')}</li>
            <li>{t('analysis.formula.adherence')}</li>
            <li>{t('analysis.formula.stalled', { n: s.stalledThreshold })}</li>
            <li>{t('analysis.formula.muscles')}</li>
          </ul>
        </details>
      )}
    </div>
  );
}
