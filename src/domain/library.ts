// Conversion of an exercise library file (any source; format in docs/data-format.md) into app exercises.
import { newExercise, nowIso } from './factory';
import type { Exercise, ExerciseCategory, MuscleGroup, Settings } from './types';
import type { MeasurementPreset } from './units';

export interface LibraryRecord {
  sid: string;
  slug: string;
  url: string;
  name: string;
  bodyParts: string[];
  equipment: string[];
  type: string;
  primary: string[];
  secondary: string[];
  overview: string;
  steps: string[];
  tips: string[];
  video: string;
  thumb?: string;
  imageUrl?: string;
  related: string[];
  /** Name of the source, taken from the file (shown on the exercise page). */
  source?: string;
}

/** Portuguese text for a library exercise (optional, for common exercises). */
export interface LibraryTranslation {
  name: string;
  overview?: string;
  steps?: string[];
}

/**
 * Records of a library file chosen by the user; each record gets the file's source name.
 * Returns undefined when the content is not a library file.
 */
export function parseLibraryFile(data: unknown): LibraryRecord[] | undefined {
  const file = data as { exercises?: unknown; source?: unknown } | null;
  if (!Array.isArray(file?.exercises)) return undefined;
  const source = typeof file.source === 'string' ? file.source : undefined;
  const records = file.exercises
    .filter((r): r is LibraryRecord => !!r && typeof r === 'object' && typeof (r as LibraryRecord).sid === 'string' && typeof (r as LibraryRecord).name === 'string')
    .map((r) => ({ ...r, source: r.source ?? source }));
  return records.length ? records : undefined;
}

/** Source name of a record: from the file, else the host of its address. */
function sourceName(rec: LibraryRecord): string {
  if (rec.source) return rec.source;
  try {
    return new URL(rec.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Lists in the source file can be missing, null, or a plain string (e.g. "null"). */
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : typeof v === 'string' && v && v.toLowerCase() !== 'null' ? [v] : [];

/** Makes a record from the file safe to use: every list field becomes a list of strings. */
export function normalizeRecord(r: LibraryRecord): LibraryRecord {
  return {
    ...r,
    sid: String(r.sid),
    name: String(r.name ?? '').trim(),
    bodyParts: asList(r.bodyParts),
    equipment: asList(r.equipment),
    primary: asList(r.primary),
    secondary: asList(r.secondary),
    steps: asList(r.steps),
    tips: asList(r.tips),
    related: asList(r.related),
    overview: typeof r.overview === 'string' ? r.overview : '',
    type: typeof r.type === 'string' ? r.type : '',
    video: typeof r.video === 'string' ? r.video : '',
  };
}

const BODY_GROUP: Record<string, MuscleGroup> = {
  chest: 'chest', back: 'back', shoulders: 'shoulders', neck: 'shoulders',
  'upper arms': 'arms', triceps: 'arms', biceps: 'arms', forearms: 'arms',
  quadriceps: 'legs', thighs: 'legs', hamstrings: 'legs', calves: 'legs', hips: 'legs', 'lower legs': 'legs', glutes: 'legs',
  waist: 'core', abs: 'core', cardio: 'cardio', plyometrics: 'cardio',
};

/** Body parts that describe a training style rather than a muscle. */
const STYLE_CATEGORY: Record<string, ExerciseCategory> = { yoga: 'mobility', stretching: 'mobility', plyometrics: 'cardio', cardio: 'cardio' };

const EQUIPMENT: Record<string, string> = {
  barbell: 'barbell', dumbbell: 'dumbbell', cable: 'cable', 'leverage machine': 'machine', 'smith machine': 'smith', 'sled machine': 'sled',
  'ez barbell': 'ez_bar', 'body weight': 'bodyweight', band: 'band', 'resistance band': 'band', kettlebell: 'kettlebell', 'stability ball': 'stability_ball',
  'medicine ball': 'medicine_ball', suspension: 'suspension', weighted: 'weighted', rope: 'rope', 'trap bar': 'trap_bar', treadmill: 'treadmill',
  'stationary bike': 'bike', rower: 'rower', 'battling ropes': 'battle_rope', 'battling rope': 'battle_rope', 'bosu ball': 'bosu', 'olympic barbell': 'barbell',
  assisted: 'assisted', 'wheel roller': 'ab_wheel', 'power sled': 'sled', roll: 'foam_roller', rollball: 'massage_ball', hammer: 'hammer', stick: 'stick', 'vibrate plate': 'vibration_plate',
};

/** Detailed muscle name → app muscle key (used by analysis). */
const MUSCLE_KEY: [RegExp, string][] = [
  [/pectoralis|serratus|^chest$/i, 'chest'],
  [/splenius|sternocleidomastoid|^neck$/i, 'neck'],
  [/deltoid|levator scapulae|trapezius upper|subscapularis|^shoulders$/i, 'shoulders'],
  [/latissimus|teres|infraspinatus|trapezius|rhomboid|erector spinae|back|^lats$|^traps$/i, 'back'],
  [/biceps|brachialis$/i, 'biceps'],
  [/brachioradialis|wrist|forearm|flexor|extensor/i, 'forearms'],
  [/triceps/i, 'triceps'],
  [/rectus abdominis|oblique|transvers|iliopsoas|abdomin/i, 'core'],
  [/gluteus|glute|hip external rotators|abductor/i, 'glutes'],
  [/adductor|pectineous|gracilis/i, 'adductors'],
  [/hamstring|biceps femoris|semitendinosus|popliteus/i, 'hamstrings'],
  [/quadricep|sartorius|tensor fasciae|rectus femoris|vastus/i, 'quads'],
  [/gastrocnemius|soleus|calf|calves|tibialis/i, 'calves'],
];

/** Portuguese names for detailed muscles (display only). */
export const MUSCLE_DETAIL_PT: Record<string, string> = {
  'Adductor Brevis': 'Adutor curto', 'Adductor Longus': 'Adutor longo', 'Adductor Magnus': 'Adutor magno', 'Biceps Brachii': 'Bíceps braquial',
  Brachialis: 'Braquial', Brachioradialis: 'Braquiorradial', 'Deltoid Anterior': 'Deltoide anterior', 'Deltoid Lateral': 'Deltoide lateral',
  'Deltoid Posterior': 'Deltoide posterior', 'Erector Spinae': 'Eretores da coluna', Gastrocnemius: 'Gastrocnémio', 'Gluteus Maximus': 'Glúteo máximo',
  'Gluteus Medius': 'Glúteo médio', 'Gluteus Minimus': 'Glúteo mínimo', Hamstrings: 'Isquiotibiais', Iliopsoas: 'Iliopsoas', Infraspinatus: 'Infraespinhoso',
  'Latissimus Dorsi': 'Grande dorsal', 'Levator Scapulae': 'Elevador da escápula', Obliques: 'Oblíquos', Pectineous: 'Pectíneo',
  'Pectoralis Major Clavicular Head': 'Peitoral maior (porção clavicular)', 'Pectoralis Major Sternal Head': 'Peitoral maior (porção esternal)',
  'Pectoralis Minor': 'Peitoral menor', Quadriceps: 'Quadríceps', 'Rectus Abdominis': 'Reto abdominal', Sartorius: 'Sartório',
  'Serratus Anterior': 'Serrátil anterior', Soleus: 'Solear', 'Tensor Fasciae Latae': 'Tensor da fáscia lata', 'Teres Major': 'Redondo maior',
  'Teres Minor': 'Redondo menor', 'Tibialis Anterior': 'Tibial anterior', 'Trapezius Lower Fibers': 'Trapézio (fibras inferiores)',
  'Trapezius Middle Fibers': 'Trapézio (fibras médias)', 'Trapezius Upper Fibers': 'Trapézio (fibras superiores)', 'Triceps Brachii': 'Tríceps braquial',
  'Wrist Extensors': 'Extensores do punho', 'Wrist Flexors': 'Flexores do punho', Rhomboids: 'Romboides', 'Transverse Abdominis': 'Transverso abdominal',
  'Deep Hip External Rotators': 'Rotadores externos profundos da anca', Gracilis: 'Grácil', Popliteus: 'Popliteu', 'Serratus Ante': 'Serrátil anterior',
  Splenius: 'Esplénio', Sternocleidomastoid: 'Esternocleidomastoideu', Subscapularis: 'Subescapular',
  // Plain names used by free-exercise-db.
  Abdominals: 'Abdominais', Abductors: 'Abdutores', Adductors: 'Adutores', Biceps: 'Bíceps', Calves: 'Gémeos', Chest: 'Peito', Forearms: 'Antebraços',
  Glutes: 'Glúteos', Lats: 'Grande dorsal', 'Lower Back': 'Lombar', 'Middle Back': 'Meio das costas', Neck: 'Pescoço', Shoulders: 'Ombros', Traps: 'Trapézio', Triceps: 'Tríceps',
};

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Source body parts, without broken single-letter values (a "null" string split into letters). */
const bodyParts = (rec: Pick<LibraryRecord, 'bodyParts'>) => rec.bodyParts.filter((b) => b.length > 1);

export function groupOf(rec: Pick<LibraryRecord, 'bodyParts' | 'primary'>): MuscleGroup {
  for (const b of bodyParts(rec)) {
    const g = BODY_GROUP[b.toLowerCase()];
    if (g) return g;
  }
  // Training-style body parts (yoga, weightlifting, full body): use the main muscle.
  return exerciseGroup({ primaryMuscles: muscleKeys(rec.primary), category: 'other' });
}

export function equipmentOf(rec: Pick<LibraryRecord, 'equipment'>): string {
  const e = rec.equipment[0];
  if (!e) return '';
  return EQUIPMENT[e.toLowerCase()] ?? e;
}

export function muscleKeys(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const k = MUSCLE_KEY.find(([re]) => re.test(n))?.[1];
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function presetOf(rec: LibraryRecord, equipment: string): MeasurementPreset {
  const t = rec.type.toLowerCase();
  if (t.includes('distance')) return 'duration_distance';
  if (t === 'duration' || t.includes('time')) return 'duration';
  if (t.includes('reps_only') || t === 'reps' || equipment === 'bodyweight') return 'bodyweight';
  return 'reps_load';
}

function categoryOf(rec: LibraryRecord, group: MuscleGroup, preset: MeasurementPreset): ExerciseCategory {
  const style = bodyParts(rec).map((b) => STYLE_CATEGORY[b.toLowerCase()]).find(Boolean);
  if (style) return style;
  if (group === 'cardio' || preset === 'duration_distance') return 'cardio';
  return muscleKeys(rec.primary).length + muscleKeys(rec.secondary).length >= 3 ? 'compound' : 'isolation';
}

export const youtubeUrl = (id: string) => (id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : '');

/** Library fields of an exercise, in the requested language when a translation exists. */
function libraryFields(rec: LibraryRecord, pt?: LibraryTranslation): Partial<Exercise> {
  return {
    group: groupOf(rec),
    overview: pt?.overview ?? rec.overview,
    steps: pt?.steps ?? rec.steps,
    tips: rec.tips.filter((x) => x.length > 25),
    thumb: rec.thumb || undefined,
    image: rec.imageUrl || undefined,
    video: youtubeUrl(rec.video) || undefined,
    muscleDetail: { primary: rec.primary, secondary: rec.secondary },
    source: { name: sourceName(rec), id: rec.sid, url: rec.url },
    related: rec.related,
  };
}

export function toExercise(rec: LibraryRecord, settings: Pick<Settings, 'language' | 'loadUnit' | 'distanceUnit'>, pt?: LibraryTranslation): Exercise {
  const equipment = equipmentOf(rec);
  const preset = presetOf(rec, equipment);
  const group = groupOf(rec);
  const usePt = settings.language === 'pt' && pt;
  const ex = newExercise(preset, settings, {
    name: usePt ? pt.name : rec.name,
    aliases: usePt && pt.name !== rec.name ? [rec.name] : [],
    primaryMuscles: muscleKeys(rec.primary),
    secondaryMuscles: muscleKeys(rec.secondary).filter((k) => !muscleKeys(rec.primary).includes(k)),
    equipment,
    category: categoryOf(rec, group, preset),
    tags: [],
    ...libraryFields(rec, usePt ? pt : undefined),
  });
  return ex;
}

/**
 * Merges library records into the existing exercises.
 * - An exercise with the same source id, or the same name (or alias), is enriched: library fields are set,
 *   and the user's settings (metrics, sets, progression, notes) and id are kept, so plans and history stay valid.
 * - Other records become new exercises.
 */
export function mergeLibrary(
  existing: Exercise[],
  records: LibraryRecord[],
  settings: Pick<Settings, 'language' | 'loadUnit' | 'distanceUnit'>,
  translations: Record<string, LibraryTranslation> = {},
): { added: Exercise[]; updated: Exercise[] } {
  const bySource = new Map(existing.filter((e) => e.source).map((e) => [e.source!.id, e]));
  const byName = new Map<string, Exercise>();
  for (const e of existing) for (const n of [e.name, ...e.aliases]) if (!byName.has(norm(n))) byName.set(norm(n), e);
  const added: Exercise[] = [];
  const updated: Exercise[] = [];
  const used = new Set<string>();
  for (const raw of records) {
    const rec = normalizeRecord(raw);
    if (!rec.name) continue;
    const pt = translations[rec.slug];
    const match = bySource.get(rec.sid) ?? byName.get(norm(rec.name)) ?? (pt ? byName.get(norm(pt.name)) : undefined);
    if (match && !used.has(match.id)) {
      used.add(match.id);
      const usePt = settings.language === 'pt' && pt;
      const aliases = [...new Set([...match.aliases, ...(norm(rec.name) !== norm(match.name) ? [rec.name] : [])])];
      updated.push({
        ...match,
        aliases,
        primaryMuscles: match.primaryMuscles.length ? match.primaryMuscles : muscleKeys(rec.primary),
        secondaryMuscles: match.secondaryMuscles.length ? match.secondaryMuscles : muscleKeys(rec.secondary),
        equipment: match.equipment || equipmentOf(rec),
        ...libraryFields(rec, usePt ? pt : undefined),
        updatedAt: nowIso(),
      });
    } else {
      added.push(toExercise(rec, settings, pt));
    }
  }
  // Built-in exercises not matched above get the image, video and how-to of their library equivalent.
  const bySlug = new Map(records.map((r) => [normalizeRecord(r).slug, normalizeRecord(r)]));
  const updatedIds = new Set(updated.map((e) => e.id));
  for (const ex of existing) {
    if (ex.source || updatedIds.has(ex.id)) continue;
    const slug = [ex.name, ...ex.aliases].flatMap((n) => [BUILTIN_LIBRARY_SLUG[n], BUILTIN_OPEN_SLUG[n]]).find((x) => x && bySlug.has(x));
    const rec = slug && bySlug.get(slug);
    if (!rec) continue;
    updated.push(illustrate(ex, rec, settings.language === 'pt' ? translations[rec.slug] : undefined));
  }
  return { added, updated };
}

/**
 * Library entry that illustrates each built-in exercise (by its English name).
 * Built-in exercises keep their own settings; they only get the image, video and how-to.
 */
export const BUILTIN_LIBRARY_SLUG: Record<string, string> = {
  'Barbell Bench Press': 'bench-press-7', 'Incline Dumbbell Press': 'dumbbell-incline-bench-press-6i6', 'Machine Chest Press': 'lever-chest-press-0t',
  'Push-up': 'push-up-1j', 'Cable Fly': 'upper-chest-crossovers-46', 'Barbell Back Squat': 'full-squat-n', 'Leg Press': 'sled-45-leg-press-1o',
  'Romanian Deadlift': 'romanian-deadlift-65', Deadlift: 'deadlift-2', 'Leg Extension': 'lever-leg-extension-0b', 'Lying Leg Curl': 'lever-lying-leg-curl-0c',
  'Barbell Hip Thrust': 'hip-thrust-39', 'Walking Lunge': 'walking-lunge-fm', 'Standing Calf Raise': 'lever-standing-calf-raise-7sa', 'Pull-up': 'pull-up-1i',
  'Lat Pulldown': 'cable-wide-grip-lat-pulldown-7v7', 'Barbell Row': 'bent-over-row-9', 'Seated Cable Row': 'cable-seated-row-7ty',
  'One-arm Dumbbell Row': 'one-arm-row-3u', 'Overhead Press': 'standing-military-press-31', 'Dumbbell Shoulder Press': 'dumbbell-seated-shoulder-press-6kp',
  'Lateral Raise': 'lateral-raise-96', 'Face Pull': 'band-face-pull-6y2', 'Barbell Curl': 'barbell-curl-1', 'Dumbbell Curl': 'biceps-curl-8j',
  'Hammer Curl': 'hammer-curl-8v', 'Triceps Pushdown': 'triceps-pushdown-7e', 'Overhead Triceps Extension': 'overhead-triceps-extension-7h',
  Dips: 'chest-dip-88', Plank: 'front-plank-6m3', 'Side Plank': 'side-plank-6t1', 'Hanging Leg Raise': 'hanging-leg-raise-6mk',
  'Cable Crunch': 'cable-kneeling-crunch-641', 'Treadmill Warm-up': 'walking-on-treadmill-7u2', 'Treadmill Walking': 'walking-on-treadmill-7u2',
  Running: 'run-on-treadmill-7so', 'Stationary Bike': 'stationary-bike-walk-6vm', 'Rowing Machine': 'rowing-6ee', 'Hip Mobility Routine': 'standing-hip-circle-8pc',
  "Farmer's Walk": 'dumbbell-farmers-carry-82k', 'Band Shoulder Dislocates': 'pvc-pass-through-9lx',
};

/** The same for the open library (free-exercise-db); its slug is the source id in lower case with "-" for "_". */
export const BUILTIN_OPEN_SLUG: Record<string, string> = {
  'Barbell Bench Press': 'barbell-bench-press---medium-grip', 'Incline Dumbbell Press': 'incline-dumbbell-press', 'Machine Chest Press': 'machine-bench-press',
  'Push-up': 'pushups', 'Cable Fly': 'cable-crossover', 'Barbell Back Squat': 'barbell-squat', 'Leg Press': 'leg-press', 'Romanian Deadlift': 'romanian-deadlift',
  Deadlift: 'barbell-deadlift', 'Leg Extension': 'leg-extensions', 'Lying Leg Curl': 'lying-leg-curls', 'Barbell Hip Thrust': 'barbell-hip-thrust',
  'Walking Lunge': 'bodyweight-walking-lunge', 'Standing Calf Raise': 'standing-calf-raises', 'Pull-up': 'pullups', 'Lat Pulldown': 'wide-grip-lat-pulldown',
  'Barbell Row': 'bent-over-barbell-row', 'Seated Cable Row': 'seated-cable-rows', 'One-arm Dumbbell Row': 'one-arm-dumbbell-row', 'Overhead Press': 'standing-military-press',
  'Dumbbell Shoulder Press': 'dumbbell-shoulder-press', 'Lateral Raise': 'side-lateral-raise', 'Face Pull': 'face-pull', 'Barbell Curl': 'barbell-curl',
  'Dumbbell Curl': 'dumbbell-bicep-curl', 'Hammer Curl': 'hammer-curls', 'Triceps Pushdown': 'triceps-pushdown', 'Overhead Triceps Extension': 'cable-rope-overhead-triceps-extension',
  Dips: 'dips---chest-version', Plank: 'plank', 'Side Plank': 'side-bridge', 'Hanging Leg Raise': 'hanging-leg-raise', 'Cable Crunch': 'cable-crunch',
  'Treadmill Warm-up': 'walking-treadmill', 'Treadmill Walking': 'walking-treadmill', Running: 'running-treadmill', 'Stationary Bike': 'bicycling-stationary',
  'Rowing Machine': 'rowing-stationary', 'Hip Mobility Routine': 'standing-hip-circles', "Farmer's Walk": 'farmers-walk',
};

/** Media and how-to of a library record for an exercise that keeps its own identity and settings. */
function illustrate(ex: Exercise, rec: LibraryRecord, pt?: LibraryTranslation): Exercise {
  return {
    ...ex,
    thumb: rec.thumb || ex.thumb,
    image: ex.image ?? (rec.imageUrl || undefined),
    video: ex.video ?? (youtubeUrl(rec.video) || undefined),
    overview: ex.overview ?? (pt?.overview ?? (rec.overview || undefined)),
    steps: ex.steps?.length ? ex.steps : (pt?.steps ?? rec.steps),
    muscleDetail: ex.muscleDetail ?? { primary: rec.primary, secondary: rec.secondary },
    updatedAt: nowIso(),
  };
}

/** Related exercises of an exercise: the source's related list, else same group and equipment. */
export function relatedOf(ex: Exercise, all: Exercise[], limit = 8): Exercise[] {
  const bySource = new Map(all.filter((e) => e.source).map((e) => [e.source!.id, e]));
  const listed = (ex.related ?? []).map((id) => bySource.get(id)).filter((e): e is Exercise => !!e && e.id !== ex.id);
  if (listed.length) return listed.slice(0, limit);
  const main = ex.primaryMuscles[0];
  return all.filter((e) => e.id !== ex.id && e.active && main && e.primaryMuscles.includes(main) && e.equipment === ex.equipment).slice(0, limit);
}

/** Muscle group of any exercise: library group, else derived from the main muscle. */
export function exerciseGroup(ex: Pick<Exercise, 'group' | 'primaryMuscles' | 'category'>): MuscleGroup {
  if (ex.group) return ex.group;
  if (ex.category === 'cardio' || ex.category === 'warmup') return 'cardio';
  const m = ex.primaryMuscles[0];
  const map: Record<string, MuscleGroup> = {
    chest: 'chest', back: 'back', shoulders: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms',
    quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', adductors: 'legs', core: 'core', cardio: 'cardio', neck: 'shoulders',
  };
  return (m && map[m]) || 'other';
}
