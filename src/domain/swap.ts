// Swaps the exercise of one plan item for another (V2-D32): it corrects a wrong choice, it is not a substitute for one day.
// Only the records of that item (its lineage) move to the new exercise: the item in every version of the plan, its workout
// entries (they show the new exercise), the corrections of those workouts, its progression events and its state.
// The wrong exercise stays as it is, with the rest of its history (other plans, free workouts).
import type { Exercise, PlanVersion, ProgressionEvent, ProgressionState, Revision, Workout, WorkoutEntry } from './types';
import { snapshot } from './workout';

export interface SwapInput {
  lineageId: string;
  fromId: string;
  to: Exercise;
  /** The metrics of the wrong exercise, to compare. */
  fromMetrics: Exercise['metrics'];
  versions: PlanVersion[];
  workouts: Workout[];
  states: ProgressionState[];
  events: ProgressionEvent[];
  revisions: Revision[];
}

/** Only the records that change. */
export interface SwapResult {
  versions: PlanVersion[];
  workouts: Workout[];
  states: ProgressionState[];
  events: ProgressionEvent[];
  revisions: Revision[];
  counts: { workouts: number; progression: number };
  /** False when the two exercises do not measure the same things (e.g. load × reps and time). */
  sameMetrics: boolean;
}

const changed = <T,>(a: T, b: T) => JSON.stringify(a) !== JSON.stringify(b);
const keys = (m: Exercise['metrics']) => m.map((x) => x.key).sort().join();

export function swapPlanExercise({ lineageId, fromId, to, fromMetrics, versions, workouts, states, events, revisions }: SwapInput): SwapResult {
  const shot = snapshot(to);
  const entry = (e: WorkoutEntry): WorkoutEntry => {
    if (e.lineageId !== lineageId) return e;
    if (e.exerciseId === fromId) return { ...e, exerciseId: to.id, exercise: shot };
    if (e.substitutedFor !== fromId) return e;
    // A substitute logged that day stays; it now stands in for the new exercise (or was the new exercise all along).
    const { substitutedFor: _, ...rest } = e;
    return e.exerciseId === to.id ? rest : { ...rest, substitutedFor: to.id };
  };
  const workout = (w: Workout): Workout => ({ ...w, entries: w.entries.map(entry) });

  const outVersions = versions
    .map((v) => ({
      ...v,
      days: v.days.map((d) => ({
        ...d,
        items: d.items.map((i) => (i.lineageId === lineageId ? { ...i, exerciseId: to.id, substitutes: i.substitutes.filter((s) => s !== to.id) } : i)),
      })),
    }))
    .filter((v, n) => changed(v, versions[n]));
  const outWorkouts = workouts.map(workout).filter((w, n) => changed(w, workouts[n]));
  const outRevisions = revisions.map((r) => ({ ...r, previous: workout(r.previous) })).filter((r, n) => changed(r, revisions[n]));
  const outEvents = events.filter((e) => e.lineageId === lineageId && e.exerciseId === fromId).map((e) => ({ ...e, exerciseId: to.id }));
  const outStates = states.filter((s) => s.lineageId === lineageId && s.exerciseId !== to.id).map((s) => ({ ...s, exerciseId: to.id }));

  return {
    versions: outVersions,
    workouts: outWorkouts,
    states: outStates,
    events: outEvents,
    revisions: outRevisions,
    counts: { workouts: outWorkouts.length, progression: outEvents.length + outStates.length },
    sameMetrics: keys(fromMetrics) === keys(to.metrics),
  };
}
