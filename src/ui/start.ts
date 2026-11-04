import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/db';
import { repo } from '../data/repo';
import { dialog } from './components/Dialog';

/**
 * Every "Start" follows one rule (D78): with a workout in progress, the app asks to continue that one instead.
 * `prepare` runs before a new workout starts (the plan editor saves); returning false stops the start.
 */
export function useStart() {
  const { t } = useTranslation();
  const nav = useNavigate();
  return async (planId?: string, dayId?: string, prepare?: () => Promise<boolean>) => {
    const open = await db.workouts.where('status').equals('in_progress').first();
    if (open) {
      if (await dialog.confirm(t('start.inProgress', { name: open.dayName ?? t('workout.free') }), { ok: t('start.continue') })) nav(`/workout/${open.id}`);
      return;
    }
    if (prepare && !(await prepare())) return;
    nav(`/workout/${await repo.startWorkout(planId, dayId)}`);
  };
}
