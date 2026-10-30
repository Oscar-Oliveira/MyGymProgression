# MyGymProgression

Web app (installable PWA) to manage strength-training plans, log workouts, apply double progression and other progression strategies, and analyse results. Single user. All data stays in the browser (IndexedDB). UI in Portuguese (PT-PT) and English.

Status: **Web MVP (Phase 3–4)**. Android follows only after the Web version is accepted. See [docs/PLAN.md](docs/PLAN.md).

## Run

Requirements: Node.js 20+ (tested with Node 24).

```bash
npm install
npm run dev        # development server: http://localhost:5173
npm run build      # type check + production build in dist/
npm run preview    # serve dist/ at http://localhost:4173 (PWA/offline works here)
```

## Exercise library

**Open library (recommended):** **More → Settings → Exercise library → Install open library** adds about 870 exercises with photos and instructions from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (The Unlicense, public domain). The file `public/library/free-exercise-db.json` is published with the app and downloaded only when you tap the button. To rebuild it (needs Pillow):

```bash
python scripts/import_free_exercise_db.py
```

The app also imports a library file from any other source (format: [docs/data-format.md](docs/data-format.md#exercise-library-file)): **More → Settings → Exercise library → Import library file**.

Optional: `scripts/import_exsercise.py` builds such a file from Exsercise.com (see the notice below):

```bash
python -I scripts/import_exsercise.py fetch  <work_dir>
python -I scripts/import_exsercise.py thumbs <work_dir>
python -I scripts/import_exsercise.py build  <work_dir>
python -I scripts/import_exsercise.py pack   private/mygymprogression-library.json
```

`pack` writes one file with all exercise data and the thumbnails embedded. Copy it to the phone, then **More → Settings → Exercise library → Import library file**. All output stays in `private/` (git-ignored, never published with the app). The file is for personal use: do not share or publish it.

> **Notice:** Exsercise.com exercise data must only be extracted with the express permission of Exsercise.com. We accept no responsibility for extraction done without that permission. Other ways to import exercises will be added in the future.

## Publish on GitHub Pages (install on a phone)

The site is built locally and pushed to the `gh-pages` branch. It contains no exercise library (see above).

```bash
npm run deploy:pages   # raises the patch version, builds for https://<user>.github.io/MyGymProgression/ and pushes dist/ to gh-pages
```

The version (`package.json`) is shown on the splash screen and in **More → About**; add a line to `src/changelog.ts` for each published change.

Once: GitHub → repository → Settings → Pages → Source: *Deploy from a branch* → `gh-pages` / root. The path is case-sensitive: `--base` in the `build:pages` script must match the repository name exactly.

## Test

```bash
npm test                          # unit + integration tests (Vitest, fake IndexedDB)
npx playwright install chromium   # once
npm run e2e                       # build + end-to-end tests (desktop and Pixel 7 viewport)
```

## Quick demo

1. Open the app → **Try with example data**. This adds the starter library, a 2-day plan and 6 weeks of simulated workouts.
2. **Home** shows one pending decision (missed reps): keep or step back.
3. **Start workout**. Each set is pre-filled with today's goal; tap **✓ Set done**. **Next ›** moves to the next exercise.
4. **Finish workout**: the summary shows ⬆ up / ＝ keep / ⬇ down for each exercise.
5. **Plans**: give plans and days a colour; **⟳ Circuit** groups exercises done back to back (one "Circuit done" in the workout).
6. **Settings → Personal trainer**: optional motivating message when a workout starts.
7. **More → Analysis**: progress per exercise, sets per muscle per week, comparison with the previous period. **More → Settings**: JSON/CSV export and import.
8. **Plans → ⋯ → Share**: send the plan as a file or a link; the link opens a preview and imports a copy.

## Structure

| Folder | Content |
|---|---|
| `src/domain` | Pure TypeScript: types, units, progression engine, analysis, workout logic, interchange format (zod), CSV, seed and demo data. No React or storage imports. |
| `src/data` | Dexie (IndexedDB) schema and storage use-cases (`repo.ts`). |
| `src/ui` | React pages and components. |
| `src/i18n` | `en.ts` and `pt.ts` resources. |
| `tests/e2e` | Playwright tests. |
| `docs` | Plan and decision log, data format, acceptance traceability. |

## Key rules

- Exercise definitions, plan prescriptions and workout records are separate. Each workout stores snapshots of the exercise and of the prescription.
- A plan version that a workout uses is locked. Editing it creates a new version.
- The plan goal sets the rule for load exercises. Hypertrophy: at the top of the range you choose more load or more reps (range +1). Strength: the load goes up automatically (fixed 5×5 or 4×4–6).
- Progression rule: every set reaches the target → the next target goes up automatically (undo available). Within the range or sets skipped → keep. A set below the minimum → you choose keep or step back one increment. Every change is logged.
- Each set shows today's goal: last time + 1 rep at the same load, up to the range max.
- Exercises with **No progression** are evaluated only for completion. They are never recommended for progression and never flagged as stalled.

## Privacy

There is no telemetry and no server. The app makes network calls only when you ask: installing the open library (from the app's own site) and full-size exercise images (from the library's source, then kept offline). Backup files contain personal training data; store them safely. Browser storage can be cleared by the browser or by the user, so save backups regularly: on a phone the backup opens the share menu (for example to Google Drive), and Home warns when the last backup is more than 7 days old. A shared plan contains no workouts, progress or personal notes.
