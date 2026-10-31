import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { pt } from '../i18n/pt';
import { decisionText } from './progress';
import type { Outcome, ProgressionEvent, Reason, WorkoutEntry } from '../domain/types';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt', resources: { pt: { translation: pt } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n);

const entry = (strategy: string, outcome: Outcome, reasons: Reason[]) =>
  ({
    exercise: { name: 'X', metrics: [{ key: 'reps' }, { key: 'load', unit: 'kg' }, { key: 'duration', unit: 'min' }] },
    progression: { strategy, steps: [{ metric: strategy === 'double' ? 'load' : 'duration', increment: 2.5 }] },
    prescription: [{ kind: 'working', targets: { reps: { min: 8, max: 12 }, load: { value: 40 } } }],
    sets: [{ kind: 'working', status: 'done', values: { reps: 10, load: 40 } }],
    evaluation: { strategy, outcome, completion: 'complete', reasons },
  }) as unknown as WorkoutEntry;

const why = (e: WorkoutEntry, ev?: ProgressionEvent) => decisionText(e, ev, t, 'pt').why;

describe('decisionText: keep', () => {
  it('sets below the rep max → building reps', () => {
    expect(why(entry('double', 'keep', [{ code: 'set_below_max', params: { set: 1, reps: 10, max: 12 } }]))).toContain('a construir repetições');
  });
  it('no rep max → says so', () => {
    expect(why(entry('double', 'keep', [{ code: 'no_rep_max' }]))).toContain('Não há limite máximo');
  });
  it('top reached without a step → all sets complete, not building', () => {
    const w = why(entry('double', 'keep', [{ code: 'top_reached' }]));
    expect(w).toContain('todas as séries completas');
    expect(w).not.toContain('a construir');
  });
  it('target strategy below a non-progressed target → shows the set', () => {
    const w = why(entry('duration', 'keep', [{ code: 'set_below_target', params: { set: 2, metric: 'incline', actual: 1, target: 2 } }]));
    expect(w).toContain('Série 2');
    expect(w).not.toContain('a construir');
  });
});

describe('decisionText: missed', () => {
  const ev = { decision: 'pending', outcome: 'missed', suggestion: { metric: 'load', from: 40, to: 37.5, kind: 'decrease' } } as ProgressionEvent;
  it('double → missed reps', () => {
    expect(decisionText(entry('double', 'missed', []), ev, t, 'pt').what).toBe('Faltaram repetições — manter ou descer?');
  });
  it('duration → below target, not reps', () => {
    expect(decisionText(entry('duration', 'missed', []), ev, t, 'pt').what).toBe('Abaixo do alvo — manter ou descer?');
  });
  it('no step-back suggestion → no question', () => {
    expect(decisionText(entry('double', 'missed', []), { ...ev, suggestion: undefined }, t, 'pt').what).toBe('Faltaram reps');
  });
});

describe('decisionText: incomplete and restricted show the sets', () => {
  it('incomplete', () => {
    expect(why(entry('double', 'incomplete', [{ code: 'sets_missing', params: { done: 1, prescribed: 3 } }]))).toBe('10 × 40 kg — 1 de 3 séries feitas.');
  });
  it('restricted', () => {
    expect(why(entry('double', 'restricted', [{ code: 'top_reached' }, { code: 'pain' }]))).toBe('10 × 40 kg — Foi registada dor ou desconforto.');
  });
});
