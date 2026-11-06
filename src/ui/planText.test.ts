import { expect, it } from 'vitest';
import i18next from 'i18next';
import { pt } from '../i18n/pt';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlan, newPlanItem } from '../domain/factory';
import type { ProgressionState } from '../domain/types';
import { planText } from './planText';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt', resources: { pt: { translation: pt } }, interpolation: { escapeValue: false } });

it('lists days, exercises, current targets, the rule and notes', () => {
  const bench = { ...newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Supino' }), primaryMuscles: ['chest'] };
  const { plan, version } = newPlan('Força');
  plan.goal = 'hypertrophy';
  plan.phase = 'Bloco 1';
  const item = { ...newPlanItem(bench, plan), notes: 'Pega média' };
  version.days = [{ ...newDay('Dia A'), weekday: 0, items: [item] }];
  const states = new Map<string, ProgressionState>([[item.lineageId, { lineageId: item.lineageId, exerciseId: bench.id, targets: { load: 42.5 }, updatedAt: '' }]]);
  const text = planText(plan, version, { exercises: new Map([[bench.id, bench]]), states, lastEntry: () => undefined }, i18n.t.bind(i18n), 'pt');
  expect(text).toContain('# Força');
  expect(text).toContain('Objetivo: Hipertrofia · Bloco 1');
  expect(text).toContain('## Dia A (Seg)');
  expect(text).toContain('1. Supino (');
  expect(text).toMatch(/Trabalho: 3 × 8–12 reps · 42,5 kg/);
  expect(text).toMatch(/Progressão: Dupla progressão \+/);
  expect(text).toContain('Notas: Pega média');
});
