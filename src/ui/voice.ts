// Personal trainer voice (D47, D50, D53): the speech synthesis of the device. Nothing is sent anywhere by the app.
import type { CoachGender, CoachStyle } from '../domain/types';

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

type Lang = 'pt' | 'en';
const LOCALE: Record<Lang, string> = { pt: 'pt-PT', en: 'en-GB' };

/**
 * The browser does not tell the gender of a voice: known voice names (Windows, Android, macOS, Chrome) and the words
 * "male" / "female" in the name are used. A voice that matches neither is "unknown".
 */
const MALE = /\b(male|man|duarte|cristiano|ant[oó]nio|ricardo|h[eé]lio|daniel|david|mark|george|guy|ryan|james|thomas|oliver|arthur|fred|aaron|rishi|reed|eddy|rocko)\b/i;
const FEMALE = /\b(female|woman|h[eé]lia|raquel|fernanda|joana|catarina|luciana|francisca|helena|maria|zira|hazel|susan|libby|sonia|samantha|karen|moira|tessa|fiona|victoria|serena|kate|martha|emma|amy|jenny|aria|flo|sandy|shelley)\b/i;

export function voiceGender(name: string): CoachGender | undefined {
  if (FEMALE.test(name)) return 'female';
  if (MALE.test(name)) return 'male';
  return undefined;
}

/** Voices of the app language only: pt-PT or en-GB (never pt-BR or en-US). */
export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase() === LOCALE[lang].toLowerCase());
}

/** Speed per style: the sergeant and the energetic trainer talk faster, the stoic slower. */
const RATE: Record<CoachStyle, number> = { support: 1, spite: 1.05, stoic: 0.9, sergeant: 1.1, energy: 1.15 };

/**
 * The voice for the trainer, from the voices of the app language. Most voices without a known name are female (the
 * default voice of phones is). Man: a male voice, else a much lower pitch. Woman: a voice that is not male, else a higher
 * pitch. Without a voice of the language, the browser chooses one for the language; the pitch still follows the gender.
 */
export function pickVoice(lang: Lang, gender: CoachGender): { voice?: SpeechSynthesisVoice; pitch: number } {
  const voices = voicesFor(lang);
  if (gender === 'male') {
    const male = voices.find((v) => voiceGender(v.name) === 'male');
    return male ? { voice: male, pitch: 1 } : { voice: voices[0], pitch: 0.55 };
  }
  const female = voices.find((v) => voiceGender(v.name) === 'female') ?? voices.find((v) => voiceGender(v.name) !== 'male');
  return female ? { voice: female, pitch: 1 } : { voice: voices[0], pitch: 1.3 };
}

/** Reads a text aloud in the app language, with the trainer's voice (queued after what is being read). Emoji are left out. */
export function speak(text: string, lang: Lang, coach: { style: CoachStyle; gender?: CoachGender }) {
  const clean = text.replace(/\p{Extended_Pictographic}/gu, '').trim();
  if (!canSpeak() || !clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = LOCALE[lang];
  const { voice, pitch } = pickVoice(lang, coach.gender ?? 'male');
  if (voice) u.voice = voice;
  u.pitch = pitch;
  u.rate = RATE[coach.style];
  speechSynthesis.speak(u);
}
