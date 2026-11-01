// Export/import logic for the versioned JSON interchange format. Pure functions; storage is done in src/data.
import type { Challenge, Exercise, GameScore, Plan, PlanVersion, ProgressionEvent, ProgressionState, Revision, Settings, Workout } from './types';
import { bundleSchema, FORMAT_ID, SCHEMA_VERSION } from './schema';
import { v1to2 } from './migrations';

export interface DataSet {
  exercises: Exercise[];
  plans: Plan[];
  planVersions: PlanVersion[];
  progressionStates: ProgressionState[];
  workouts: Workout[];
  progressionEvents: ProgressionEvent[];
  revisions: Revision[];
  gameScores: GameScore[];
  challenges: Challenge[];
  settings?: Settings;
}

export type TableName = Exclude<keyof DataSet, 'settings'>;
export const TABLES: TableName[] = ['exercises', 'plans', 'planVersions', 'progressionStates', 'workouts', 'progressionEvents', 'revisions', 'gameScores', 'challenges'];
export type Scope = 'full' | 'library' | 'plans';

export interface Bundle {
  format: typeof FORMAT_ID;
  schemaVersion: number;
  exportedAt: string;
  app: { version: string };
  scope: Scope;
  data: DataSet;
}

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export const keyOf = (table: TableName, r: object): string =>
  table === 'progressionStates' ? (r as ProgressionState).lineageId : (r as { id: string }).id;

export function emptyDataSet(): DataSet {
  return { exercises: [], plans: [], planVersions: [], progressionStates: [], workouts: [], progressionEvents: [], revisions: [], gameScores: [], challenges: [] };
}

/** Builds an export bundle. "library" = exercises only; "plans" = plans, versions, states and referenced exercises. */
export function buildBundle(all: DataSet, scope: Scope, appVersion: string, now = new Date().toISOString()): Bundle {
  let data: DataSet;
  if (scope === 'library') {
    data = { ...emptyDataSet(), exercises: all.exercises };
  } else if (scope === 'plans') {
    const used = new Set(all.planVersions.flatMap((v) => v.days.flatMap((d) => d.items.flatMap((i) => [i.exerciseId, ...i.substitutes]))));
    data = {
      ...emptyDataSet(),
      plans: all.plans,
      planVersions: all.planVersions,
      progressionStates: all.progressionStates,
      exercises: all.exercises.filter((e) => used.has(e.id)),
    };
  } else {
    data = all;
  }
  return { format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now, app: { version: appVersion }, scope, data };
}

/** Migrations from older schema versions. Each function upgrades raw JSON by one version. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  1: v1to2.bundle,
  // v3 only adds optional fields (goal-based progression), so v2 data is valid as is.
  2: (raw) => ({ ...raw, schemaVersion: 3 }),
  // v4 only adds optional library fields to exercises (images, steps, video, source).
  3: (raw) => ({ ...raw, schemaVersion: 4 }),
  // v5 removes rest times; validation drops the old restSec fields.
  4: (raw) => ({ ...raw, schemaVersion: 5 }),
  // v6 only adds an optional goal per day (mixed plans).
  5: (raw) => ({ ...raw, schemaVersion: 6 }),
  // v7 only adds optional fields: colours, circuits, theme and personal trainer settings.
  6: (raw) => ({ ...raw, schemaVersion: 7 }),
  // v8 only adds when the personal trainer speaks during a workout.
  7: (raw) => ({ ...raw, schemaVersion: 8 }),
  // v9 only adds whether the personal trainer also speaks on other pages.
  8: (raw) => ({ ...raw, schemaVersion: 9 }),
  // v10 only adds game scores, weekly challenges and the challenge setting.
  9: (raw) => ({ ...raw, schemaVersion: 10 }),
  // v11 only adds which workout closed a question (event.closedBy) and per-side records (challenge.perSide).
  10: (raw) => ({ ...raw, schemaVersion: 11 }),
};

export type ParseResult = { ok: true; bundle: Bundle; migratedFrom?: number } | { ok: false; errors: string[] };

export function parseBundle(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: ['file_too_large'] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['invalid_json'] };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== FORMAT_ID) {
    return { ok: false, errors: ['not_a_backup'] };
  }
  let obj = raw as Record<string, unknown>;
  const original = Number(obj.schemaVersion);
  if (!Number.isInteger(original) || original < 1) return { ok: false, errors: ['schema_version_missing'] };
  if (original > SCHEMA_VERSION) return { ok: false, errors: [`schema_version_newer:${original}`] };
  for (let v = original; v < SCHEMA_VERSION; v++) obj = MIGRATIONS[v](obj);

  const parsed = bundleSchema.safeParse(obj);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  return { ok: true, bundle: parsed.data as Bundle, ...(original < SCHEMA_VERSION ? { migratedFrom: original } : {}) };
}

export interface TablePreview {
  incoming: number;
  new: number;
  identical: number;
  conflicts: string[];
}

export interface Preview {
  tables: Record<TableName, TablePreview>;
  /** Imported exercises with a different id but the same name and equipment as an existing one. */
  duplicateExercises: { importedId: string; existingId: string; name: string }[];
  /** References to exercises that exist neither in the import nor locally. */
  missingExerciseRefs: string[];
}

const canonicalJson = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function previewImport(incoming: DataSet, existing: DataSet): Preview {
  const tables = {} as Record<TableName, TablePreview>;
  for (const t of TABLES) {
    const local = new Map((existing[t] as object[]).map((r) => [keyOf(t, r), canonicalJson(r)]));
    const p: TablePreview = { incoming: incoming[t].length, new: 0, identical: 0, conflicts: [] };
    for (const r of incoming[t] as object[]) {
      const k = keyOf(t, r);
      const l = local.get(k);
      if (l === undefined) p.new++;
      else if (l === canonicalJson(r)) p.identical++;
      else p.conflicts.push(k);
    }
    tables[t] = p;
  }
  const localIds = new Set(existing.exercises.map((e) => e.id));
  const byName = new Map(existing.exercises.map((e) => [`${normalize(e.name)}|${normalize(e.equipment)}`, e.id]));
  const duplicateExercises = incoming.exercises
    .filter((e) => !localIds.has(e.id))
    .flatMap((e) => {
      const existingId = byName.get(`${normalize(e.name)}|${normalize(e.equipment)}`);
      return existingId ? [{ importedId: e.id, existingId, name: e.name }] : [];
    });

  const known = new Set([...localIds, ...incoming.exercises.map((e) => e.id)]);
  const refs = new Set<string>();
  for (const v of incoming.planVersions) for (const d of v.days) for (const i of d.items) [i.exerciseId, ...i.substitutes].forEach((x) => refs.add(x));
  for (const w of incoming.workouts) for (const e of w.entries) refs.add(e.exerciseId);
  const missingExerciseRefs = [...refs].filter((r) => !known.has(r));
  return { tables, duplicateExercises, missingExerciseRefs };
}

export type ConflictPolicy = 'skip' | 'overwrite' | 'keepBoth';
export type DuplicatePolicy = 'import' | 'useExisting';

/** Replaces every string equal to a key in `map` (ids are UUIDs, so exact matches are safe). */
function remap<T>(value: T, map: Map<string, string>): T {
  if (!map.size) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map.get(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/**
 * Computes the records to write for a merge import. Existing records are never removed.
 * - skip: keep the local record on conflict.
 * - overwrite: replace the local record on conflict.
 * - keepBoth: import the conflicting record under a new id (references inside the import are rewritten).
 *   Progression states are keyed by lineage, so they are skipped under keepBoth.
 * There is one weekly challenge per week: an imported challenge of a week that already has one here is not imported
 * (on a conflict of the same challenge, only "overwrite" replaces it).
 */
export function planMerge(
  incoming: DataSet,
  existing: DataSet,
  policy: ConflictPolicy,
  duplicates: DuplicatePolicy,
  newId: () => string = () => crypto.randomUUID(),
): DataSet {
  const preview = previewImport(incoming, existing);
  const idMap = new Map<string, string>();
  const dropExercise = new Set<string>();
  if (duplicates === 'useExisting') {
    for (const d of preview.duplicateExercises) {
      idMap.set(d.importedId, d.existingId);
      dropExercise.add(d.importedId);
    }
  }
  if (policy === 'keepBoth') {
    for (const t of TABLES) {
      if (t === 'progressionStates') continue;
      for (const k of preview.tables[t].conflicts) idMap.set(k, newId());
    }
  }
  const out = emptyDataSet();
  for (const t of TABLES) {
    const conflicts = new Set(preview.tables[t].conflicts);
    const local = new Set((existing[t] as object[]).map((r) => keyOf(t, r)));
    const weeks = new Set(existing.challenges.map((c) => c.week));
    const rows = (incoming[t] as object[]).filter((r) => {
      const k = keyOf(t, r);
      if (t === 'exercises' && dropExercise.has(k)) return false;
      if (t === 'challenges') return conflicts.has(k) ? policy === 'overwrite' : !local.has(k) && !weeks.has((r as { week: string }).week);
      // Identical records already exist; never rewrite them.
      if (!conflicts.has(k)) return !local.has(k);
      if (policy === 'overwrite') return true;
      if (policy === 'keepBoth') return t !== 'progressionStates';
      return false;
    });
    (out[t] as object[]) = rows.map((r) => remap(r, idMap));
  }
  return out;
}
