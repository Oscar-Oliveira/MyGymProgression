// Personal trainer voice (D47): the speech synthesis of the device. Nothing is sent anywhere by the app.

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/** Reads a text aloud in the app language (queued after what is being read). Emoji are left out. */
export function speak(text: string, lang: 'pt' | 'en') {
  const clean = text.replace(/\p{Extended_Pictographic}/gu, '').trim();
  if (!canSpeak() || !clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang === 'pt' ? 'pt-PT' : 'en-GB';
  const voices = speechSynthesis.getVoices().map((v) => ({ v, lang: v.lang.replace('_', '-') }));
  const voice = voices.find((x) => x.lang === u.lang) ?? voices.find((x) => x.lang.startsWith(lang));
  if (voice) u.voice = voice.v;
  speechSynthesis.speak(u);
}
