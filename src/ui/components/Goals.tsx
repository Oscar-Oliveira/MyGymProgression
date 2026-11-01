// Goals with a projection (D42): in Analysis (all goals) and on an exercise page (its goals).
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { goalStatus } from '../../domain/goal';
import type { Exercise, Goal } from '../../domain/types';
import { convert, hasMetric } from '../../domain/units';
import { dialog } from './Dialog';
import { NumInput } from './NumInput';
import { fmtDate, fmtNum, loadOut, useSettings } from '../util';

/** Goals are stored as the total load; a per-side exercise shows and takes the load per side, as it is logged. */
const sideOf = (ex?: Pick<Exercise, 'loadMode'>) => (ex?.loadMode === 'perSide' ? 2 : 1);

export function Goals({ exerciseId }: { exerciseId?: string }) {
  const { t } = useTranslation();
  const s = useSettings();
  const data = useLiveQuery(async () => {
    const goals = exerciseId ? await db.goals.where('exerciseId').equals(exerciseId).toArray() : await db.goals.toArray();
    return { goals: goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), workouts: await db.workouts.toArray(), exercises: await db.exercises.toArray() };
  }, [exerciseId]);
  const [adding, setAdding] = useState(false);
  const [exId, setExId] = useState(exerciseId ?? '');
  const [load, setLoad] = useState<number>();
  const [by, setBy] = useState('');
  if (!data) return null;
  const exercises = new Map(data.exercises.map((e) => [e.id, e]));
  const options = data.exercises.filter((e) => e.active && hasMetric(e.metrics, 'load')).sort((a, b) => a.name.localeCompare(b.name));
  if (exerciseId && !options.some((e) => e.id === exerciseId)) return null;
  const fmtLoad = (kg: number, ex?: Exercise) => `${fmtNum(loadOut(kg / sideOf(ex), s), s.language)} ${s.loadUnit}`;

  const add = async () => {
    const ex = exercises.get(exId);
    if (!ex || !load || load <= 0) return;
    await repo.addGoal({ exerciseId: ex.id, exerciseName: ex.name, load: convert(load, s.loadUnit, 'kg') * sideOf(ex), ...(by ? { by } : {}) });
    setAdding(false);
    setLoad(undefined);
    setBy('');
  };
  const remove = async (g: Goal) => {
    if (await dialog.confirm(t('analysis.goalDeleteConfirm', { load: fmtLoad(g.load, exercises.get(g.exerciseId)), name: g.exerciseName }), { danger: true, ok: t('common.delete') })) await repo.deleteGoal(g.id);
  };

  return (
    <section className="card" aria-label={t('analysis.goals')}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>🎯 {t('analysis.goals')}</h2>
        {!adding && (
          <button className="ghost sm" onClick={() => setAdding(true)}>
            + {t('analysis.newGoal')}
          </button>
        )}
      </div>
      {data.goals.length === 0 && !adding && <p className="muted">{t('analysis.noGoals')}</p>}
      <ul className="report-list">
        {data.goals.map((g) => {
          const ex = exercises.get(g.exerciseId);
          const st = goalStatus(g, data.workouts);
          const text = st.metAt
            ? `✓ ${t('analysis.goalMet', { date: fmtDate(st.metAt, s.language) })}`
            : st.projected
              ? `${t('analysis.goalProjected', { date: fmtDate(`${st.projected}T12:00:00`, s.language) })}${g.by ? ` · ${t(st.projected > g.by ? 'analysis.goalLate' : 'analysis.goalOnTime', { date: fmtDate(`${g.by}T12:00:00`, s.language) })}` : ''}`
              : t(st.noTrend ? 'analysis.goalNoTrend' : 'analysis.goalFew');
          const share = st.metAt ? 1 : st.best ? Math.min(1, st.best / g.load) : 0;
          return (
            <li key={g.id} className="goal">
              <span>
                <strong>
                  {!exerciseId && `${ex?.name ?? g.exerciseName} · `}
                  {fmtLoad(g.load, ex)}
                </strong>
                <small className={st.metAt ? 'up-text' : st.projected && g.by && st.projected > g.by ? 'warn-text' : 'muted'}>{text}</small>
                <span className="challenge-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
                  <span style={{ width: `${share * 100}%` }} />
                </span>
                {st.best !== undefined && !st.metAt && <small className="muted">{t('analysis.goalBest', { load: fmtLoad(st.best, ex) })}</small>}
              </span>
              <button className="ghost sm" aria-label={t('analysis.goalDelete')} onClick={() => void remove(g)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {adding && (
        <div className="goal-form">
          {!exerciseId && (
            <label>
              {t('analysis.goalExercise')}
              <select value={exId} onChange={(e) => setExId(e.target.value)}>
                <option value="" />
                {options.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t('analysis.goalLoad', { unit: s.loadUnit })}
            <NumInput label={t('analysis.goalLoad', { unit: s.loadUnit })} value={load} onChange={setLoad} />
          </label>
          <label>
            {t('analysis.goalBy')}
            <input type="date" value={by} onChange={(e) => setBy(e.target.value)} />
          </label>
          <div className="row">
            <button className="outline" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </button>
            <button className="primary" disabled={!exId || !load || load <= 0} onClick={() => void add()}>
              {t('common.add')}
            </button>
          </div>
        </div>
      )}
      <p className="help">{t('analysis.formula.goal')}</p>
    </section>
  );
}
