import Dexie, { type Table } from 'dexie';
import { dropRest, v1to2 } from '../domain/migrations';
import type { Challenge, CoachReport, Exercise, Goal, GameScore, Plan, PlanVersion, ProgressionEvent, ProgressionState, Revision, Settings, Workout } from '../domain/types';

export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  plans!: Table<Plan, string>;
  planVersions!: Table<PlanVersion, string>;
  progressionStates!: Table<ProgressionState, string>;
  workouts!: Table<Workout, string>;
  progressionEvents!: Table<ProgressionEvent, string>;
  revisions!: Table<Revision, string>;
  settings!: Table<Settings, string>;
  gameScores!: Table<GameScore, string>;
  challenges!: Table<Challenge, string>;
  goals!: Table<Goal, string>;
  coachReports!: Table<CoachReport, string>;

  constructor(name = 'mygymprogression') {
    super(name);
    // Schema migrations: add a new this.version(n) block with an upgrade() function. Never edit an old block.
    this.version(1).stores({
      exercises: 'id, name, category, active',
      plans: 'id, status',
      planVersions: 'id, planId',
      progressionStates: 'lineageId, exerciseId',
      workouts: 'id, startedAt, status, planId',
      progressionEvents: 'id, workoutId, lineageId, exerciseId, createdAt, decision',
      revisions: 'id, workoutId, at',
      settings: 'id',
    });
    // v2: RIR/RPE removed, new progression outcomes and decisions (see domain/migrations.ts).
    this.version(2).stores({}).upgrade(async (tx) => {
      const up = (o: object) => o as Record<string, unknown>;
      await tx.table('exercises').toCollection().modify((e, ref) => void (ref.value = v1to2.exercise(up(e))));
      await tx.table('planVersions').toCollection().modify((v, ref) => void (ref.value = v1to2.planVersion(up(v))));
      await tx.table('workouts').toCollection().modify((w, ref) => void (ref.value = v1to2.workout(up(w))));
      await tx.table('progressionEvents').toCollection().modify((e, ref) => void (ref.value = v1to2.event(up(e))));
      await tx.table('revisions').toCollection().modify((r, ref) => void (ref.value = v1to2.revision(up(r))));
    });
    // v3: rest times removed.
    this.version(3).stores({}).upgrade(async (tx) => {
      for (const t of ['exercises', 'planVersions', 'workouts', 'revisions']) {
        await tx.table(t).toCollection().modify((x, ref) => void (ref.value = dropRest(x)));
      }
    });
    // v4: game scores and weekly challenges.
    this.version(4).stores({ gameScores: 'id, game, at', challenges: 'id, week' });
    // v5: goals and the trainer's week reports.
    this.version(5).stores({ goals: 'id, exerciseId', coachReports: 'id, week' });
  }
}

export const db = new GymDB();
