import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, newExercise } from './factory';
import { exerciseGroup, mergeLibrary, muscleKeys, relatedOf, toExercise, type LibraryRecord } from './library';

const rec = (over: Partial<LibraryRecord> = {}): LibraryRecord => ({
  sid: '2',
  slug: 'bench-press-7',
  url: 'https://www.exsercise.com/library/bench-press-7',
  name: 'Bench Press',
  bodyParts: ['Chest'],
  equipment: ['Barbell'],
  type: 'weight_reps',
  primary: ['Pectoralis Major Sternal Head'],
  secondary: ['Deltoid Anterior', 'Pectoralis Major Clavicular Head', 'Triceps Brachii'],
  overview: 'A classic.',
  steps: ['Grip the bar.', 'Lower it.'],
  tips: ['Avoid arching your back: keep contact with the bench.', 'Short'],
  video: 'qU9tbGJ8UFc',
  thumb: 'library/thumbs/2.webp',
  imageUrl: 'https://lyfta.app/images/exercises/00251101.png',
  related: ['8', '11'],
  ...over,
});

describe('library import', () => {
  it('maps a record to an exercise', () => {
    const ex = toExercise(rec(), { ...DEFAULT_SETTINGS, language: 'en' });
    expect(ex).toMatchObject({
      name: 'Bench Press',
      group: 'chest',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['shoulders', 'triceps'],
      category: 'compound',
      video: 'https://www.youtube.com/watch?v=qU9tbGJ8UFc',
      thumb: 'library/thumbs/2.webp',
      source: { name: 'Exsercise.com', id: '2' },
      tips: ['Avoid arching your back: keep contact with the bench.'],
    });
    expect(ex.progression.strategy).toBe('double');
  });

  it('uses the PT translation when the language is PT', () => {
    const ex = toExercise(rec(), DEFAULT_SETTINGS, { name: 'Supino', steps: ['Agarre a barra.'] });
    expect(ex.name).toBe('Supino');
    expect(ex.aliases).toEqual(['Bench Press']);
    expect(ex.steps).toEqual(['Agarre a barra.']);
    expect(ex.overview).toBe('A classic.');
  });

  it('bodyweight and duration types get matching metrics', () => {
    expect(toExercise(rec({ equipment: ['Body weight'] }), DEFAULT_SETTINGS).metrics.map((m) => m.key)).toEqual(['reps', 'load']);
    expect(toExercise(rec({ type: 'duration', bodyParts: ['Waist'] }), DEFAULT_SETTINGS).metrics.map((m) => m.key)).toEqual(['duration']);
    expect(toExercise(rec({ type: 'distance_duration', bodyParts: ['Cardio'] }), DEFAULT_SETTINGS).category).toBe('cardio');
  });

  it('merge enriches an existing exercise by alias and keeps its id and settings', () => {
    const mine = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Supino com barra', aliases: ['Bench Press'], personalNotes: 'mine' });
    mine.defaultSets[0].targets.load = { value: 77 };
    const { added, updated } = mergeLibrary([mine], [rec(), rec({ sid: '9', slug: 'x', name: 'Cable Fly' })], DEFAULT_SETTINGS);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: mine.id, name: 'Supino com barra', personalNotes: 'mine', thumb: 'library/thumbs/2.webp', source: { id: '2' } });
    expect(updated[0].defaultSets[0].targets.load).toEqual({ value: 77 });
    expect(added.map((e) => e.name)).toEqual(['Cable Fly']);
  });

  it('merge is idempotent (matches by source id)', () => {
    const first = mergeLibrary([], [rec()], DEFAULT_SETTINGS).added;
    const again = mergeLibrary(first, [rec()], DEFAULT_SETTINGS);
    expect(again.added).toHaveLength(0);
    expect(again.updated[0].id).toBe(first[0].id);
  });

  it('related: source list first, else same main muscle and equipment', () => {
    const all = mergeLibrary([], [rec(), rec({ sid: '8', slug: 'a', name: 'Fly' }), rec({ sid: '11', slug: 'b', name: 'Dip' })], DEFAULT_SETTINGS).added;
    expect(relatedOf(all[0], all).map((e) => e.name)).toEqual(['Fly', 'Dip']);
    const own = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Own', primaryMuscles: ['chest'], equipment: 'barbell' });
    expect(relatedOf(own, all).length).toBe(3);
  });

  it('broken or style body parts fall back to the main muscle', () => {
    expect(toExercise(rec({ bodyParts: ['n', 'u', 'l', 'l'] }), DEFAULT_SETTINGS).group).toBe('chest');
    const yoga = toExercise(rec({ bodyParts: ['Yoga'], primary: ['Hamstrings'] }), DEFAULT_SETTINGS);
    expect(yoga.group).toBe('legs');
    expect(yoga.category).toBe('mobility');
  });

  it('tolerates string or missing list fields in the file', () => {
    const bad = { ...rec(), bodyParts: 'null', equipment: null, related: undefined } as unknown as LibraryRecord;
    const { added } = mergeLibrary([], [bad], DEFAULT_SETTINGS);
    expect(added[0].group).toBe('chest');
    expect(added[0].equipment).toBe('');
  });

  it('built-in exercises get the image of their library equivalent, keeping their settings', () => {
    const own = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Supino com barra', aliases: ['Barbell Bench Press'] });
    const other = rec({ sid: '99', name: 'Barbell Bench Press Variant' });
    const { updated } = mergeLibrary([own], [rec({ name: 'Something else' }), other], DEFAULT_SETTINGS);
    const u = updated.find((e) => e.id === own.id)!;
    expect(u.thumb).toBe('library/thumbs/2.webp');
    expect(u.video).toContain('youtube');
    expect(u.source).toBeUndefined();
    expect(u.defaultSets).toEqual(own.defaultSets);
  });

  it('muscle keys and groups', () => {
    expect(muscleKeys(['Latissimus Dorsi', 'Biceps Brachii', 'Gluteus Maximus', 'Adductor Magnus'])).toEqual(['back', 'biceps', 'glutes', 'adductors']);
    expect(exerciseGroup({ primaryMuscles: ['quads'], category: 'compound' })).toBe('legs');
    expect(exerciseGroup({ primaryMuscles: [], category: 'warmup' })).toBe('cardio');
  });
});
