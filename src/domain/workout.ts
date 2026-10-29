// Workout use-case logic: start from a plan day, session edits, finish, progression decisions. Pure functions.
import { applyTargets, evaluate, initialTargets } from './progression';
import { nowIso, uid } from './factory';
import type {
  Exercise,
  ExerciseSnapshot,
  MetricKey,
  Plan,
  PlanDay,
  PlanItem,
  PlanVersion,
  ProgressionEvent,
  ProgressionState,
  SetPrescription,
  SetRecord,
  Workout,
  WorkoutEntry,
} from './types';

/** Returns a lookup for the latest finished entry of a lineage, optionally only before a date. */
export function lastEntryFinder(workouts: Workout[], beforeIso?: string): (lineageId: string) => WorkoutEntry | undefined {
  const sorted = workouts
    .filter((w) => w.status !== 'in_progress' && (!beforeIso || w.startedAt < beforeIso))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (lineageId) => {
    for (const w of sorted) {
      const e = w.entries.find((x) => x.lineageId === lineageId);
      if (e) return e;
    }
    return undefined;
  };
}

export function snapshot(ex: Exercise): ExerciseSnapshot {
  return structuredClone({
    name: ex.name,
    category: ex.category,
    metrics: ex.metrics,
    loadMode: ex.loadMode,
    primaryMuscles: ex.primaryMuscles,
    secondaryMuscles: ex.secondaryMuscles,
  });
}

export const adHocLineage = (exerciseId: string) => `exercise:${exerciseId}`;

/**
 * Pre-fills a set from the prescription: a fixed target value first (e.g. the current working load),
 * then the value from the same set last session, then the range minimum.
 */
function prefill(p: SetPrescription, index: number, previous?: WorkoutEntry): SetRecord {
  const prev = previous?.sets.filter((s) => s.kind === p.kind)[index];
  const values: SetRecord['values'] = {};
  const keys = new Set<MetricKey>([...(Object.keys(p.targets) as MetricKey[]), ...(Object.keys(prev?.values ?? {}) as MetricKey[])]);
  for (const k of keys) {
    const t = p.targets[k];
    const v = t?.value ?? prev?.values[k] ?? t?.min;
    if (v !== undefined) values[k] = v;
  }
  return { id: uid(), kind: p.kind, values, status: 'pending', notes: '' };
}

function setsFor(prescription: SetPrescription[], previous?: WorkoutEntry): SetRecord[] {
  const counters: Record<string, number> = {};
  return prescription.map((p) => {
    const i = counters[p.kind] ?? 0;
    counters[p.kind] = i + 1;
    return prefill(p, i, previous);
  });
}

export function entryFromItem(item: PlanItem, ex: Exercise, state?: ProgressionState, previous?: WorkoutEntry): WorkoutEntry {
  const prescription = applyTargets(item.sets, state?.targets);
  return {
    id: uid(),
    exerciseId: ex.id,
    exercise: snapshot(ex),
    lineageId: item.lineageId,
    prescription,
    progression: structuredClone(item.progression ?? ex.progression),
    group: item.group,
    role: item.role,
    sets: setsFor(prescription, previous),
    pain: false,
    technique: false,
    notes: item.notes,
  };
}

export function entryAdHoc(ex: Exercise, state?: ProgressionState, previous?: WorkoutEntry): WorkoutEntry {
  const prescription = applyTargets(ex.defaultSets, state?.targets);
  return {
    id: uid(),
    exerciseId: ex.id,
    exercise: snapshot(ex),
    lineageId: adHocLineage(ex.id),
    prescription,
    progression: structuredClone(ex.progression),
    role: ex.category === 'warmup' ? 'warmup' : 'main',
    sets: setsFor(prescription, previous),
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
    return ex ? [entryFromItem(item, ex, ctx.states.get(item.lineageId), ctx.lastEntry(item.lineageId))] : [];
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

export function finishWorkout(
  w: Workout,
  interrupted: boolean,
  previous: (lineageId: string) => WorkoutEntry | undefined,
  states: Map<string, ProgressionState>,
): { workout: Workout; events: ProgressionEvent[] } {
  const now = nowIso();
  const evaluated = evaluateWorkout(w, previous);
  const workout: Workout = { ...evaluated, status: workoutStatus(evaluated, interrupted), endedAt: now, updatedAt: now };
  const events: ProgressionEvent[] = workout.entries
    .filter((e) => e.lineageId && e.evaluation && e.progression.strategy !== 'none')
    .map((e) => {
      const targets = states.get(e.lineageId!)?.targets ?? initialTargets(e.progression, e.prescription);
      return {
        id: uid(),
        workoutId: workout.id,
        entryId: e.id,
        lineageId: e.lineageId!,
        exerciseId: e.exerciseId,
        strategy: e.evaluation!.strategy,
        outcome: e.evaluation!.outcome,
        recommendation: e.evaluation!.recommendation,
        reasons: e.evaluation!.reasons,
        decision: e.evaluation!.recommendation ? 'pending' : 'none',
        before: { ...targets },
        after: { ...targets },
        createdAt: now,
      };
    });
  return { workout, events };
}

export type DecisionInput = { kind: 'accept' } | { kind: 'override'; value: number; reason: string } | { kind: 'defer'; reason?: string };

/** Applies a user decision to a pending recommendation and returns the updated event and state. */
export function decide(event: ProgressionEvent, state: ProgressionState | undefined, input: DecisionInput): { event: ProgressionEvent; state: ProgressionState } {
  const now = nowIso();
  const rec = event.recommendation;
  const base: ProgressionState = state ?? { lineageId: event.lineageId, exerciseId: event.exerciseId, targets: rec ? { [rec.metric]: rec.from } : {}, updatedAt: now };
  if (!rec || input.kind === 'defer') {
    return { event: { ...event, decision: 'deferred', decisionReason: input.kind === 'defer' ? input.reason : undefined, decidedAt: now }, state: base };
  }
  const value = input.kind === 'accept' ? rec.to : input.value;
  const targets = { ...base.targets, [rec.metric]: value };
  return {
    event: {
      ...event,
      decision: input.kind === 'accept' ? 'accepted' : 'overridden',
      decisionReason: input.kind === 'override' ? input.reason : undefined,
      before: { ...base.targets },
      after: targets,
      decidedAt: now,
    },
    state: { ...base, targets, updatedAt: now },
  };
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
    state: { lineageId, exerciseId, targets: after, updatedAt: now },
  };
}

/** Next training day of a plan: the day after the last finished day in plan order, else the first day. */
export function nextDay(version: PlanVersion, workouts: Workout[]): PlanDay | undefined {
  const last = workouts
    .filter((w) => w.planId === version.planId && w.status !== 'in_progress' && w.dayId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const i = last ? version.days.findIndex((d) => d.id === last.dayId) : -1;
  return version.days[(i + 1) % Math.max(1, version.days.length)];
}
