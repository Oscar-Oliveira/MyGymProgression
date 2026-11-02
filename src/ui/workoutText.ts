// The workout as plain text: every set of every exercise, to paste in an email or ask an AI (calories, for example).
import type { TFunction } from 'i18next';
import type { Workout } from '../domain/types';
import { setText } from './progress';
import { fmtDate, fmtSeconds } from './util';

export function workoutText(w: Workout, t: TFunction, lang: string): string {
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'pt' ? 'pt-PT' : 'en-GB', { timeStyle: 'short' });
  const when = [fmtDate(w.startedAt, lang, true) + (w.endedAt ? ` – ${time(w.endedAt)}` : '')];
  if (w.endedAt) when.push(`${t('analysis.duration')} ${fmtSeconds((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 1000)}`);
  const out = [[w.dayName ?? t('workout.free'), w.planName].filter(Boolean).join(' · '), when.join(' · '), t(`workout.status.${w.status}`)];
  w.entries.forEach((e, i) => {
    const muscles = [...e.exercise.primaryMuscles, ...e.exercise.secondaryMuscles].map((m) => t(`muscle.${m}`, { defaultValue: m }));
    out.push('', `${i + 1}. ${e.exercise.name}${muscles.length ? ` (${muscles.join(', ')})` : ''}`);
    const counters: Record<string, number> = {};
    for (const x of e.sets) {
      const n = (counters[x.kind] = (counters[x.kind] ?? 0) + 1);
      const label = x.kind === 'working' ? t('workout.setN', { n }) : `${t(`setKind.${x.kind}`)} ${n}`;
      out.push(`   ${label}: ${x.status === 'done' ? setText(x, e.exercise.metrics, lang) || '—' : t('setStatus.skipped')}`);
    }
    if (e.notes) out.push(`   ${t('common.notes')}: ${e.notes}`);
  });
  if (w.notes) out.push('', `${t('common.notes')}: ${w.notes}`);
  return out.join('\n');
}
