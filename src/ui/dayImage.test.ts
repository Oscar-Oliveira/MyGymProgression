import { expect, it } from 'vitest';
import i18next from 'i18next';
import { pt } from '../i18n/pt';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlan, newPlanItem } from '../domain/factory';
import type { ProgressionState } from '../domain/types';
import { startWorkout } from '../domain/workout';
import { dayImageRows } from './dayImage';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt', resources: { pt: { translation: pt } }, interpolation: { escapeValue: false } });

it('lists each exercise with warm-up and working sets, today’s loads and circuit headers', () => {
  const bench = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Supino' });
  const row = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Remada' });
  const { plan, version } = newPlan('Força');
  const a = newPlanItem(bench, plan);
  a.sets = [{ kind: 'warmup', targets: { reps: { value: 10 }, load: { value: 20 } } }, ...a.sets];
  const b = { ...newPlanItem(row, plan), circuitId: 'c1' };
  const day = { ...newDay('Dia A'), items: [a, b], circuits: [{ id: 'c1', name: 'Final', rounds: 2 }] };
  version.days = [day];
  const states = new Map<string, ProgressionState>([[a.lineageId, { lineageId: a.lineageId, exerciseId: bench.id, targets: { load: 42.5 }, updatedAt: '' }]]);
  const { entries } = startWorkout(plan, version, day, { exercises: new Map([[bench.id, bench], [row.id, row]]), states, lastEntry: () => undefined });
  const rows = dayImageRows(entries, i18n.t.bind(i18n), 'pt');
  expect(rows[0]).toMatchObject({ n: 1, name: 'Supino', inCircuit: false });
  const sets = 'sets' in rows[0] ? rows[0].sets : [];
  expect(sets[0]).toBe('Aquecimento: 1 × 10 reps · 20 kg');
  expect(sets[1]).toMatch(/^3 × 8–12 reps · 42,5 kg$/);
  expect(rows[1]).toEqual({ circuit: 'Circuito · Final · 2 voltas' });
  expect(rows[2]).toMatchObject({ n: 2, name: 'Remada', inCircuit: true });
});
