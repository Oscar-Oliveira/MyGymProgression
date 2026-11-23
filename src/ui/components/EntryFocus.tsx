import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { CoachSettings, LoadMode, MetricDef, SetRecord, WorkoutEntry } from '../../domain/types';
import { validateValue } from '../../domain/units';
import { addSet } from '../../domain/workout';
import { effortBand, effortScale, effortText, RIR_CHOICES } from '../../domain/effort';
import { NumInput } from './NumInput';
import { Thumb } from './Thumb';
import { CoachAvatar, CoachName } from './CoachAvatar';
import { progressHint, rxLine, setsLine, setText } from '../progress';
import { buzz, fmtNum, metricLabel, useSettings } from '../util';
import { Icon } from './Icon';
import { InfoButton } from './ExerciseSheet';
import { Modal } from './Modal';
import { PlateLine } from './PlateLine';

export function stepFor(m: MetricDef): number {
  if (m.key === 'load') return m.unit === 'lb' ? 5 : 2.5;
  if (m.key === 'duration') return m.unit === 'min' ? 1 : 5;
  if (m.key === 'speed' || m.key === 'distance') return 0.5;
  return 1;
}

function BigStepper({ def, metrics, loadMode, value, goal, onChange }: { def: MetricDef; metrics: MetricDef[]; loadMode: LoadMode; value?: number; goal?: number; onChange: (v: number | undefined) => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const step = stepFor(def);
  const label = metricLabel(t, def.key, metrics);
  const bump = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <div className="bigstep">
      <span className="lbl">
        {label} {def.unit !== 'reps' && <span>({def.key === 'load' ? `${def.unit} · ${t(`loadMode.short.${loadMode}`)}` : def.unit})</span>}
      </span>
      <div className="ctl">
        <button type="button" aria-label={`${label} −${step}`} onClick={() => bump(-step)}>
          <Icon name="minus" />
        </button>
        <NumInput label={label} value={value} onChange={onChange} />
        <button type="button" aria-label={`${label} +${step}`} onClick={() => bump(step)}>
          <Icon name="plus" />
        </button>
      </div>
      {goal !== undefined && <span className="goal">{t('workout.goal', { value: fmtNum(goal, s.language) })}</span>}
    </div>
  );
}

/** Effort of the open set (V2-D6): one tap for 0…5+ reps in reserve (or the RPE equivalent); tap again to clear. */
export function EffortPicker({ scale, value, target, onChange }: { scale: 'rir' | 'rpe'; value?: number; target?: number; onChange: (rir: number | undefined) => void }) {
  const { t } = useTranslation();
  return (
    <div className="effort" role="group" aria-label={t('effort.label')}>
      <span className="lbl">
        {t(`effort.${scale}Long`)}
        {target !== undefined && <span> · {t('effort.target', { value: effortText(target, scale) })}</span>}
      </span>
      <div className="effort-chips">
        {RIR_CHOICES.map((r) => (
          <button key={r} type="button" className={`chip effort-${effortBand(r)} ${value === r ? 'on' : ''}`} aria-pressed={value === r} aria-label={effortText(r, scale)} onClick={() => onChange(value === r ? undefined : r)}>
            {scale === 'rpe' ? 10 - r : r >= 5 ? '5+' : r}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The same set in the last workout: same kind, same place among the sets of that kind. */
function beforeOf(entry: WorkoutEntry, set: SetRecord, previous?: WorkoutEntry): SetRecord | undefined {
  if (!previous) return undefined;
  const i = entry.sets.filter((x) => x.kind === set.kind).indexOf(set);
  return previous.sets.filter((x) => x.kind === set.kind && x.status === 'done')[i];
}

/** Short text of a set for the "Before" column: load × reps, else the usual set text. */
function shortSet(set: SetRecord, metrics: MetricDef[], lang: string): string {
  const { load, reps } = set.values;
  return load !== undefined && reps !== undefined ? `${fmtNum(load, lang)}×${fmtNum(reps, lang)}` : setText(set, metrics, lang);
}

/**
 * Sets of one exercise (V2-D10, prototype variant A): a table with one row per set (set, the same set last time, the values,
 * the effort, ✓). Tapping a row opens it; the open set is edited under the table with the big steppers and the effort chips.
 */
function SetList({
  entry,
  previous,
  equipment,
  barWeight,
  activeId,
  onActivate,
  onChange,
}: {
  entry: WorkoutEntry;
  previous?: WorkoutEntry;
  equipment?: string;
  barWeight?: number;
  activeId?: string;
  onActivate: (id: string) => void;
  onChange: (e: WorkoutEntry) => void;
}) {
  const { t } = useTranslation();
  const s = useSettings();
  const lang = s.language;
  const metrics = entry.exercise.metrics;
  const scale = effortScale(s);
  const showEffort = !!scale && metrics.some((m) => m.key === 'reps');
  const up = (id: string, patch: Partial<SetRecord>) => onChange({ ...entry, sets: entry.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const min = entry.prescription.find((p) => p.kind === 'working')?.targets.reps?.min;
  let working = 0;
  const labels = new Map(entry.sets.map((x) => [x.id, x.kind === 'working' ? String(++working) : t(`setKind.${x.kind}`).slice(0, 1)]));
  const nameOf = (x: SetRecord) => (x.kind === 'working' ? t('workout.setN', { n: labels.get(x.id) }) : t(`setKind.${x.kind}`));
  const invalid = (x: SetRecord) => metrics.some((m) => validateValue(m, x.values[m.key]));
  const effortCell = (x: SetRecord) => {
    if (x.kind === 'warmup' || x.rir === undefined || !scale) return '–';
    if (scale === 'rpe') return fmtNum(10 - x.rir, lang);
    return x.rir >= 5 ? '5+' : String(x.rir);
  };
  // "Before" keeps room for a short value; the value columns share the rest (up to 4 values, e.g. a treadmill).
  const cols = `2rem minmax(3.5rem, 1fr) repeat(${metrics.length}, minmax(2.4rem, 3.4rem))${showEffort ? ' 2.6rem' : ''}`;
  const set = entry.sets.find((x) => x.id === activeId);
  const before = set && beforeOf(entry, set, previous);
  // "No increase this time" only when the app raises the targets by itself and these flags stop it.
  const blocks = entry.progression.strategy !== 'none' && entry.progression.strategy !== 'manual' && (entry.progression.criteria.blockOnPain || entry.progression.criteria.blockOnTechnique);
  const flagsTitle = blocks ? `${t('workout.flags')} · ${t('workout.flagsHelp')}` : t('workout.flags');

  return (
    <>
      <div className="set-table" style={{ '--st-cols': cols } as CSSProperties}>
        <div className="st-head" aria-hidden="true">
          <span>{t('workout.colSet')}</span>
          <span>{t('workout.colBefore')}</span>
          {metrics.map((m) => (
            <span key={m.key}>{m.key === 'reps' ? metricLabel(t, m.key, metrics) : m.unit}</span>
          ))}
          {showEffort && <span>{scale === 'rpe' ? 'RPE' : 'RIR'}</span>}
        </div>
        {entry.sets.map((x) => {
          const prev = beforeOf(entry, x, previous);
          const miss = x.status === 'done' && x.kind === 'working' && min !== undefined && (x.values.reps ?? 0) < min;
          const cells = (
            <>
              <span className={`st-n k-${x.kind}`}>{labels.get(x.id)}</span>
              <span className="st-before">{prev && previous ? shortSet(prev, previous.exercise.metrics, lang) : '—'}</span>
              {metrics.map((m) => (
                <span key={m.key} className={`st-cell ${m.key === 'reps' && miss ? 'miss' : ''}`}>
                  {x.status === 'skipped' || x.values[m.key] === undefined ? '—' : fmtNum(x.values[m.key], lang)}
                </span>
              ))}
              {showEffort && <span className={`st-eff eff ${x.rir !== undefined && x.kind !== 'warmup' ? `effort-${effortBand(x.rir)}` : ''}`}>{effortCell(x)}</span>}
            </>
          );
          return (
            <div key={x.id} className={`st-row ${x.status} ${x.id === activeId ? 'active' : ''}`}>
              {x.id === activeId ? (
                <div className="st-main" aria-current="step">
                  {cells}
                </div>
              ) : (
                <button type="button" className="st-main" onClick={() => onActivate(x.id)} aria-label={`${nameOf(x)}: ${x.status === 'skipped' ? t('setStatus.skipped') : setText(x, metrics, lang) || '—'}`}>
                  {cells}
                </button>
              )}
              {x.status === 'pending' ? (
                <button type="button" className="st-check" disabled={invalid(x)} aria-label={t('workout.quickDone', { set: nameOf(x) })} onClick={() => (buzz(), up(x.id, { status: 'done' }))}>
                  <Icon name="check" />
                </button>
              ) : (
                <span className={`st-check ${x.status === 'done' ? 'on' : ''}`} aria-hidden="true">
                  {x.status === 'done' && <Icon name="check" />}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Under the table (V2-D30): + Set on the left, the flags for the progression on the right. */}
      <div className="st-under">
        <button type="button" className="outline sm" onClick={() => onChange(addSet(entry, 'working'))}>
          <Icon name="plus" /> {t('workout.addSet')}
        </button>
        <div className="st-flags" role="group" aria-label={t('workout.flags')} title={flagsTitle}>
          <button type="button" className={`chip ${entry.pain ? 'on' : ''}`} aria-pressed={entry.pain} onClick={() => onChange({ ...entry, pain: !entry.pain })}>
            {t('workout.pain')}
          </button>
          <button type="button" className={`chip ${entry.technique ? 'on' : ''}`} aria-pressed={entry.technique} onClick={() => onChange({ ...entry, technique: !entry.technique })}>
            {t('workout.technique')}
          </button>
        </div>
      </div>
      {set && (
        <div className="set active" role="group" aria-label={t('workout.setN', { n: labels.get(set.id) })}>
          <div className="top">
            <span className="n">{labels.get(set.id)}</span>
            <strong>{nameOf(set)}</strong>
            {before && previous && <span className="help">{t('workout.before', { value: shortSet(before, previous.exercise.metrics, lang) })}</span>}
          </div>
          <div className="steppers">
            {metrics.map((m) => (
              <BigStepper key={m.key} def={m} metrics={metrics} loadMode={entry.exercise.loadMode} value={set.values[m.key]} goal={m.key === 'reps' ? set.goal?.reps : undefined} onChange={(v) => up(set.id, { values: { ...set.values, [m.key]: v } })} />
            ))}
          </div>
          <PlateLine load={set.values.load} equipment={equipment} barWeight={barWeight} loadMode={entry.exercise.loadMode} />
          {showEffort && scale && set.kind !== 'warmup' && <EffortPicker scale={scale} value={set.rir} target={entry.prescription[entry.sets.indexOf(set)]?.rir} onChange={(rir) => up(set.id, { rir })} />}
          <div className="row">
            <button className="primary xl" disabled={invalid(set)} onClick={() => (buzz(), up(set.id, { status: 'done' }))}>
              <Icon name="check" /> {t('workout.setDone')}
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
      )}
    </>
  );
}

/**
 * One exercise of the workout. `setup`: the setup note of the exercise (D39), edited here and saved with `onSetup`.
 * `tips`: technique tips of the exercise (D48, D54, D75): the bulb by ⓘ opens one in a bubble (the trainer's, when it is on); "another tip" goes to the next.
 * `onTip`: called with the tip shown (the voice reads it). `info`: the exercise is in the library, so its sheet can open.
 * Layout (V2-D30): ⓘ and the bulb by the name, Substitute on the right of the header, then one small line with the setup and the notes
 * (a tap edits them in a sheet); + Set and the flags are under the set table.
 */
export function EntryFocus({
  entry,
  previous,
  onChange,
  onSubstitute,
  thumbOf,
  setup,
  onSetup,
  tips,
  onTip,
  coach,
  info,
  equipment,
  barWeight,
}: {
  entry: WorkoutEntry;
  previous?: WorkoutEntry;
  onChange: (e: WorkoutEntry) => void;
  onSubstitute: () => void;
  thumbOf: (id: string) => string | undefined;
  setup?: string;
  onSetup?: (text: string) => void;
  tips?: string[];
  onTip?: (tip: string) => void;
  coach?: CoachSettings;
  info?: boolean;
  /** Equipment of the exercise and its own bar weight (for the plates of a bar). */
  equipment?: string;
  barWeight?: number;
}) {
  const { t } = useTranslation();
  const s = useSettings();
  const [chosen, setChosen] = useState<string>();
  // The open tip (index), or none.
  const [tip, setTip] = useState<number>();
  const showTip = (i: number | undefined) => {
    setTip(i);
    if (i !== undefined && tips) onTip?.(tips[i]);
  };
  // The note edited in a sheet: the setup note (saved in the exercise) or the notes of this workout. Closing the sheet saves.
  const [editing, setEditing] = useState<'setup' | 'notes'>();
  const [draft, setDraft] = useState('');
  const edit = (what: 'setup' | 'notes') => {
    setDraft((what === 'setup' ? setup : entry.notes) ?? '');
    setEditing(what);
  };
  const closeEdit = () => {
    const text = draft.trim();
    if (editing === 'setup' && text !== (setup ?? '').trim()) onSetup?.(text);
    if (editing === 'notes' && text !== (entry.notes ?? '').trim()) onChange({ ...entry, notes: text });
    setEditing(undefined);
  };
  const editLabel = editing === 'setup' ? t('workout.setup') : t('common.notes');
  // The sheet opens with the text field ready (after the sheet itself takes the focus).
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) noteRef.current?.focus();
  }, [editing]);
  const firstPending = entry.sets.find((x) => x.status === 'pending')?.id;
  const chosenSet = entry.sets.find((x) => x.id === chosen);
  // The chosen set stays open until it is marked done or skipped; otherwise the first pending set is open.
  const activeId = chosenSet?.status === 'pending' ? chosen : firstPending;

  return (
    <section aria-label={entry.exercise.name}>
      {entry.group && <span className="badge">{t('plan.group')} {entry.group}</span>}
      <div className="ex-head">
        <Thumb src={thumbOf(entry.exerciseId) ?? entry.exercise.thumb} name={entry.exercise.name} size={76} />
        <div className="ex-head-text">
          <h1 className="ex-title">
            {entry.exercise.name}
            {info && <InfoButton id={entry.exerciseId} name={entry.exercise.name} />}
            {tips && tips.length > 0 && (
              <button type="button" className={`info-btn ${tip !== undefined ? 'on' : ''}`} aria-expanded={tip !== undefined} aria-label={t('workout.tip')} title={t('workout.tip')} onClick={() => showTip(tip === undefined ? 0 : undefined)}>
                <Icon name="bulb" />
              </button>
            )}
          </h1>
          <div className="ex-meta num">{rxLine(entry, t, s.language)}</div>
          <div className="ex-last">
            {t('workout.lastTime')}: {previous ? setsLine(previous.sets, previous.exercise.metrics, s.language) : t('workout.firstTime')}
          </div>
        </div>
        <button type="button" className="icon outline ex-sub" aria-label={t('workout.substitute')} title={t('workout.substitute')} onClick={onSubstitute}>
          <Icon name="swap" />
        </button>
      </div>
      <div className="ex-notes">
        {onSetup && (
          <button type="button" className={setup ? '' : 'blank'} aria-label={setup ? `${t('workout.setup')}: ${setup}` : t('workout.setup')} onClick={() => edit('setup')}>
            <Icon name="pin" /> <span>{setup || t('workout.setup')}</span>
          </button>
        )}
        <button type="button" className={entry.notes ? '' : 'blank'} aria-label={entry.notes ? `${t('common.notes')}: ${entry.notes}` : t('common.notes')} onClick={() => edit('notes')}>
          <Icon name="note" /> <span>{entry.notes || t('common.notes')}</span>
        </button>
      </div>
      {tip !== undefined && tips?.[tip] && (
        <div className="coach tip" role="note" aria-label={t('workout.tip')}>
          {coach ? <CoachAvatar style={coach.style} gender={coach.gender} look={coach.look} size={32} /> : <span className="tip-ico"><Icon name="bulb" /></span>}
          <div className="tip-body">
            {coach ? (
              <p>
                <CoachName name={coach.name} />
                {t(`trainer.tip.${coach.style}`, { tip: tips[tip] })}
              </p>
            ) : (
              <p>{tips[tip]}</p>
            )}
            {s.language !== 'en' && <small>{t('workout.tipLanguage')}</small>}
            {tips.length > 1 && (
              <button type="button" className="ghost sm" onClick={() => showTip((tip + 1) % tips.length)}>
                {t('workout.tipNext', { n: tip + 1, total: tips.length })}
              </button>
            )}
          </div>
          <button type="button" className="ghost sm" aria-label={t('common.close')} onClick={() => showTip(undefined)}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {entry.short && <p className="help"><Icon name="timer" /> {t('reason.short')}</p>}
      {entry.substitutedFor && <p className="help">{t('workout.substituted')}</p>}
      <div className="hint">{progressHint(entry, t, s.language)}</div>

      <SetList
        entry={entry}
        previous={previous}
        equipment={equipment}
        barWeight={barWeight}
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

      {editing && (
        <Modal title={editLabel} onClose={closeEdit}>
          <label className="note-edit">
            <span className="help">{t(editing === 'setup' ? 'workout.setupHelp' : 'workout.notesHelp')}</span>
            <textarea ref={noteRef} aria-label={editLabel} value={draft} placeholder={editing === 'setup' ? t('workout.setupPlaceholder') : undefined} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button type="button" className="primary xl" onClick={closeEdit}>
            {t('dialog.ok')}
          </button>
        </Modal>
      )}
    </section>
  );
}
