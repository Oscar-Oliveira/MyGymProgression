# Acceptance traceability (context.md §12)

| # | Criterion | Automated evidence |
|---|---|---|
| 1 | Create, edit, reuse exercises | e2e "custom exercise…", "library → plan…"; `workout.test.ts` duplicate as variation |
| 2 | Different measurement types and units | `analysis.test.ts` (lb/kg, per side, cardio); e2e custom duration exercise |
| 3 | Create, modify, execute plans | e2e "library → plan → workout"; `repo.test.ts` plan edit/versions |
| 4 | Each set recorded independently | e2e set-by-set logging; `workout.test.ts` pending → skipped |
| 5 | Double progression follows rules | `progression.test.ts` §6.3 and §6.4 sequences |
| 6 | Load increase only when all conditions hold | `progression.test.ts` exceptions (RIR, pain, technique, substitution, load below, cap) |
| 7 | Incomplete sessions and manual overrides | `progression.test.ts` incomplete/skipped; `workout.test.ts` override/defer/manualAdjust |
| 8 | Fixed exercises repeat without recommendations | `workout.test.ts` warm-up ×4; `analysis.test.ts` stalled ignores `none` |
| 9 | 5-min treadmill warm-up not stalled or recommended | `progression.test.ts` warm-up; `analysis.test.ts`; demo test |
| 10 | Treadmill duration progression recommends | `progression.test.ts` 10 → 12 min, multi-variable |
| 11 | Distance/duration/speed/incline recorded and analysed | `analysis.test.ts` cardio metrics and pace; e2e analysis of Treadmill Walking |
| 12 | History stays meaningful after plan changes | `repo.test.ts` locked version → new version, old workout unchanged |
| 13 | Analysis uses actual data and documented formulas | `analysis.test.ts`; formulas listed on the Analysis page and in `analysis.ts` |
| 14 | Import/export round trip | `interchange.test.ts`, `repo.test.ts`, e2e export → delete → import |
| 15 | Invalid and conflicting imports handled safely | `interchange.test.ts` invalid/conflict/keepBoth/duplicates; e2e invalid file |
| 16 | Desktop and mobile browsers | e2e runs on Desktop Chrome and Pixel 7 projects (Chromium only) |
| 17 | Documented install/test/run | README.md |
