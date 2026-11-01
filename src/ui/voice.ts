// Personal trainer voice (D47, D50): the speech synthesis of the device. Nothing is sent anywhere by the app.
import { useEffect, useState } from 'react';
import type { CoachGender, CoachStyle } from '../domain/types';

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

type Lang = 'pt' | 'en';
const LOCALE: Record<Lang, string> = { pt: 'pt-PT', en: 'en-GB' };

/**
 * The browser does not tell the gender of a voice: known voice names (Windows, Android, macOS, Chrome) and the words
 * "male" / "female" in the name are used. A voice that matches neither is "unknown".
 */
const MALE = /\b(male|man|duarte|cristiano|ant[oó]nio|ricardo|h[eé]lio|daniel|david|mark|george|guy|ryan|james|thomas|oliver|arthur|fred|aaron|rishi|reed|eddy|rocko)\b/i;
const FEMALE = /\b(female|woman|raquel|fernanda|joana|catarina|luciana|francisca|helena|maria|zira|hazel|susan|libby|sonia|samantha|karen|moira|tessa|fiona|victoria|serena|kate|martha|emma|amy|jenny|aria|flo|sandy|shelley)\b/i;

export function voiceGender(name: string): CoachGender | undefined {
  if (FEMALE.test(name)) return 'female';
  if (MALE.test(name)) return 'male';
  return undefined;
}

/** Voices for the language: the exact locale first (pt-PT), then the same language (pt-BR). */
export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  const all = speechSynthesis.getVoices();
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-');
  return [...all.filter((v) => norm(v) === LOCALE[lang]), ...all.filter((v) => norm(v) !== LOCALE[lang] && norm(v).startsWith(lang))];
}

/** The device voices, updated when the browser loads them (they arrive late in Chrome). */
export function useVoices(lang: Lang): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => voicesFor(lang));
  useEffect(() => {
    if (!canSpeak()) return;
    const update = () => setVoices(voicesFor(lang));
    update();
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, [lang]);
  return voices;
}

/** The voice chosen by hand for a language and gender is kept on this device only (voices differ per device). */
const key = (lang: Lang, gender: CoachGender) => `coach:voice:${lang}:${gender}`;
export function chosenVoice(lang: Lang, gender: CoachGender): string {
  try {
    return localStorage.getItem(key(lang, gender)) ?? '';
  } catch {
    return '';
  }
}
export function chooseVoice(lang: Lang, gender: CoachGender, name: string) {
  try {
    if (name) localStorage.setItem(key(lang, gender), name);
    else localStorage.removeItem(key(lang, gender));
  } catch {
    // Without storage the automatic voice is used.
  }
}

/** Speed per style: the sergeant and the energetic trainer talk faster, the stoic slower. */
const RATE: Record<CoachStyle, number> = { support: 1, spite: 1.05, stoic: 0.9, sergeant: 1.1, energy: 1.15 };

/**
 * The voice for the trainer: the one chosen by hand, else the first voice of the gender, else the first voice of the
 * language with the pitch moved down (man) or up (woman).
 */
export function pickVoice(lang: Lang, gender: CoachGender): { voice?: SpeechSynthesisVoice; pitch: number } {
  const voices = voicesFor(lang);
  const chosen = voices.find((v) => v.name === chosenVoice(lang, gender));
  if (chosen) return { voice: chosen, pitch: 1 };
  const match = voices.find((v) => voiceGender(v.name) === gender);
  if (match) return { voice: match, pitch: 1 };
  return { voice: voices[0], pitch: gender === 'male' ? 0.75 : 1.3 };
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
