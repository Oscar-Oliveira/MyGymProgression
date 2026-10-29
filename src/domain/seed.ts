// Starter exercise library (optional). Names in PT and EN; the other language is stored as an alias.
import { newExercise } from './factory';
import type { Exercise, ExerciseCategory, LoadMode, MetricDef, ProgressionConfig, SetPrescription, Settings } from './types';
import { DEFAULT_CRITERIA, type MeasurementPreset } from './units';

interface SeedDef {
  en: string;
  pt: string;
  preset: MeasurementPreset;
  category: ExerciseCategory;
  equipment: string;
  primary: string[];
  secondary?: string[];
  reps?: [number, number];
  sets?: number;
  rest?: number;
  loadMode?: LoadMode;
  /** Overrides for non-resistance exercises. */
  defaultSets?: SetPrescription[];
  progression?: ProgressionConfig;
  metrics?: MetricDef[];
}

const crit = () => ({ ...DEFAULT_CRITERIA });
const none = (): ProgressionConfig => ({ strategy: 'none', steps: [], criteria: crit() });
const w = (targets: SetPrescription['targets'], n = 1, restSec = 0): SetPrescription[] => Array.from({ length: n }, () => ({ kind: 'working', targets: structuredClone(targets), restSec }));

const DEFS: SeedDef[] = [
  { en: 'Barbell Bench Press', pt: 'Supino com barra', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['chest'], secondary: ['triceps', 'shoulders'], reps: [6, 10], sets: 3, rest: 150 },
  { en: 'Incline Dumbbell Press', pt: 'Supino inclinado com halteres', preset: 'reps_load', category: 'compound', equipment: 'dumbbell', primary: ['chest'], secondary: ['shoulders', 'triceps'], loadMode: 'perSide' },
  { en: 'Machine Chest Press', pt: 'Press de peito na máquina', preset: 'reps_load', category: 'compound', equipment: 'machine', primary: ['chest'], secondary: ['triceps'] },
  { en: 'Push-up', pt: 'Flexão de braços', preset: 'bodyweight', category: 'compound', equipment: 'bodyweight', primary: ['chest'], secondary: ['triceps', 'core'] },
  { en: 'Cable Fly', pt: 'Aberturas no cabo', preset: 'reps_load', category: 'isolation', equipment: 'cable', primary: ['chest'], reps: [10, 15], rest: 60 },
  { en: 'Barbell Back Squat', pt: 'Agachamento com barra', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['quads'], secondary: ['glutes', 'hamstrings'], reps: [5, 8], rest: 180 },
  { en: 'Leg Press', pt: 'Leg press', preset: 'reps_load', category: 'compound', equipment: 'machine', primary: ['quads'], secondary: ['glutes'], reps: [10, 15] },
  { en: 'Romanian Deadlift', pt: 'Peso morto romeno', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['hamstrings'], secondary: ['glutes', 'back'], reps: [8, 12], rest: 120 },
  { en: 'Deadlift', pt: 'Peso morto', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['back'], secondary: ['hamstrings', 'glutes'], reps: [3, 6], rest: 180 },
  { en: 'Leg Extension', pt: 'Extensão de pernas', preset: 'reps_load', category: 'isolation', equipment: 'machine', primary: ['quads'], reps: [10, 15], rest: 60 },
  { en: 'Lying Leg Curl', pt: 'Curl de pernas deitado', preset: 'reps_load', category: 'isolation', equipment: 'machine', primary: ['hamstrings'], reps: [10, 15], rest: 60 },
  { en: 'Barbell Hip Thrust', pt: 'Hip thrust com barra', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['glutes'], secondary: ['hamstrings'] },
  { en: 'Walking Lunge', pt: 'Afundos a andar', preset: 'reps_load', category: 'compound', equipment: 'dumbbell', primary: ['quads'], secondary: ['glutes'], loadMode: 'perSide' },
  { en: 'Standing Calf Raise', pt: 'Elevação de gémeos em pé', preset: 'reps_load', category: 'isolation', equipment: 'machine', primary: ['calves'], reps: [10, 15], rest: 60 },
  { en: 'Pull-up', pt: 'Elevações', preset: 'bodyweight', category: 'compound', equipment: 'bodyweight', primary: ['back'], secondary: ['biceps'], reps: [5, 10], rest: 120 },
  { en: 'Lat Pulldown', pt: 'Puxada à frente', preset: 'reps_load', category: 'compound', equipment: 'cable', primary: ['back'], secondary: ['biceps'] },
  { en: 'Barbell Row', pt: 'Remada com barra', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['back'], secondary: ['biceps'], reps: [6, 10], rest: 120 },
  { en: 'Seated Cable Row', pt: 'Remada sentada no cabo', preset: 'reps_load', category: 'compound', equipment: 'cable', primary: ['back'], secondary: ['biceps'] },
  { en: 'One-arm Dumbbell Row', pt: 'Remada unilateral com halter', preset: 'reps_load', category: 'compound', equipment: 'dumbbell', primary: ['back'], secondary: ['biceps'] },
  { en: 'Overhead Press', pt: 'Press militar', preset: 'reps_load', category: 'compound', equipment: 'barbell', primary: ['shoulders'], secondary: ['triceps'], reps: [5, 8], rest: 150 },
  { en: 'Dumbbell Shoulder Press', pt: 'Press de ombros com halteres', preset: 'reps_load', category: 'compound', equipment: 'dumbbell', primary: ['shoulders'], secondary: ['triceps'], loadMode: 'perSide' },
  { en: 'Lateral Raise', pt: 'Elevações laterais', preset: 'reps_load', category: 'isolation', equipment: 'dumbbell', primary: ['shoulders'], reps: [12, 20], rest: 60, loadMode: 'perSide' },
  { en: 'Face Pull', pt: 'Face pull', preset: 'reps_load', category: 'isolation', equipment: 'cable', primary: ['shoulders'], secondary: ['back'], reps: [12, 20], rest: 60 },
  { en: 'Barbell Curl', pt: 'Curl com barra', preset: 'reps_load', category: 'isolation', equipment: 'barbell', primary: ['biceps'], rest: 60 },
  { en: 'Dumbbell Curl', pt: 'Curl com halteres', preset: 'reps_load', category: 'isolation', equipment: 'dumbbell', primary: ['biceps'], rest: 60, loadMode: 'perSide' },
  { en: 'Hammer Curl', pt: 'Curl martelo', preset: 'reps_load', category: 'isolation', equipment: 'dumbbell', primary: ['biceps'], secondary: ['forearms'], rest: 60, loadMode: 'perSide' },
  { en: 'Triceps Pushdown', pt: 'Extensão de tríceps no cabo', preset: 'reps_load', category: 'isolation', equipment: 'cable', primary: ['triceps'], reps: [10, 15], rest: 60 },
  { en: 'Overhead Triceps Extension', pt: 'Extensão de tríceps acima da cabeça', preset: 'reps_load', category: 'isolation', equipment: 'dumbbell', primary: ['triceps'], reps: [10, 15], rest: 60 },
  { en: 'Dips', pt: 'Afundos nas paralelas', preset: 'bodyweight', category: 'compound', equipment: 'bodyweight', primary: ['triceps'], secondary: ['chest', 'shoulders'] },
  { en: 'Plank', pt: 'Prancha', preset: 'duration', category: 'isolation', equipment: 'bodyweight', primary: ['core'] },
  { en: 'Side Plank', pt: 'Prancha lateral', preset: 'duration', category: 'isolation', equipment: 'bodyweight', primary: ['core'] },
  { en: 'Hanging Leg Raise', pt: 'Elevação de pernas suspenso', preset: 'bodyweight', category: 'isolation', equipment: 'bodyweight', primary: ['core'], reps: [8, 15] },
  { en: 'Cable Crunch', pt: 'Abdominal no cabo', preset: 'reps_load', category: 'isolation', equipment: 'cable', primary: ['core'], reps: [10, 15], rest: 60 },
  {
    en: 'Treadmill Warm-up', pt: 'Aquecimento na passadeira', preset: 'treadmill', category: 'warmup', equipment: 'treadmill', primary: ['cardio'],
    defaultSets: w({ duration: { value: 5 } }), progression: none(),
  },
  {
    en: 'Treadmill Walking', pt: 'Caminhada na passadeira', preset: 'treadmill', category: 'cardio', equipment: 'treadmill', primary: ['cardio'],
    defaultSets: w({ duration: { value: 10 }, speed: { value: 5 }, incline: { value: 2 } }),
    progression: { strategy: 'duration', steps: [{ metric: 'duration', increment: 2, cap: 30 }], criteria: crit() },
  },
  { en: 'Running', pt: 'Corrida', preset: 'duration_distance', category: 'cardio', equipment: 'other', primary: ['cardio'], defaultSets: w({ duration: { value: 30 } }), progression: none() },
  { en: 'Stationary Bike', pt: 'Bicicleta estática', preset: 'resistance', category: 'cardio', equipment: 'bike', primary: ['cardio'], secondary: ['quads'], progression: none() },
  { en: 'Rowing Machine', pt: 'Remo ergómetro', preset: 'duration_distance', category: 'cardio', equipment: 'rower', primary: ['cardio'], secondary: ['back'], defaultSets: w({ duration: { value: 10 } }), progression: none() },
  {
    en: 'Hip Mobility Routine', pt: 'Rotina de mobilidade da anca', preset: 'duration', category: 'mobility', equipment: 'bodyweight', primary: ['glutes'],
    metrics: [{ key: 'duration', unit: 'min', required: true }], defaultSets: w({ duration: { value: 5 } }), progression: none(),
  },
  { en: 'Band Shoulder Dislocates', pt: 'Rotações de ombro com elástico', preset: 'bodyweight', category: 'mobility', equipment: 'band', primary: ['shoulders'], metrics: [{ key: 'reps', unit: 'reps', required: true }], defaultSets: w({ reps: { min: 15 } }, 2), progression: none() },
  {
    en: "Farmer's Walk", pt: 'Marcha do agricultor', preset: 'custom', category: 'compound', equipment: 'dumbbell', primary: ['forearms'], secondary: ['core'], loadMode: 'perSide',
    metrics: [{ key: 'duration', unit: 's', required: true }, { key: 'load', unit: 'kg', required: true }],
    defaultSets: w({ duration: { value: 40 }, load: { value: 20 } }, 3, 90), progression: { strategy: 'manual', steps: [], criteria: crit() },
  },
];

export const SEED_SIZE = DEFS.length;

export function seedExercises(settings: Pick<Settings, 'language' | 'loadUnit' | 'distanceUnit'>): Exercise[] {
  return DEFS.map((d) => {
    const ex = newExercise(d.preset, settings);
    const name = settings.language === 'pt' ? d.pt : d.en;
    const alias = settings.language === 'pt' ? d.en : d.pt;
    ex.name = name;
    ex.aliases = alias !== name ? [alias] : [];
    ex.category = d.category;
    ex.equipment = d.equipment;
    ex.primaryMuscles = d.primary;
    ex.secondaryMuscles = d.secondary ?? [];
    ex.loadMode = d.loadMode ?? 'total';
    ex.tags = ['seed'];
    if (d.metrics) ex.metrics = d.metrics.map((m) => (m.key === 'load' ? { ...m, unit: settings.loadUnit } : m));
    if (d.defaultSets) ex.defaultSets = d.defaultSets;
    if (d.progression) ex.progression = d.progression;
    if (d.preset === 'reps_load' || d.preset === 'bodyweight') {
      const [min, max] = d.reps ?? [8, 12];
      if (!d.defaultSets) {
        ex.defaultSets = ex.defaultSets.slice(0, 1).flatMap((s) =>
          Array.from({ length: d.sets ?? 3 }, () => ({ ...structuredClone(s), targets: { ...structuredClone(s.targets), reps: { min, max } }, restSec: d.rest ?? s.restSec })),
        );
      }
      if (ex.loadMode === 'perSide' && ex.progression.strategy === 'double') {
        ex.progression.steps = [{ metric: 'load', increment: settings.loadUnit === 'lb' ? 5 : 2 }];
      }
    }
    return ex;
  });
}
