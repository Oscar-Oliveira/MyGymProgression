"""
Personal-use import of the Exsercise.com exercise library (https://www.exsercise.com/).

Output (git-ignored, not for redistribution):
  public/library/exsercise.json   exercise records
  public/library/thumbs/<id>.webp small thumbnails

Polite crawling: 2 parallel requests, a pause between requests, retries, and resume (records already fetched are skipped).
Usage:
  python -I scripts/import_exsercise.py fetch  <work_dir>   # pages → <work_dir>/records.jsonl
  python -I scripts/import_exsercise.py thumbs <work_dir>   # images → public/library/thumbs
  python -I scripts/import_exsercise.py build  <work_dir>   # records → public/library/exsercise.json
"""
import concurrent.futures as cf
import html
import io
import json
import os
import re
import sys
import time
import urllib.request

UA = 'MyGymProgression-personal-import/0.1 (+personal use)'
BASE = 'https://www.exsercise.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'library')
DELAY = 0.6


def get(url, binary=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return data if binary else data.decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def library_urls():
    xml = get(f'{BASE}/sitemaps/sitemap1.xml')
    return [u for u in re.findall(r'<loc>([^<]+)</loc>', xml) if '/library/' in u]


def parse(url, page):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not m:
        return None
    pp = json.loads(m.group(1))['props']['pageProps']
    d = pp.get('firstData') or {}
    if not d.get('name'):
        return None
    # Muscle names are only in the page text: "Primary muscles: A, B. Secondary muscles: C, D."
    text = html.unescape(page)
    prim = re.search(r'Primary muscles: ([^."]*)', text)
    sec = re.search(r'Secondary muscles: ([^."]*)', text)
    split = lambda m: [x.strip() for x in m.group(1).split(',') if x.strip() and x.strip().lower() != 'none'] if m else []
    code = re.search(r'/(\d{8})', d.get('image_name') or '')
    return {
        'sid': str(d.get('id')),
        'slug': url.rstrip('/').split('/')[-1],
        'url': url,
        'name': d['name'].strip(),
        'bodyParts': d.get('body_part_id') or [],
        'equipment': d.get('equipment_id') or [],
        'type': d.get('exercise_type') or '',
        'primary': split(prim),
        'secondary': split(sec),
        'overview': (d.get('overview') or '').strip(),
        'steps': [s.strip() for s in (d.get('ex_instructions') or []) if s and s.strip()],
        'tips': [s.strip() for s in (d.get('exercise_tips') or []) if s and s.strip()],
        'video': d.get('video_name') or '',
        'imageCode': code.group(1) if code else '',
        'image': d.get('image_name') or '',
        'related': [str(x) for x in (d.get('related_exercise_ids') or [])],
        'relatedSlugs': [r.get('url', '').rstrip('/').split('/')[-1] for r in (d.get('related_exercise_data') or [])],
    }


def fetch(work):
    os.makedirs(work, exist_ok=True)
    path = os.path.join(work, 'records.jsonl')
    done = set()
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                try:
                    done.add(json.loads(line)['url'])
                except Exception:  # noqa: BLE001
                    pass
    urls = [u for u in library_urls() if u not in done]
    print(f'{len(done)} done, {len(urls)} to fetch', flush=True)

    def one(u):
        time.sleep(DELAY)
        try:
            return u, parse(u, get(u)), None
        except Exception as e:  # noqa: BLE001
            return u, None, str(e)

    n = 0
    with open(path, 'a', encoding='utf-8') as out, cf.ThreadPoolExecutor(2) as ex:
        for u, rec, err in ex.map(one, urls):
            n += 1
            if rec:
                out.write(json.dumps(rec, ensure_ascii=False) + '\n')
                out.flush()
            elif err:
                print('ERR', u, err, flush=True)
            if n % 100 == 0:
                print(f'{n}/{len(urls)}', flush=True)
    print('fetch done', flush=True)


def records(work):
    seen = {}
    with open(os.path.join(work, 'records.jsonl'), encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            seen[r['sid']] = r
    return list(seen.values())


def thumbs(work):
    from PIL import Image

    tdir = os.path.join(OUT, 'thumbs')
    os.makedirs(tdir, exist_ok=True)
    todo = [r for r in records(work) if r['imageCode'] and not os.path.exists(os.path.join(tdir, f"{r['sid']}.webp"))]
    print(f'{len(todo)} thumbnails to make', flush=True)

    def one(r):
        time.sleep(DELAY / 2)
        try:
            data = get(f"https://lyfta.app/images/exercises/{r['imageCode']}.png", binary=True)
            im = Image.open(io.BytesIO(data)).convert('RGBA')
            bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
            bg.alpha_composite(im)
            bg = bg.convert('RGB')
            bg.thumbnail((128, 128))
            bg.save(os.path.join(tdir, f"{r['sid']}.webp"), 'WEBP', quality=62, method=6)
            return None
        except Exception as e:  # noqa: BLE001
            return f"{r['sid']} {e}"

    n = 0
    with cf.ThreadPoolExecutor(3) as ex:
        for err in ex.map(one, todo):
            n += 1
            if err:
                print('ERR', err, flush=True)
            if n % 200 == 0:
                print(f'{n}/{len(todo)}', flush=True)
    print('thumbs done', flush=True)


def build(work):
    recs = records(work)
    tdir = os.path.join(OUT, 'thumbs')
    for r in recs:
        r['thumb'] = f"library/thumbs/{r['sid']}.webp" if os.path.exists(os.path.join(tdir, f"{r['sid']}.webp")) else ''
        r['imageUrl'] = f"https://lyfta.app/images/exercises/{r['imageCode']}.png" if r['imageCode'] else ''
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'exsercise.json'), 'w', encoding='utf-8') as f:
        json.dump({'source': BASE, 'fetchedAt': time.strftime('%Y-%m-%d'), 'exercises': recs}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'built {len(recs)} exercises', flush=True)


if __name__ == '__main__':
    {'fetch': fetch, 'thumbs': thumbs, 'build': build}[sys.argv[1]](sys.argv[2])
