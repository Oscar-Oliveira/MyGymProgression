import type { BuiltinMetric, MetricDef, MetricKey, ProgressionConfig, SetPrescription } from './types';

/** Allowed units per built-in metric. The first unit is the canonical unit used in analysis. */
export const METRIC_UNITS: Record<BuiltinMetric, string[]> = {
  reps: ['reps'],
  load: ['kg', 'lb'],
  duration: ['s', 'min'],
  distance: ['m', 'km', 'mi'],
  speed: ['km/h', 'mph'],
  incline: ['%'],
  resistance: ['level'],
  calories: ['kcal'],
};

/** Validation limits in canonical units. */
export const METRIC_LIMITS: Record<BuiltinMetric, { min: number; max: number }> = {
  reps: { min: 0, max: 1000 },
  load: { min: 0, max: 1000 },
  duration: { min: 0, max: 86400 },
  distance: { min: 0, max: 1_000_000 },
  speed: { min: 0, max: 60 },
  incline: { min: -10, max: 40 },
  resistance: { min: 0, max: 100 },
  calories: { min: 0, max: 20000 },
};

const TO_CANONICAL: Record<string, number> = {
  kg: 1,
  lb: 0.45359237,
  s: 1,
  min: 60,
  m: 1,
  km: 1000,
  mi: 1609.344,
  'km/h': 1,
  mph: 1.609344,
};

export function isBuiltin(key: MetricKey): key is BuiltinMetric {
  return !key.startsWith('custom:');
}

/** Converts a value to the canonical unit of its metric. Unknown units are returned unchanged. */
export function toCanonical(value: number, unit: string): number {
  return value * (TO_CANONICAL[unit] ?? 1);
}

export function convert(value: number, from: string, to: string): number {
  if (from === to) return value;
  return toCanonical(value, from) / (TO_CANONICAL[to] ?? 1);
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Returns an error code for an invalid value, or undefined if valid. */
export function validateValue(def: MetricDef, value: number | undefined): string | undefined {
  if (value === undefined || Number.isNaN(value)) return def.required ? 'required' : undefined;
  if (!Number.isFinite(value)) return 'invalid';
  if (def.key === 'reps' && !Number.isInteger(value)) return 'integer';
  if (isBuiltin(def.key)) {
    const c = toCanonical(value, def.unit);
    const lim = METRIC_LIMITS[def.key];
    if (c < lim.min || c > lim.max) return 'out_of_range';
  }
  return undefined;
}

export type MeasurementPreset =
  | 'reps_load'
  | 'bodyweight'
  | 'duration'
  | 'distance'
  | 'duration_distance'
  | 'treadmill'
  | 'resistance'
  | 'time_reps'
  | 'custom';

export const MEASUREMENT_PRESETS: MeasurementPreset[] = [
  'reps_load',
  'bodyweight',
  'duration',
  'distance',
  'duration_distance',
  'treadmill',
  'resistance',
  'time_reps',
  'custom',
];

export function presetMetrics(preset: MeasurementPreset, loadUnit = 'kg', distanceUnit = 'km'): MetricDef[] {
  const m = (key: MetricKey, unit: string, required = true): MetricDef => ({ key, unit, required });
  switch (preset) {
    case 'reps_load':
      return [m('reps', 'reps'), m('load', loadUnit)];
    case 'bodyweight':
      return [m('reps', 'reps'), m('load', loadUnit, false)];
    case 'duration':
      return [m('duration', 's')];
    case 'distance':
      return [m('distance', distanceUnit)];
    case 'duration_distance':
      return [m('duration', 'min'), m('distance', distanceUnit)];
    case 'treadmill':
      return [m('duration', 'min'), m('speed', distanceUnit === 'mi' ? 'mph' : 'km/h'), m('incline', '%'), m('distance', distanceUnit, false), m('calories', 'kcal', false)];
    case 'resistance':
      return [m('duration', 'min'), m('resistance', 'level')];
    case 'time_reps':
      return [m('duration', 's'), m('reps', 'reps')];
    case 'custom':
      return [];
  }
}

export function hasMetric(metrics: MetricDef[], key: MetricKey): boolean {
  return metrics.some((d) => d.key === key);
}

export const DEFAULT_CRITERIA = { blockOnPain: true, blockOnTechnique: true, blockOnSubstitution: true };

/** Default prescription and progression suggested for a preset. */
export function presetDefaults(preset: MeasurementPreset, loadUnit = 'kg'): { sets: SetPrescription[]; progression: ProgressionConfig } {
  const working = (targets: SetPrescription['targets'], n: number, restSec: number): SetPrescription[] =>
    Array.from({ length: n }, () => ({ kind: 'working' as const, targets: structuredClone(targets), restSec }));
  switch (preset) {
    case 'reps_load':
      return {
        sets: working({ reps: { min: 8, max: 12 }, load: { value: 20 } }, 3, 90),
        progression: { strategy: 'double', steps: [{ metric: 'load', increment: loadUnit === 'lb' ? 5 : 2.5 }], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'bodyweight':
      return {
        sets: working({ reps: { min: 6, max: 12 } }, 3, 90),
        progression: { strategy: 'manual', steps: [], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'duration':
      return {
        sets: working({ duration: { value: 30 } }, 3, 60),
        progression: { strategy: 'duration', steps: [{ metric: 'duration', increment: 10 }], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'distance':
    case 'duration_distance':
      return {
        sets: working({ duration: { value: 20 } }, 1, 0),
        progression: { strategy: 'none', steps: [], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'treadmill':
      return {
        sets: working({ duration: { value: 10 }, speed: { value: 5 }, incline: { value: 2 } }, 1, 0),
        progression: { strategy: 'none', steps: [], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'resistance':
      return {
        sets: working({ duration: { value: 10 }, resistance: { value: 5 } }, 1, 0),
        progression: { strategy: 'none', steps: [], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'time_reps':
      return {
        sets: working({ duration: { value: 60 }, reps: { min: 10 } }, 3, 60),
        progression: { strategy: 'manual', steps: [], criteria: { ...DEFAULT_CRITERIA } },
      };
    case 'custom':
      return { sets: [], progression: { strategy: 'none', steps: [], criteria: { ...DEFAULT_CRITERIA } } };
  }
}
