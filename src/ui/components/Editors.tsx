// Editors for exercise metrics, set prescriptions and progression configuration.
import { useTranslation } from 'react-i18next';
import type { MetricDef, MetricKey, ProgressionConfig, ProgressionStrategy, SetKind, SetPrescription } from '../../domain/types';
import { METRIC_KEYS } from '../../domain/types';
import { DEFAULT_CRITERIA, isBuiltin, METRIC_UNITS } from '../../domain/units';
import { metricLabel, metricShort } from '../util';
import { NumInput } from './NumInput';

export function MetricsEditor({ metrics, onChange }: { metrics: MetricDef[]; onChange: (m: MetricDef[]) => void }) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<MetricDef>) => onChange(metrics.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const unused = METRIC_KEYS.filter((k) => !metrics.some((m) => m.key === k));
  const cols = { gridTemplateColumns: 'minmax(0, 1.6fr) minmax(4.5rem, 1fr) 4.5rem 2.2rem' };
  return (
    <div>
      {metrics.length > 0 && (
        <div className="gtable" role="table">
          <div className="gtable-row head" role="row" style={cols}>
            <span role="columnheader">{t('exercise.metric')}</span>
            <span role="columnheader">{t('exercise.unit')}</span>
            <span role="columnheader">{t('exercise.required')}</span>
            <span />
          </div>
          {metrics.map((m, i) => (
            <div className="gtable-row" role="row" key={m.key} style={cols}>
              {isBuiltin(m.key) ? (
                <strong>{metricLabel(t, m.key)}</strong>
              ) : (
                <input aria-label={t('exercise.customLabel')} placeholder={t('exercise.customLabel')} value={m.label ?? ''} onChange={(e) => set(i, { label: e.target.value })} />
              )}
              {isBuiltin(m.key) ? (
                <select aria-label={`${t('exercise.unit')} ${metricLabel(t, m.key)}`} value={m.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                  {METRIC_UNITS[m.key].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              ) : (
                <input aria-label={t('exercise.unit')} value={m.unit} onChange={(e) => set(i, { unit: e.target.value })} />
              )}
              <input type="checkbox" className="big-check" aria-label={`${t('exercise.required')} ${metricLabel(t, m.key, metrics)}`} checked={m.required} onChange={(e) => set(i, { required: e.target.checked })} />
              <button type="button" className="ghost sm" aria-label={`${t('common.remove')} ${metricLabel(t, m.key, metrics)}`} onClick={() => onChange(metrics.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <select
        aria-label={t('exercise.addMetric')}
        style={{ marginTop: '0.6rem' }}
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
  // Reps take two columns (min–max); every other metric one column.
  const cols = { gridTemplateColumns: `1.6rem minmax(4.6rem, 1fr) ${metrics.map((m) => (m.key === 'reps' ? 'minmax(0, 1.6fr)' : 'minmax(0, 1fr)')).join(' ')} 2.2rem` };
  return (
    <div>
      {sets.length > 0 && (
        <div className="gtable" role="table">
          <div className="gtable-row head" role="row" style={cols}>
            <span role="columnheader">#</span>
            <span role="columnheader">{t('prescription.kind')}</span>
            {metrics.map((m) => (
              <span key={m.key} role="columnheader" title={metricLabel(t, m.key, metrics)}>
                {metricShort(t, m.key, metrics)}
                {m.unit !== 'reps' && <small>{m.unit}</small>}
              </span>
            ))}
            <span />
          </div>
          {sets.map((s, i) => (
            <div className="gtable-row" role="row" key={i} style={cols}>
              <span className="n">{i + 1}</span>
              <select aria-label={`${t('prescription.kind')} ${i + 1}`} value={s.kind} onChange={(e) => upd(i, (x) => ({ ...x, kind: e.target.value as SetKind }))}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`setKindShort.${k}`)}
                  </option>
                ))}
              </select>
              {metrics.map((m) =>
                m.key === 'reps' ? (
                  <span key={m.key} className="range">
                    <NumInput label={`${metricLabel(t, m.key)} ${t('prescription.min')} ${i + 1}`} placeholder={t('prescription.min')} value={s.targets.reps?.min ?? s.targets.reps?.value} onChange={(v) => setTarget(i, 'reps', 'min', v)} />
                    <span aria-hidden="true">–</span>
                    <NumInput label={`${metricLabel(t, m.key)} ${t('prescription.max')} ${i + 1}`} placeholder={t('prescription.max')} value={s.targets.reps?.max} onChange={(v) => setTarget(i, 'reps', 'max', v)} />
                  </span>
                ) : (
                  <NumInput key={m.key} label={`${metricLabel(t, m.key, metrics)} ${i + 1}`} placeholder={t('prescription.target')} value={s.targets[m.key]?.value} onChange={(v) => setTarget(i, m.key, 'value', v)} />
                ),
              )}
              <button type="button" className="ghost sm" aria-label={`${t('common.remove')} ${i + 1}`} onClick={() => onChange(sets.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="outline sm"
        style={{ marginTop: '0.6rem' }}
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
