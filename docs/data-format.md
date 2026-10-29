# Interchange format (schema version 2)

JSON file produced by **Settings → Export**. The authoritative definition is the zod schema in [`src/domain/schema.ts`](../src/domain/schema.ts).

```json
{
  "format": "mygymprogression",
  "schemaVersion": 2,
  "exportedAt": "2026-10-29T10:00:00.000Z",
  "app": { "version": "0.1.0" },
  "scope": "full | library | plans",
  "data": {
    "exercises": [], "plans": [], "planVersions": [], "progressionStates": [],
    "workouts": [], "progressionEvents": [], "revisions": [], "settings": {}
  }
}
```

## Conventions

- Ids are UUID strings. Relationships use ids (`planVersions[].planId`, `planItem.exerciseId`, `workout.planVersionId`, `entry.lineageId`, …).
- Timestamps are ISO 8601 UTC strings.
- Values are stored **in the unit recorded**. Each exercise metric has an explicit `unit`; each workout entry keeps a snapshot of the metrics and units (`entry.exercise.metrics`). Analysis converts to canonical units (kg, s, m, km/h).
- `loadMode: "perSide"` means that the recorded load is per side or per dumbbell. Volume counts it twice.
- Metric keys: `reps, load, duration, distance, speed, incline, resistance, calories`, or `custom:<id>` with a `label` and a `unit`.
- `links[]` are media references (URLs only). Files are not embedded.

## Main objects

| Object | Purpose |
|---|---|
| `Exercise` | Library definition: metrics, default sets, default progression. |
| `Plan` / `PlanVersion` | Plan metadata / content that is immutable once used (days → items → set prescriptions). |
| `PlanItem.lineageId` | Stable across versions; keys `ProgressionState`. |
| `ProgressionState` | Current progressed targets per lineage, e.g. `{ "load": 42.5 }`. |
| `Workout` → `WorkoutEntry` → `SetRecord` | Actual session data, with prescription and exercise snapshots and the evaluation result. |
| `ProgressionEvent` | `outcome`, optional `suggestion` (`metric`, `from`, `to`, `kind`: increase/decrease), reasons, `decision` (`applied`, `reverted`, `pending`, `kept`, `stepped_back`, `overridden`, `none`), and targets before/after. |
| `SetRecord.goal` | Today's goal for the set, computed at workout start. |
| `Revision` | Full copy of a workout before a correction. |

## Import

1. Validation. Errors are reported with a JSON path, for example `data.exercises.0.category`.
2. Migration. Older `schemaVersion` values are upgraded step by step (`MIGRATIONS` in `interchange.ts`, record functions in `migrations.ts`). A newer version is rejected.
   - v1 → v2: `rir`, `rpe` and `criteria.useRir` are removed; `recommendation` becomes `suggestion`; outcomes `completed_as_prescribed`→`keep`, `increase_recommended`→`increase`, `below_target`→`missed`; decisions `accepted`→`applied`, `deferred`/`pending`→`kept`. The browser database is migrated the same way on first start.
3. Preview per table: new, identical, conflicting (same id, different content).
4. **Merge** never deletes local data. On conflict: keep local, use imported, or keep both (the imported copy gets a new id and its references are rewritten). Identical records are not rewritten. Exercises with the same name and equipment but a different id can be mapped to the existing exercise.
5. **Replace** downloads a backup of the current data first, then replaces everything in one transaction.

## CSV

- `sets.csv`: one row per set, one value column and one unit column per metric.
- `workouts.csv`: one row per workout.
- `progression_events.csv`: one row per progression event.

The files are UTF-8 with a BOM, comma-separated, and quoted where needed.
