// Images and animations of the v2 exercise library (exercises-dataset, © Gym visual).
// They are not published with the app: the phone downloads them from the source, only when the user asks,
// and keeps them in the cache the service worker reads (V2-D4, V2-D12).
import type { Exercise } from '../domain/types';

/** Cache used by the service worker for library media (vite.config.ts, runtimeCaching). */
export const MEDIA_CACHE = 'exercise-media';
/** Media of the v2 library, pinned to one dataset commit. */
export const MEDIA_PREFIX = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@';
/** Hosts that send CORS headers: their images can be cached as normal responses, not opaque ones. */
const CORS_HOSTS = /^https:\/\/(cdn\.jsdelivr\.net|raw\.githubusercontent\.com)\//;

/** crossOrigin for an <img>: "anonymous" only for hosts known to allow it (other images would fail to load). */
export const corsOf = (src?: string): 'anonymous' | undefined => (src && CORS_HOSTS.test(src) ? 'anonymous' : undefined);

/** Library media of the exercises: thumbnails first, then animations. */
export function mediaUrls(exercises: Pick<Exercise, 'thumb' | 'image'>[]): string[] {
  const ours = (u?: string): u is string => !!u && u.startsWith(MEDIA_PREFIX);
  const thumbs = exercises.map((e) => e.thumb).filter(ours);
  const animations = exercises.map((e) => e.image).filter(ours);
  return [...new Set([...thumbs, ...animations])];
}

const cacheApi = () => (typeof caches === 'undefined' ? undefined : caches);

/** How many of the addresses are already on the device. */
export async function cachedCount(urls: string[]): Promise<number> {
  const api = cacheApi();
  if (!api) return 0;
  const cache = await api.open(MEDIA_CACHE);
  const keys = new Set((await cache.keys()).map((r) => r.url));
  return urls.filter((u) => keys.has(u)).length;
}

/**
 * Downloads the addresses that are not on the device yet, a few at a time.
 * Calls onProgress after each file. Stops early when the signal aborts.
 */
export async function downloadMedia(
  urls: string[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  parallel = 6,
): Promise<{ ok: number; failed: number }> {
  const api = cacheApi();
  if (!api) return { ok: 0, failed: urls.length };
  const cache = await api.open(MEDIA_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = urls.filter((u) => !have.has(u));
  let done = urls.length - todo.length;
  let ok = done;
  let failed = 0;
  let next = 0;
  onProgress(done, urls.length);
  const worker = async () => {
    while (next < todo.length && !signal?.aborted) {
      const url = todo[next++];
      try {
        const res = await fetch(url, { mode: 'cors', signal });
        if (res.ok) {
          await cache.put(url, res);
          ok++;
        } else failed++;
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, worker));
  return { ok, failed };
}
