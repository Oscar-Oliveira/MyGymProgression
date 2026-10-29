// Editors for exercise metrics, set prescriptions and progression configuration.
import { useTranslation } from 'react-i18next';
import type { MetricDef, MetricKey, ProgressionConfig, ProgressionStrategy, SetKind, SetPrescription } from '../../domain/types';
import { METRIC_KEYS } from '../../domain/types';
import { DEFAULT_CRITERIA, isBuiltin, METRIC_UNITS } from '../../domain/units';
import { metricLabel } from '../util';
import { NumInput } from './NumInput';

export function MetricsEditor({ metrics, onChange }: { metrics: MetricDef[]; onChange: (m: MetricDef[]) => void }) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<MetricDef>) => onChange(metrics.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const unused = METRIC_KEYS.filter((k) => !metrics.some((m) => m.key === k));
  return (
    <div className="stack-sm">
      {metrics.map((m, i) => (
        <div className="row wrap" key={m.key}>
          {isBuiltin(m.key) ? (
            <strong className="w-8">{metricLabel(t, m.key)}</strong>
          ) : (
            <input aria-label={t('exercise.customLabel')} className="w-8" value={m.label ?? ''} onChange={(e) => set(i, { label: e.target.value })} />
          )}
          {isBuiltin(m.key) ? (
            <select aria-label={t('exercise.unit')} value={m.unit} onChange={(e) => set(i, { unit: e.target.value })}>
              {METRIC_UNITS[m.key].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          ) : (
            <input aria-label={t('exercise.unit')} className="w-4" value={m.unit} onChange={(e) => set(i, { unit: e.target.value })} />
          )}
          <label className="check">
            <input type="checkbox" checked={m.required} onChange={(e) => set(i, { required: e.target.checked })} /> {t('exercise.required')}
          </label>
          <button type="button" className="ghost" onClick={() => onChange(metrics.filter((_, j) => j !== i))}>
            {t('common.remove')}
          </button>
        </div>
      ))}
      <select
        aria-label={t('exercise.addMetric')}
        value=""
        onChange={(e) => {
          const k = e.target.value;
          if (k === 'custom') onChange([...metrics, { key: `custom:${crypto.randomUUID().slice(0, 8)}`, unit: '', required: false, label: '' }]);
          else if (k) onChange([...metrics, { key: k as MetricKey, unit: METRIC_UNITS[k as keyof typeof METRIC_UNITS][0], required: false }]);
        }}
      >
        <option value="">+ {t('exercise.addMetric')}</option>
        {unused.map((k) => (
          <option key={k} value={k}>
            {metricLabel(t, k)}
          </option>
        ))}
        <option value="custom">{t('metric.custom')}</option>
      </select>
    </div>
  );
}

const KINDS: SetKind[] = ['warmup', 'working', 'backoff'];

export function PrescriptionEditor({ sets, metrics, onChange }: { sets: SetPrescription[]; metrics: MetricDef[]; onChange: (s: SetPrescription[]) => void }) {
  const { t } = useTranslation();
  const upd = (i: number, f: (s: SetPrescription) => SetPrescription) => onChange(sets.map((s, j) => (j === i ? f(structuredClone(s)) : s)));
  const setTarget = (i: number, key: MetricKey, field: 'value' | 'min' | 'max', v: number | undefined) =>
    upd(i, (s) => {
      const tgt = { ...s.targets[key], [field]: v };
      if (tgt.value === undefined && tgt.min === undefined && tgt.max === undefined) delete s.targets[key];
      else s.targets[key] = tgt;
      return s;
    });
  return (
    <div className="stack-sm">
      {sets.map((s, i) => (
        <div className="set-rx" key={i}>
          <span className="muted">{t('prescription.setN', { n: i + 1 })}</span>
          <select aria-label={t('prescription.kind')} value={s.kind} onChange={(e) => upd(i, (x) => ({ ...x, kind: e.target.value as SetKind }))}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`setKind.${k}`)}
              </option>
            ))}
          </select>
          {metrics.map((m) =>
            m.key === 'reps' ? (
              <span key={m.key} className="field-inline">
                <span>{metricLabel(t, m.key, metrics)}</span>
                <NumInput label={`${metricLabel(t, m.key)} ${t('prescription.min')}`} placeholder={t('prescription.min')} value={s.targets.reps?.min ?? s.targets.reps?.value} onChange={(v) => setTarget(i, 'reps', 'min', v)} />
                –
                <NumInput label={`${metricLabel(t, m.key)} ${t('prescription.max')}`} placeholder={t('prescription.max')} value={s.targets.reps?.max} onChange={(v) => setTarget(i, 'reps', 'max', v)} />
              </span>
            ) : (
              <span key={m.key} className="field-inline">
                <span>
                  {metricLabel(t, m.key, metrics)} <small>({m.unit})</small>
                </span>
                <NumInput label={metricLabel(t, m.key, metrics)} placeholder={t('prescription.target')} value={s.targets[m.key]?.value} onChange={(v) => setTarget(i, m.key, 'value', v)} />
              </span>
            ),
          )}
          <button type="button" className="ghost" aria-label={`${t('common.remove')} ${i + 1}`} onClick={() => onChange(sets.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="outline"
        onClick={() => onChange([...sets, sets.length ? structuredClone(sets[sets.length - 1]) : { kind: 'working', targets: {} }])}
      >
        + {t('prescription.addSet')}
      </button>
    </div>
  );
}

const STRATEGIES: ProgressionStrategy[] = ['double', 'duration', 'distance', 'intensity', 'multi', 'manual', 'none'];
const FIXED_METRIC: Partial<Record<ProgressionStrategy, MetricKey>> = { duration: 'duration', distance: 'distance' };

function defaultSteps(strategy: ProgressionStrategy, metrics: MetricDef[]): ProgressionConfig['steps'] {
  const has = (k: MetricKey) => metrics.some((m) => m.key === k);
  const lb = metrics.find((m) => m.key === 'load')?.unit === 'lb';
  switch (strategy) {
    case 'double':
      return [{ metric: has('load') ? 'load' : 'resistance', increment: lb ? 5 : 2.5 }];
    case 'duration':
      return [{ metric: 'duration', increment: metrics.find((m) => m.key === 'duration')?.unit === 'min' ? 1 : 10 }];
    case 'distance':
      return [{ metric: 'distance', increment: 0.5 }];
    case 'intensity':
      return [{ metric: has('incline') ? 'incline' : has('speed') ? 'speed' : 'resistance', increment: 1 }];
    case 'multi':
      return metrics.filter((m) => m.key !== 'reps').slice(0, 2).map((m) => ({ metric: m.key, increment: 1 }));
    default:
      return [];
  }
}

export function ProgressionEditor({ config, metrics, onChange }: { config: ProgressionConfig; metrics: MetricDef[]; onChange: (c: ProgressionConfig) => void }) {
  const { t } = useTranslation();
  const setStep = (i: number, patch: Partial<ProgressionConfig['steps'][number]>) => onChange({ ...config, steps: config.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const criteria = config.criteria ?? DEFAULT_CRITERIA;
  const showSteps = !['manual', 'none'].includes(config.strategy);
  const choosable = metrics.filter((m) => m.key !== 'reps');
  return (
    <div className="stack-sm">
      <label>
        {t('strategy.label')}
        <select value={config.strategy} onChange={(e) => {
          const strategy = e.target.value as ProgressionStrategy;
          onChange({ ...config, strategy, steps: defaultSteps(strategy, metrics) });
        }}>
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {t(`strategy.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="help">{t(`strategy.help.${config.strategy}`)}</p>
      {showSteps &&
        config.steps.map((s, i) => (
          <div className="row wrap" key={i}>
            <label className="field-inline">
              <span>{t('progression.variable')}</span>
              {FIXED_METRIC[config.strategy] ? (
                <strong>{metricLabel(t, s.metric, metrics)}</strong>
              ) : (
                <select value={s.metric} onChange={(e) => setStep(i, { metric: e.target.value as MetricKey })}>
                  {choosable.map((m) => (
                    <option key={m.key} value={m.key}>
                      {metricLabel(t, m.key, metrics)}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <span className="field-inline">
              <span>
                {t('progression.increment')} <small>({metrics.find((m) => m.key === s.metric)?.unit})</small>
              </span>
              <NumInput label={t('progression.increment')} value={s.increment} onChange={(v) => setStep(i, { increment: v ?? 0 })} />
            </span>
            <span className="field-inline">
              <span>{t('progression.cap')}</span>
              <NumInput label={t('progression.cap')} value={s.cap} onChange={(v) => setStep(i, { cap: v })} />
            </span>
            {config.strategy === 'multi' && (
              <button type="button" className="ghost" onClick={() => onChange({ ...config, steps: config.steps.filter((_, j) => j !== i) })}>
                ✕
              </button>
            )}
          </div>
        ))}
      {config.strategy === 'multi' && choosable.length > 0 && (
        <button type="button" className="outline" onClick={() => onChange({ ...config, steps: [...config.steps, { metric: choosable[0].key, increment: 1 }] })}>
          + {t('progression.addStep')}
        </button>
      )}
      {showSteps && (
        <fieldset>
          <legend>{t('progression.criteria')}</legend>
          {(['blockOnPain', 'blockOnTechnique', 'blockOnSubstitution'] as const).map((k) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={criteria[k]} onChange={(e) => onChange({ ...config, criteria: { ...criteria, [k]: e.target.checked } })} /> {t(`progression.${k}`)}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
