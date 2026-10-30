import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CoachStyle } from '../../domain/types';
import { CoachAvatar } from './CoachAvatar';

/** Personal trainer message at the top of the workout; can be closed (remembered for this workout). */
export function CoachCard({ workoutId, message, style }: { workoutId: string; message: string; style: CoachStyle }) {
  const { t } = useTranslation();
  const key = `coach:${workoutId}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !message) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      // Without storage the message only hides for this visit.
    }
  };
  return (
    <div className="coach" role="note" aria-label={t('coach.title')}>
      <CoachAvatar style={style} />
      <p>{message}</p>
      <button className="ghost sm" aria-label={t('common.close')} onClick={close}>
        ✕
      </button>
    </div>
  );
}
