import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetricDef, SetRecord, WorkoutEntry } from '../../domain/types';
import { validateValue } from '../../domain/units';
import { addSet } from '../../domain/workout';
import { NumInput } from './NumInput';
import { Thumb } from './Thumb';
import { progressHint, rxLine, setsLine, setText } from '../progress';
import { buzz, fmtNum, metricLabel, useSettings } from '../util';

function stepFor(m: MetricDef): number {
  if (m.key === 'load') return m.unit === 'lb' ? 5 : 2.5;
  if (m.key === 'duration') return m.unit === 'min' ? 1 : 5;
  if (m.key === 'speed' || m.key === 'distance') return 0.5;
  return 1;
}

function BigStepper({ def, metrics, value, goal, onChange }: { def: MetricDef; metrics: MetricDef[]; value?: number; goal?: number; onChange: (v: number | undefined) => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const step = stepFor(def);
  const label = metricLabel(t, def.key, metrics);
  const bump = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <div className="bigstep">
      <span className="lbl">
        {label} {def.unit !== 'reps' && <span>({def.unit})</span>}
      </span>
      <div className="ctl">
        <button type="button" aria-label={`${label} −${step}`} onClick={() => bump(-step)}>
          −
        </button>
        <NumInput label={label} value={value} onChange={onChange} />
        <button type="button" aria-label={`${label} +${step}`} onClick={() => bump(step)}>
          +
        </button>
      </div>
      {goal !== undefined && <span className="goal">{t('workout.goal', { value: fmtNum(goal, s.language) })}</span>}
    </div>
  );
}

function SetList({ entry, activeId, onActivate, onChange }: { entry: WorkoutEntry; activeId?: string; onActivate: (id: string) => void; onChange: (e: WorkoutEntry) => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const metrics = entry.exercise.metrics;
  const up = (id: string, patch: Partial<SetRecord>) => onChange({ ...entry, sets: entry.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  let working = 0;
  return (
    <div className="sets">
      {entry.sets.map((set) => {
        const label = set.kind === 'working' ? String(++working) : t(`setKind.${set.kind}`).slice(0, 1);
        const min = entry.prescription.find((p) => p.kind === 'working')?.targets.reps?.min;
        const miss = set.status === 'done' && set.kind === 'working' && min !== undefined && (set.values.reps ?? 0) < min;
        if (set.id === activeId) {
          const blocked = metrics.some((m) => validateValue(m, set.values[m.key]));
          return (
            <div key={set.id} className="set active" role="group" aria-label={t('workout.setN', { n: label })}>
              <div className="top">
                <span className="n">{label}</span>
                <strong>{set.kind === 'working' ? t('workout.setN', { n: label }) : t(`setKind.${set.kind}`)}</strong>
              </div>
              <div className="steppers">
                {metrics.map((m) => (
                  <BigStepper key={m.key} def={m} metrics={metrics} value={set.values[m.key]} goal={m.key === 'reps' ? set.goal?.reps : undefined} onChange={(v) => up(set.id, { values: { ...set.values, [m.key]: v } })} />
                ))}
              </div>
              <div className="row">
                <button className="primary xl" disabled={blocked} onClick={() => (buzz(), up(set.id, { status: 'done' }))}>
                  ✓ {t('workout.setDone')}
                </button>
              </div>
              <div className="row between">
                <button className="ghost sm" onClick={() => up(set.id, { status: 'skipped' })}>
                  {t('workout.skip')}
                </button>
                {!entry.prescription[entry.sets.indexOf(set)] && (
                  <button className="ghost sm" onClick={() => onChange({ ...entry, sets: entry.sets.filter((x) => x.id !== set.id) })}>
                    {t('common.remove')}
                  </button>
                )}
              </div>
            </div>
          );
        }
        return (
          <button key={set.id} className={`set ${set.status} ${miss ? 'miss' : ''}`} onClick={() => onActivate(set.id)} aria-label={`${t('workout.setN', { n: label })}: ${set.status === 'skipped' ? t('setStatus.skipped') : setText(set, metrics, s.language)}`}>
            <span className="n">{set.status === 'done' ? '✓' : label}</span>
            <span className="v">{set.status === 'skipped' ? t('setStatus.skipped') : setText(set, metrics, s.language) || '—'}</span>
            {set.status === 'pending' && set.goal?.reps !== undefined && <span className="g">{t('workout.goal', { value: set.goal.reps })}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function EntryFocus({ entry, previous, onChange, onSubstitute, thumbOf }: { entry: WorkoutEntry; previous?: WorkoutEntry; onChange: (e: WorkoutEntry) => void; onSubstitute: () => void; thumbOf: (id: string) => string | undefined }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [chosen, setChosen] = useState<string>();
  const [notes, setNotes] = useState(!!entry.notes);
  const firstPending = entry.sets.find((x) => x.status === 'pending')?.id;
  const chosenSet = entry.sets.find((x) => x.id === chosen);
  // The chosen set stays open until it is marked done or skipped; otherwise the first pending set is open.
  const activeId = chosenSet?.status === 'pending' ? chosen : firstPending;

  return (
    <section aria-label={entry.exercise.name}>
      {entry.group && <span className="badge">{t('plan.group')} {entry.group}</span>}
      <div className="ex-head">
        <Thumb src={thumbOf(entry.exerciseId) ?? entry.exercise.thumb} name={entry.exercise.name} size={76} />
        <div style={{ minWidth: 0 }}>
          <h1 className="ex-title">{entry.exercise.name}</h1>
          <div className="ex-meta num">{rxLine(entry, t, s.language)}</div>
          <div className="ex-last">
            {t('workout.lastTime')}: {previous ? setsLine(previous.sets, previous.exercise.metrics, s.language) : t('workout.firstTime')}
          </div>
        </div>
      </div>
      {entry.substitutedFor && <p className="help">{t('workout.substituted')}</p>}
      <div className="hint">{progressHint(entry, t, s.language)}</div>

      <SetList
        entry={entry}
        activeId={activeId}
        onActivate={(id) => {
          const x = entry.sets.find((y) => y.id === id);
          if (x && x.status !== 'pending') onChange({ ...entry, sets: entry.sets.map((y) => (y.id === id ? { ...y, status: 'pending' } : y)) });
          setChosen(id);
        }}
        onChange={(e) => {
          onChange(e);
          setChosen(undefined);
        }}
      />

      <div className="wk-actions">
        <button className="chip" onClick={() => onChange(addSet(entry, 'working'))}>
          + {t('workout.addSet')}
        </button>
        <button className="chip" onClick={onSubstitute}>
          ⇄ {t('workout.substitute')}
        </button>
        <button className={`chip ${entry.pain ? 'on' : ''}`} aria-pressed={entry.pain} onClick={() => onChange({ ...entry, pain: !entry.pain })}>
          {t('workout.pain')}
        </button>
        <button className={`chip ${entry.technique ? 'on' : ''}`} aria-pressed={entry.technique} onClick={() => onChange({ ...entry, technique: !entry.technique })}>
          {t('workout.technique')}
        </button>
        <button className={`chip ${notes ? 'on' : ''}`} onClick={() => setNotes(!notes)}>
          {t('common.notes')}
        </button>
      </div>
      {notes && <textarea style={{ marginTop: '0.6rem' }} aria-label={t('common.notes')} value={entry.notes} onChange={(e) => onChange({ ...entry, notes: e.target.value })} />}
    </section>
  );
}
