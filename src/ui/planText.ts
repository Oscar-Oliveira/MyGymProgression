// Plans as plain text (D81): days, exercises, sets with today's targets (after progression) and the progression rule,
// to paste in an AI chat and ask about the plan.
import type { TFunction } from 'i18next';
import type { MetricDef, Plan, PlanVersion, SetPrescription } from '../domain/types';
import { startWorkout, type StartContext } from '../domain/workout';
import { fmtValue } from './util';

/** "8–12 reps · 40 kg" for one set. */
function rx(s: SetPrescription, metrics: MetricDef[], lang: string): string {
  return metrics
    .flatMap((m) => {
      const x = s.targets[m.key];
      if (!x) return [];
      const unit = m.key === 'reps' ? 'reps' : m.unit;
      if (x.value !== undefined) return [fmtValue(x.value, unit, lang)];
      if (x.min !== undefined || x.max !== undefined) return [`${x.min ?? '?'}${x.max !== undefined ? `–${x.max}` : '+'} ${unit}`.trim()];
      return [];
    })
    .join(' · ');
}

/** Equal sets in a row are grouped: "Warm-up: 1 × 10 reps · 20 kg; Working: 3 × 8–12 reps · 40 kg". */
function setsText(sets: SetPrescription[], metrics: MetricDef[], t: TFunction, lang: string): string {
  const groups: { kind: string; text: string; n: number }[] = [];
  for (const s of sets) {
    const text = rx(s, metrics, lang) || '—';
    const last = groups.at(-1);
    if (last && last.kind === s.kind && last.text === text) last.n++;
    else groups.push({ kind: s.kind, text, n: 1 });
  }
  return groups.map((g) => `${t(`setKind.${g.kind}`)}: ${g.n} × ${g.text}`).join('; ');
}

export function planText(plan: Plan, version: PlanVersion, ctx: StartContext, t: TFunction, lang: string): string {
  const head = [t(`goal.${plan.goal}`), plan.phase].filter(Boolean).join(' · ');
  const out = [`# ${plan.name}`, `${t('goal.label')}: ${head}`];
  if (plan.description) out.push(plan.description);
  for (const day of version.days) {
    const goal = day.goal ? ` · ${t(`goal.${day.goal}`)}` : '';
    const weekday = day.weekday !== undefined ? ` (${(t('weekday', { returnObjects: true }) as string[])[day.weekday]})` : '';
    out.push('', `## ${day.name || t('plan.day')}${weekday}${goal}`);
    let circuit: string | undefined;
    startWorkout(plan, version, day, ctx).entries.forEach((e, i) => {
      if (e.circuit && e.circuit.id !== circuit) out.push(`${t('circuit.label')} "${e.circuit.name}": ${t('circuit.roundsCount', { count: e.circuit.rounds })}`);
      circuit = e.circuit?.id;
      const muscles = [...e.exercise.primaryMuscles, ...e.exercise.secondaryMuscles].map((m) => t(`muscle.${m}`, { defaultValue: m }));
      const role = e.role !== 'main' ? ` [${t(`role.${e.role}`)}]` : '';
      out.push(`${i + 1}. ${e.exercise.name}${muscles.length ? ` (${muscles.join(', ')})` : ''}${role}`);
      out.push(`   ${setsText(e.prescription, e.exercise.metrics, t, lang)}`);
      const cfg = e.progression;
      const steps = cfg.steps.map((st) => {
        const unit = e.exercise.metrics.find((m) => m.key === st.metric)?.unit ?? (st.metric === 'reps' ? 'reps' : '');
        return `+${fmtValue(st.increment, unit, lang)}${st.cap !== undefined ? ` (max. ${fmtValue(st.cap, unit, lang)})` : ''}`;
      });
      out.push(`   ${t('strategy.label')}: ${t(`strategy.${cfg.strategy}`)}${steps.length && cfg.strategy !== 'none' && cfg.strategy !== 'manual' ? ` ${steps.join(', ')}` : ''}`);
      if (e.notes) out.push(`   ${t('common.notes')}: ${e.notes}`);
    });
  }
  return out.join('\n');
}
