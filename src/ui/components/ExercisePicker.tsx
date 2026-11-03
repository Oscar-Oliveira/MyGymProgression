import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import type { Exercise } from '../../domain/types';
import { tr } from '../util';
import { Modal } from './Modal';
import { ExerciseItem } from './ExerciseItem';
import { Icon } from './Icon';

/** Results shown at first and added by "show more", as in the exercise list. */
const PAGE = 60;

export const matches = (e: Exercise, q: string) => {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const needle = n(q.trim());
  return !needle || [e.name, ...e.aliases, ...e.tags].some((s) => n(s).includes(needle));
};

/** Exercise search. `preferred` ids (e.g. plan substitutes) are listed first. */
export function ExercisePicker({ onPick, onClose, exclude = [], preferred = [] }: { onPick: (e: Exercise) => void; onClose: () => void; exclude?: string[]; preferred?: string[] }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const all = useLiveQuery(() => db.exercises.toArray(), [], []);
  const list = useMemo(
    () =>
      all
        .filter((e) => e.active && !exclude.includes(e.id) && matches(e, q))
        .sort((a, b) => Number(preferred.includes(b.id)) - Number(preferred.includes(a.id)) || a.name.localeCompare(b.name)),
    [all, q, exclude, preferred],
  );
  const shown = list.slice(0, limit);
  return (
    <Modal title={t('picker.title')} onClose={onClose}>
      <input type="search" autoFocus placeholder={t('picker.placeholder')} aria-label={t('common.search')} value={q} onChange={(e) => (setQ(e.target.value), setLimit(PAGE))} />
      <ul className="pick-list">
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" className="pick" onClick={() => onPick(e)}>
              <ExerciseItem
                name={e.name}
                trailing={preferred.includes(e.id) ? <Icon name="star" /> : undefined}
                thumb={e.thumb}
                size="sm"
                sub={[tr(t, 'equipment', e.equipment), e.primaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')].filter(Boolean).join(' · ')}
              />
            </button>
          </li>
        ))}
        {!list.length && <li className="muted">{t('exercise.noResults')}</li>}
      </ul>
      {list.length > shown.length && (
        <button type="button" className="outline xl" style={{ marginTop: '0.75rem' }} onClick={() => setLimit(limit + PAGE)}>
          {t('exercise.showMore', { n: Math.min(PAGE, list.length - shown.length), left: list.length - shown.length })}
        </button>
      )}
    </Modal>
  );
}
