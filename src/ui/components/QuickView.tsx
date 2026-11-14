import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workoutSteps } from '../../domain/circuit';
import type { SetRecord, WorkoutEntry } from '../../domain/types';
import { validateValue } from '../../domain/units';
import { editSet } from '../../domain/workout';
import { setText } from '../progress';
import { buzz, metricLabel, useSettings } from '../util';
import { stepFor } from './EntryFocus';
import { Icon } from './Icon';
import { NumInput } from './NumInput';
import { Thumb } from './Thumb';

/** A press this long on ✓ skips the set. */
const LONG_PRESS_MS = 500;

/**
 * Quick view of the active workout (D85): every exercise with its sets on one screen.
 * ✓ marks a set done (again: back to pending; long press: skipped). The value opens a small editor.
 * `onOpen`: shows that step in the normal view.
 */
export function QuickView({
  entries,
  onChange,
  onOpen,
  thumbOf,
}: {
  entries: WorkoutEntry[];
  onChange: (e: WorkoutEntry) => void;
  onOpen: (step: number) => void;
  thumbOf: (id: string, fallback?: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string>();
  const steps = workoutSteps(entries);

  const row = (e: WorkoutEntry, set: SetRecord, label: string, name?: string) => (
    <QuickSet key={set.id} entry={e} set={set} label={label} name={name} open={open === set.id} onToggle={() => setOpen(open === set.id ? undefined : set.id)} onChange={onChange} />
  );

  return (
    <section className="quick" aria-label={t('workout.quick')}>
      {steps.map((st, i) => {
        const es = st.indexes.map((j) => entries[j]);
        if (st.circuit) {
          const rounds = Math.max(0, ...es.map((e) => e.sets.length));
          return (
            <div key={st.indexes[0]} className="quick-ex" role="group" aria-label={st.circuit.name}>
              <button type="button" className="quick-name" onClick={() => onOpen(i)} aria-label={t('workout.quickOpen', { name: st.circuit.name })}>
                <Icon name="circuit" /> {st.circuit.name}
              </button>
              {Array.from({ length: rounds }, (_, r) => (
                <div key={r} className="quick-round">
                  <p className="eyebrow">{t('circuit.roundN', { n: r + 1 })}</p>
                  {es.map((e) => e.sets[r] && row(e, e.sets[r], String(r + 1), e.exercise.name))}
                </div>
              ))}
            </div>
          );
        }
        const e = es[0];
        let working = 0;
        return (
          <div key={e.id} className="quick-ex" role="group" aria-label={e.exercise.name}>
            <button type="button" className="quick-name" onClick={() => onOpen(i)} aria-label={t('workout.quickOpen', { name: e.exercise.name })}>
              <Thumb src={thumbOf(e.exerciseId, e.exercise.thumb)} name={e.exercise.name} size={28} /> {e.exercise.name}
            </button>
            {e.sets.map((set) => row(e, set, set.kind === 'working' ? String(++working) : t(`setKind.${set.kind}`).slice(0, 1)))}
          </div>
        );
      })}
    </section>
  );
}

function QuickSet({
  entry,
  set,
  label,
  name,
  open,
  onToggle,
  onChange,
}: {
  entry: WorkoutEntry;
  set: SetRecord;
  label: string;
  name?: string;
  open: boolean;
  onToggle: () => void;
  onChange: (e: WorkoutEntry) => void;
}) {
  const { t } = useTranslation();
  const s = useSettings();
  const metrics = entry.exercise.metrics;
  const blocked = metrics.some((m) => validateValue(m, set.values[m.key]));
  const status = (x: SetRecord['status']) => onChange({ ...entry, sets: entry.sets.map((y) => (y.id === set.id ? { ...y, status: x } : y)) });
  const setValue = (key: string, v: number | undefined) => onChange(editSet(entry, set.id, { ...set.values, [key]: v }));
  // Long press on ✓: skipped. The click that follows the long press does nothing.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const long = useRef(false);
  const press = () => {
    long.current = false;
    timer.current = setTimeout(() => {
      long.current = true;
      buzz();
      status('skipped');
    }, LONG_PRESS_MS);
  };
  const release = () => clearTimeout(timer.current);
  const text = set.status === 'skipped' ? t('setStatus.skipped') : setText(set, metrics, s.language) || '—';
  const who = name ? `${name} ${t('workout.setN', { n: label })}` : t('workout.setN', { n: label });

  return (
    <div className={`quick-set ${set.status} ${set.kind}`}>
      <div className="quick-line">
        <span className="n">{label}</span>
        {name && <span className="who">{name}</span>}
        <button type="button" className="quick-val" aria-expanded={open} aria-label={`${t('workout.quickEdit', { set: who })}: ${text}`} onClick={onToggle}>
          {text}
        </button>
        <button
          type="button"
          className="quick-check"
          aria-label={t('workout.quickDone', { set: who })}
          aria-pressed={set.status === 'done'}
          disabled={set.status === 'pending' && blocked}
          onPointerDown={set.status === 'pending' ? press : undefined}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (long.current) return void (long.current = false);
            if (set.status === 'pending') {
              buzz();
              status('done');
            } else status('pending');
          }}
        >
          <Icon name={set.status === 'skipped' ? 'undo' : 'check'} />
        </button>
      </div>
      {open && (
        <div className="quick-edit" role="group" aria-label={t('workout.quickEdit', { set: who })}>
          {metrics.map((m) => {
            const lbl = metricLabel(t, m.key, metrics);
            const step = stepFor(m);
            const v = set.values[m.key];
            return (
              <div key={m.key} className="quick-metric">
                <span className="lbl">
                  {lbl} {m.unit !== 'reps' && <small>({m.unit})</small>}
                </span>
                <span className="ctl">
                  <button type="button" aria-label={`${lbl} −${step}`} onClick={() => setValue(m.key, Math.max(0, Math.round(((v ?? 0) - step) * 100) / 100))}>
                    <Icon name="minus" />
                  </button>
                  <NumInput label={lbl} value={v} onChange={(x) => setValue(m.key, x)} />
                  <button type="button" aria-label={`${lbl} +${step}`} onClick={() => setValue(m.key, Math.round(((v ?? 0) + step) * 100) / 100)}>
                    <Icon name="plus" />
                  </button>
                </span>
              </div>
            );
          })}
          <div className="row between">
            {set.status === 'pending' ? (
              <button type="button" className="ghost sm" onClick={() => (status('skipped'), onToggle())}>
                {t('workout.skip')}
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="primary sm" onClick={onToggle}>
              {t('dialog.ok')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
