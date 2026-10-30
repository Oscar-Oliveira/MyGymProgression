import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { Link } from 'react-router-dom';
import { adherence, completionByExercise, entryMetrics, filterWorkouts, MUSCLE_SETS_GUIDE, muscleSetsPerWeek, periodSummary, previousPeriod, stalledItems, workoutsByWeek, type EntryMetrics } from '../../domain/analysis';
import { currentTarget } from '../../domain/progression';
import type { MetricKey, Workout, WorkoutEntry } from '../../domain/types';
import { fmtMetric, TrendPill, type Trend } from '../progress';
import { ExerciseItem } from '../components/ExerciseItem';
import { PageCoach } from '../components/CoachCard';
import { distOut, fmtDate, fmtNum, fmtSeconds, loadOut, tr, useSettings, useThumbs } from '../util';
import { toneStyle, useTones } from '../colors';

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

/** Workouts per week: one bar per week, one coloured block per workout (plan or day colour). Tap a week to list it. */
function WeekBars({ weeks, lang }: { weeks: { start: Date; workouts: Workout[] }[]; lang: string }) {
  const { t } = useTranslation();
  const toneFor = useTones();
  const [sel, setSel] = useState<number>();
  const row = useRef<HTMLDivElement>(null);
  // Many weeks scroll sideways; start at the most recent.
  useEffect(() => {
    if (row.current) row.current.scrollLeft = row.current.scrollWidth;
  }, [weeks.length]);
  const max = Math.max(1, ...weeks.map((w) => w.workouts.length));
  const total = weeks.reduce((a, w) => a + w.workouts.length, 0);
  const month = (d: Date) => d.toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { month: 'short' });
  const chosen = sel !== undefined ? weeks[sel] : undefined;
  return (
    <section className="card">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>{t('analysis.perWeek')}</h2>
        <small className="num">{t('analysis.avgPerWeek', { n: fmtNum(total / Math.max(1, weeks.length), lang, 1) })}</small>
      </div>
      <div className="weeks" ref={row}>
        {weeks.map((w, i) => (
          <button
            key={w.start.getTime()}
            className={`week-bar ${sel === i ? 'on' : ''}`}
            aria-pressed={sel === i}
            aria-label={t('analysis.weekOf', { date: fmtDate(w.start.toISOString(), lang), count: w.workouts.length })}
            onClick={() => setSel(sel === i ? undefined : i)}
          >
            <span className="bar-area">
              <span className="bar-stack" style={{ height: `${(w.workouts.length / max) * 100}%` }}>
                {w.workouts.map((x) => (
                  <span key={x.id} className="block toned" style={toneStyle(toneFor(x.planId, x.dayId))} />
                ))}
              </span>
            </span>
            <span className="lbl">{i === 0 || weeks[i - 1].start.getMonth() !== w.start.getMonth() ? month(w.start) : ''}</span>
          </button>
        ))}
      </div>
      {chosen ? (
        <div className="week-list">
          <p className="eyebrow">{t('analysis.weekOf', { date: fmtDate(chosen.start.toISOString(), lang), count: chosen.workouts.length })}</p>
          {chosen.workouts.map((x) => (
            <Link key={x.id} to={`/workout/${x.id}`} className="nav-row toned" style={toneStyle(toneFor(x.planId, x.dayId))}>
              <span className="tone-dot" />
              <span className="main">
                <span className="title">{x.dayName ?? t('workout.free')}</span>
                <span className="meta">{fmtDate(x.startedAt, lang)}</span>
              </span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="help" style={{ margin: '0.5rem 0 0' }}>
          {t('analysis.tapWeek')}
        </p>
      )}
    </section>
  );
}

/** Change against the previous period: ▲ more, ▼ less, ＝ same. Nothing without a previous value. */
function Delta({ now, prev, digits = 0, lang, unit = '' }: { now: number; prev?: number; digits?: number; lang: string; unit?: string }) {
  if (prev === undefined) return null;
  const d = Number((now - prev).toFixed(digits));
  if (d === 0) return <span className="delta">＝</span>;
  return (
    <span className={`delta ${d > 0 ? 'up' : 'down'}`}>
      {d > 0 ? '▲' : '▼'} {fmtNum(Math.abs(d), lang, digits)}
      {unit}
    </span>
  );
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
  const thumbOf = useThumbs();
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
    // Period dates shown under the selector, and the weeks of the chart ("All": from the first workout).
    const start = from ? new Date(`${from}T00:00:00`) : current[0] ? new Date(current[0].startedAt) : new Date();
    const weeks = workoutsByWeek(current, start, new Date());
    // The previous period of the same length, for comparison (not for "All", and only when it has workouts).
    const prevRange = from ? previousPeriod(from, days) : undefined;
    const prevWorkouts = prevRange ? filterWorkouts(data.workouts, { ...prevRange, planId: planId || undefined }) : [];
    const prev = prevRange && prevWorkouts.length ? { range: prevRange, summary: periodSummary(prevWorkouts), muscles: muscleSetsPerWeek(prevWorkouts, prevRange.from, prevRange.to) } : undefined;
    const muscles = Object.entries(muscleSetsPerWeek(current, from ?? current[0]?.startedAt.slice(0, 10) ?? today, today)).sort((a, b) => b[1] - a[1]);
    return { current, rows, adherenceRows, start, weeks, summary: periodSummary(current), prev, muscles, completion: completionByExercise(current) };
  }, [data, days, planId, s.stalledThreshold]);
  if (!data || !computed) return null;
  const { rows, adherenceRows, start, weeks, summary, prev, muscles, completion } = computed;
  // Scale of the muscle bars: at least past the top of the guideline, so the band is always visible.
  const scale = Math.max(MUSCLE_SETS_GUIDE.max * 1.25, ...muscles.map(([, v]) => v));

  const fmtMain = (key: string, v: number | undefined) =>
    key === 'topLoad' ? `${fmtNum(loadOut(v, s), s.language)} ${s.loadUnit}` : key === 'maxDuration' ? fmtSeconds(v) : key === 'totalDistance' ? `${fmtNum(distOut(v, s), s.language)} ${s.distanceUnit}` : fmtNum(v, s.language);

  return (
    <div>
      <div className="page-head">
        <h1>{t('analysis.title')}</h1>
      </div>
      <PageCoach place="analysis" />
      <div className="segmented" role="tablist" aria-label={t('analysis.period')}>
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={days === p} className={days === p ? 'on' : ''} onClick={() => setDays(p)}>
            {t(`analysis.p${p}`)}
          </button>
        ))}
      </div>
      <p className="period-range num">
        {fmtDate(start.toISOString(), s.language)} – {fmtDate(new Date().toISOString(), s.language)}
      </p>
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
          <Delta now={summary.workouts} prev={prev?.summary.workouts} lang={s.language} />
        </div>
        <div className="stat">
          <div className="value">{summary.workingSets}</div>
          <div className="label">{t('analysis.workingSets')}</div>
          <Delta now={summary.workingSets} prev={prev?.summary.workingSets} lang={s.language} />
        </div>
        <div className="stat">
          <div className="value">{fmtNum(summary.completionRate * 100, s.language, 0)}%</div>
          <div className="label">{t('analysis.completionRate')}</div>
          <Delta now={Math.round(summary.completionRate * 100)} prev={prev && Math.round(prev.summary.completionRate * 100)} lang={s.language} unit=" pp" />
        </div>
      </div>
      {prev && (
        <p className="help" style={{ marginTop: '-0.4rem' }}>
          {t('analysis.vsPrevious', { from: fmtDate(`${prev.range.from}T00:00:00`, s.language), to: fmtDate(`${prev.range.to}T00:00:00`, s.language) })}
        </p>
      )}

      {summary.workouts > 0 && <WeekBars weeks={weeks} lang={s.language} />}

      {muscles.length > 0 && (
        <section className="card">
          <h2>{t('analysis.muscles')}</h2>
          <table>
            <tbody>
              {muscles.map(([m, v]) => (
                <tr key={m}>
                  <th>{tr(t, 'muscle', m)}</th>
                  <td className="num">
                    {fmtNum(v, s.language, 1)}
                    <Delta now={v} prev={prev ? (prev.muscles[m] ?? 0) : undefined} digits={1} lang={s.language} />
                  </td>
                  <td style={{ width: '50%' }}>
                    <div className="mbar">
                      <div className="bar" style={{ width: `${(v / scale) * 100}%` }} />
                      <div className="guide" style={{ left: `${(MUSCLE_SETS_GUIDE.min / scale) * 100}%`, width: `${((MUSCLE_SETS_GUIDE.max - MUSCLE_SETS_GUIDE.min) / scale) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="help">{t('analysis.musclesGuide', MUSCLE_SETS_GUIDE)}</p>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="empty">{t('analysis.noData')}</div>
      ) : (
        <section className="card">
          <h2>{t('analysis.byExercise')}</h2>
          {rows.map((r) => (
            <ExerciseItem
              key={r.id}
              to={`/exercises/${r.id}`}
              name={r.name}
              thumb={thumbOf(r.id, r.last.exercise.thumb)}
              sub={
                r.fixed
                  ? `${t('analysis.fixed')} · ${t('analysis.completionShort', { pct: fmtNum(r.rate * 100, s.language, 0) })}`
                  : `${t(r.main.label)}: ${fmtMain(r.main.key, r.series[0])} → ${fmtMain(r.main.key, r.series[r.series.length - 1])}`
              }
              trailing={
                <span className="col" style={{ alignItems: 'flex-end', gap: '0.25rem' }}>
                  {!r.fixed && r.step && r.target !== undefined && <strong className="now">{fmtMetric(r.last.exercise.metrics, r.step.metric, r.target, s.language)}</strong>}
                  {r.stalled ? <span className="pill warn">{t('analysis.stalledShort')}</span> : <TrendPill trend={r.trend} />}
                </span>
              }
            >
              <span className="xitem-sub row">
                {!r.fixed && <Spark values={r.series} />}
                {t('analysis.sessionsN', { count: r.sessions })}
              </span>
            </ExerciseItem>
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
            {t('analysis.volume')}: {fmtNum(loadOut(summary.volume, s), s.language, 0)} {s.loadUnit}
            {prev && <Delta now={loadOut(summary.volume, s) ?? 0} prev={loadOut(prev.summary.volume, s)} lang={s.language} unit={` ${s.loadUnit}`} />}
            {t('analysis.duration')}: {fmtSeconds(summary.duration)}
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
