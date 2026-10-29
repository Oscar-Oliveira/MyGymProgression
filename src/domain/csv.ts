// CSV export of tabular records. One row per set, per workout or per progression event.
import type { MetricKey, ProgressionEvent, Workout } from './types';
import { METRIC_KEYS } from './types';

const esc = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

export function setsCsv(workouts: Workout[]): string {
  const custom = new Set<MetricKey>();
  for (const w of workouts) for (const e of w.entries) for (const m of e.exercise.metrics) if (m.key.startsWith('custom:')) custom.add(m.key);
  const keys: MetricKey[] = [...METRIC_KEYS, ...custom];
  const header = [
    'workout_id', 'date', 'plan', 'day', 'workout_status', 'entry_no', 'exercise_id', 'exercise', 'substituted_for', 'set_no', 'kind', 'status',
    ...keys.flatMap((k) => [k, `${k}_unit`]),
    'load_mode', 'goal', 'rest_s', 'notes',
  ];
  const rows: unknown[][] = [];
  for (const w of workouts) {
    w.entries.forEach((e, ei) => {
      e.sets.forEach((s, si) => {
        const units = Object.fromEntries(e.exercise.metrics.map((m) => [m.key, m.unit]));
        rows.push([
          w.id, w.startedAt, w.planName, w.dayName, w.status, ei + 1, e.exerciseId, e.exercise.name, e.substitutedFor, si + 1, s.kind, s.status,
          ...keys.flatMap((k) => (s.values[k] === undefined ? ['', ''] : [s.values[k], units[k] ?? ''])),
          e.exercise.loadMode, s.goal ? JSON.stringify(s.goal) : '', s.restSec, s.notes,
        ]);
      });
    });
  }
  return toCsv(header, rows);
}

export function workoutsCsv(workouts: Workout[]): string {
  const header = ['workout_id', 'started_at', 'ended_at', 'plan', 'day', 'status', 'exercises', 'working_sets_done', 'notes'];
  const rows = workouts.map((w) => [
    w.id, w.startedAt, w.endedAt, w.planName, w.dayName, w.status, w.entries.length,
    w.entries.reduce((a, e) => a + e.sets.filter((s) => s.kind === 'working' && s.status === 'done').length, 0),
    w.notes,
  ]);
  return toCsv(header, rows);
}

export function eventsCsv(events: ProgressionEvent[], names: Record<string, string>): string {
  const header = ['event_id', 'created_at', 'workout_id', 'exercise_id', 'exercise', 'strategy', 'outcome', 'metric', 'from', 'to', 'direction', 'decision', 'decision_reason', 'before', 'after', 'reasons'];
  const rows = events.map((e) => [
    e.id, e.createdAt, e.workoutId, e.exerciseId, names[e.exerciseId] ?? '', e.strategy, e.outcome,
    e.suggestion?.metric, e.suggestion?.from, e.suggestion?.to, e.suggestion?.kind, e.decision, e.decisionReason,
    JSON.stringify(e.before), JSON.stringify(e.after), e.reasons.map((r) => r.code).join('|'),
  ]);
  return toCsv(header, rows);
}
