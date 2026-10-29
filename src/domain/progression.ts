// Progression engine. Pure functions, no UI or storage dependencies.
import type {
  Completion,
  Evaluation,
  MetricKey,
  Outcome,
  ProgressionConfig,
  ProgressionStep,
  Reason,
  Recommendation,
  SetPrescription,
  SetRecord,
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

function restrictions(input: EvalInput, ps: Pair[]): Reason[] {
  const { criteria } = input.config;
  const out: Reason[] = [];
  if (input.pain && criteria.blockOnPain) out.push({ code: 'pain' });
  if (input.technique && criteria.blockOnTechnique) out.push({ code: 'technique' });
  if (criteria.useRir) {
    for (const { index, p, r } of ps) {
      if (p.rir !== undefined && r.rir !== undefined && r.rir < p.rir) {
        out.push({ code: 'rir_below_target', params: { set: index, rir: r.rir, target: p.rir } });
      }
    }
  }
  return out;
}

function sumMetric(sets: SetRecord[], metric: MetricKey): number {
  return workingDone(sets).reduce((a, s) => a + (s.values[metric] ?? 0), 0);
}

function currentTarget(prescription: SetPrescription[], metric: MetricKey): number | undefined {
  return workingPrescribed(prescription)[0]?.targets[metric]?.value;
}

function step(from: number, s: ProgressionStep): number {
  const to = round(from + s.increment);
  return s.cap !== undefined ? Math.min(to, s.cap) : to;
}

const result = (
  input: EvalInput,
  outcome: Outcome,
  completion: Completion,
  reasons: Reason[],
  recommendation?: Recommendation,
): Evaluation => ({ strategy: input.config.strategy, outcome, completion, reasons, ...(recommendation ? { recommendation } : {}) });

function evaluateDouble(input: EvalInput, completion: Completion, completionReasons: Reason[]): Evaluation {
  const s = input.config.steps[0] ?? { metric: 'load', increment: 0 };
  const pm = s.metric;
  const ps = pairs(input.prescription, input.sets);

  if (completion === 'incomplete') return result(input, 'incomplete', completion, completionReasons);
  if (input.substituted && input.config.criteria.blockOnSubstitution) {
    return result(input, 'restricted', completion, [{ code: 'substituted' }]);
  }

  const loadBelow = completionReasons.filter((r) => r.params?.metric === pm);
  if (loadBelow.length) return result(input, 'below_target', completion, loadBelow);

  const repReasons = completionReasons.filter((r) => r.params?.metric === 'reps');
  const belowMax: Reason[] = [];
  for (const { index, p, r } of ps) {
    const max = p.targets.reps?.max;
    if (max === undefined) return result(input, completion === 'complete' ? 'completed_as_prescribed' : 'below_target', completion, [{ code: 'no_rep_max' }]);
    const reps = r.values.reps ?? 0;
    if (reps < max) belowMax.push({ code: 'set_below_max', params: { set: index, reps, max } });
  }

  if (belowMax.length) {
    if (repReasons.length) return result(input, 'below_target', completion, repReasons);
    const prev = input.previous;
    const sameLoad = prev && currentTarget(prev.prescription, pm) === currentTarget(input.prescription, pm);
    if (prev && sameLoad && sumMetric(input.sets, 'reps') > sumMetric(prev.sets, 'reps')) {
      return result(input, 'progress', completion, [{ code: 'reps_improved' }, ...belowMax]);
    }
    return result(input, 'completed_as_prescribed', completion, belowMax);
  }

  const blocked = restrictions(input, ps);
  if (blocked.length) return result(input, 'restricted', completion, [{ code: 'top_reached' }, ...blocked]);

  const from = currentTarget(input.prescription, pm) ?? Math.max(...ps.map((x) => x.r.values[pm] ?? 0));
  if (s.cap !== undefined && from >= s.cap - EPS) {
    return result(input, 'completed_as_prescribed', completion, [{ code: 'top_reached' }, { code: 'cap_reached', params: { metric: pm } }]);
  }
  const reasons: Reason[] = [{ code: 'top_reached' }];
  if (ps.some((x) => x.p.rir !== undefined && x.r.rir === undefined)) reasons.push({ code: 'rir_not_recorded' });
  return result(input, 'increase_recommended', completion, reasons, { metric: pm, from, to: step(from, s) });
}

function evaluateTargets(input: EvalInput, completion: Completion, completionReasons: Reason[]): Evaluation {
  const ps = pairs(input.prescription, input.sets);
  if (completion === 'incomplete') return result(input, 'incomplete', completion, completionReasons);
  if (input.substituted && input.config.criteria.blockOnSubstitution) {
    return result(input, 'restricted', completion, [{ code: 'substituted' }]);
  }
  if (completion === 'below_target') return result(input, 'below_target', completion, completionReasons);
  const blocked = restrictions(input, ps);
  if (blocked.length) return result(input, 'restricted', completion, [{ code: 'targets_met' }, ...blocked]);

  for (const s of input.config.steps) {
    const from = currentTarget(input.prescription, s.metric);
    if (from === undefined) continue;
    if (s.cap !== undefined && from >= s.cap - EPS) continue;
    return result(input, 'increase_recommended', completion, [{ code: 'targets_met' }], { metric: s.metric, from, to: step(from, s) });
  }
  return result(input, 'completed_as_prescribed', completion, [{ code: 'targets_met' }, { code: 'caps_reached' }]);
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
 * Applies current progression targets to a plan prescription.
 * Only working sets receive the progressed values.
 */
export function applyTargets(sets: SetPrescription[], targets: Partial<Record<MetricKey, number>> | undefined): SetPrescription[] {
  const copy = structuredClone(sets);
  if (!targets) return copy;
  for (const s of copy) {
    if (s.kind !== 'working') continue;
    for (const [metric, value] of Object.entries(targets) as [MetricKey, number][]) {
      s.targets[metric] = { ...s.targets[metric], value };
    }
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
