import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedCount, corsOf, downloadMedia, MEDIA_PREFIX, mediaUrls } from './media';

const url = (f: string) => `${MEDIA_PREFIX}7455efae41b330c265e7cd4b78dfa848e7ce5ebd/${f}`;

/** Minimal Cache API: one cache, keyed by URL. */
function fakeCaches(start: string[] = []) {
  const store = new Map<string, unknown>(start.map((u) => [u, {}]));
  const cache = {
    keys: async () => [...store.keys()].map((u) => ({ url: u })),
    put: async (u: string, r: unknown) => void store.set(u, r),
  };
  vi.stubGlobal('caches', { open: async () => cache });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('library media (v2)', () => {
  it('lists dataset thumbnails first, then animations, without repeats or other images', () => {
    const list = mediaUrls([
      { thumb: url('images/0025.jpg'), image: url('videos/0025.gif') },
      { thumb: url('images/0025.jpg'), image: url('videos/0025.gif') },
      { thumb: 'data:image/webp;base64,AAAA', image: 'https://example.com/x.png' },
      { thumb: url('images/0032.jpg') },
    ]);
    expect(list).toEqual([url('images/0025.jpg'), url('images/0032.jpg'), url('videos/0025.gif')]);
  });

  it('asks for CORS only on hosts that allow it', () => {
    expect(corsOf(url('images/0025.jpg'))).toBe('anonymous');
    expect(corsOf('https://raw.githubusercontent.com/a/b/main/x.jpg')).toBe('anonymous');
    expect(corsOf('https://images.example.com/x.png')).toBeUndefined();
    expect(corsOf('data:image/webp;base64,AAAA')).toBeUndefined();
    expect(corsOf(undefined)).toBeUndefined();
  });

  it('downloads only what is missing, counts failures and reports progress', async () => {
    const urls = [url('a.jpg'), url('b.jpg'), url('c.jpg'), url('d.gif')];
    const store = fakeCaches([urls[0]]);
    const fetchMock = vi.fn(async (u: string, _init?: RequestInit) => ({ ok: !u.endsWith('c.jpg') }));
    vi.stubGlobal('fetch', fetchMock);
    const progress: number[] = [];
    const res = await downloadMedia(urls, (done) => progress.push(done), undefined, 2);
    expect(res).toEqual({ ok: 3, failed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => init?.mode === 'cors')).toBe(true);
    expect(progress[0]).toBe(1);
    expect(progress.at(-1)).toBe(4);
    expect([...store.keys()].sort()).toEqual([urls[0], urls[1], urls[3]].sort());
    expect(await cachedCount(urls)).toBe(3);
  });

  it('stops when the download is cancelled', async () => {
    fakeCaches();
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => (ctrl.abort(), { ok: true })));
    const res = await downloadMedia([url('a.jpg'), url('b.jpg'), url('c.jpg')], () => undefined, ctrl.signal, 1);
    expect(res.ok).toBe(1);
  });
});
