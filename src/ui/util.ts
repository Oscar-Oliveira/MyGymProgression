import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import { db } from '../data/db';
import { repo } from '../data/repo';
import { DEFAULT_SETTINGS } from '../domain/factory';
import { buildBundle } from '../domain/interchange';
import type { MetricDef, MetricKey, Reason, Settings } from '../domain/types';
import { convert, round } from '../domain/units';

export function useSettings(): Settings {
  return useLiveQuery(() => repo.getSettings(), [], DEFAULT_SETTINGS);
}

/** Keeps the screen on while `on` is true (e.g. during a workout). The browser releases the lock when the page is hidden, so it is taken again on return. */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | undefined;
    let stopped = false;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => (stopped ? void l.release() : (lock = l)),
        () => undefined,
      );
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [on]);
}

/** Short vibration as feedback for a done set (devices without vibration ignore it). */
export const buzz = () => navigator.vibrate?.(40);

/** Current image of each exercise, so older records also show the images added later. */
export function useThumbs(): (exerciseId: string, fallback?: string) => string | undefined {
  const map = useLiveQuery(async () => {
    const m = new Map<string, string>();
    await db.exercises.each((e) => {
      if (e.thumb) m.set(e.id, e.thumb);
    });
    return m;
  }, []);
  return (id, fallback) => map?.get(id) ?? fallback;
}

export function metricLabel(t: TFunction, key: MetricKey, defs?: MetricDef[]): string {
  if (key.startsWith('custom:')) return defs?.find((d) => d.key === key)?.label || key.slice(7);
  return t(`metric.${key}`);
}

/** Short label for table headers (e.g. "Vel." for speed). */
export function metricShort(t: TFunction, key: MetricKey, defs?: MetricDef[]): string {
  if (key.startsWith('custom:')) return metricLabel(t, key, defs);
  return t(`metricShort.${key}`);
}

/** Translates a known key in a group (muscle, equipment); returns the raw text for user-defined values. */
export function tr(t: TFunction, group: string, key: string): string {
  return t(`${group}.${key}`, { defaultValue: key });
}

export function fmtNum(v: number | undefined, lang: string, digits = 2): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: digits }).format(v);
}

export function fmtValue(v: number | undefined, unit: string, lang: string): string {
  if (v === undefined) return '—';
  return unit === 'reps' ? fmtNum(v, lang) : `${fmtNum(v, lang)} ${unit}`;
}

/** Seconds → m:ss or h:mm:ss. */
export function fmtSeconds(sec: number | undefined): string {
  if (sec === undefined) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function fmtDate(iso: string | undefined, lang: string, withTime = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

/** Canonical kg → display unit. */
export const loadOut = (kg: number | undefined, s: Settings) => (kg === undefined ? undefined : round(convert(kg, 'kg', s.loadUnit), 1));
/** Canonical m → km or mi. */
export const distOut = (m: number | undefined, s: Settings) => (m === undefined ? undefined : round(convert(m, 'm', s.distanceUnit), 2));
/** Pace s/km → s per display distance unit. */
/** Canonical km/h → display unit (mph with miles). */
export const speedOut = (kmh: number | undefined, s: Settings) => (kmh === undefined ? undefined : round(convert(kmh, 'km/h', s.distanceUnit === 'mi' ? 'mph' : 'km/h'), 1));
export const paceOut = (sPerKm: number | undefined, s: Settings) => (sPerKm === undefined ? undefined : s.distanceUnit === 'mi' ? sPerKm * 1.609344 : sPerKm);

export function reasonText(t: TFunction, r: Reason, defs?: MetricDef[]): string {
  const params = { ...r.params };
  if (typeof params.metric === 'string') params.metric = metricLabel(t, params.metric as MetricKey, defs);
  return t(`reason.${r.code}`, params);
}

export function download(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Gives a file to the user. On a phone (touch screen) the share menu opens, so the file can go to Drive, email or a chat;
 * elsewhere, or without file sharing, it is downloaded. Returns false when the user closes the share menu.
 */
export async function shareFile(filename: string, text: string, mime = 'application/json'): Promise<boolean> {
  const file = new File([text], filename, { type: mime });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  download(filename, text, mime);
  return true;
}

/** Full backup as a file (share menu on a phone). The backup date is saved only when the file was given. */
export async function saveBackup(): Promise<boolean> {
  const bundle = buildBundle(await repo.readAll(), 'full', __APP_VERSION__);
  const ok = await shareFile(`mygymprogression-full-${stamp()}.json`, JSON.stringify(bundle, null, 2));
  if (ok) await repo.saveSettings({ lastBackupAt: new Date().toISOString() });
  return ok;
}

export const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
export const today = () => new Date().toISOString().slice(0, 10);
export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
