// Core domain types. Three layers are kept separate:
// definition (Exercise) -> prescription (PlanVersion/PlanItem) -> actual record (Workout/Entry/Set).

export type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'warmup' | 'mobility' | 'other';
export type LoadMode = 'total' | 'perSide';

/** Built-in metric keys. Custom metrics use the prefix "custom:". */
export const METRIC_KEYS = ['reps', 'load', 'duration', 'distance', 'speed', 'incline', 'resistance', 'calories'] as const;
export type BuiltinMetric = (typeof METRIC_KEYS)[number];
export type MetricKey = BuiltinMetric | `custom:${string}`;

export interface MetricDef {
  key: MetricKey;
  unit: string;
  required: boolean;
  /** Display label, used for custom metrics. */
  label?: string;
}

/** A target for one metric: a fixed value, or a range (min/max). */
export interface Target {
  value?: number;
  min?: number;
  max?: number;
}

export type SetKind = 'warmup' | 'working' | 'backoff';

export interface SetPrescription {
  kind: SetKind;
  targets: Partial<Record<MetricKey, Target>>;
  rir?: number;
  rpe?: number;
  restSec?: number;
}

export type ProgressionStrategy = 'double' | 'duration' | 'distance' | 'intensity' | 'multi' | 'manual' | 'none';

/** One progressable variable. For 'double' the first step is the load-like variable. */
export interface ProgressionStep {
  metric: MetricKey;
  increment: number;
  cap?: number;
}

export interface ProgressionCriteria {
  blockOnPain: boolean;
  blockOnTechnique: boolean;
  blockOnSubstitution: boolean;
  /** When true, a recorded RIR below the target RIR blocks progression. A missing RIR never blocks (D6/Q3). */
  useRir: boolean;
}

export interface ProgressionConfig {
  strategy: ProgressionStrategy;
  steps: ProgressionStep[];
  criteria: ProgressionCriteria;
}

export interface Link {
  label: string;
  url: string;
}

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: ExerciseCategory;
  instructions: string;
  safetyNotes: string;
  personalNotes: string;
  tags: string[];
  links: Link[];
  active: boolean;
  variationOf?: string;
  metrics: MetricDef[];
  loadMode: LoadMode;
  defaultSets: SetPrescription[];
  progression: ProgressionConfig;
  createdAt: string;
  updatedAt: string;
}

export type PlanGoal = 'hypertrophy' | 'strength' | 'mixed' | 'other';
export type ItemRole = 'warmup' | 'main' | 'optional';

export interface PlanItem {
  id: string;
  /** Stable across plan versions; keys the progression state. */
  lineageId: string;
  exerciseId: string;
  /** Items with the same group label form a superset. */
  group?: string;
  role: ItemRole;
  sets: SetPrescription[];
  /** Overrides the exercise default progression. */
  progression?: ProgressionConfig;
  substitutes: string[];
  notes: string;
}

export interface PlanDay {
  id: string;
  name: string;
  /** 0 = Monday ... 6 = Sunday. Optional. */
  weekday?: number;
  items: PlanItem[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  goal: PlanGoal;
  phase: string;
  status: 'active' | 'archived';
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanVersion {
  id: string;
  planId: string;
  number: number;
  createdAt: string;
  /** True once a workout references this version; it is then immutable. */
  locked: boolean;
  days: PlanDay[];
}

export interface ProgressionState {
  /** Plan item lineage id, or "exercise:<id>" for ad-hoc entries. */
  lineageId: string;
  exerciseId: string;
  /** Current working targets for progressed metrics, e.g. { load: 42.5 }. */
  targets: Partial<Record<MetricKey, number>>;
  updatedAt: string;
}

export type SetStatus = 'pending' | 'done' | 'skipped';

export interface SetRecord {
  id: string;
  kind: SetKind;
  values: Partial<Record<MetricKey, number>>;
  rir?: number;
  rpe?: number;
  restSec?: number;
  status: SetStatus;
  notes: string;
}

/** Copy of exercise fields at the time of the workout. Keeps history meaningful after edits. */
export interface ExerciseSnapshot {
  name: string;
  category: ExerciseCategory;
  metrics: MetricDef[];
  loadMode: LoadMode;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export type Outcome =
  | 'completed_as_prescribed'
  | 'progress'
  | 'increase_recommended'
  | 'below_target'
  | 'incomplete'
  | 'restricted'
  | 'manual'
  | 'no_progression';

export type Completion = 'complete' | 'incomplete' | 'below_target';

export interface Reason {
  code: string;
  params?: Record<string, string | number>;
}

export interface Recommendation {
  metric: MetricKey;
  from: number;
  to: number;
}

export interface Evaluation {
  strategy: ProgressionStrategy;
  outcome: Outcome;
  completion: Completion;
  recommendation?: Recommendation;
  reasons: Reason[];
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  exercise: ExerciseSnapshot;
  lineageId?: string;
  /** Effective prescription used in this session (snapshot). */
  prescription: SetPrescription[];
  progression: ProgressionConfig;
  substitutedFor?: string;
  group?: string;
  role: ItemRole;
  sets: SetRecord[];
  pain: boolean;
  technique: boolean;
  notes: string;
  evaluation?: Evaluation;
}

export type WorkoutStatus = 'in_progress' | 'completed' | 'partial' | 'interrupted';

export interface Workout {
  id: string;
  startedAt: string;
  endedAt?: string;
  planId?: string;
  planVersionId?: string;
  dayId?: string;
  planName?: string;
  dayName?: string;
  status: WorkoutStatus;
  notes: string;
  entries: WorkoutEntry[];
  updatedAt: string;
}

export type Decision = 'pending' | 'accepted' | 'overridden' | 'deferred' | 'none';

export interface ProgressionEvent {
  id: string;
  /** Empty for manual adjustments made outside a workout. */
  workoutId?: string;
  entryId?: string;
  lineageId: string;
  exerciseId: string;
  strategy: ProgressionStrategy;
  outcome: Outcome;
  recommendation?: Recommendation;
  reasons: Reason[];
  decision: Decision;
  decisionReason?: string;
  /** Target values before and after the decision. */
  before: Partial<Record<MetricKey, number>>;
  after: Partial<Record<MetricKey, number>>;
  createdAt: string;
  decidedAt?: string;
}

export interface Revision {
  id: string;
  workoutId: string;
  at: string;
  /** Full workout as it was before the correction. */
  previous: Workout;
}

export interface Settings {
  id: 'settings';
  language: 'pt' | 'en';
  loadUnit: 'kg' | 'lb';
  distanceUnit: 'km' | 'mi';
  stalledThreshold: number;
  lastBackupAt?: string;
}
