// Storage use-cases. Each multi-table change runs in one transaction.
import { db as defaultDb, type GymDB } from './db';
import { DEFAULT_SETTINGS, newPlanItem, nowIso, saveVersion, uid } from '../domain/factory';
import { dayGoal } from '../domain/goals';
import { emptyDataSet, TABLES, type DataSet } from '../domain/interchange';
import { seedExercises } from '../domain/seed';
import { mergeLibrary, type LibraryRecord } from '../domain/library';
import { mergeExercises } from '../domain/merge';
import { LIBRARY_PT } from '../domain/library-pt';
import { createChallenge, settleChallenges, weekKey } from '../domain/challenge';
import type { Exercise, GameId, Plan, PlanDay, PlanVersion, ProgressionEvent, Settings, Workout, WorkoutEntry } from '../domain/types';
import { canRevert, decide, evaluateWorkout, eventsFor, finishWorkout, lastEntryFinder, manualAdjust, reopenWorkout, resetRepsRange, startWorkout, type DecisionInput } from '../domain/workout';

export function createRepo(db: GymDB) {
  // Library imports run one at a time (app start and a button click may overlap); otherwise both would add the same exercises.
  let libraryQueue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(f: () => Promise<T>): Promise<T> => {
    const run = libraryQueue.then(f, f);
    libraryQueue = run.catch(() => undefined);
    return run;
  };
  async function getSettings(): Promise<Settings> {
    const lang = globalThis.navigator?.language?.toLowerCase().startsWith('en') ? 'en' : 'pt';
    return (await db.settings.get('settings')) ?? { ...DEFAULT_SETTINGS, language: lang };
  }

  async function readAll(): Promise<DataSet> {
    const out = emptyDataSet();
    await db.transaction('r', db.tables, async () => {
      for (const t of TABLES) (out[t] as unknown[]) = await db.table(t).toArray();
      out.settings = await db.settings.get('settings');
    });
    return out;
  }

  /** Everything that can reference an exercise, for joining two of them. */
  async function joinInput(keepId: string, dropId: string) {
    const [keep, drop] = await db.exercises.bulkGet([keepId, dropId]);
    if (!keep || !drop || keepId === dropId) return undefined;
    const [versions, workouts, states, events, revisions] = await Promise.all([
      db.planVersions.toArray(),
      db.workouts.toArray(),
      db.progressionStates.toArray(),
      db.progressionEvents.toArray(),
      db.revisions.toArray(),
    ]);
    return { keep, drop, versions, workouts, states, events, revisions };
  }

  async function importLibraryNow(records: LibraryRecord[]) {
    const settings = await getSettings();
    const { added, updated } = mergeLibrary(await db.exercises.toArray(), records, settings, LIBRARY_PT);
    await db.exercises.bulkPut([...updated, ...added]);
    return { added: added.length, updated: updated.length };
  }

  /** Undoes the still-current progression changes of a workout, removes its events and opens the questions it closed. Call inside a transaction. */
  async function undoEvents(workoutId: string) {
    const evs = await db.progressionEvents.where('workoutId').equals(workoutId).toArray();
    for (const ev of evs) {
      const state = await db.progressionStates.get(ev.lineageId);
      if (state && canRevert(ev, state)) await db.progressionStates.put(decide(ev, state, { kind: 'revert' }).state);
    }
    await db.progressionEvents.bulkDelete(evs.map((e) => e.id));
    // Questions this workout closed are open again, unless another later workout of the same exercise closes them now.
    const closed = (await db.progressionEvents.where('decision').equals('kept').toArray()).filter((e) => e.closedBy === workoutId);
    if (!closed.length) return;
    const workouts = (await db.workouts.toArray()).filter((x) => x.id !== workoutId && x.status !== 'in_progress').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    await db.progressionEvents.bulkPut(
      closed.map(({ closedBy: _c, decidedAt: _d, ...e }) => {
        const asked = workouts.find((x) => x.id === e.workoutId)?.startedAt ?? e.createdAt;
        const later = workouts.find((x) => x.startedAt > asked && x.entries.some((en) => en.lineageId === e.lineageId));
        return later ? { ...e, decision: 'kept' as const, decidedAt: later.endedAt, closedBy: later.id } : { ...e, decision: 'pending' as const };
      }),
    );
  }

  return {
    getSettings,
    readAll,

    async saveSettings(patch: Partial<Settings>) {
      const s = await getSettings();
      await db.settings.put({ ...s, ...patch, id: 'settings' });
    },

    async seedLibrary() {
      const s = await getSettings();
      const existing = new Set((await db.exercises.toArray()).map((e) => e.name.toLowerCase()));
      const add = seedExercises(s).filter((e) => !existing.has(e.name.toLowerCase()));
      await db.exercises.bulkAdd(add);
      return add.length;
    },

    /** Adds the external library: enriches matching exercises (same id, plans unchanged) and adds the rest. */
    importLibrary(records: LibraryRecord[]) {
      return serial(() => importLibraryNow(records));
    },

    async saveExercise(ex: Exercise) {
      await db.exercises.put({ ...ex, updatedAt: nowIso() });
    },

    /** Returns the names of plans that use the exercise. Deletion is allowed only when the list is empty. */
    async exerciseUsage(id: string): Promise<string[]> {
      const versions = await db.planVersions.toArray();
      const planIds = new Set(versions.filter((v) => v.days.some((d) => d.items.some((i) => i.exerciseId === id || i.substitutes.includes(id)))).map((v) => v.planId));
      return (await db.plans.bulkGet([...planIds])).filter((p): p is Plan => !!p).map((p) => p.name);
    },

    async deleteExercise(id: string) {
      // Workouts keep snapshots, so history stays readable.
      await db.exercises.delete(id);
    },

    /** What joining would change (plans, workouts, progression records), to show before confirming. */
    async joinPreview(keepId: string, dropId: string) {
      const input = await joinInput(keepId, dropId);
      return input && mergeExercises(input).counts;
    },

    /** Joins a duplicate into the kept exercise everywhere, then deletes the duplicate (D19). One transaction. */
    async joinExercises(keepId: string, dropId: string) {
      await db.transaction('rw', [db.exercises, db.planVersions, db.workouts, db.progressionStates, db.progressionEvents, db.revisions], async () => {
        const input = await joinInput(keepId, dropId);
        if (!input) throw new Error('exercise_missing');
        const r = mergeExercises(input);
        await db.planVersions.bulkPut(r.versions);
        await db.workouts.bulkPut(r.workouts);
        await db.revisions.bulkPut(r.revisions);
        await db.progressionEvents.bulkPut(r.events);
        await db.progressionStates.bulkDelete(r.deleteStates);
        await db.progressionStates.bulkPut(r.states);
        await db.exercises.put(r.exercise);
        await db.exercises.delete(dropId);
      });
    },

    async createPlan(plan: Plan, version: PlanVersion) {
      await db.transaction('rw', db.plans, db.planVersions, async () => {
        await db.plans.add(plan);
        await db.planVersions.add(version);
      });
    },

    /** Saves plan metadata and days. A locked version produces a new version. */
    async savePlan(plan: Plan, days: PlanDay[]) {
      await db.transaction('rw', db.plans, db.planVersions, async () => {
        const current = await db.planVersions.get(plan.currentVersionId);
        if (!current) throw new Error('version_missing');
        const next = saveVersion(current, days);
        await db.planVersions.put(next);
        await db.plans.put({ ...plan, currentVersionId: next.id, updatedAt: nowIso() });
      });
    },

    /** Adds an exercise at the end of a plan day, with the sets of the day's goal. A locked version produces a new version. */
    async addToPlanDay(planId: string, dayId: string, exerciseId: string) {
      await db.transaction('rw', db.plans, db.planVersions, db.exercises, async () => {
        const plan = await db.plans.get(planId);
        const current = plan && (await db.planVersions.get(plan.currentVersionId));
        const ex = await db.exercises.get(exerciseId);
        if (!plan || !current || !ex) throw new Error('not_found');
        const days = current.days.map((d) => (d.id === dayId ? { ...d, items: [...d.items, newPlanItem(ex, dayGoal(plan, d))] } : d));
        const next = saveVersion(current, days);
        await db.planVersions.put(next);
        await db.plans.put({ ...plan, currentVersionId: next.id, updatedAt: nowIso() });
      });
    },

    async deletePlan(id: string) {
      // Workouts keep plan name and version id, so history stays meaningful. Versions referenced by workouts are kept.
      await db.transaction('rw', db.plans, db.planVersions, db.workouts, async () => {
        const used = new Set((await db.workouts.where('planId').equals(id).toArray()).map((w) => w.planVersionId));
        const versions = await db.planVersions.where('planId').equals(id).toArray();
        await db.planVersions.bulkDelete(versions.filter((v) => !used.has(v.id)).map((v) => v.id));
        await db.plans.delete(id);
      });
    },

    /** Starts a workout. When one is already in progress, nothing is started and its id is returned (one at a time). */
    async startWorkout(planId?: string, dayId?: string): Promise<string> {
      return db.transaction('rw', db.tables, async () => {
        const open = await db.workouts.where('status').equals('in_progress').first();
        if (open) return open.id;
        const plan = planId ? await db.plans.get(planId) : undefined;
        const version = plan ? await db.planVersions.get(plan.currentVersionId) : undefined;
        const day = version?.days.find((d) => d.id === dayId);
        const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
        const states = new Map((await db.progressionStates.toArray()).map((s) => [s.lineageId, s]));
        const lastEntry = lastEntryFinder(await db.workouts.toArray());
        const w = startWorkout(plan, version, day, { exercises, states, lastEntry });
        if (version && !version.locked) await db.planVersions.put({ ...version, locked: true });
        await db.workouts.add(w);
        return w.id;
      });
    },

    async saveWorkout(w: Workout) {
      await db.workouts.put({ ...w, updatedAt: nowIso() });
    },

    async finishWorkout(w: Workout, interrupted: boolean) {
      await db.transaction('rw', db.workouts, db.progressionEvents, db.progressionStates, async () => {
        const others = (await db.workouts.toArray()).filter((x) => x.id !== w.id);
        const states = new Map((await db.progressionStates.toArray()).map((s) => [s.lineageId, s]));
        const res = finishWorkout(w, interrupted, lastEntryFinder(others, w.startedAt), states);
        // Older open questions of the same exercises are closed as "kept": this workout already used the targets they left unchanged.
        const lineages = new Set(res.events.map((e) => e.lineageId));
        const stale = (await db.progressionEvents.where('decision').equals('pending').toArray()).filter((e) => lineages.has(e.lineageId));
        await db.progressionEvents.bulkPut(stale.map((e) => ({ ...e, decision: 'kept' as const, decidedAt: res.workout.endedAt, closedBy: w.id })));
        await db.workouts.put(res.workout);
        await db.progressionEvents.bulkAdd(res.events);
        await db.progressionStates.bulkPut(res.states);
      });
    },

    async discardWorkout(id: string) {
      await db.workouts.delete(id);
    },

    /**
     * Correction of a finished workout. The previous version is kept as a revision; entries are re-evaluated.
     * Only exercises not done in a later workout can change progression (older targets never overwrite newer progress):
     * their undecided events are recreated from the new evaluation; decided ones are kept.
     * Returns the applied increases that the correction no longer supports, so the user can choose to undo them.
     */
    async correctWorkout(w: Workout): Promise<ProgressionEvent[]> {
      return db.transaction('rw', db.workouts, db.revisions, db.progressionEvents, db.progressionStates, async () => {
        const previous = await db.workouts.get(w.id);
        if (!previous) throw new Error('workout_missing');
        const others = (await db.workouts.toArray()).filter((x) => x.id !== w.id);
        const evaluated = { ...evaluateWorkout(w, lastEntryFinder(others, w.startedAt)), updatedAt: nowIso() };
        await db.revisions.add({ id: uid(), workoutId: w.id, at: nowIso(), previous });
        await db.workouts.put(evaluated);

        const later = new Set(others.filter((x) => x.status !== 'in_progress' && x.startedAt > w.startedAt).flatMap((x) => x.entries.map((e) => e.lineageId)));
        const latest = new Set(evaluated.entries.filter((e) => e.lineageId && !later.has(e.lineageId)).map((e) => e.id));
        const events = (await db.progressionEvents.where('workoutId').equals(w.id).toArray()).filter((e) => latest.has(e.entryId!));
        const undecided = events.filter((e) => e.decision === 'pending' || e.decision === 'none');
        const decidedEntries = new Set(events.filter((e) => !undecided.includes(e)).map((e) => e.entryId));
        const redo = new Set([...latest].filter((id) => !decidedEntries.has(id)));
        const states = new Map((await db.progressionStates.toArray()).map((s) => [s.lineageId, s]));
        const res = eventsFor(evaluated, states, redo);
        await db.progressionEvents.bulkDelete(undecided.map((e) => e.id));
        await db.progressionEvents.bulkAdd(res.events);
        await db.progressionStates.bulkPut(res.states);
        const outcome = new Map(evaluated.entries.map((e) => [e.id, e.evaluation?.outcome]));
        return events.filter(
          (e) => (e.decision === 'applied' || e.decision === 'reps_up') && !['increase', 'ready'].includes(outcome.get(e.entryId!) ?? '') && canRevert(e, states.get(e.lineageId)),
        );
      });
    },

    /** Deletes a workout. Progression changes it caused are undone when they are still current; its events are removed. */
    async deleteWorkout(id: string) {
      await db.transaction('rw', db.workouts, db.revisions, db.progressionEvents, db.progressionStates, async () => {
        await db.workouts.delete(id);
        await db.revisions.where('workoutId').equals(id).delete();
        await undoEvents(id);
      });
    },

    /**
     * Continues an interrupted workout: its progression changes are undone (as for a delete), the finished version is kept
     * as a revision, and it is in progress again. Finishing it evaluates it again.
     */
    async resumeWorkout(id: string) {
      await db.transaction('rw', db.workouts, db.revisions, db.progressionEvents, db.progressionStates, async () => {
        const w = await db.workouts.get(id);
        if (!w || w.status !== 'interrupted') return;
        if ((await db.workouts.where('status').equals('in_progress').count()) > 0) throw new Error('workout_in_progress');
        await db.revisions.add({ id: uid(), workoutId: id, at: nowIso(), previous: w });
        await undoEvents(id);
        await db.workouts.put(reopenWorkout(w));
      });
    },

    async decide(eventId: string, input: DecisionInput) {
      await db.transaction('rw', db.progressionEvents, db.progressionStates, async () => {
        const ev = await db.progressionEvents.get(eventId);
        if (!ev) throw new Error('event_missing');
        const res = decide(ev, await db.progressionStates.get(ev.lineageId), input);
        await db.progressionEvents.put(res.event);
        await db.progressionStates.put(res.state);
      });
    },

    async manualAdjust(lineageId: string, exerciseId: string, targets: ProgressionEvent['after'], reason: string, strategy: ProgressionEvent['strategy']) {
      await db.transaction('rw', db.progressionEvents, db.progressionStates, async () => {
        const res = manualAdjust(await db.progressionStates.get(lineageId), lineageId, exerciseId, targets, reason, strategy);
        await db.progressionEvents.add(res.event);
        await db.progressionStates.put(res.state);
      });
    },

    /** The plan's rep range applies again for a lineage (after it was changed in the plan). Nothing happens without a "reps up" range. */
    async resetRepsRange(lineageId: string, reason: string, strategy: ProgressionEvent['strategy']) {
      await db.transaction('rw', db.progressionEvents, db.progressionStates, async () => {
        const state = await db.progressionStates.get(lineageId);
        if (!state?.repsRange) return;
        const res = resetRepsRange(state, reason, strategy);
        await db.progressionEvents.add(res.event);
        await db.progressionStates.put(res.state);
      });
    },

    async lastEntry(lineageId: string): Promise<WorkoutEntry | undefined> {
      return lastEntryFinder(await db.workouts.toArray())(lineageId);
    },

    async addScore(game: GameId, score: number) {
      await db.gameScores.add({ id: uid(), game, score, at: nowIso() });
    },

    /** Deletes the scores of one game, or of all games. */
    async resetScores(game?: GameId) {
      if (game) await db.gameScores.where('game').equals(game).delete();
      else await db.gameScores.clear();
    },

    /** Closes the challenges of past weeks and creates the one of this week when it is missing. */
    async ensureChallenge(now = new Date()) {
      await db.transaction('rw', db.challenges, db.workouts, async () => {
        const week = weekKey(now);
        const [all, workouts] = await Promise.all([db.challenges.toArray(), db.workouts.toArray()]);
        await db.challenges.bulkPut(settleChallenges(all, workouts, week, now.toISOString()));
        if (!all.some((c) => c.week === week)) await db.challenges.add(createChallenge(week, workouts, uid(), now.toISOString()));
      });
    },

    /** Marks the challenge done, or open again. */
    async setChallengeDone(id: string, done: boolean) {
      await db.challenges.update(id, done ? { status: 'done', doneAt: nowIso() } : { status: 'open', doneAt: undefined });
    },

    /** Writes records from a merge plan (see planMerge). Existing records not in the plan are untouched. */
    async importMerge(data: DataSet) {
      await db.transaction('rw', db.tables, async () => {
        // One workout in progress at a time: imported open workouts become interrupted when one is already open here
        // (or, among themselves, all but the latest).
        const open = await db.workouts.where('status').equals('in_progress').first();
        const latest = data.workouts.filter((w) => w.status === 'in_progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
        const keep = open ? open.id : latest?.id;
        const workouts = data.workouts.map((w) => (w.status === 'in_progress' && w.id !== keep ? { ...w, status: 'interrupted' as const, endedAt: w.endedAt ?? w.updatedAt } : w));
        for (const t of TABLES) if (data[t].length) await db.table(t).bulkPut(t === 'workouts' ? workouts : data[t]);
      });
    },

    /** Replaces all data. Callers must create a backup first. */
    async importReplace(data: DataSet) {
      await db.transaction('rw', db.tables, async () => {
        for (const t of db.tables) await t.clear();
        for (const t of TABLES) if (data[t].length) await db.table(t).bulkAdd(data[t]);
        await db.settings.put(data.settings ?? DEFAULT_SETTINGS);
      });
    },

    async clearAll() {
      await db.transaction('rw', db.tables, async () => {
        for (const t of db.tables) await t.clear();
      });
    },
  };
}

export const repo = createRepo(defaultDb);
export type Repo = ReturnType<typeof createRepo>;
