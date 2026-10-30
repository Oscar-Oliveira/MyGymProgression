// Joins two exercises that are the same (D19): every reference to the duplicate moves to the kept exercise.
import { nowIso } from './factory';
import type { Exercise, PlanVersion, ProgressionEvent, ProgressionState, Revision, Workout, WorkoutEntry } from './types';
import { adHocLineage } from './workout';

export interface MergeInput {
  keep: Exercise;
  drop: Exercise;
  versions: PlanVersion[];
  workouts: Workout[];
  states: ProgressionState[];
  events: ProgressionEvent[];
  revisions: Revision[];
}

/** Only the records that change. `deleteStates` are lineage ids to remove (the duplicate's own ad-hoc progression). */
export interface MergeResult {
  exercise: Exercise;
  versions: PlanVersion[];
  workouts: Workout[];
  states: ProgressionState[];
  deleteStates: string[];
  events: ProgressionEvent[];
  revisions: Revision[];
  counts: { plans: number; workouts: number; progression: number };
}

const uniq = (xs: string[]) => [...new Set(xs)];
const changed = <T,>(a: T, b: T) => JSON.stringify(a) !== JSON.stringify(b);
const filled = (v: unknown) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

export function mergeExercises({ keep, drop, versions, workouts, states, events, revisions }: MergeInput): MergeResult {
  const id = (x: string) => (x === drop.id ? keep.id : x);
  const dropLineage = adHocLineage(drop.id);
  const keepLineage = adHocLineage(keep.id);
  const lineage = (l: string) => (l === dropLineage ? keepLineage : l);

  const entry = (e: WorkoutEntry): WorkoutEntry => {
    const exerciseId = id(e.exerciseId);
    const substitutedFor = e.substitutedFor && id(e.substitutedFor) !== exerciseId ? id(e.substitutedFor) : undefined;
    // The exercise snapshot is kept: history shows what was logged at the time.
    return { ...e, exerciseId, substitutedFor, ...(e.lineageId ? { lineageId: lineage(e.lineageId) } : {}) };
  };
  const workout = (w: Workout): Workout => ({ ...w, entries: w.entries.map(entry) });

  const outVersions = versions
    .map((v) => ({
      ...v,
      days: v.days.map((d) => ({
        ...d,
        items: d.items.map((i) => {
          const exerciseId = id(i.exerciseId);
          return { ...i, exerciseId, substitutes: uniq(i.substitutes.map(id)).filter((s) => s !== exerciseId) };
        }),
      })),
    }))
    .filter((v, n) => changed(v, versions[n]));
  const outWorkouts = workouts.map(workout).filter((w, n) => changed(w, workouts[n]));
  const outRevisions = revisions.map((r) => ({ ...r, previous: workout(r.previous) })).filter((r, n) => changed(r, revisions[n]));
  const outEvents = events.map((e) => ({ ...e, exerciseId: id(e.exerciseId), lineageId: lineage(e.lineageId) })).filter((e, n) => changed(e, events[n]));

  // States: plan lineages only change their exercise id; the duplicate's ad-hoc state moves to the kept one (newest wins).
  const outStates: ProgressionState[] = [];
  const deleteStates: string[] = [];
  const keepAdHoc = states.find((s) => s.lineageId === keepLineage);
  for (const s of states) {
    if (s.lineageId === dropLineage) {
      deleteStates.push(dropLineage);
      if (!keepAdHoc || s.updatedAt > keepAdHoc.updatedAt) outStates.push({ ...s, lineageId: keepLineage, exerciseId: keep.id });
    } else if (s.exerciseId === drop.id) outStates.push({ ...s, exerciseId: keep.id });
  }

  // The kept exercise: the duplicate's names become other names; empty library fields are filled from the duplicate.
  const names = new Set([keep.name.toLowerCase()]);
  const aliases = [...keep.aliases, drop.name, ...drop.aliases].filter((n) => !names.has(n.toLowerCase()) && (names.add(n.toLowerCase()), true));
  const fill = <K extends keyof Exercise>(k: K) => (filled(keep[k]) ? keep[k] : drop[k]);
  const exercise: Exercise = {
    ...keep,
    aliases,
    tags: uniq([...keep.tags, ...drop.tags]),
    links: [...keep.links, ...drop.links.filter((l) => !keep.links.some((k) => k.url === l.url))],
    instructions: fill('instructions'),
    safetyNotes: fill('safetyNotes'),
    personalNotes: [keep.personalNotes, drop.personalNotes].filter(Boolean).join('\n'),
    group: fill('group'),
    overview: fill('overview'),
    steps: fill('steps'),
    tips: fill('tips'),
    thumb: fill('thumb'),
    image: fill('image'),
    video: fill('video'),
    muscleDetail: fill('muscleDetail'),
    source: fill('source'),
    related: fill('related'),
    updatedAt: nowIso(),
  };

  const plans = new Set(outVersions.map((v) => v.planId)).size;
  return { exercise, versions: outVersions, workouts: outWorkouts, states: outStates, deleteStates, events: outEvents, revisions: outRevisions, counts: { plans, workouts: outWorkouts.length, progression: outEvents.length + outStates.length } };
}
