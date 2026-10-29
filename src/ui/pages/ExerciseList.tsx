import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { exerciseGroup } from '../../domain/library';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../domain/types';
import { matches } from '../components/ExercisePicker';
import { Thumb } from '../components/Thumb';
import { tr } from '../util';

const MAX_RESULTS = 200;

export function ExerciseList() {
  const { t } = useTranslation();
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | ''>('');
  const [equip, setEquip] = useState('');
  const [inactive, setInactive] = useState(false);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of all ?? []) if (e.active || inactive) c[exerciseGroup(e)] = (c[exerciseGroup(e)] ?? 0) + 1;
    return c;
  }, [all, inactive]);
  const equipment = useMemo(() => [...new Set((all ?? []).map((e) => e.equipment).filter(Boolean))].sort(), [all]);
  const list = useMemo(
    () =>
      (all ?? [])
        .filter((e) => (inactive || e.active) && (!group || exerciseGroup(e) === group) && (!equip || e.equipment === equip) && matches(e, q))
        .sort((a, b) => Number(!!b.thumb) - Number(!!a.thumb) || a.name.localeCompare(b.name)),
    [all, q, group, equip, inactive],
  );
  if (!all) return null;
  const showing = q || group || equip ? list.slice(0, MAX_RESULTS) : [];
  const importLib = async () => {
    setBusy(true);
    await repo.seedOrImport();
    setBusy(false);
  };

  return (
    <div>
      <div className="page-head">
        <h1>{t('exercise.title')}</h1>
        <Link className="btn btn-primary" to="/exercises/new">
          + {t('exercise.new')}
        </Link>
      </div>

      <input type="search" style={{ width: '100%' }} value={q} placeholder={t('picker.placeholder')} aria-label={t('common.search')} onChange={(e) => setQ(e.target.value)} />

      {all.length === 0 ? (
        <div className="empty" style={{ marginTop: '1rem' }}>
          <p>{t('dashboard.emptyLibrary')}</p>
          <button className="primary" disabled={busy} onClick={() => void importLib()}>
            {busy ? '…' : t('exercise.loadLibrary')}
          </button>
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label={t('exercise.groups')} style={{ margin: '0.75rem 0 0.5rem' }}>
            <button role="tab" aria-selected={!group} className={!group ? 'on' : ''} onClick={() => setGroup('')}>
              {t('common.all')}
            </button>
            {MUSCLE_GROUPS.filter((g) => counts[g]).map((g) => (
              <button key={g} role="tab" aria-selected={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
                {t(`group.${g}`)} <small style={{ color: 'inherit', opacity: 0.7 }}>{counts[g]}</small>
              </button>
            ))}
          </div>
          <div className="row wrap" style={{ marginBottom: '0.5rem' }}>
            <select aria-label={t('exercise.equipment')} value={equip} onChange={(e) => setEquip(e.target.value)}>
              <option value="">{t('exercise.allEquipment')}</option>
              {equipment.map((m) => (
                <option key={m} value={m}>
                  {tr(t, 'equipment', m)}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> {t('exercise.showInactive')}
            </label>
          </div>

          {!q && !group && !equip ? (
            <section className="card">
              <h2>{t('exercise.groups')}</h2>
              {MUSCLE_GROUPS.filter((g) => counts[g]).map((g) => (
                <button key={g} className="lib-row" style={{ width: '100%', background: 'transparent', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => setGroup(g)}>
                  <span className="main" style={{ textAlign: 'left' }}>
                    <span className="name">{t(`group.${g}`)}</span>
                  </span>
                  <span className="muted">{t('exercise.count', { count: counts[g] })} ›</span>
                </button>
              ))}
            </section>
          ) : (
            <section className="card">
              <p className="muted">
                {t('exercise.count', { count: list.length })}
                {list.length > MAX_RESULTS && ` · ${t('exercise.refine', { n: MAX_RESULTS })}`}
              </p>
              {showing.map((e) => (
                <Link key={e.id} to={`/exercises/${e.id}`} className="lib-row">
                  <Thumb src={e.thumb} name={e.name} size={56} />
                  <span className="main">
                    <span className="name">{e.name}</span>
                    {!e.active && <span className="badge"> {t('exercise.inactive')}</span>}
                    <br />
                    <span className="sub">
                      {tr(t, 'equipment', e.equipment)} · {e.primaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')}
                    </span>
                  </span>
                </Link>
              ))}
              {!list.length && <p className="muted">{t('exercise.noResults')}</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
