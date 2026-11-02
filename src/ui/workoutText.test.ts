import { expect, it } from 'vitest';
import i18next from 'i18next';
import { pt } from '../i18n/pt';
import { workoutText } from './workoutText';
import type { Workout } from '../domain/types';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt', resources: { pt: { translation: pt } }, interpolation: { escapeValue: false } });

it('lists every set, skipped ones too, with the duration', () => {
  const w = {
    dayName: 'Dia A',
    planName: 'Força',
    status: 'completed',
    startedAt: '2026-11-02T10:00:00Z',
    endedAt: '2026-11-02T11:05:00Z',
    notes: '',
    entries: [
      {
        exercise: { name: 'Supino', metrics: [{ key: 'reps' }, { key: 'load', unit: 'kg' }], primaryMuscles: ['chest'], secondaryMuscles: [] },
        sets: [
          { kind: 'warmup', status: 'done', values: { reps: 10, load: 20 } },
          { kind: 'working', status: 'done', values: { reps: 8, load: 60 } },
          { kind: 'working', status: 'skipped', values: { reps: 8, load: 60 } },
        ],
        notes: '',
      },
    ],
  } as unknown as Workout;
  const text = workoutText(w, i18n.t.bind(i18n), 'pt');
  expect(text).toContain('Dia A · Força');
  expect(text).toContain('Duração 1:05:00');
  expect(text).toContain('1. Supino (');
  expect(text).toContain('   Aquecimento 1: 10 × 20 kg');
  expect(text).toContain('   Série 1: 8 × 60 kg');
  expect(text).toContain('   Série 2: Saltada');
});
