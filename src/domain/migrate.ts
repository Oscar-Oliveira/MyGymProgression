// Migration of v1 data into v2 (F3, docs/V2-PLAN.md). Pure functions: reading v1 and writing v2 are in src/data.
// Every v1 exercise that is used is matched to the v2 library (exercises-dataset); the user reviews the matches.
// Exercises keep their v1 id, so plans and history keep pointing at them; two v1 exercises matched to the same
// library exercise are joined (mergeExercises, D19). Workout records and their exercise snapshots do not change.
import { nowIso } from './factory';
import { TABLES, type DataSet, type TableName } from './interchange';
import { equipmentOf, normalizeRecord, toExercise, type LibraryRecord } from './library';
import { mergeExercises } from './merge';
import { seedExercises } from './seed';
import type { Exercise, Settings, Workout } from './types';

/** Decision for one v1 exercise (a string): a library source id, or KEEP (it stays as the user's own exercise). */
export const KEEP = 'keep';

export type MatchKind = 'exact' | 'probable' | 'none';
export interface Candidate {
  sid: string;
  score: number;
}
export interface MatchSuggestion {
  exerciseId: string;
  name: string;
  equipment: string;
  /** Workout entries and plan items that use the exercise. */
  uses: number;
  kind: MatchKind;
  /** Best library matches first (at most 5). */
  candidates: Candidate[];
}

const PROBABLE = 0.55;
const STOP = new Set(['with', 'on', 'the', 'a', 'of', 'and', 'to', 'male', 'v', 'version']);
const SYNONYM: Record<string, string> = {
  bicep: 'biceps', tricep: 'triceps', curls: 'curl', raises: 'raise', squats: 'squat', lunges: 'lunge', ups: 'up', dips: 'dip',
  rows: 'row', flyes: 'fly', flys: 'fly', revers: 'reverse', sitted: 'seated', deg: 'degrees', jumping: 'jump', jumps: 'jump',
};
/** Equipment words: compared apart from the movement words, so a shared "lever" alone is not a match. */
const EQUIPMENT_VOCABULARY = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'smith', 'sled', 'ez', 'band', 'kettlebell', 'weighted', 'ball', 'medicine', 'machine', 'bodyweight', 'trap', 'olympic', 'resistance', 'stability', 'exercise']);
/** Equipment that can stand in for each other: no penalty between them (EZ bar ≈ barbell, an elliptical is a machine). */
const EQUIPMENT_FAMILY: Record<string, string> = {
  barbell: 'barbell', ez_bar: 'barbell', trap_bar: 'barbell',
  machine: 'machine', sled: 'machine', smith: 'smith', assisted: 'machine', elliptical: 'machine', stepmill: 'machine', skierg: 'machine', ergometer: 'machine', bike: 'machine', treadmill: 'machine', rower: 'machine',
  bodyweight: 'body', weighted: 'body', stability_ball: 'body', bosu: 'body', suspension: 'body',
  dumbbell: 'dumbbell', cable: 'cable', band: 'band', kettlebell: 'kettlebell', medicine_ball: 'medicine_ball',
};
/** Phrases read as the dataset's own words before comparing. */
const PHRASES: [RegExp, string][] = [[/\bpec deck\b/g, 'seated fly']];
/** Words the dataset puts first in a name for each v1 equipment (v1 names often leave the equipment out). */
const EQUIPMENT_WORDS: Record<string, string[]> = {
  barbell: ['barbell'], dumbbell: ['dumbbell'], cable: ['cable'], machine: ['lever'], smith: ['smith'], sled: ['sled'], ez_bar: ['ez', 'barbell'],
  band: ['band'], kettlebell: ['kettlebell'], weighted: ['weighted'], stability_ball: ['ball'], medicine_ball: ['medicine', 'ball'], trap_bar: ['trap', 'bar'],
};

/** Comparable words of an exercise name: lower case, no accents, "°" read as "degrees", common plurals and typos joined. */
export function nameTokens(name: string): string[] {
  const s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/в?°/g, ' degrees ')
    .replace(/[^a-z0-9]+/g, ' ');
  return PHRASES.reduce((t, [re, to]) => t.replace(re, to), s)
    .split(' ').filter(Boolean).map((w) => SYNONYM[w] ?? w).filter((w) => !STOP.has(w));
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const dice = (a: Set<string>, b: Set<string>) => (a.size + b.size ? (2 * [...a].filter((x) => b.has(x)).length) / (a.size + b.size) : 0);

/** Ids of every exercise that v1 data refers to, with the number of workout entries and plan items that use it. */
export function exerciseUses(v1: DataSet): Map<string, number> {
  const uses = new Map<string, number>();
  const add = (id: string | undefined, n = 1) => {
    if (id) uses.set(id, (uses.get(id) ?? 0) + n);
  };
  const entries = (w: Workout, n: number) => {
    for (const e of w.entries) {
      add(e.exerciseId, n);
      add(e.substitutedFor, 0);
    }
  };
  for (const w of v1.workouts) entries(w, 1);
  for (const r of v1.revisions) entries(r.previous, 0);
  const current = new Set(v1.plans.map((p) => p.currentVersionId));
  for (const v of v1.planVersions)
    for (const i of v.days.flatMap((d) => d.items)) {
      add(i.exerciseId, current.has(v.id) ? 1 : 0);
      i.substitutes.forEach((s) => add(s, 0));
    }
  for (const s of v1.progressionStates) add(s.exerciseId, 0);
  for (const e of v1.progressionEvents) add(e.exerciseId, 0);
  for (const g of v1.goals) add(g.exerciseId, 0);
  for (const c of v1.challenges) add(c.exerciseId, 0);
  return uses;
}

/**
 * The v1 exercises that move to v2: every exercise that is used, the user's own exercises (not built-in, no library
 * source), and exercises with a favourite mark or personal notes. Unused library entries stay in v1.
 */
export function exercisesToMigrate(v1: DataSet): Exercise[] {
  const uses = exerciseUses(v1);
  const builtIn = new Set(['pt', 'en'].flatMap((language) => seedExercises({ language: language as 'pt' | 'en', loadUnit: 'kg', distanceUnit: 'km' }).map((e) => e.name.toLowerCase())));
  return v1.exercises.filter((e) => uses.has(e.id) || (!e.source && !builtIn.has(e.name.toLowerCase())) || e.favorite || e.personalNotes.trim());
}

/** Library matches for each exercise that moves, most used first. */
export function suggestMatches(v1: DataSet, records: LibraryRecord[]): MatchSuggestion[] {
  const uses = exerciseUses(v1);
  // Movement words: no equipment words, no numbers and degrees (they only count for an exact match).
  const movement = (words: Set<string>) => new Set([...words].filter((w) => !EQUIPMENT_VOCABULARY.has(w) && !/^\d+$/.test(w) && w !== 'degrees'));
  const family = (e: string) => EQUIPMENT_FAMILY[e];
  const recs = records.map(normalizeRecord).map((r) => {
    const words = new Set(nameTokens(r.name));
    return { sid: r.sid, words, moves: movement(words), equipment: equipmentOf(r) };
  });
  return exercisesToMigrate(v1)
    .map((ex) => {
      const extra = EQUIPMENT_WORDS[ex.equipment] ?? [];
      const variants = [ex.name, ...ex.aliases].map((n) => new Set(nameTokens(n)));
      const withEquipment = variants.map((v) => new Set([...extra, ...v]));
      const moves = variants.map(movement);
      // Exact: the same words (with or without the equipment word). Otherwise: movement words (85 %) + same equipment (15 %).
      const scored = recs.map((r) => {
        const exact = [...variants, ...withEquipment].some((v) => sameSet(v, r.words));
        const name = Math.max(...moves.map((m) => dice(m, r.moves)));
        // Same equipment: +0.15; another family (dumbbell for a machine exercise): -0.15; unknown: 0.
        let equipment = 0;
        if (r.equipment && r.equipment === ex.equipment) equipment = 0.15;
        else if (family(r.equipment) && family(ex.equipment) && family(r.equipment) !== family(ex.equipment)) equipment = -0.15;
        let score = name > 0 ? Math.min(0.99, 0.85 * name + equipment) : 0;
        if (exact) score = 1;
        return { sid: r.sid, score, exact };
      });
      scored.sort((a, b) => b.score - a.score || Number(b.exact) - Number(a.exact));
      const top = scored.slice(0, 5).filter((c) => c.score > 0);
      let kind: MatchKind = (top[0]?.score ?? 0) >= PROBABLE ? 'probable' : 'none';
      if (top[0]?.exact) kind = 'exact';
      return { exerciseId: ex.id, name: ex.name, equipment: ex.equipment, uses: uses.get(ex.id) ?? 0, kind, candidates: top.map(({ sid, score }) => ({ sid, score: Math.round(score * 100) / 100 })) };
    })
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}

/** Starting decisions: exact and probable matches take the best candidate (probable ones still need the user's OK); the rest stay own. */
export function defaultDecisions(suggestions: MatchSuggestion[]): Record<string, string> {
  return Object.fromEntries(suggestions.map((s) => [s.exerciseId, s.kind === 'none' ? KEEP : s.candidates[0].sid]));
}

/**
 * A v1 exercise that takes a library exercise as its identity: library name (Portuguese when the app is in
 * Portuguese), muscles, equipment, images and source. The user's id, metrics, sets, progression, category, notes,
 * favourite and own instructions are kept; the old names become other names.
 */
export function adopt(ex: Exercise, rec: LibraryRecord, settings: Pick<Settings, 'language' | 'loadUnit' | 'distanceUnit'>, now = nowIso()): Exercise {
  const lib = toExercise(normalizeRecord(rec), settings, rec.pt);
  const seen = new Set([lib.name.toLowerCase()]);
  const aliases = [...lib.aliases, ex.name, ...ex.aliases].filter((n) => !seen.has(n.toLowerCase()) && (seen.add(n.toLowerCase()), true));
  const has = (v?: unknown[] | string) => !!v && v.length > 0;
  return {
    ...ex,
    name: lib.name,
    aliases,
    primaryMuscles: lib.primaryMuscles.length ? lib.primaryMuscles : ex.primaryMuscles,
    secondaryMuscles: lib.primaryMuscles.length ? lib.secondaryMuscles : ex.secondaryMuscles,
    equipment: lib.equipment || ex.equipment,
    group: lib.group,
    overview: has(ex.overview) ? ex.overview : lib.overview,
    steps: has(ex.steps) ? ex.steps : lib.steps,
    tips: has(ex.tips) ? ex.tips : lib.tips,
    thumb: lib.thumb ?? ex.thumb,
    image: lib.image ?? ex.image,
    video: lib.video ?? ex.video,
    muscleDetail: lib.muscleDetail,
    source: lib.source,
    related: [],
    updatedAt: now,
  };
}

export interface TableCheck {
  name: TableName | 'sets';
  before: number;
  after: number;
  ok: boolean;
}
export interface MigrationReport {
  ok: boolean;
  tables: TableCheck[];
  exercises: { v1: number; migrated: number; library: number; own: number; merged: number; left: number; libraryAdded: number };
  /** Workouts whose sets or volume changed (must be empty). */
  workoutMismatches: string[];
  /** References that pointed to an exercise in v1 and point to nothing in v2 (must be empty). */
  dangling: string[];
}

/** References from records to exercises, as "where:exerciseId"; only the ones that resolve in the data set. */
function resolvedRefs(d: DataSet): Set<string> {
  const ids = new Set(d.exercises.map((e) => e.id));
  const out = new Set<string>();
  const ref = (where: string, id?: string) => id && ids.has(id) && out.add(`${where}:${id}`);
  for (const v of d.planVersions) for (const day of v.days) for (const i of day.items) (ref(`plan ${v.id} item ${i.id}`, i.exerciseId), i.substitutes.forEach((s) => ref(`plan ${v.id} item ${i.id} substitute`, s)));
  for (const w of d.workouts) for (const e of w.entries) (ref(`workout ${w.id} entry ${e.id}`, e.exerciseId), ref(`workout ${w.id} entry ${e.id} substituted`, e.substitutedFor));
  for (const s of d.progressionStates) ref(`state ${s.lineageId}`, s.exerciseId);
  for (const e of d.progressionEvents) ref(`event ${e.id}`, e.exerciseId);
  for (const g of d.goals) ref(`goal ${g.id}`, g.exerciseId);
  for (const c of d.challenges) ref(`challenge ${c.id}`, c.exerciseId);
  return out;
}

/** Sets and volume (load × reps of done sets) of each workout. */
function workoutFigures(d: DataSet): Map<string, string> {
  return new Map(
    d.workouts.map((w) => {
      const sets = w.entries.flatMap((e) => e.sets);
      const volume = sets.filter((s) => s.status === 'done').reduce((t, s) => t + (s.values.load ?? 0) * (s.values.reps ?? 0), 0);
      return [w.id, `${sets.length}:${Math.round(volume * 1000)}`];
    }),
  );
}

/**
 * Checks the migrated data against v1: the same number of records in every table (progression states lose only the
 * duplicate ad-hoc states of joined exercises), the same sets and volume in every workout, and no reference that
 * resolved in v1 points to nothing in v2. A reference that maps to a joined exercise counts as resolved.
 */
export function checkMigration(v1: DataSet, v2: DataSet, joined: Map<string, string> = new Map(), statesDropped = 0): Omit<MigrationReport, 'exercises'> {
  const tables: TableCheck[] = TABLES.filter((t) => t !== 'exercises').map((t) => {
    const before = v1[t].length;
    const after = v2[t].length;
    return { name: t, before, after, ok: t === 'progressionStates' ? after === before - statesDropped : after === before };
  });
  const setCount = (d: DataSet) => d.workouts.reduce((n, w) => n + w.entries.reduce((m, e) => m + e.sets.length, 0), 0);
  tables.push({ name: 'sets', before: setCount(v1), after: setCount(v2), ok: setCount(v1) === setCount(v2) });
  const before = workoutFigures(v1);
  const after = workoutFigures(v2);
  const workoutMismatches = [...before].filter(([id, f]) => after.get(id) !== f).map(([id]) => id);
  const now = resolvedRefs(v2);
  const dangling = [...resolvedRefs(v1)]
    // Ad-hoc progression states of joined exercises are checked by their count (statesDropped).
    .filter((r) => !r.startsWith('state exercise:'))
    .map((r) => {
      const i = r.lastIndexOf(':');
      return { where: r.slice(0, i), id: joined.get(r.slice(i + 1)) ?? r.slice(i + 1) };
    })
    // A substitute that became the item's own exercise after a join is removed on purpose (mergeExercises).
    .filter(({ where, id }) => !now.has(`${where}:${id}`) && !now.has(`${where.replace(/ substituted?$/, '')}:${id}`))
    .map(({ where, id }) => `${where}:${id}`);
  return { ok: tables.every((t) => t.ok) && !workoutMismatches.length && !dangling.length, tables, workoutMismatches, dangling };
}

/**
 * Builds the v2 data set from v1 data, the v2 library and the user's decisions (missing decision = KEEP).
 * The rest of the library is added as new exercises. The input is not changed.
 */
export function migrateV1(
  input: DataSet,
  records: LibraryRecord[],
  decisions: Record<string, string>,
  settings: Pick<Settings, 'language' | 'loadUnit' | 'distanceUnit'>,
  now = nowIso(),
): { data: DataSet; report: MigrationReport } {
  const v1 = structuredClone(input);
  const d: DataSet = structuredClone(input);
  const bySid = new Map(records.map((r) => [r.sid, r]));
  const uses = exerciseUses(v1);
  const moving = exercisesToMigrate(v1).sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0));
  const out = new Map<string, Exercise>();
  const adoptedBySid = new Map<string, string>();
  const joined = new Map<string, string>();
  let statesDropped = 0;
  const replace = <T,>(list: T[], changed: T[], key: (x: T) => string) => {
    const byKey = new Map(changed.map((x) => [key(x), x]));
    return list.map((x) => byKey.get(key(x)) ?? x);
  };

  for (const ex of moving) {
    const decision = decisions[ex.id] ?? KEEP;
    const rec = decision === KEEP ? undefined : bySid.get(decision);
    const keepId = rec && adoptedBySid.get(rec.sid);
    if (!rec) out.set(ex.id, ex);
    else if (!keepId) {
      out.set(ex.id, adopt(ex, rec, settings, now));
      adoptedBySid.set(rec.sid, ex.id);
    } else {
      const r = mergeExercises({ keep: out.get(keepId)!, drop: ex, versions: d.planVersions, workouts: d.workouts, states: d.progressionStates, events: d.progressionEvents, revisions: d.revisions });
      d.planVersions = replace(d.planVersions, r.versions, (v) => v.id);
      d.workouts = replace(d.workouts, r.workouts, (w) => w.id);
      d.revisions = replace(d.revisions, r.revisions, (x) => x.id);
      d.progressionEvents = replace(d.progressionEvents, r.events, (e) => e.id);
      const before = d.progressionStates.length;
      const kept = d.progressionStates.filter((s) => !r.deleteStates.includes(s.lineageId));
      const upserts = new Map(r.states.map((s) => [s.lineageId, s]));
      d.progressionStates = [...kept.filter((s) => !upserts.has(s.lineageId)), ...upserts.values()];
      statesDropped += before - d.progressionStates.length;
      d.goals = d.goals.map((g) => (g.exerciseId === ex.id ? { ...g, exerciseId: keepId } : g));
      d.challenges = d.challenges.map((c) => (c.exerciseId === ex.id ? { ...c, exerciseId: keepId } : c));
      out.set(keepId, r.exercise);
      joined.set(ex.id, keepId);
    }
  }

  let libraryAdded = 0;
  for (const rec of records) {
    if (adoptedBySid.has(rec.sid)) continue;
    const ex = toExercise(normalizeRecord(rec), settings, rec.pt);
    out.set(ex.id, ex);
    libraryAdded++;
  }
  for (const [id, ex] of out) if (ex.variationOf && !out.has(ex.variationOf)) out.set(id, { ...ex, variationOf: joined.get(ex.variationOf) });
  d.exercises = [...out.values()];

  const library = adoptedBySid.size;
  const report: MigrationReport = {
    ...checkMigration(v1, d, joined, statesDropped),
    exercises: { v1: v1.exercises.length, migrated: moving.length, library, own: moving.length - library - joined.size, merged: joined.size, left: v1.exercises.length - moving.length, libraryAdded },
  };
  return { data: d, report };
}
