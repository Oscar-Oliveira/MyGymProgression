import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import type { ExerciseCategory } from '../../domain/types';
import { Empty } from '../components/Bits';
import { matches } from '../components/ExercisePicker';
import { tr } from '../util';

const CATS: ExerciseCategory[] = ['compound', 'isolation', 'cardio', 'warmup', 'mobility', 'other'];

export function ExerciseList() {
  const { t } = useTranslation();
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  const [inactive, setInactive] = useState(false);

  const muscles = useMemo(() => [...new Set((all ?? []).flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles]))].sort(), [all]);
  const equipment = useMemo(() => [...new Set((all ?? []).map((e) => e.equipment).filter(Boolean))].sort(), [all]);
  const list = useMemo(
    () =>
      (all ?? [])
        .filter(
          (e) =>
            (inactive || e.active) &&
            (!cat || e.category === cat) &&
            (!muscle || e.primaryMuscles.includes(muscle) || e.secondaryMuscles.includes(muscle)) &&
            (!equip || e.equipment === equip) &&
            matches(e, q),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [all, q, cat, muscle, equip, inactive],
  );
  if (!all) return null;

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{t('exercise.title')}</h1>
        <Link className="button" to="/exercises/new">
          + {t('exercise.new')}
        </Link>
      </div>
      <div className="card form-grid">
        <label>
          {t('common.search')}
          <input type="search" value={q} placeholder={t('picker.placeholder')} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          {t('exercise.category')}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('exercise.primary')}
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {muscles.map((m) => (
              <option key={m} value={m}>
                {tr(t, 'muscle', m)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('exercise.equipment')}
          <select value={equip} onChange={(e) => setEquip(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {equipment.map((m) => (
              <option key={m} value={m}>
                {tr(t, 'equipment', m)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> {t('exercise.showInactive')}
        </label>
      </div>

      {all.length === 0 ? (
        <Empty>
          <p>{t('dashboard.emptyLibrary')}</p>
          <button onClick={() => void repo.seedLibrary()}>{t('dashboard.seed')}</button>
        </Empty>
      ) : (
        <div className="card">
          <p className="muted">{t('exercise.count', { count: list.length })}</p>
          <ul className="list">
            {list.map((e) => (
              <li key={e.id}>
                <Link to={`/exercises/${e.id}`}>
                  <strong>{e.name}</strong>
                </Link>
                {!e.active && <span className="badge neutral"> {t('exercise.inactive')}</span>}
                <br />
                <small>
                  {t(`category.${e.category}`)} · {e.primaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')} · {tr(t, 'equipment', e.equipment)} · {t(`strategy.${e.progression.strategy}`)}
                </small>
              </li>
            ))}
            {!list.length && <li className="muted">{t('exercise.noResults')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
