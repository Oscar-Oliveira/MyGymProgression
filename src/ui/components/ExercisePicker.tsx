import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import type { Exercise } from '../../domain/types';
import { tr } from '../util';
import { Modal } from './Modal';

export const matches = (e: Exercise, q: string) => {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const needle = n(q.trim());
  return !needle || [e.name, ...e.aliases, ...e.tags].some((s) => n(s).includes(needle));
};

/** Exercise search. `preferred` ids (e.g. plan substitutes) are listed first. */
export function ExercisePicker({ onPick, onClose, exclude = [], preferred = [] }: { onPick: (e: Exercise) => void; onClose: () => void; exclude?: string[]; preferred?: string[] }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const all = useLiveQuery(() => db.exercises.toArray(), [], []);
  const list = useMemo(
    () =>
      all
        .filter((e) => e.active && !exclude.includes(e.id) && matches(e, q))
        .sort((a, b) => Number(preferred.includes(b.id)) - Number(preferred.includes(a.id)) || a.name.localeCompare(b.name)),
    [all, q, exclude, preferred],
  );
  return (
    <Modal title={t('picker.title')} onClose={onClose}>
      <input type="search" autoFocus placeholder={t('picker.placeholder')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="pick-list">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)}>
              <strong>
                {preferred.includes(e.id) && '★ '}
                {e.name}
              </strong>
              <small>
                {t(`category.${e.category}`)} · {e.primaryMuscles.map((m) => tr(t, 'muscle', m)).join(', ')} · {tr(t, 'equipment', e.equipment)}
              </small>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted">{t('exercise.noResults')}</li>}
      </ul>
    </Modal>
  );
}
