// Progression engine. Pure functions, no UI or storage dependencies.
//
// Rules (D8):
// - All working sets reach the target (double: top of the rep range) → increase (applied automatically, can be undone).
// - Within the range, or sets skipped → keep.
// - A completed set below the minimum (missing reps) → missed: the user chooses keep or step back one increment.
// - Hypertrophy plans (onTop "ask"): top of the range → ready: the user chooses load up or reps up (range +1).
import type {
  Completion,
  Evaluation,
  MetricKey,
  Outcome,
  ProgressionConfig,
  ProgressionStep,
  Reason,
  RepRange,
  SetPrescription,
  SetRecord,
  Suggestion,
} from './types';
import { round } from './units';

const EPS = 1e-9;

export interface EvalInput {
  config: ProgressionConfig;
  /** Effective prescription (plan sets with current progression targets applied). */
  prescription: SetPrescription[];
  sets: SetRecord[];
  pain: boolean;
  technique: boolean;
  substituted: boolean;
  /** The last earlier session of the same lineage, if any. */
  previous?: { prescription: SetPrescription[]; sets: SetRecord[] };
}

interface Pair {
  index: number;
  p: SetPrescription;
  r: SetRecord;
}

const workingPrescribed = (prescription: SetPrescription[]) => prescription.filter((s) => s.kind === 'working');
const workingDone = (sets: SetRecord[]) => sets.filter((s) => s.kind === 'working' && s.status === 'done');

/** Pairs the i-th prescribed working set with the i-th completed working set. */
function pairs(prescription: SetPrescription[], sets: SetRecord[]): Pair[] {
  const p = workingPrescribed(prescription);
  const r = workingDone(sets);
  return p.slice(0, r.length).map((ps, i) => ({ index: i + 1, p: ps, r: r[i] }));
}

/** Evaluates whether the prescription was completed, independent of progression strategy. */
export function evaluateCompletion(prescription: SetPrescription[], sets: SetRecord[]): { completion: Completion; reasons: Reason[] } {
  const prescribed = workingPrescribed(prescription).length;
  const done = workingDone(sets).length;
  if (done < prescribed) {
    return { completion: 'incomplete', reasons: [{ code: 'sets_missing', params: { done, prescribed } }] };
  }
  const reasons: Reason[] = [];
  for (const { index, p, r } of pairs(prescription, sets)) {
    for (const [metric, t] of Object.entries(p.targets) as [MetricKey, NonNullable<SetPrescription['targets'][MetricKey]>][]) {
      const actual = r.values[metric];
      const required = t.value ?? t.min;
      if (required === undefined) continue;
      if (actual === undefined) {
        reasons.push({ code: 'value_missing', params: { set: index, metric } });
      } else if (actual < required - EPS) {
        reasons.push({ code: 'set_below_target', params: { set: index, metric, actual, target: required } });
      }
    }
  }
  return { completion: reasons.length ? 'below_target' : 'complete', reasons };
}

function blockers(input: EvalInput): Reason[] {
  const { criteria } = input.config;
  const out: Reason[] = [];
  if (input.substituted && criteria.blockOnSubstitution) out.push({ code: 'substituted' });
  if (input.pain && criteria.blockOnPain) out.push({ code: 'pain' });
  if (input.technique && criteria.blockOnTechnique) out.push({ code: 'technique' });
  return out;
}

function sumMetric(sets: SetRecord[], metric: MetricKey): number {
  return workingDone(sets).reduce((a, s) => a + (s.values[metric] ?? 0), 0);
}

export function currentTarget(prescription: SetPrescription[], metric: MetricKey): number | undefined {
  return workingPrescribed(prescription)[0]?.targets[metric]?.value;
}

const up = (from: number, s: ProgressionStep): number => {
  const to = round(from + s.increment);
  return s.cap !== undefined ? Math.min(to, s.cap) : to;
};
const down = (from: number, s: ProgressionStep): number => Math.max(0, round(from - s.increment));

const result = (
  input: EvalInput,
  outcome: Outcome,
  completion: Completion,
  reasons: Reason[],
  suggestion?: Suggestion,
  repsOption?: Evaluation['repsOption'],
): Evaluation => ({
  strategy: input.config.strategy,
  outcome,
  completion,
  reasons,
  ...(suggestion ? { suggestion } : {}),
  ...(repsOption ? { repsOption } : {}),
});

/** Current rep range of the first working set, if it has both limits. */
function repRange(prescription: SetPrescription[]): RepRange | undefined {
  const r = workingPrescribed(prescription)[0]?.targets.reps;
  return r?.min !== undefined && r.max !== undefined ? { min: r.min, max: r.max } : undefined;
}

/** Step-back suggestion for a metric, if a current target and an increment exist. */
function stepBack(input: EvalInput, s: ProgressionStep | undefined): Suggestion | undefined {
  if (!s || s.increment <= 0) return undefined;
  const from = currentTarget(input.prescription, s.metric);
  if (from === undefined || from <= 0) return undefined;
  return { metric: s.metric, from, to: down(from, s), kind: 'decrease' };
}

function evaluateDouble(input: EvalInput, completion: Completion, completionReasons: Reason[]): Evaluation {
  const s = input.config.steps[0];
  const pm = s?.metric ?? 'load';
  const ps = pairs(input.prescription, input.sets);

  if (input.substituted && input.config.criteria.blockOnSubstitution) return result(input, 'restricted', completion, [{ code: 'substituted' }]);

  const missed = ps.flatMap(({ index, p, r }) => {
    const min = p.targets.reps?.min ?? p.targets.reps?.value;
    const reps = r.values.reps ?? 0;
    return min !== undefined && reps < min ? [{ code: 'set_below_min', params: { set: index, reps, min } }] : [];
  });
  if (missed.length) return result(input, 'missed', completion, missed, stepBack(input, s));
  if (completion === 'incomplete') return result(input, 'incomplete', completion, completionReasons);

  const loadBelow = completionReasons.filter((r) => r.params?.metric === pm);
  if (loadBelow.length) return result(input, 'restricted', completion, loadBelow);

  const belowMax: Reason[] = [];
  for (const { index, p, r } of ps) {
    const max = p.targets.reps?.max;
    if (max === undefined) return result(input, 'keep', completion, [{ code: 'no_rep_max' }]);
    const reps = r.values.reps ?? 0;
    if (reps < max) belowMax.push({ code: 'set_below_max', params: { set: index, reps, max } });
  }
  if (belowMax.length) {
    const prev = input.previous;
    const sameLoad = prev && currentTarget(prev.prescription, pm) === currentTarget(input.prescription, pm);
    if (prev && sameLoad && sumMetric(input.sets, 'reps') > sumMetric(prev.sets, 'reps')) {
      return result(input, 'progress', completion, [{ code: 'reps_improved' }, ...belowMax]);
    }
    return result(input, 'keep', completion, belowMax);
  }

  const blocked = blockers(input);
  if (blocked.length) return result(input, 'restricted', completion, [{ code: 'top_reached' }, ...blocked]);
  const range = repRange(input.prescription);
  const repsOption = input.config.onTop === 'ask' && range ? { from: range, to: { min: range.min + 1, max: range.max + 1 } } : undefined;
  const from = s ? (currentTarget(input.prescription, pm) ?? Math.max(...ps.map((x) => x.r.values[pm] ?? 0))) : undefined;
  const capped = !s || from === undefined || (s.cap !== undefined && from >= s.cap - EPS);
  const load: Suggestion | undefined = !capped ? { metric: pm, from: from!, to: up(from!, s!), kind: 'increase' } : undefined;
  if (repsOption) return result(input, 'ready', completion, [{ code: 'top_reached' }], load, repsOption);
  if (!load) return result(input, s ? 'at_cap' : 'keep', completion, [{ code: 'top_reached' }, ...(s ? [{ code: 'cap_reached', params: { metric: pm } }] : [])]);
  return result(input, 'increase', completion, [{ code: 'top_reached' }], load);
}

function evaluateTargets(input: EvalInput, completion: Completion, completionReasons: Reason[]): Evaluation {
  if (input.substituted && input.config.criteria.blockOnSubstitution) return result(input, 'restricted', completion, [{ code: 'substituted' }]);
  const stepMetrics = new Set(input.config.steps.map((s) => s.metric));
  const missed = completionReasons.filter((r) => r.code === 'set_below_target' && stepMetrics.has(r.params?.metric as MetricKey));
  if (missed.length) {
    const s = input.config.steps.find((x) => x.metric === missed[0].params?.metric);
    return result(input, 'missed', completion, missed, stepBack(input, s));
  }
  if (completion === 'incomplete') return result(input, 'incomplete', completion, completionReasons);
  if (completion === 'below_target') return result(input, 'keep', completion, completionReasons);
  const blocked = blockers(input);
  if (blocked.length) return result(input, 'restricted', completion, [{ code: 'targets_met' }, ...blocked]);

  for (const s of input.config.steps) {
    const from = currentTarget(input.prescription, s.metric);
    if (from === undefined) continue;
    if (s.cap !== undefined && from >= s.cap - EPS) continue;
    return result(input, 'increase', completion, [{ code: 'targets_met' }], { metric: s.metric, from, to: up(from, s), kind: 'increase' });
  }
  return result(input, 'at_cap', completion, [{ code: 'targets_met' }, { code: 'caps_reached' }]);
}

export function evaluate(input: EvalInput): Evaluation {
  const { completion, reasons } = evaluateCompletion(input.prescription, input.sets);
  switch (input.config.strategy) {
    case 'none':
      return result(input, 'no_progression', completion, reasons);
    case 'manual':
      return result(input, 'manual', completion, reasons);
    case 'double':
      return evaluateDouble(input, completion, reasons);
    default:
      return evaluateTargets(input, completion, reasons);
  }
}

/**
 * Today's goal per prescribed set. Double progression: last time + 1 rep (up to the range max) at the same load;
 * after a load change or without history: the range minimum. Other metrics: the target value.
 */
export function setGoals(config: ProgressionConfig, prescription: SetPrescription[], previous?: { prescription: SetPrescription[]; sets: SetRecord[] }) {
  const pm = config.steps[0]?.metric ?? 'load';
  const sameLoad = previous && currentTarget(previous.prescription, pm) === currentTarget(prescription, pm);
  const counters: Record<string, number> = {};
  return prescription.map((p) => {
    const i = counters[p.kind] ?? 0;
    counters[p.kind] = i + 1;
    const goal: Partial<Record<MetricKey, number>> = {};
    for (const [k, t] of Object.entries(p.targets) as [MetricKey, NonNullable<SetPrescription['targets'][MetricKey]>][]) {
      if (t.value !== undefined) goal[k] = t.value;
    }
    const r = p.targets.reps;
    if (r) {
      const prevReps = previous?.sets.filter((x) => x.kind === p.kind && x.status === 'done')[i]?.values.reps;
      const min = r.min ?? r.value;
      if (config.strategy === 'double' && p.kind === 'working' && sameLoad && prevReps !== undefined && min !== undefined) {
        goal.reps = Math.max(min, r.max !== undefined ? Math.min(r.max, prevReps + 1) : prevReps + 1);
      } else if (min !== undefined) goal.reps = min;
    }
    return goal;
  });
}

/**
 * Applies current progression targets to a plan prescription.
 * Only working sets receive the progressed values.
 */
export function applyTargets(sets: SetPrescription[], targets: Partial<Record<MetricKey, number>> | undefined, repsRange?: RepRange): SetPrescription[] {
  const copy = structuredClone(sets);
  for (const s of copy) {
    if (s.kind !== 'working') continue;
    for (const [metric, value] of Object.entries(targets ?? {}) as [MetricKey, number][]) {
      s.targets[metric] = { ...s.targets[metric], value };
    }
    if (repsRange && s.targets.reps) s.targets.reps = { min: repsRange.min, max: repsRange.max };
  }
  return copy;
}

/** Initial progression targets taken from the first working set of a prescription. */
export function initialTargets(config: ProgressionConfig, sets: SetPrescription[]): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  for (const s of config.steps) {
    const v = currentTarget(sets, s.metric);
    if (v !== undefined) out[s.metric] = v;
  }
  return out;
}
