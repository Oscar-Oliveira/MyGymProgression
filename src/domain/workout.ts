// Workout use-case logic: start from a plan day, session edits, finish, progression decisions. Pure functions.
import { applyTargets, evaluate, initialTargets, setGoals } from './progression';
import { nowIso, uid } from './factory';
import { dayGoal, goalProgression } from './goals';
import type {
  Exercise,
  ExerciseSnapshot,
  MetricKey,
  Plan,
  PlanDay,
  PlanItem,
  PlanVersion,
  ProgressionConfig,
  ProgressionEvent,
  ProgressionState,
  SetPrescription,
  SetRecord,
  Workout,
  WorkoutEntry,
} from './types';

/**
 * Returns a lookup for the latest finished entry of a lineage, optionally only before a date.
 * Substituted entries are skipped: "last time" always refers to the planned exercise.
 */
export function lastEntryFinder(workouts: Workout[], beforeIso?: string): (lineageId: string) => WorkoutEntry | undefined {
  const sorted = workouts
    .filter((w) => w.status !== 'in_progress' && (!beforeIso || w.startedAt < beforeIso))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (lineageId) => {
    for (const w of sorted) {
      const e = w.entries.find((x) => x.lineageId === lineageId && !x.substitutedFor);
      if (e) return e;
    }
    return undefined;
  };
}

export function snapshot(ex: Exercise): ExerciseSnapshot {
  return structuredClone({
    name: ex.name,
    ...(ex.thumb ? { thumb: ex.thumb } : {}),
    category: ex.category,
    metrics: ex.metrics,
    loadMode: ex.loadMode,
    primaryMuscles: ex.primaryMuscles,
    secondaryMuscles: ex.secondaryMuscles,
  });
}

export const adHocLineage = (exerciseId: string) => `exercise:${exerciseId}`;

/**
 * Creates the session sets. Each set gets today's goal (see setGoals) and is pre-filled with it,
 * so a set done as planned needs one tap. Metrics without a goal take last session's value.
 */
function setsFor(prescription: SetPrescription[], config: ProgressionConfig, previous?: WorkoutEntry): SetRecord[] {
  const goals = setGoals(config, prescription, previous);
  const counters: Record<string, number> = {};
  return prescription.map((p, n) => {
    const i = counters[p.kind] ?? 0;
    counters[p.kind] = i + 1;
    const prev = previous?.sets.filter((s) => s.kind === p.kind && s.status === 'done')[i];
    const values: SetRecord['values'] = { ...(prev?.values ?? {}), ...goals[n] };
    return { id: uid(), kind: p.kind, values, goal: goals[n], status: 'pending', notes: '' };
  });
}

/** The progression rule for a plan item: an explicit item override, else the plan goal rule (D11). */
export function itemProgression(plan: Pick<Plan, 'goal'> | undefined, item: PlanItem, ex: Exercise): ProgressionConfig {
  return goalProgression(plan, ex, item.progression);
}

export function entryFromItem(item: PlanItem, ex: Exercise, state?: ProgressionState, previous?: WorkoutEntry, plan?: Pick<Plan, 'goal'>): WorkoutEntry {
  const prescription = applyTargets(item.sets, state?.targets, state?.repsRange);
  const progression = itemProgression(plan, item, ex);
  const prev = previous?.exerciseId === ex.id ? previous : undefined;
  return {
    id: uid(),
    exerciseId: ex.id,
    exercise: snapshot(ex),
    lineageId: item.lineageId,
    prescription,
    progression,
    group: item.group,
    role: item.role,
    sets: setsFor(prescription, progression, prev),
    pain: false,
    technique: false,
    notes: item.notes,
  };
}

export function entryAdHoc(ex: Exercise, state?: ProgressionState, previous?: WorkoutEntry): WorkoutEntry {
  const prescription = applyTargets(ex.defaultSets, state?.targets, state?.repsRange);
  const progression = structuredClone(ex.progression);
  const prev = previous?.exerciseId === ex.id ? previous : undefined;
  return {
    id: uid(),
    exerciseId: ex.id,
    exercise: snapshot(ex),
    lineageId: adHocLineage(ex.id),
    prescription,
    progression,
    role: ex.category === 'warmup' ? 'warmup' : 'main',
    sets: setsFor(prescription, progression, prev),
    pain: false,
    technique: false,
    notes: '',
  };
}

export interface StartContext {
  exercises: Map<string, Exercise>;
  states: Map<string, ProgressionState>;
  lastEntry: (lineageId: string) => WorkoutEntry | undefined;
}

export function startWorkout(plan: Plan | undefined, version: PlanVersion | undefined, day: PlanDay | undefined, ctx: StartContext): Workout {
  const now = nowIso();
  const entries = (day?.items ?? []).flatMap((item) => {
    const ex = ctx.exercises.get(item.exerciseId);
    if (!ex) return [];
    const entry = entryFromItem(item, ex, ctx.states.get(item.lineageId), ctx.lastEntry(item.lineageId), dayGoal(plan, day));
    const circuit = day?.circuits?.find((c) => c.id === item.circuitId);
    return [circuit ? { ...entry, circuit: { ...circuit } } : entry];
  });
  return {
    id: uid(),
    startedAt: now,
    planId: plan?.id,
    planVersionId: version?.id,
    dayId: day?.id,
    planName: plan?.name,
    dayName: day?.name,
    status: 'in_progress',
    notes: '',
    entries,
    updatedAt: now,
  };
}

/** Replaces the exercise of an entry for this session only. Progression is blocked by default for substitutions. */
export function substitute(entry: WorkoutEntry, ex: Exercise): WorkoutEntry {
  if (ex.id === entry.exerciseId) return entry;
  const original = entry.substitutedFor ?? entry.exerciseId;
  return { ...entry, exerciseId: ex.id, exercise: snapshot(ex), substitutedFor: ex.id === original ? undefined : original };
}

/**
 * "Short on time" (D40): removes the optional exercises not started yet, and one pending working set from each other
 * exercise with 3 or more working sets (outside circuits). Those exercises are marked short: no increase this time.
 */
export function shortenWorkout(w: Workout): Workout {
  const lastIndex = <T,>(xs: T[], f: (x: T) => boolean) => xs.map(f).lastIndexOf(true);
  const started = (e: WorkoutEntry) => e.sets.some((s) => s.status !== 'pending');
  const entries = w.entries
    .filter((e) => e.role !== 'optional' || started(e))
    .map((e) => {
      const working = e.prescription.filter((p) => p.kind === 'working').length;
      const last = lastIndex(e.sets, (s) => s.kind === 'working');
      if (e.circuit || working < 3 || last < 0 || e.sets[last].status !== 'pending') return e;
      const rx = lastIndex(e.prescription, (p) => p.kind === 'working');
      return { ...e, short: true, sets: e.sets.filter((_, i) => i !== last), prescription: e.prescription.filter((_, i) => i !== rx) };
    });
  return { ...w, short: true, entries };
}

/** "Do it later" (D41): moves the entries at `indexes` (one exercise or a whole circuit) to the end of the workout. */
export function moveToEnd(w: Workout, indexes: number[]): Workout {
  const moved = indexes.map((i) => w.entries[i]);
  return { ...w, entries: [...w.entries.filter((_, i) => !indexes.includes(i)), ...moved] };
}

export function addSet(entry: WorkoutEntry, kind: SetRecord['kind'] = 'working'): WorkoutEntry {
  const last = [...entry.sets].reverse().find((s) => s.kind === kind) ?? entry.sets[entry.sets.length - 1];
  const set: SetRecord = { id: uid(), kind, values: { ...(last?.values ?? {}) }, status: 'pending', notes: '' };
  return { ...entry, sets: [...entry.sets, set] };
}

export function evaluateEntry(entry: WorkoutEntry, previous?: WorkoutEntry) {
  return evaluate({
    config: entry.progression,
    prescription: entry.prescription,
    sets: entry.sets,
    pain: entry.pain,
    technique: entry.technique,
    substituted: entry.substitutedFor !== undefined,
    short: entry.short,
    previous: previous && previous.exerciseId === entry.exerciseId ? { prescription: previous.prescription, sets: previous.sets } : undefined,
  });
}

/** Overall status: completed when every prescribed working set of non-optional entries is done. */
export function workoutStatus(w: Workout, interrupted: boolean): Workout['status'] {
  if (interrupted) return 'interrupted';
  const ok = w.entries
    .filter((e) => e.role !== 'optional')
    .every((e) => e.sets.filter((s) => s.kind === 'working' && s.status === 'done').length >= e.prescription.filter((p) => p.kind === 'working').length);
  return ok ? 'completed' : 'partial';
}

/** Re-evaluates all entries. Used at finish and after corrections. Pending sets become skipped. */
export function evaluateWorkout(w: Workout, previous: (lineageId: string) => WorkoutEntry | undefined): Workout {
  const entries = w.entries.map((e) => {
    const sets = e.sets.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' as const } : s));
    const next = { ...e, sets };
    return { ...next, evaluation: evaluateEntry(next, e.lineageId ? previous(e.lineageId) : undefined) };
  });
  return { ...w, entries };
}

/** Progression events for evaluated entries. An increase is applied at once; missed reps and "ready" wait for the user. */
export function eventsFor(workout: Workout, states: Map<string, ProgressionState>, entryIds?: Set<string>): { events: ProgressionEvent[]; states: ProgressionState[] } {
  const now = nowIso();
  const changed: ProgressionState[] = [];
  const events: ProgressionEvent[] = workout.entries
    .filter((e) => e.lineageId && e.evaluation && e.progression.strategy !== 'none' && (!entryIds || entryIds.has(e.id)))
    .map((e) => {
      const ev = e.evaluation!;
      const state = states.get(e.lineageId!);
      const before = state?.targets ?? initialTargets(e.progression, e.prescription);
      let after = { ...before };
      if (ev.outcome === 'increase' && ev.suggestion) {
        after = { ...before, [ev.suggestion.metric]: ev.suggestion.to };
        // A load increase restarts from the plan's rep range.
        changed.push({ lineageId: e.lineageId!, exerciseId: e.exerciseId, targets: after, updatedAt: now });
      }
      return {
        id: uid(),
        workoutId: workout.id,
        entryId: e.id,
        lineageId: e.lineageId!,
        exerciseId: e.exerciseId,
        strategy: ev.strategy,
        outcome: ev.outcome,
        suggestion: ev.suggestion,
        ...(ev.repsOption ? { repsOption: ev.repsOption } : {}),
        reasons: ev.reasons,
        decision: ev.outcome === 'increase' ? 'applied' : ev.outcome === 'missed' || ev.outcome === 'ready' ? 'pending' : 'none',
        before: { ...before },
        after,
        ...(state?.repsRange ? { rangeBefore: state.repsRange } : {}),
        ...(state?.repsRange && ev.outcome !== 'increase' ? { rangeAfter: state.repsRange } : {}),
        createdAt: now,
        ...(ev.outcome === 'increase' ? { decidedAt: now } : {}),
      } satisfies ProgressionEvent;
    });
  return { events, states: changed };
}

/** Finishes a workout: evaluates every entry and creates one progression event per progressive entry. */
export function finishWorkout(
  w: Workout,
  interrupted: boolean,
  previous: (lineageId: string) => WorkoutEntry | undefined,
  states: Map<string, ProgressionState>,
): { workout: Workout; events: ProgressionEvent[]; states: ProgressionState[] } {
  const now = nowIso();
  const evaluated = evaluateWorkout(w, previous);
  const workout: Workout = { ...evaluated, status: workoutStatus(evaluated, interrupted), endedAt: now, updatedAt: now };
  return { workout, ...eventsFor(workout, states) };
}

/**
 * Reopens a finished workout so it can be continued (resume after an interruption).
 * Skipped sets become pending again (sets left open at the interruption were saved as skipped); evaluations are removed,
 * because the workout is evaluated again when it is finished.
 */
export function reopenWorkout(w: Workout): Workout {
  return {
    ...w,
    status: 'in_progress',
    endedAt: undefined,
    updatedAt: nowIso(),
    entries: w.entries.map(({ evaluation: _evaluation, ...e }) => ({ ...e, sets: e.sets.map((s) => (s.status === 'skipped' ? { ...s, status: 'pending' as const } : s)) })),
  };
}

/** Only the most recent workout can be resumed, when it is paused (in progress) or interrupted. */
export function resumable(w: Workout, all: Workout[]): boolean {
  if (w.status !== 'in_progress' && w.status !== 'interrupted') return false;
  return !all.some((x) => x.id !== w.id && x.startedAt > w.startedAt);
}

export type DecisionInput = { kind: 'keep' } | { kind: 'apply' } | { kind: 'stepBack' } | { kind: 'repsUp' } | { kind: 'revert' } | { kind: 'set'; value: number; reason: string };

const sameTargets = (a: ProgressionState['targets'], b: ProgressionState['targets']) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * An applied change can be undone only while it is still the current state,
 * so undoing an old event never overwrites newer progress.
 */
export function canRevert(event: ProgressionEvent, state: ProgressionState | undefined): boolean {
  if (!['applied', 'reps_up', 'stepped_back', 'overridden'].includes(event.decision)) return false;
  if (!state) return true;
  return sameTargets(state.targets, event.after) && JSON.stringify(state.repsRange ?? null) === JSON.stringify(event.rangeAfter ?? null);
}

/**
 * A pending question can be answered only while the targets are still those it was asked about,
 * so an old answer never overwrites newer progress.
 */
export function canDecide(event: ProgressionEvent, state: ProgressionState | undefined): boolean {
  if (event.decision !== 'pending') return false;
  if (!state) return true;
  return Object.entries(event.before).every(([k, v]) => state.targets[k as MetricKey] === v) && JSON.stringify(state.repsRange ?? null) === JSON.stringify(event.rangeBefore ?? null);
}

/** Applies a user decision to an event and returns the updated event and progression state. */
export function decide(event: ProgressionEvent, state: ProgressionState | undefined, input: DecisionInput): { event: ProgressionEvent; state: ProgressionState } {
  const now = nowIso();
  const base: ProgressionState = state ?? { lineageId: event.lineageId, exerciseId: event.exerciseId, targets: { ...event.before }, ...(event.rangeBefore ? { repsRange: event.rangeBefore } : {}), updatedAt: now };
  if (input.kind !== 'revert' && !canDecide(event, state)) return { event, state: base };
  const s = event.suggestion;
  const next = (targets: ProgressionState['targets'], repsRange: ProgressionState['repsRange']): ProgressionState => {
    const { repsRange: _old, ...rest } = base;
    return { ...rest, targets, ...(repsRange ? { repsRange } : {}), updatedAt: now };
  };
  const done = (decision: ProgressionEvent['decision'], st: ProgressionState, extra: Partial<ProgressionEvent> = {}) => {
    const { rangeAfter: _r, ...ev } = event;
    return { event: { ...ev, decision, after: { ...st.targets }, ...(st.repsRange ? { rangeAfter: st.repsRange } : {}), decidedAt: now, ...extra }, state: st };
  };
  switch (input.kind) {
    case 'keep':
      return done('kept', next({ ...base.targets, ...event.before }, event.rangeBefore));
    case 'revert':
      if (!canRevert(event, state)) return { event, state: base };
      return done('reverted', next({ ...base.targets, ...event.before }, event.rangeBefore));
    case 'apply':
    case 'stepBack': {
      if (!s) return { event, state: base };
      // A load increase restarts from the plan's rep range.
      const st = next({ ...base.targets, [s.metric]: s.to }, s.kind === 'increase' ? undefined : base.repsRange);
      return done(s.kind === 'increase' ? 'applied' : 'stepped_back', st);
    }
    case 'repsUp':
      if (!event.repsOption) return { event, state: base };
      return done('reps_up', next({ ...base.targets }, event.repsOption.to));
    case 'set': {
      const metric = s?.metric ?? (Object.keys(event.before)[0] as MetricKey | undefined);
      if (!metric) return { event, state: base };
      return done('overridden', next({ ...base.targets, [metric]: input.value }, base.repsRange), { decisionReason: input.reason });
    }
  }
}

/** Manual change of current targets outside a recommendation (manual progression or correction). */
export function manualAdjust(
  state: ProgressionState | undefined,
  lineageId: string,
  exerciseId: string,
  targets: Partial<Record<MetricKey, number>>,
  reason: string,
  strategy: ProgressionEvent['strategy'],
): { event: ProgressionEvent; state: ProgressionState } {
  const now = nowIso();
  const before = { ...(state?.targets ?? {}) };
  const after = { ...before, ...targets };
  return {
    event: { id: uid(), lineageId, exerciseId, strategy, outcome: 'manual', reasons: [], decision: 'overridden', decisionReason: reason, before, after, createdAt: now, decidedAt: now },
    state: { lineageId, exerciseId, targets: after, ...(state?.repsRange ? { repsRange: state.repsRange } : {}), updatedAt: now },
  };
}

/** Removes a "reps up" range, so the plan's rep range applies again (the plan range was changed). Targets do not change. */
export function resetRepsRange(state: ProgressionState, reason: string, strategy: ProgressionEvent['strategy']): { event: ProgressionEvent; state: ProgressionState } {
  const now = nowIso();
  const { repsRange, ...rest } = state;
  return {
    event: {
      id: uid(), lineageId: state.lineageId, exerciseId: state.exerciseId, strategy, outcome: 'manual', reasons: [], decision: 'overridden', decisionReason: reason,
      before: { ...state.targets }, after: { ...state.targets }, ...(repsRange ? { rangeBefore: repsRange } : {}), createdAt: now, decidedAt: now,
    },
    state: { ...rest, updatedAt: now },
  };
}

/**
 * Days from `now` to the next date of a plan day set to a weekday (0 = today), or undefined without a weekday.
 * A day already finished today counts from next week.
 */
export function daysUntil(day: PlanDay, workouts: Workout[], now: Date): number | undefined {
  if (day.weekday === undefined) return undefined;
  const d = (day.weekday - ((now.getDay() + 6) % 7) + 7) % 7;
  const today = now.toLocaleDateString('sv');
  const doneToday = workouts.some((w) => w.dayId === day.id && w.status !== 'in_progress' && new Date(w.startedAt).toLocaleDateString('sv') === today);
  return d === 0 && doneToday ? 7 : d;
}

/**
 * Next training day of a plan. When days are set to a weekday: the nearest one from today (plan order on a tie).
 * Otherwise the day after the last finished day in plan order, else the first day.
 */
export function nextDay(version: PlanVersion, workouts: Workout[], now = new Date()): PlanDay | undefined {
  const scheduled = version.days.flatMap((day) => {
    const d = daysUntil(day, workouts, now);
    return d === undefined ? [] : [{ day, d }];
  });
  if (scheduled.length) return scheduled.reduce((a, b) => (b.d < a.d ? b : a)).day;
  const last = workouts
    .filter((w) => w.planId === version.planId && w.status !== 'in_progress' && w.dayId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const i = last ? version.days.findIndex((d) => d.id === last.dayId) : -1;
  return version.days[(i + 1) % Math.max(1, version.days.length)];
}

/**
 * Next workout over the active plans: the nearest day set to a weekday in any plan (plan order on a tie).
 * Without weekdays: the next day of the plan used most recently, else of the first plan.
 */
export function nextPlanned(plans: Plan[], versions: PlanVersion[], workouts: Workout[], now = new Date()): { plan: Plan; version: PlanVersion; day: PlanDay } | undefined {
  const options = plans.flatMap((plan) => {
    const version = versions.find((v) => v.id === plan.currentVersionId);
    const day = version && nextDay(version, workouts, now);
    return version && day ? [{ plan, version, day, d: daysUntil(day, workouts, now) }] : [];
  });
  const scheduled = options.filter((o) => o.d !== undefined);
  if (scheduled.length) return scheduled.reduce((a, b) => (b.d! < a.d! ? b : a));
  const recent = workouts.filter((w) => w.status !== 'in_progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).find((w) => options.some((o) => o.plan.id === w.planId));
  return options.find((o) => o.plan.id === recent?.planId) ?? options[0];
}
