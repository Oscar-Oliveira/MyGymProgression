import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { adherence, completionByExercise, exerciseHistory, filterWorkouts, muscleDistribution, periodSummary, stalledItems, type PeriodSummary } from '../../domain/analysis';
import { Empty } from '../components/Bits';
import { distOut, fmtNum, fmtSeconds, loadOut, tr, useSettings } from '../util';
import { ExerciseCharts } from './ExerciseDetail';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoDay(new Date(Date.parse(iso) + n * 86400000));

export function Analysis() {
  const { t } = useTranslation();
  const s = useSettings();
  const [to, setTo] = useState(isoDay(new Date()));
  const [from, setFrom] = useState(addDays(isoDay(new Date()), -55));
  const [planId, setPlanId] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const data = useLiveQuery(async () => ({ workouts: await db.workouts.toArray(), plans: await db.plans.toArray(), versions: await db.planVersions.toArray() }), []);

  const computed = useMemo(() => {
    if (!data) return undefined;
    const f = { from, to, planId: planId || undefined, exerciseId: exerciseId || undefined };
    const current = filterWorkouts(data.workouts, f);
    const len = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    const prev = filterWorkouts(data.workouts, { ...f, from: addDays(from, -len), to: addDays(from, -1) });
    const exercises = new Map<string, string>();
    for (const w of data.workouts) for (const e of w.entries) exercises.set(e.exerciseId, e.exercise.name);
    return {
      current,
      summary: periodSummary(current),
      previous: periodSummary(prev),
      muscles: Object.entries(muscleDistribution(current)).sort((a, b) => b[1] - a[1]),
      completion: completionByExercise(current),
      stalled: stalledItems(data.workouts, s.stalledThreshold),
      exercises: [...exercises].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [data, from, to, planId, exerciseId, s.stalledThreshold]);
  if (!data || !computed) return null;

  const { summary, previous, muscles, completion, stalled } = computed;
  const maxMuscle = Math.max(1, ...muscles.map(([, v]) => v));
  const history = exerciseId ? exerciseHistory(computed.current, exerciseId) : [];
  const rows: [keyof PeriodSummary, string, (v: number) => string][] = [
    ['workouts', t('analysis.workouts'), (v) => fmtNum(v, s.language)],
    ['workingSets', t('analysis.workingSets'), (v) => fmtNum(v, s.language)],
    ['volume', `${t('analysis.volume')} (${s.loadUnit})`, (v) => fmtNum(loadOut(v, s), s.language, 0)],
    ['duration', `${t('analysis.duration')} (h:mm:ss)`, (v) => fmtSeconds(v)],
    ['distance', `${t('analysis.distance')} (${s.distanceUnit})`, (v) => fmtNum(distOut(v, s), s.language)],
    ['completionRate', t('analysis.completionRate'), (v) => `${fmtNum(v * 100, s.language, 0)}%`],
  ];
  const activePlans = data.plans.filter((p) => !planId || p.id === planId);

  return (
    <div className="stack">
      <h1>{t('analysis.title')}</h1>
      <section className="card form-grid" aria-label={t('analysis.filters')}>
        <label>
          {t('common.from')}
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label>
          {t('common.to')}
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <label>
          {t('analysis.plan')}
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {data.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({t(`goal.${p.goal}`)})
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('analysis.exercise')}
          <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {computed.exercises.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {summary.workouts === 0 ? (
        <Empty>{t('analysis.noData')}</Empty>
      ) : (
        <>
          <section className="card">
            <h2>{t('analysis.overview')}</h2>
            <p className="help">{t('analysis.compare')}</p>
            <table>
              <tbody>
                {rows.map(([k, label, f]) => {
                  const d = summary[k] - previous[k];
                  return (
                    <tr key={k}>
                      <th>{label}</th>
                      <td className="num">{f(summary[k])}</td>
                      <td className="num muted">
                        {previous.workouts > 0 && (d >= 0 ? '▲ ' : '▼ ') + f(Math.abs(d))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {exerciseId && (
            <section className="card">
              <h2>
                <Link to={`/exercises/${exerciseId}`}>{computed.exercises.find(([id]) => id === exerciseId)?.[1]}</Link>
              </h2>
              <ExerciseCharts history={history} t={t} />
            </section>
          )}
          {!exerciseId && <p className="help">{t('analysis.chooseExercise')}</p>}

          <div className="grid">
            <section className="card">
              <h2>{t('analysis.adherence')}</h2>
              <table>
                <tbody>
                  {activePlans.map((p) => {
                    const v = data.versions.find((x) => x.id === p.currentVersionId);
                    const n = filterWorkouts(data.workouts, { from, to, planId: p.id }).length;
                    const a = adherence(n, v?.days.length ?? 0, from, to);
                    return (
                      <tr key={p.id}>
                        <th>{p.name}</th>
                        <td className="num">{a === undefined ? '—' : `${fmtNum(a * 100, s.language, 0)}%`}</td>
                        <td className="muted">
                          {n} · {t('analysis.perWeek', { n: v?.days.length ?? 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2>{t('analysis.stalled')}</h2>
              {stalled.length === 0 ? (
                <p className="muted">{t('analysis.stalledNone')}</p>
              ) : (
                <ul className="list">
                  {stalled.map((x) => (
                    <li key={x.lineageId}>
                      <Link to={`/exercises/${x.exerciseId}`}>{x.name}</Link> <small>({x.sessions})</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2>{t('analysis.muscles')}</h2>
            <table>
              <tbody>
                {muscles.map(([m, v]) => (
                  <tr key={m}>
                    <th>{tr(t, 'muscle', m)}</th>
                    <td className="num">{fmtNum(v, s.language, 1)}</td>
                    <td style={{ width: '60%' }}>
                      <div className="bar" style={{ width: `${(v / maxMuscle) * 100}%` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>{t('analysis.completion')}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('analysis.exercise')}</th>
                    <th>{t('strategy.label')}</th>
                    <th className="num">{t('analysis.sessions')}</th>
                    <th className="num">{t('analysis.completionRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {completion.map((c) => (
                    <tr key={c.exerciseId}>
                      <td>
                        <button className="ghost" onClick={() => setExerciseId(c.exerciseId)}>
                          {c.name}
                        </button>
                      </td>
                      <td>{c.strategy === 'none' ? <span className="tag">{t('analysis.fixed')}</span> : t(`strategy.${c.strategy}`)}</td>
                      <td className="num">{c.sessions}</td>
                      <td className="num">
                        {fmtNum(c.rate * 100, s.language, 0)}% <small>({c.done}/{c.prescribed})</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="card">
        <h2>{t('analysis.formulas')}</h2>
        <ul className="help">
          <li>{t('analysis.formula.volume')}</li>
          <li>{t('analysis.formula.e1rm')}</li>
          <li>{t('analysis.formula.completion')}</li>
          <li>{t('analysis.formula.adherence')}</li>
          <li>{t('analysis.formula.stalled', { n: s.stalledThreshold })}</li>
          <li>{t('analysis.formula.muscles')}</li>
          <li>{t('analysis.formula.pace')}</li>
        </ul>
      </section>
    </div>
  );
}
