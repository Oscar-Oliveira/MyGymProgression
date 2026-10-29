import Dexie, { type Table } from 'dexie';
import type { Exercise, Plan, PlanVersion, ProgressionEvent, ProgressionState, Revision, Settings, Workout } from '../domain/types';

export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  plans!: Table<Plan, string>;
  planVersions!: Table<PlanVersion, string>;
  progressionStates!: Table<ProgressionState, string>;
  workouts!: Table<Workout, string>;
  progressionEvents!: Table<ProgressionEvent, string>;
  revisions!: Table<Revision, string>;
  settings!: Table<Settings, string>;

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
  }
}

export const db = new GymDB();
