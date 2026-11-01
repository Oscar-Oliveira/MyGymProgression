import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { exerciseGroup } from '../../domain/library';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../domain/types';
import { matches } from '../components/ExercisePicker';
import { ExerciseItem, ThumbStack } from '../components/ExerciseItem';
import { tr } from '../util';

const PAGE = 60;

export function ExerciseList() {
  const { t } = useTranslation();
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  // The filters are kept in the URL, so "back" from an exercise returns to the same search.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const group = (params.get('group') ?? '') as MuscleGroup | '';
  const equip = params.get('equip') ?? '';
  const inactive = params.get('inactive') === '1';
  const limit = Math.max(PAGE, Number(params.get('n')) || PAGE);
  const set = (next: { q?: string; group?: string; equip?: string; inactive?: boolean; n?: number }) => {
    const v = { q, group, equip, inactive, n: PAGE, ...next };
    const out: Record<string, string> = {};
    if (v.q) out.q = v.q;
    if (v.group) out.group = v.group;
    if (v.equip) out.equip = v.equip;
    if (v.inactive) out.inactive = '1';
    if (v.n > PAGE) out.n = String(v.n);
    setParams(out, { replace: true });
  };
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of all ?? []) if (e.active || inactive) c[exerciseGroup(e)] = (c[exerciseGroup(e)] ?? 0) + 1;
    return c;
  }, [all, inactive]);
  // Three images per group, from common exercises (those with a translated name first).
  const samples = useMemo(() => {
    const out: Record<string, { name: string; thumb?: string }[]> = {};
    for (const e of [...(all ?? [])].sort((a, b) => Number(!!b.aliases.length) - Number(!!a.aliases.length))) {
      if (!e.thumb || !e.active) continue;
      const g = exerciseGroup(e);
      if ((out[g] ??= []).length < 3) out[g].push({ name: e.name, thumb: e.thumb });
    }
    return out;
  }, [all]);
  const equipment = useMemo(() => [...new Set((all ?? []).map((e) => e.equipment).filter(Boolean))].sort(), [all]);
  const list = useMemo(
    () =>
      (all ?? [])
        .filter((e) => (inactive || e.active) && (!group || exerciseGroup(e) === group) && (!equip || e.equipment === equip) && matches(e, q))
        .sort((a, b) => Number(!!b.thumb) - Number(!!a.thumb) || a.name.localeCompare(b.name)),
    [all, q, group, equip, inactive],
  );
  if (!all) return null;
  const showing = q || group || equip ? list.slice(0, limit) : [];
  const importLib = async () => {
    setBusy(true);
    await repo.seedLibrary();
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

      <input type="search" style={{ width: '100%' }} value={q} placeholder={t('picker.placeholder')} aria-label={t('common.search')} onChange={(e) => set({ q: e.target.value })} />

      {all.length === 0 ? (
        <div className="empty" style={{ marginTop: '1rem' }}>
          <p>{t('dashboard.emptyLibrary')}</p>
          <button className="primary" disabled={busy} onClick={() => void importLib()}>
            {busy ? '…' : t('settings.seed')}
          </button>
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label={t('exercise.groups')} style={{ margin: '0.75rem 0 0.5rem' }}>
            <button role="tab" aria-selected={!group} className={!group ? 'on' : ''} onClick={() => set({ group: '' })}>
              {t('common.all')}
            </button>
            {MUSCLE_GROUPS.filter((g) => counts[g]).map((g) => (
              <button key={g} role="tab" aria-selected={group === g} className={group === g ? 'on' : ''} onClick={() => set({ group: g })}>
                {t(`group.${g}`)} <small style={{ color: 'inherit', opacity: 0.7 }}>{counts[g]}</small>
              </button>
            ))}
          </div>
          <div className="row wrap" style={{ marginBottom: '0.5rem' }}>
            <select aria-label={t('exercise.equipment')} value={equip} onChange={(e) => set({ equip: e.target.value })}>
              <option value="">{t('exercise.allEquipment')}</option>
              {equipment.map((m) => (
                <option key={m} value={m}>
                  {tr(t, 'equipment', m)}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={inactive} onChange={(e) => set({ inactive: e.target.checked })} /> {t('exercise.showInactive')}
            </label>
          </div>

          {!q && !group && !equip ? (
            <section className="card">
              <h2>{t('exercise.groups')}</h2>
              {MUSCLE_GROUPS.filter((g) => counts[g]).map((g) => (
                <button key={g} className="nav-row group-row" onClick={() => set({ group: g })}>
                  <ThumbStack items={samples[g] ?? []} />
                  <span className="main">
                    <span className="title">{t(`group.${g}`)}</span>
                    <span className="meta">{t('exercise.count', { count: counts[g] })}</span>
                  </span>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </section>
          ) : (
            <section className="card">
              <p className="muted">{t('exercise.count', { count: list.length })}</p>
              {showing.map((e) => (
                <ExerciseItem
                  key={e.id}
                  to={`/exercises/${e.id}`}
                  name={e.name}
                  thumb={e.thumb}
                  sub={[tr(t, 'equipment', e.equipment), e.primaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')].filter(Boolean).join(' · ')}
                  trailing={!e.active ? <span className="pill">{t('exercise.inactive')}</span> : undefined}
                />
              ))}
              {list.length > showing.length && (
                <button className="outline xl" style={{ marginTop: '0.75rem' }} onClick={() => set({ n: limit + PAGE })}>
                  {t('exercise.showMore', { n: Math.min(PAGE, list.length - showing.length), left: list.length - showing.length })}
                </button>
              )}
              {!list.length && <p className="muted">{t('exercise.noResults')}</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
