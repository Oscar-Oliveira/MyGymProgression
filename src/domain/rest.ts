// Rest timer between sets (V2-D6). The end time is kept in the workout, so the timer survives a reload.
import type { Settings, Workout, WorkoutEntry } from './types';

export const DEFAULT_REST = 90;
export const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

/** Rest after a set of this entry, in seconds (0 = off): the plan item's, else the setting's (default 90 s). */
export const restFor = (entry: Pick<WorkoutEntry, 'restSec'> | undefined, s: Pick<Settings, 'restSec'>): number => entry?.restSec ?? s.restSec ?? DEFAULT_REST;

export function startRest(w: Workout, seconds: number, now = Date.now()): Workout {
  return seconds > 0 ? { ...w, restUntil: new Date(now + seconds * 1000).toISOString(), restTotal: seconds } : w;
}

/** −15 s / +15 s: never before now. */
export function adjustRest(w: Workout, delta: number, now = Date.now()): Workout {
  if (!w.restUntil) return w;
  const until = Math.max(now, Date.parse(w.restUntil) + delta * 1000);
  return { ...w, restUntil: new Date(until).toISOString(), restTotal: Math.max(1, (w.restTotal ?? 0) + delta) };
}

export function endRest(w: Workout): Workout {
  const { restUntil: _until, restTotal: _total, ...rest } = w;
  return rest;
}

/** Whole seconds left (0 when over or not running). */
export const restLeft = (w: Pick<Workout, 'restUntil'>, now = Date.now()): number => (w.restUntil ? Math.max(0, Math.ceil((Date.parse(w.restUntil) - now) / 1000)) : 0);

/**
 * After a change to a workout in progress: when a set has just been marked done, the rest of that entry starts.
 * No rest after the last set of the workout. Any other change keeps the timer as it is.
 */
export function restAfterChange(before: Workout, after: Workout, s: Pick<Settings, 'restSec'>, now = Date.now()): Workout {
  if (after.status !== 'in_progress') return after;
  const doneIn = (e: WorkoutEntry) => e.sets.filter((x) => x.status === 'done').length;
  const changed = after.entries.find((e) => doneIn(e) > doneIn(before.entries.find((b) => b.id === e.id) ?? { ...e, sets: [] }));
  if (!changed) return after;
  const pending = after.entries.some((e) => e.sets.some((x) => x.status === 'pending'));
  return pending ? startRest(after, restFor(changed, s), now) : endRest(after);
}
