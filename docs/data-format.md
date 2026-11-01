# Interchange format (schema version 10)

JSON file produced by **Settings → Export**. The authoritative definition is the zod schema in [`src/domain/schema.ts`](../src/domain/schema.ts).

```json
{
  "format": "mygymprogression",
  "schemaVersion": 12,
  "exportedAt": "2026-10-29T10:00:00.000Z",
  "app": { "version": "0.1.0" },
  "scope": "full | library | plans",
  "data": {
    "exercises": [], "plans": [], "planVersions": [], "progressionStates": [],
    "workouts": [], "progressionEvents": [], "revisions": [], "gameScores": [], "challenges": [], "settings": {}
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
   - v11 → v12: additive only — outcome `sync` (a question to update another plan with the same exercise after its load went up), `event.sourceEventId` (the event that raised the load) and `loadSync` in settings (`trigger` `off` | `order` | `below`, `method` `e1rm` | `increment`).
   - v10 → v11: additive only — `event.closedBy` (the workout that closed an open question as kept; it opens again when that workout is deleted or resumed) and `challenge.perSide` (a record of a per-side exercise is shown per side).
   - v9 → v10: additive only — `gameScores` (game, score, date), `challenges` (weekly challenge per Monday, with `kind`, `target` and `status` `open` | `done` | `missed`) and `challenge` in settings (boolean).
   - v8 → v9: additive only — `coach.pages` in settings (boolean).
   - v7 → v8: additive only — `coach.when` in settings (`start` | `each` | `random`).
   - v6 → v7: additive only — `color` on plans and days, `circuits` on days and `circuitId` on plan items, `circuit` snapshot on workout entries, `theme` and `coach` in settings.
   - v5 → v6: additive only — optional `goal` (`hypertrophy` | `strength`) and `strengthMode` per plan day, used by mixed plans.
   - v4 → v5: `restSec` removed from set prescriptions and set records.
   - v3 → v4: additive only — exercise library fields (`group`, `overview`, `steps`, `tips`, `thumb`, `image`, `video`, `muscleDetail`, `source`, `related`).
   - v2 → v3: additive only — `plan.strengthMode`, `progression.onTop`, `progressionState.repsRange`, `event.repsOption` / `rangeBefore` / `rangeAfter`, outcome `ready`, decision `reps_up`.
   - v1 → v2: `rir`, `rpe` and `criteria.useRir` are removed; `recommendation` becomes `suggestion`; outcomes `completed_as_prescribed`→`keep`, `increase_recommended`→`increase`, `below_target`→`missed`; decisions `accepted`→`applied`, `deferred`/`pending`→`kept`. The browser database is migrated the same way on first start.
3. Preview per table: new, identical, conflicting (same id, different content).
4. **Merge** never deletes local data. On conflict: keep local, use imported, or keep both (the imported copy gets a new id and its references are rewritten). Identical records are not rewritten. Exercises with the same name and equipment but a different id can be mapped to the existing exercise.
5. **Replace** downloads a backup of the current data first, then replaces everything in one transaction.

## CSV

- `sets.csv`: one row per set, one value column and one unit column per metric.
- `workouts.csv`: one row per workout.
- `progression_events.csv`: one row per progression event.

The files are UTF-8 with a BOM, comma-separated, and quoted where needed.

## Exercise library file

A separate file to add many exercises at once (Settings → Exercise library → Import library file). It can come from any source.

```json
{
  "format": "mygymprogression-library",
  "version": 1,
  "source": "Name shown on the exercise page",
  "fetchedAt": "2026-10-29",
  "exercises": [
    {
      "sid": "2", "slug": "bench-press", "url": "https://…", "name": "Bench Press",
      "bodyParts": ["Chest"], "equipment": ["Barbell"], "type": "weight_reps",
      "primary": ["Pectoralis Major Sternal Head"], "secondary": ["Triceps Brachii"],
      "overview": "…", "steps": ["…"], "tips": ["…"], "video": "<YouTube id>",
      "thumb": "data:image/webp;base64,…", "imageUrl": "https://…", "related": ["<sid>"]
    }
  ]
}
```

- Required per exercise: `sid` (unique in the source) and `name`. Missing lists are treated as empty.
- `thumb`: small image, embedded as a `data:` URL so it works offline. `imageUrl`: full image, loaded from the web and then kept offline.
- `type`: `weight_reps`, `reps_only`, `duration` or `distance_duration`; it chooses what is recorded.
- Import is repeatable: an exercise with the same `sid`, or the same name, is updated (id, settings, plans and history are kept); others are added.

## Shared plan

A shared plan is a normal export bundle (scope `plans`) with one plan, one version and the exercises it uses. The plan, version, days, items and lineages have new ids, so an import always adds a new plan. It has no progression states, workouts or personal notes.

- **File:** `<plan name>.mygymprogression.json`; import it in Settings → Import.
- **Link:** `<app address>#/share?d=<code>`. The code is the bundle JSON, compressed with raw DEFLATE and encoded as base64url. Exercises in a link have no library text or images (`instructions`, `overview`, `steps`, `tips`, `thumb`, `image`, `video`, `muscleDetail`, `related`, `links` are empty). The link opens a preview; on import, exercises that already exist (same id, or same name and equipment) are reused.
