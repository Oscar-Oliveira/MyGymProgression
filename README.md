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
5. **More → Analysis**: progress per exercise. **More → Settings**: JSON/CSV export and import.

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
- Progression rule: every set reaches the target → the next target goes up automatically (undo available). Within the range or sets skipped → keep. A set below the minimum → you choose keep or step back one increment. Every change is logged.
- Each set shows today's goal: last time + 1 rep at the same load, up to the range max.
- Exercises with **No progression** are evaluated only for completion. They are never recommended for progression and never flagged as stalled.

## Privacy

There are no network calls, no telemetry and no external resources at runtime. Backup files contain personal training data; store them safely. Browser storage can be cleared by the browser or by the user, so export backups regularly.
