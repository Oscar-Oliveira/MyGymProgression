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
}

export interface ProgressionConfig {
  strategy: ProgressionStrategy;
  steps: ProgressionStep[];
  criteria: ProgressionCriteria;
  /**
   * Double progression only. What happens when every set reaches the top of the range:
   * "load" (default) raises the load automatically; "ask" lets the user choose load or reps (hypertrophy plans).
   */
  onTop?: 'load' | 'ask';
}

export interface RepRange {
  min: number;
  max: number;
}

export interface Link {
  label: string;
  url: string;
}

/** Muscle groups used to browse the library. */
export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio', 'other'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

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
  /** Library fields (optional). */
  group?: MuscleGroup;
  overview?: string;
  steps?: string[];
  tips?: string[];
  /** App-relative thumbnail path, e.g. "library/thumbs/2.webp". */
  thumb?: string;
  /** Full image URL (loaded on demand). */
  image?: string;
  /** Video URL (e.g. YouTube). */
  video?: string;
  /** Detailed muscle names from the source library. */
  muscleDetail?: { primary: string[]; secondary: string[] };
  /** Where the library entry came from. */
  source?: { name: string; id: string; url: string };
  /** Related exercises, as source ids. */
  related?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Fixed palette for plans and days (values in styles.css, readable in dark and light). */
export const COLOR_KEYS = ['violet', 'blue', 'cyan', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export type PlanGoal = 'hypertrophy' | 'strength' | 'mixed' | 'other';
/** No longer used (D22: strength starts at 5×5, a range is set per exercise); kept so older data stays valid. */
export type StrengthMode = 'fixed' | 'range';
/** Goal of one day in a mixed plan. */
export type DayGoal = 'hypertrophy' | 'strength';
export type ItemRole = 'warmup' | 'main' | 'optional';

export interface PlanItem {
  id: string;
  /** Stable across plan versions; keys the progression state. */
  lineageId: string;
  exerciseId: string;
  /** Old free-text superset label (no longer edited; kept for older data). */
  group?: string;
  /** Circuit of the day this item belongs to (see PlanDay.circuits). */
  circuitId?: string;
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
  /** Mixed plans only: the goal of this day. Not set = each exercise uses its own rule. */
  goal?: DayGoal;
  strengthMode?: StrengthMode;
  /** Not set = the plan colour. */
  color?: ColorKey;
  /** Exercises done back to back without rest, for a number of rounds. Their items are consecutive in `items`. */
  circuits?: Circuit[];
  items: PlanItem[];
}

export interface Circuit {
  id: string;
  name: string;
  rounds: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  goal: PlanGoal;
  strengthMode?: StrengthMode;
  color?: ColorKey;
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
  /** Rep range override after "reps up" (hypertrophy), e.g. 9–13 instead of the plan's 8–12. */
  repsRange?: RepRange;
  updatedAt: string;
}

export type SetStatus = 'pending' | 'done' | 'skipped';

export interface SetRecord {
  id: string;
  kind: SetKind;
  values: Partial<Record<MetricKey, number>>;
  /** Today's goal for this set, computed at workout start (e.g. last time + 1 rep). */
  goal?: Partial<Record<MetricKey, number>>;
  status: SetStatus;
  notes: string;
}

/** Copy of exercise fields at the time of the workout. Keeps history meaningful after edits. */
export interface ExerciseSnapshot {
  name: string;
  thumb?: string;
  category: ExerciseCategory;
  metrics: MetricDef[];
  loadMode: LoadMode;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

/**
 * increase: targets met, the next target goes up automatically.
 * progress / keep: within the range, the target stays (reps are being built).
 * incomplete: sets were skipped or missing, the target stays.
 * restricted: an increase was blocked (pain, technique, substitution, lower load).
 * missed: reps (or the progressed value) fell below the minimum; the user chooses keep or step back.
 * ready: every set reached the top (hypertrophy); the user chooses load up or reps up.
 * at_cap: targets met, but the configured cap is reached.
 * sync: the load went up in another plan with the same exercise; the user chooses to update this item (D36).
 */
export type Outcome = 'increase' | 'ready' | 'progress' | 'keep' | 'incomplete' | 'restricted' | 'missed' | 'at_cap' | 'manual' | 'no_progression' | 'sync';

export type Completion = 'complete' | 'incomplete' | 'below_target';

export interface Reason {
  code: string;
  params?: Record<string, string | number>;
}

export interface Suggestion {
  metric: MetricKey;
  from: number;
  to: number;
  kind: 'increase' | 'decrease';
}

export interface Evaluation {
  strategy: ProgressionStrategy;
  outcome: Outcome;
  completion: Completion;
  suggestion?: Suggestion;
  /** Alternative to a load increase: shift the rep range up by one (outcome "ready"). */
  repsOption?: { from: RepRange; to: RepRange };
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
  /** Snapshot of the circuit this entry was part of. */
  circuit?: Circuit;
  role: ItemRole;
  sets: SetRecord[];
  pain: boolean;
  technique: boolean;
  notes: string;
  evaluation?: Evaluation;
  /** "Short on time" removed a working set: no increase this time (D40). */
  short?: boolean;
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
  /** "Short on time" was used (D40). */
  short?: boolean;
}

/**
 * applied: an increase was applied automatically. reverted: the user undid it.
 * pending: missed reps, waiting for keep / step back. kept / stepped_back: the user's answer.
 * reps_up: the user chose more reps instead of more load. overridden: the user set a value manually. none: nothing to decide.
 */
export type Decision = 'applied' | 'reverted' | 'pending' | 'kept' | 'stepped_back' | 'reps_up' | 'overridden' | 'none';

export interface ProgressionEvent {
  id: string;
  /** Empty for manual adjustments made outside a workout. */
  workoutId?: string;
  entryId?: string;
  lineageId: string;
  exerciseId: string;
  strategy: ProgressionStrategy;
  outcome: Outcome;
  suggestion?: Suggestion;
  repsOption?: { from: RepRange; to: RepRange };
  reasons: Reason[];
  decision: Decision;
  decisionReason?: string;
  /** Target values before and after the decision. */
  before: Partial<Record<MetricKey, number>>;
  after: Partial<Record<MetricKey, number>>;
  /** Rep range override before and after the decision (absent = plan range). */
  rangeBefore?: RepRange;
  rangeAfter?: RepRange;
  createdAt: string;
  decidedAt?: string;
  /** Set when a later workout closed this question as kept; it opens again if that workout is deleted or resumed. */
  closedBy?: string;
  /** Sync questions only: the event that raised the load in the other plan. */
  sourceEventId?: string;
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
  /** No longer used (the library was once applied automatically); kept so older backups stay valid. */
  librarySync?: string;
  /** Default: dark. */
  theme?: 'dark' | 'light' | 'system';
  /** Personal trainer messages: in the workout, and optionally on other pages. */
  coach?: CoachSettings;
  /** Weekly challenge on Home. Default: off. */
  challenge?: boolean;
  /** Load sync between plans with the same exercise (D36). Default: below, e1rm. */
  loadSync?: LoadSync;
  /** Automatic warm-up sets on the first compound exercise of each muscle (D38). Default: off. */
  warmup?: boolean;
  /** Week report on Home on Sundays, without the trainer (D57). Default: the old coach.report (with the trainer on), else off. */
  report?: boolean;
  /** "You vs 3 months ago" on the workout summary, without the trainer (D57). Default: the old coach.rival (with the trainer on), else off. */
  rival?: boolean;
  /** "1987" look, the easter egg of About (D59). Default: off. */
  retro?: boolean;
  /** The secret game, unlocked by the first "1987" (D59). It stays unlocked. */
  secretGame?: boolean;
}

/**
 * trigger — off: never ask; order: only when hypertrophy reaches strength (or another hypertrophy item is below);
 * below: whenever the other item is below the suggestion. method — e1rm: convert through the estimated 1RM; increment: +1 increment.
 */
export interface LoadSync {
  trigger: 'off' | 'order' | 'below';
  method: 'e1rm' | 'increment';
}

export type CoachStyle = 'support' | 'spite' | 'stoic' | 'sergeant' | 'energy';
export type CoachGender = 'male' | 'female';
export interface CoachSettings {
  enabled: boolean;
  style: CoachStyle;
  /** Face of the trainer. Default: male. */
  gender?: CoachGender;
  /** Spite style only: allow swear words. */
  profanity: boolean;
  /** Messages after an exercise or circuit is done: never (start only), always, or about 4 in 10. Default: random. */
  when?: CoachWhen;
  /** Also speak outside the workout: greeting on Home, comments on the summary, Analysis and History. Default: true. */
  pages?: boolean;
  /** Reaction when a set beats the same set of last time (D45). Default: off. */
  live?: boolean;
  /** Old place of Settings.report (D46); read only when Settings.report is not set (D57). */
  report?: boolean;
  /** Reads the messages aloud with the device voice (D47). Default: off. */
  voice?: boolean;
  /** A technique tip from the library when an exercise opens (D48). Default: off. */
  tips?: boolean;
  /** Old place of Settings.rival (D49); read only when Settings.rival is not set (D57). */
  rival?: boolean;
}
export type CoachWhen = 'start' | 'each' | 'random';

export type GameId = 'memory' | 'whack' | 'muscle' | 'flappy' | 'runner' | 'starship' | 'legday' | 'rerack';
/** One finished game. */
export interface GameScore {
  id: string;
  game: GameId;
  score: number;
  at: string;
}

export type ChallengeKind = 'workouts' | 'sets' | 'record' | 'muscle';
/** Weekly challenge (Monday to Sunday). */
export interface Challenge {
  id: string;
  /** Monday of the week, local date YYYY-MM-DD. */
  week: string;
  kind: ChallengeKind;
  /** workouts, sets: count. record: load to beat, canonical kg. muscle: sets of that muscle. */
  target: number;
  exerciseId?: string;
  exerciseName?: string;
  /** record: the exercise is logged per side; the load is shown per side (target stays the total). */
  perSide?: boolean;
  muscle?: string;
  status: 'open' | 'done' | 'missed';
  doneAt?: string;
  createdAt: string;
}

/** A target load for an exercise (D42). Met when a done working set reaches it (total load, canonical kg). */
export interface Goal {
  id: string;
  exerciseId: string;
  exerciseName: string;
  /** Canonical kg, total (per-side × 2). */
  load: number;
  /** Target date, local YYYY-MM-DD. Optional. */
  by?: string;
  createdAt: string;
}

/** The personal trainer's report of a week, Monday to Sunday (D46). Figures as of `createdAt`. */
export interface CoachReport {
  id: string;
  /** Monday of the week, local date YYYY-MM-DD. */
  week: string;
  workouts: number;
  sets: number;
  /** Heaviest set of the week (canonical kg, total). */
  best?: { exerciseName: string; load: number; reps?: number };
  /** Increases in the week (load or reps). */
  ups: number;
  /** Primary muscle trained least in the week, among those trained in the 4 weeks before. */
  weak?: string;
  challenge?: Challenge['status'];
  createdAt: string;
}
