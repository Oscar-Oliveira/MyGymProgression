// Zod schemas for the interchange format (see docs/data-format.md).
import { z } from 'zod';

const metricKey = z.string().regex(/^(reps|load|duration|distance|speed|incline|resistance|calories|custom:.+)$/, 'unknown metric key');
const num = z.number().finite();
const iso = z.string().min(10);
const metricValues = z.record(metricKey, num);

export const targetSchema = z.object({ value: num.optional(), min: num.optional(), max: num.optional() });
export const setPrescriptionSchema = z.object({
  kind: z.enum(['warmup', 'working', 'backoff']),
  targets: z.record(metricKey, targetSchema),
  restSec: num.optional(),
});
export const progressionSchema = z.object({
  strategy: z.enum(['double', 'duration', 'distance', 'intensity', 'multi', 'manual', 'none']),
  steps: z.array(z.object({ metric: metricKey, increment: num, cap: num.optional() })),
  criteria: z.object({ blockOnPain: z.boolean(), blockOnTechnique: z.boolean(), blockOnSubstitution: z.boolean() }),
});
const metricDef = z.object({ key: metricKey, unit: z.string(), required: z.boolean(), label: z.string().optional() });
const category = z.enum(['compound', 'isolation', 'cardio', 'warmup', 'mobility', 'other']);
const loadMode = z.enum(['total', 'perSide']);

export const exerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string(),
  category,
  instructions: z.string(),
  safetyNotes: z.string(),
  personalNotes: z.string(),
  tags: z.array(z.string()),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  active: z.boolean(),
  variationOf: z.string().optional(),
  metrics: z.array(metricDef),
  loadMode,
  defaultSets: z.array(setPrescriptionSchema),
  progression: progressionSchema,
  createdAt: iso,
  updatedAt: iso,
});

const planItem = z.object({
  id: z.string(),
  lineageId: z.string(),
  exerciseId: z.string(),
  group: z.string().optional(),
  role: z.enum(['warmup', 'main', 'optional']),
  sets: z.array(setPrescriptionSchema),
  progression: progressionSchema.optional(),
  substitutes: z.array(z.string()),
  notes: z.string(),
});

export const planSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  goal: z.enum(['hypertrophy', 'strength', 'mixed', 'other']),
  phase: z.string(),
  status: z.enum(['active', 'archived']),
  currentVersionId: z.string(),
  createdAt: iso,
  updatedAt: iso,
});

export const planVersionSchema = z.object({
  id: z.string().min(1),
  planId: z.string(),
  number: z.number().int().positive(),
  createdAt: iso,
  locked: z.boolean(),
  days: z.array(z.object({ id: z.string(), name: z.string(), weekday: z.number().int().min(0).max(6).optional(), items: z.array(planItem) })),
});

export const progressionStateSchema = z.object({ lineageId: z.string().min(1), exerciseId: z.string(), targets: metricValues, updatedAt: iso });

const reason = z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), num])).optional() });
const outcome = z.enum(['increase', 'progress', 'keep', 'incomplete', 'restricted', 'missed', 'at_cap', 'manual', 'no_progression']);
const suggestion = z.object({ metric: metricKey, from: num, to: num, kind: z.enum(['increase', 'decrease']) });

const setRecord = z.object({
  id: z.string(),
  kind: z.enum(['warmup', 'working', 'backoff']),
  values: metricValues,
  goal: metricValues.optional(),
  restSec: num.optional(),
  status: z.enum(['pending', 'done', 'skipped']),
  notes: z.string(),
});

const entry = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exercise: z.object({ name: z.string(), category, metrics: z.array(metricDef), loadMode, primaryMuscles: z.array(z.string()), secondaryMuscles: z.array(z.string()) }),
  lineageId: z.string().optional(),
  prescription: z.array(setPrescriptionSchema),
  progression: progressionSchema,
  substitutedFor: z.string().optional(),
  group: z.string().optional(),
  role: z.enum(['warmup', 'main', 'optional']),
  sets: z.array(setRecord),
  pain: z.boolean(),
  technique: z.boolean(),
  notes: z.string(),
  evaluation: z
    .object({
      strategy: progressionSchema.shape.strategy,
      outcome,
      completion: z.enum(['complete', 'incomplete', 'below_target']),
      suggestion: suggestion.optional(),
      reasons: z.array(reason),
    })
    .optional(),
});

export const workoutSchema = z.object({
  id: z.string().min(1),
  startedAt: iso,
  endedAt: iso.optional(),
  planId: z.string().optional(),
  planVersionId: z.string().optional(),
  dayId: z.string().optional(),
  planName: z.string().optional(),
  dayName: z.string().optional(),
  status: z.enum(['in_progress', 'completed', 'partial', 'interrupted']),
  notes: z.string(),
  entries: z.array(entry),
  updatedAt: iso,
});

export const progressionEventSchema = z.object({
  id: z.string().min(1),
  workoutId: z.string().optional(),
  entryId: z.string().optional(),
  lineageId: z.string(),
  exerciseId: z.string(),
  strategy: progressionSchema.shape.strategy,
  outcome,
  suggestion: suggestion.optional(),
  reasons: z.array(reason),
  decision: z.enum(['applied', 'reverted', 'pending', 'kept', 'stepped_back', 'overridden', 'none']),
  decisionReason: z.string().optional(),
  before: metricValues,
  after: metricValues,
  createdAt: iso,
  decidedAt: iso.optional(),
});

export const revisionSchema = z.object({ id: z.string().min(1), workoutId: z.string(), at: iso, previous: workoutSchema });

export const settingsSchema = z.object({
  id: z.literal('settings'),
  language: z.enum(['pt', 'en']),
  loadUnit: z.enum(['kg', 'lb']),
  distanceUnit: z.enum(['km', 'mi']),
  stalledThreshold: z.number().int().min(2).max(20),
  lastBackupAt: iso.optional(),
});

export const SCHEMA_VERSION = 2;
export const FORMAT_ID = 'mygymprogression';

export const bundleSchema = z.object({
  format: z.literal(FORMAT_ID),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: iso,
  app: z.object({ version: z.string() }),
  scope: z.enum(['full', 'library', 'plans']),
  data: z.object({
    exercises: z.array(exerciseSchema).default([]),
    plans: z.array(planSchema).default([]),
    planVersions: z.array(planVersionSchema).default([]),
    progressionStates: z.array(progressionStateSchema).default([]),
    workouts: z.array(workoutSchema).default([]),
    progressionEvents: z.array(progressionEventSchema).default([]),
    revisions: z.array(revisionSchema).default([]),
    settings: settingsSchema.optional(),
  }),
});
