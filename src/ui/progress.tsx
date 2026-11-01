// Shared texts and components that explain progression to the user.
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { repo } from '../data/repo';
import { canDecide, canRevert } from '../domain/workout';
import { currentTarget } from '../domain/progression';
import type { Exercise, MetricDef, MetricKey, ProgressionEvent, Reason, SetRecord, WorkoutEntry } from '../domain/types';
import { NumInput } from './components/NumInput';
import { fmtNum, fmtValue, metricLabel, reasonText, useSettings, useThumbs } from './util';
import { ExerciseItem } from './components/ExerciseItem';

export type Trend = 'up' | 'same' | 'down' | 'ask' | 'done' | 'short';
const TREND_ICON: Record<Trend, string> = { up: '⬆', same: '＝', down: '⬇', ask: '!', done: '✓', short: '!' };
const TREND_CLASS: Record<Trend, string> = { up: 'up', same: '', down: 'down', ask: 'warn', done: 'up', short: 'warn' };

/** The status label used everywhere: ⬆ Up, ＝ Keep, ⬇ Down, ! Decide, ✓ Done. */
export function TrendPill({ trend }: { trend: Trend }) {
  const { t } = useTranslation();
  return (
    <span className={`pill ${TREND_CLASS[trend]}`}>
      {TREND_ICON[trend]} {t(`trend.${trend}`)}
    </span>
  );
}

const unitOf = (metrics: MetricDef[], k: MetricKey) => metrics.find((m) => m.key === k)?.unit ?? '';
export const fmtMetric = (metrics: MetricDef[], k: MetricKey, v: number | undefined, lang: string) => fmtValue(v, unitOf(metrics, k), lang);

/** "12 · 11 · 10 × 40 kg" for reps+load, otherwise the values of each set joined. */
export function setsLine(sets: SetRecord[], metrics: MetricDef[], lang: string): string {
  const done = sets.filter((s) => s.kind === 'working' && s.status === 'done');
  if (!done.length) return '—';
  const hasReps = metrics.some((m) => m.key === 'reps');
  const loads = [...new Set(done.map((s) => s.values.load))];
  if (hasReps && metrics.some((m) => m.key === 'load') && loads.length === 1 && loads[0] !== undefined) {
    return `${done.map((s) => fmtNum(s.values.reps, lang)).join(' · ')} × ${fmtMetric(metrics, 'load', loads[0], lang)}`;
  }
  return done.map((s) => setText(s, metrics, lang)).join('  ·  ');
}

export function setText(s: SetRecord, metrics: MetricDef[], lang: string): string {
  const v = s.values;
  if (v.reps !== undefined && v.load !== undefined) return `${fmtNum(v.reps, lang)} × ${fmtMetric(metrics, 'load', v.load, lang)}`;
  return metrics
    .filter((m) => v[m.key] !== undefined)
    .map((m) => (m.key === 'reps' ? `${fmtNum(v.reps, lang)} reps` : fmtValue(v[m.key], m.unit, lang)))
    .join(' · ');
}

/** Short prescription: "3 × 8–12 · 40 kg". */
export function rxLine(entry: Pick<WorkoutEntry, 'prescription' | 'exercise'>, t: TFunction, lang: string): string {
  const working = entry.prescription.filter((s) => s.kind === 'working');
  const first = working[0];
  if (!first) return '—';
  const metrics = entry.exercise.metrics;
  const parts = metrics.flatMap((m) => {
    const x = first.targets[m.key];
    if (!x) return [];
    if (m.key === 'reps') {
      if (x.value !== undefined || (x.min !== undefined && x.min === x.max)) return [`${x.value ?? x.min} reps`];
      return [`${x.min ?? '?'}${x.max !== undefined ? `–${x.max}` : '+'} reps`];
    }
    return x.value !== undefined ? [fmtValue(x.value, m.unit, lang)] : [];
  });
  const warm = entry.prescription.filter((s) => s.kind === 'warmup').length;
  return `${warm ? `${warm} ${t('setKind.warmup').toLowerCase()} + ` : ''}${working.length} × ${parts.join(' · ') || '—'}`;
}

/** What the user must do today to progress, e.g. "12 reps in every set → 42.5 kg next time". */
export function progressHint(entry: WorkoutEntry, t: TFunction, lang: string): string {
  const cfg = entry.progression;
  const metrics = entry.exercise.metrics;
  if (cfg.strategy === 'none') return t('hint.fixed');
  if (cfg.strategy === 'manual') return t('hint.manual');
  const s = cfg.steps[0];
  if (!s) return t('hint.manual');
  const from = currentTarget(entry.prescription, s.metric);
  const to = from !== undefined ? Math.round((from + s.increment) * 100) / 100 : undefined;
  const capped = s.cap !== undefined && from !== undefined && from >= s.cap;
  if (cfg.strategy === 'double') {
    const reps = entry.prescription.find((p) => p.kind === 'working')?.targets.reps;
    const max = reps?.max;
    if (max === undefined || to === undefined) return t('hint.manual');
    if (cfg.onTop === 'ask' && reps?.min !== undefined) {
      return t('hint.ask', { max, to: fmtMetric(metrics, s.metric, to, lang), range: `${reps.min + 1}–${max + 1}` });
    }
    if (capped) return t('hint.cap');
    return t('hint.double', { max, to: fmtMetric(metrics, s.metric, to, lang) });
  }
  if (from === undefined || to === undefined) return t('hint.manual');
  if (capped) return t('hint.cap');
  return t('hint.target', { target: fmtMetric(metrics, s.metric, from, lang), to: fmtMetric(metrics, s.metric, to, lang) });
}

/** Trend for an entry and its event, for summaries and lists. */
function trendOf(entry: WorkoutEntry, ev?: ProgressionEvent): Trend {
  if (ev) {
    if (ev.decision === 'applied' || ev.decision === 'reps_up') return 'up';
    if (ev.decision === 'pending') return 'ask';
    if (ev.decision === 'stepped_back') return 'down';
    if (ev.decision === 'overridden' && ev.suggestion) return ev.after[ev.suggestion.metric]! > ev.before[ev.suggestion.metric]! ? 'up' : ev.after[ev.suggestion.metric]! < ev.before[ev.suggestion.metric]! ? 'down' : 'same';
    return 'same';
  }
  if (entry.progression.strategy === 'none') return entry.evaluation?.completion === 'complete' ? 'done' : 'short';
  return 'same';
}

function mainValue(entry: WorkoutEntry, targets?: Partial<Record<MetricKey, number>>): { metric: MetricKey; value: number } | undefined {
  const metric = entry.progression.steps[0]?.metric;
  if (!metric) return undefined;
  const value = targets?.[metric] ?? currentTarget(entry.prescription, metric);
  return value === undefined ? undefined : { metric, value };
}

const firstReason = (t: TFunction, reasons: Reason[], metrics: MetricDef[]) => (reasons[0] ? reasonText(t, reasons[0], metrics) : '');

/** "Keep" has several causes; "building reps" only fits sets below the rep max. */
function keepWhy(t: TFunction, reasons: Reason[], metrics: MetricDef[]): string {
  const code = reasons[0]?.code;
  if (code === 'set_below_max') return t('decide.building');
  if (code === 'top_reached') return t('reason.top_reached_short');
  return firstReason(t, reasons, metrics);
}

/** One line "what happens next" and one line "why" for an evaluated entry. */
export function decisionText(entry: WorkoutEntry, ev: ProgressionEvent | undefined, t: TFunction, lang: string): { what: string; why: string } {
  const metrics = entry.exercise.metrics;
  const evn = entry.evaluation;
  const sets = setsLine(entry.sets, metrics, lang);
  if (!evn) return { what: '', why: sets };
  if (entry.progression.strategy === 'none') {
    return { what: evn.completion === 'complete' ? t('decide.doneFixed') : t('decide.shortFixed'), why: sets };
  }
  const val = (targets?: Partial<Record<MetricKey, number>>) => {
    const m = mainValue(entry, targets);
    return m ? fmtMetric(metrics, m.metric, m.value, lang) : '';
  };
  if (ev?.decision === 'applied') return { what: t('decide.up', { value: val(ev.after) }), why: `${sets} — ${t('reason.top_reached_short')}` };
  if (ev?.decision === 'reps_up' && ev.rangeAfter) {
    return { what: t('decide.repsUp', { range: `${ev.rangeAfter.min}–${ev.rangeAfter.max}`, value: val(ev.after) }), why: `${sets} — ${t('reason.top_reached_short')}` };
  }
  if (ev?.decision === 'pending' && evn.outcome === 'ready') return { what: t('decide.ready'), why: `${sets} — ${t('reason.top_reached_short')}` };
  if (ev?.decision === 'reverted') return { what: t('decide.reverted', { value: val(ev.after) }), why: sets };
  if (ev?.decision === 'pending') {
    // Without a step-back suggestion there is nothing to choose, so no question.
    const key = entry.progression.strategy === 'double' ? 'missed' : 'missedTarget';
    return { what: t(ev.suggestion ? `decide.${key}` : `outcome.${key}`), why: `${sets} — ${firstReason(t, evn.reasons, metrics)}` };
  }
  if (ev?.decision === 'kept') return { what: t('decide.keep', { value: val(ev.after) }), why: sets };
  if (ev?.decision === 'stepped_back') return { what: t('decide.down', { value: val(ev.after) }), why: sets };
  if (ev?.decision === 'overridden') return { what: t('decide.set', { value: val(ev.after) }), why: ev.decisionReason || sets };
  const keep = t('decide.keep', { value: val() });
  // setsLine returns '—' when no set was done; then the reason alone is clearer.
  const withSets = (reason: string) => (!reason ? sets : sets === '—' ? reason : `${sets} — ${reason}`);
  switch (evn.outcome) {
    case 'progress':
      return { what: keep, why: `${sets} — ${t('reason.reps_improved_short')}` };
    case 'keep':
      return { what: keep, why: `${sets} — ${keepWhy(t, evn.reasons, metrics)}` };
    case 'incomplete':
      return { what: keep, why: withSets(firstReason(t, evn.reasons, metrics)) };
    case 'restricted':
      return { what: keep, why: withSets(evn.reasons.filter((r) => r.code !== 'top_reached').map((r) => reasonText(t, r, metrics)).join(' ')) };
    case 'at_cap':
      return { what: t('hint.cap'), why: sets };
    case 'manual':
      return { what: t('hint.manual'), why: sets };
    default:
      return { what: keep, why: sets };
  }
}

/** Decision card shown after a workout: applied increase (undo), missed reps (keep / step back), ready (load / reps), or keep. */
export function DecisionCard({ entry, ev: stored, compact }: { entry: WorkoutEntry; ev?: ProgressionEvent; compact?: boolean }) {
  const { t } = useTranslation();
  const s = useSettings();
  const thumbOf = useThumbs();
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState<number | undefined>(stored?.suggestion?.to);
  const state = useLiveQuery(() => (stored ? db.progressionStates.get(stored.lineageId) : undefined), [stored?.lineageId]);
  // A question that newer progress has made out of date is shown as kept.
  const ev = stored?.decision === 'pending' && state && !canDecide(stored, state) ? { ...stored, decision: 'kept' as const, after: stored.before } : stored;
  const undoable = !compact && !!ev && (ev.decision === 'applied' || ev.decision === 'reps_up') && canRevert(ev, state);
  const trend = trendOf(entry, ev);
  const { what, why } = decisionText(entry, ev, t, s.language);
  const metrics = entry.exercise.metrics;
  const sug = ev?.suggestion;
  const pending = !compact && !!ev && canDecide(ev, state);
  const pill = <TrendPill trend={trend} />;
  const item = (
    <ExerciseItem name={entry.exercise.name} thumb={thumbOf(entry.exerciseId, entry.exercise.thumb)} sub={what} trailing={pill} size={compact ? 'sm' : 'md'}>
      {compact && why && <span className="xitem-sub">{why}</span>}
    </ExerciseItem>
  );
  if (compact) return item;
  const fmt = (v: number) => (sug ? fmtMetric(metrics, sug.metric, v, s.language) : '');
  return (
    <section className={`card decision-card ${trend === 'up' ? 'up' : trend === 'ask' ? 'warn' : ''}`} aria-label={entry.exercise.name}>
      {item}
      {why && <p className="why">{why}</p>}
      {pending && ev.outcome === 'ready' && (
        <div className="actions">
          {sug && (
            <button className="primary" onClick={() => void repo.decide(ev.id, { kind: 'apply' })}>
              ⬆ {t('decide.loadBtn', { value: fmt(sug.to) })}
            </button>
          )}
          {ev.repsOption && (
            <button className="outline" onClick={() => void repo.decide(ev.id, { kind: 'repsUp' })}>
              ⬆ {t('decide.repsBtn', { range: `${ev.repsOption.to.min}–${ev.repsOption.to.max}` })}
            </button>
          )}
          <button className="ghost" onClick={() => void repo.decide(ev.id, { kind: 'keep' })}>
            {t('decide.keepPlain')}
          </button>
        </div>
      )}
      {pending && ev.outcome !== 'ready' && (
        <>
          <div className="actions">
            {sug && (
              <button className="primary" onClick={() => void repo.decide(ev.id, { kind: 'stepBack' })}>
                ⬇ {t('decide.downBtn', { value: fmt(sug.to) })}
              </button>
            )}
            <button className="outline" onClick={() => void repo.decide(ev.id, { kind: 'keep' })}>
              {sug ? t('decide.keepBtn', { value: fmt(sug.from) }) : t('decide.keepPlain')}
            </button>
            {sug && (
              <button className="ghost" aria-expanded={custom} onClick={() => setCustom(!custom)}>
                {t('decide.other')}
              </button>
            )}
          </div>
          {custom && sug && (
            <div className="actions">
              <NumInput label={metricLabel(t, sug.metric, metrics)} value={value} onChange={setValue} />
              <span className="muted">{unitOf(metrics, sug.metric)}</span>
              <button className="primary" disabled={value === undefined} onClick={() => void repo.decide(ev.id, { kind: 'set', value: value!, reason: '' })}>
                {t('common.save')}
              </button>
            </div>
          )}
        </>
      )}
      {undoable && (
        <div className="actions">
          <button className="ghost" onClick={() => void repo.decide(ev.id, { kind: 'revert' })}>
            ↶ {t('decide.undo')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Question about another plan with the same exercise (D36): the load went up in one plan, so this item may be out of date.
 * Pending: update / other value / not now. Applied: undo while still current.
 */
export function SyncCard({ ev: stored, exercise }: { ev: ProgressionEvent; exercise?: Exercise }) {
  const { t } = useTranslation();
  const s = useSettings();
  const thumbOf = useThumbs();
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState<number | undefined>(stored.suggestion?.to);
  const state = useLiveQuery(() => db.progressionStates.get(stored.lineageId), [stored.lineageId]);
  // A question that newer progress has made out of date is shown as kept.
  const ev = stored.decision === 'pending' && state && !canDecide(stored, state) ? { ...stored, decision: 'kept' as const, after: stored.before } : stored;
  const sug = ev.suggestion;
  const p = ev.reasons[0]?.params ?? {};
  const metrics = exercise?.metrics ?? [];
  const fmt = (v?: number) => fmtMetric(metrics, 'load', v, s.language);
  const pending = canDecide(ev, state);
  const changed = ev.decision === 'applied' || ev.decision === 'overridden';
  const trend: Trend = pending ? 'ask' : changed ? 'up' : 'same';
  const target = `${t(`goal.${p.targetGoal}`)} · ${p.targetPlan} — ${p.targetDay}`;
  const what = pending
    ? t('sync.ask', { from: fmt(sug?.from), to: fmt(sug?.to) })
    : changed
      ? t('decide.set', { value: fmt(ev.after.load) })
      : t('decide.keep', { value: fmt(ev.before.load) });
  const why = t('sync.why', { goal: t(`goal.${p.goal}`), plan: p.plan, day: p.day, load: fmt(Number(p.load)) });
  const undoable = changed && canRevert(ev, state);
  return (
    <section className={`card decision-card ${trend === 'up' ? 'up' : trend === 'ask' ? 'warn' : ''}`} aria-label={exercise?.name}>
      <ExerciseItem name={exercise?.name ?? ''} thumb={thumbOf(ev.exerciseId, exercise?.thumb)} sub={target} trailing={<TrendPill trend={trend} />} />
      <p className="why">
        <strong>{what}</strong> {why}
      </p>
      {pending && sug && (
        <>
          <div className="actions">
            <button className="primary" onClick={() => void repo.decide(ev.id, { kind: 'apply' })}>
              ⬆ {t('sync.applyBtn', { value: fmt(sug.to) })}
            </button>
            <button className="ghost" aria-expanded={custom} onClick={() => setCustom(!custom)}>
              {t('decide.other')}
            </button>
            <button className="ghost" onClick={() => void repo.decide(ev.id, { kind: 'keep' })}>
              {t('sync.later')}
            </button>
          </div>
          {custom && (
            <div className="actions">
              <NumInput label={metricLabel(t, 'load', metrics)} value={value} onChange={setValue} />
              <span className="muted">{unitOf(metrics, 'load')}</span>
              <button className="primary" disabled={value === undefined} onClick={() => void repo.decide(ev.id, { kind: 'set', value: value!, reason: t('sync.reason') })}>
                {t('common.save')}
              </button>
            </div>
          )}
        </>
      )}
      {undoable && (
        <div className="actions">
          <button className="ghost" onClick={() => void repo.decide(ev.id, { kind: 'revert' })}>
            ↶ {t('decide.undo')}
          </button>
        </div>
      )}
    </section>
  );
}
