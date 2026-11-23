import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { exerciseGroup, mineIds } from '../../domain/library';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../domain/types';
import { matches } from '../components/ExercisePicker';
import { ExerciseItem } from '../components/ExerciseItem';
import { Empty, HeadAction, PageHead } from '../components/Bits';
import { FilterChip, FilterRow, OptionSheet, ViewTabs } from '../components/Controls';
import { tr } from '../util';

const PAGE = 60;
type Tab = 'mine' | 'lib';

/** The view and the filters, kept in the URL. */
const fromUrl = (params: URLSearchParams) => ({
  tab: (params.get('tab') === 'lib' ? 'lib' : 'mine') as Tab,
  q: params.get('q') ?? '',
  group: (params.get('group') ?? '') as MuscleGroup | '',
  equip: params.get('equip') ?? '',
  inactive: params.get('inactive') === '1',
  fav: params.get('fav') === '1',
  n: Math.max(PAGE, Number(params.get('n')) || PAGE),
});

/**
 * Exercises (V2-D22): Mine (in a plan or a workout, own, favourite) and the Library, as tabs; a search and filter chips
 * (group, equipment, favourites, inactive) on both.
 */
export function ExerciseList() {
  const { t } = useTranslation();
  const data = useLiveQuery(async () => {
    const [all, versions, workouts] = await Promise.all([db.exercises.toArray(), db.planVersions.toArray(), db.workouts.toArray()]);
    return { all, mine: mineIds(all, versions, workouts) };
  }, []);
  // The filters are copied to the URL, so "back" from an exercise returns to the same search.
  // Typing writes the URL (replace) and does not read it back: the URL changes after a short delay, and typing must not wait for it.
  // A new URL from elsewhere (a link, back or forward) sets the filters again.
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(() => fromUrl(params));
  const { key } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== 'REPLACE') setFilters(fromUrl(params));
    // Only a new page of history counts, not each update of the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const { tab, q, group, equip, inactive, fav, n: limit } = filters;
  const set = (next: Partial<typeof filters>) => {
    const v = { ...filters, n: PAGE, ...next };
    setFilters(v);
    const out: Record<string, string> = {};
    if (v.tab === 'lib') out.tab = 'lib';
    if (v.q) out.q = v.q;
    if (v.group) out.group = v.group;
    if (v.equip) out.equip = v.equip;
    if (v.inactive) out.inactive = '1';
    if (v.fav) out.fav = '1';
    if (v.n > PAGE) out.n = String(v.n);
    setParams(out, { replace: true });
  };
  const [sheet, setSheet] = useState<'group' | 'equip'>();
  const [busy, setBusy] = useState(false);

  const all = data?.all;
  const inTab = useMemo(() => (data ? data.all.filter((e) => data.mine.has(e.id) === (tab === 'mine')) : []), [data, tab]);
  const counts = useMemo(() => {
    const c = { mine: 0, lib: 0 };
    for (const e of data?.all ?? []) if (e.active) c[data!.mine.has(e.id) ? 'mine' : 'lib']++;
    return c;
  }, [data]);
  const visible = (e: (typeof inTab)[number]) => inactive || e.active;
  const groupCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of inTab) if (visible(e)) c[exerciseGroup(e)] = (c[exerciseGroup(e)] ?? 0) + 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTab, inactive]);
  const equipment = useMemo(() => [...new Set(inTab.map((e) => e.equipment).filter(Boolean))].sort(), [inTab]);
  const list = useMemo(
    () =>
      inTab
        .filter((e) => visible(e) && (!fav || e.favorite) && (!group || exerciseGroup(e) === group) && (!equip || e.equipment === equip) && matches(e, q))
        // Mine: favourites first; the library: exercises with an image first.
        .sort((a, b) => (tab === 'mine' ? Number(!!b.favorite) - Number(!!a.favorite) : Number(!!b.thumb) - Number(!!a.thumb)) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inTab, q, group, equip, inactive, fav, tab],
  );
  if (!all) return null;
  const showing = list.slice(0, limit);
  // Nothing in Mine for this search: how many the library has, to search there instead.
  const inLibrary = tab === 'mine' && !list.length && q ? all.filter((e) => !data!.mine.has(e.id) && (inactive || e.active) && matches(e, q)).length : 0;
  const importLib = async () => {
    setBusy(true);
    await repo.seedLibrary();
    setBusy(false);
  };

  return (
    <div>
      <PageHead
        title={t('exercise.title')}
        more
        count={t('exercise.count', { count: counts.mine + counts.lib })}
        actions={<HeadAction icon="plus" label={t('exercise.new')} to="/exercises/new" primary />}
      />

      {all.length === 0 ? (
        <Empty
          action={
            <button className="primary" disabled={busy} onClick={() => void importLib()}>
              {busy ? '…' : t('settings.seed')}
            </button>
          }
        >
          {t('dashboard.emptyLibrary')}
        </Empty>
      ) : (
        <>
          <ViewTabs
            label={t('exercise.title')}
            active={tab}
            onPick={(k) => set({ tab: k as Tab, group: '', equip: '' })}
            items={[
              { key: 'mine', label: t('exercise.mine'), count: counts.mine },
              { key: 'lib', label: t('exercise.library'), count: counts.lib },
            ]}
          />
          <input type="search" style={{ width: '100%' }} value={q} placeholder={t('picker.placeholder')} aria-label={t('common.search')} onChange={(e) => set({ q: e.target.value })} />
          <FilterRow label={t('filters.label')}>
            <FilterChip label={t('exercise.group')} value={group ? t(`group.${group}`) : undefined} onOpen={() => setSheet('group')} onClear={() => set({ group: '' })} />
            {equipment.length > 0 && (
              <FilterChip label={t('exercise.equipment')} value={equip ? tr(t, 'equipment', equip) : undefined} onOpen={() => setSheet('equip')} onClear={() => set({ equip: '' })} />
            )}
            {(fav || all.some((e) => e.favorite)) && <FilterChip label={t('exercise.favorites')} icon="star" pressed={fav} onToggle={() => set({ fav: !fav })} />}
            {(inactive || all.some((e) => !e.active)) && <FilterChip label={t('exercise.inactiveFilter')} pressed={inactive} onToggle={() => set({ inactive: !inactive })} />}
          </FilterRow>

          {!list.length ? (
            tab === 'mine' && !q && !group && !equip && !fav ? (
              <Empty
                action={
                  <button className="outline" onClick={() => set({ tab: 'lib' })}>
                    {t('exercise.openLibrary')}
                  </button>
                }
              >
                {t('exercise.mineEmpty')}
              </Empty>
            ) : (
              <Empty
                action={
                  inLibrary > 0 && (
                    <button className="outline" onClick={() => set({ tab: 'lib', group: '', equip: '', fav: false })}>
                      {t('exercise.searchLibrary', { count: inLibrary })}
                    </button>
                  )
                }
              >
                {t('exercise.noResults')}
              </Empty>
            )
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
            </section>
          )}
          {/* Attribution of the v2 library media, shown only in the Exercises area (V2-D4). */}
          {all.some((e) => e.source?.name.startsWith('exercises-dataset')) && <p className="privacy-note">{t('exercise.mediaCredit')}</p>}
        </>
      )}

      {sheet === 'group' && (
        <OptionSheet
          title={t('exercise.group')}
          value={group}
          onPick={(v) => set({ group: v as MuscleGroup | '' })}
          onClose={() => setSheet(undefined)}
          options={[{ value: '', label: t('filters.all') }, ...MUSCLE_GROUPS.filter((g) => groupCounts[g]).map((g) => ({ value: g, label: t(`group.${g}`), count: groupCounts[g] }))]}
        />
      )}
      {sheet === 'equip' && (
        <OptionSheet
          title={t('exercise.equipment')}
          value={equip}
          onPick={(v) => set({ equip: v })}
          onClose={() => setSheet(undefined)}
          options={[{ value: '', label: t('filters.all') }, ...equipment.map((m) => ({ value: m, label: tr(t, 'equipment', m) }))]}
        />
      )}
    </div>
  );
}
