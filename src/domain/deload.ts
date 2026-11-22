// Deload suggestion (V2-D17): after `threshold` sessions without progress, the app asks to lower the load by 10 %.
// It is a question like "missed reps": the user steps back (−10 %) or keeps the load.
import type { Outcome, ProgressionEvent, ProgressionStep } from './types';
import { round } from './units';

export const DELOAD_FACTOR = 0.9;
/** Outcomes that count as "no progress" (the same as a stalled exercise in Analysis). */
const NO_PROGRESS: Outcome[] = ['keep', 'missed'];

/**
 * The event as a deload question when the exercise has had no progress for `threshold` sessions in a row (this one
 * included). The run restarts after progress or after an earlier deload question. Only double and triple
 * progression on load; the new load is rounded down to the load increment.
 */
export function deloadEvent(ev: ProgressionEvent, history: ProgressionEvent[], threshold: number, step: ProgressionStep | undefined): ProgressionEvent {
  if (ev.outcome !== 'keep' || (ev.strategy !== 'double' && ev.strategy !== 'triple')) return ev;
  if (!step || step.metric !== 'load' || step.increment <= 0) return ev;
  const from = ev.before.load;
  if (!from) return ev;
  const earlier = history
    .filter((h) => h.lineageId === ev.lineageId && h.workoutId !== ev.workoutId && h.createdAt < ev.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let streak = 1;
  for (const h of earlier) {
    if (h.outcome === 'deload' || !NO_PROGRESS.includes(h.outcome)) break;
    streak++;
  }
  if (streak < threshold) return ev;
  const to = round(Math.floor((from * DELOAD_FACTOR) / step.increment + 1e-9) * step.increment);
  if (to <= 0 || to >= from) return ev;
  return { ...ev, outcome: 'deload', decision: 'pending', suggestion: { metric: 'load', from, to, kind: 'decrease' }, reasons: [{ code: 'stalled', params: { n: streak } }, ...ev.reasons] };
}
