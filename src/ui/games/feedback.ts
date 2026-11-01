// Sound and vibration in the games (D52). Short tones made with Web Audio (no sound files); vibration where supported.
// Both can be turned off on the Games page; the choice is kept on this device.

export type Fx = 'tap' | 'good' | 'bad' | 'power' | 'end' | 'record';

const KEYS = { sound: 'games:sound', haptic: 'games:haptic' } as const;
export type FxSetting = keyof typeof KEYS;

/** On unless turned off. */
export function fxOn(k: FxSetting): boolean {
  try {
    return localStorage.getItem(KEYS[k]) !== 'off';
  } catch {
    return true;
  }
}
export function setFx(k: FxSetting, on: boolean) {
  try {
    localStorage.setItem(KEYS[k], on ? 'on' : 'off');
  } catch {
    // Without storage the setting lasts for this visit only.
  }
}

/** Notes (frequency Hz, start s, length s) and wave of each sound. */
const SOUND: Record<Fx, { wave: OscillatorType; notes: [number, number, number][]; gain: number }> = {
  tap: { wave: 'triangle', notes: [[660, 0, 0.05]], gain: 0.08 },
  good: { wave: 'square', notes: [[880, 0, 0.06], [1320, 0.06, 0.08]], gain: 0.05 },
  bad: { wave: 'sawtooth', notes: [[220, 0, 0.12], [150, 0.1, 0.18]], gain: 0.07 },
  power: { wave: 'triangle', notes: [[523, 0, 0.07], [659, 0.07, 0.07], [784, 0.14, 0.1]], gain: 0.08 },
  end: { wave: 'triangle', notes: [[392, 0, 0.15], [330, 0.15, 0.15], [262, 0.3, 0.3]], gain: 0.09 },
  record: { wave: 'square', notes: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3]], gain: 0.06 },
};
const VIBRATE: Record<Fx, number | number[]> = { tap: 10, good: 25, bad: [60, 40, 60], power: [20, 30, 20], end: 120, record: [40, 40, 40, 40, 120] };

let audio: AudioContext | undefined;

/** Plays the sound and the vibration of an event (each only when on). */
export function fx(kind: Fx) {
  if (fxOn('haptic')) navigator.vibrate?.(VIBRATE[kind]);
  if (!fxOn('sound') || typeof AudioContext === 'undefined') return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const s = SOUND[kind];
    const t0 = audio.currentTime;
    for (const [freq, start, len] of s.notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = s.wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(s.gain, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + len + 0.02);
    }
  } catch {
    // No sound on this device.
  }
}
