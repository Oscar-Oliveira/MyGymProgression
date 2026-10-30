"""
Builds the open exercise library that is published with the app, from free-exercise-db
(https://github.com/yuhonas/free-exercise-db, The Unlicense: public domain).

Output: public/library/free-exercise-db.json, a library file (docs/data-format.md) with small thumbnails embedded.
The app loads it only when the user taps Settings → Exercise library → Install open library.
Full images stay on GitHub and are loaded when an exercise page is opened.

Downloaded thumbnails are kept in private/free-exercise-db/thumbs (git-ignored), so a second run only fetches new ones.
Usage:
  python -I scripts/import_free_exercise_db.py
"""
import base64
import concurrent.futures as cf
import io
import json
import os
import time
import urllib.parse
import urllib.request

UA = 'MyGymProgression-library-build/0.1'
REPO = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'private', 'free-exercise-db', 'thumbs')
OUT = os.path.join(ROOT, 'public', 'library', 'free-exercise-db.json')

# Source equipment → names the app maps (src/domain/library.ts, EQUIPMENT).
EQUIPMENT = {
    'body only': 'body weight', 'kettlebells': 'kettlebell', 'bands': 'band', 'exercise ball': 'stability ball',
    'e-z curl bar': 'ez barbell', 'foam roll': 'roll', 'machine': 'leverage machine',
}
# Categories that describe a training style rather than a muscle (src/domain/library.ts, STYLE_CATEGORY).
STYLE = {'cardio', 'stretching', 'plyometrics'}


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def image_url(path):
    return f'{REPO}/exercises/{urllib.parse.quote(path)}'


def thumb(ex):
    """Small WebP thumbnail of the first image, as a data URL; '' when there is no image."""
    from PIL import Image

    if not ex.get('images'):
        return ''
    path = os.path.join(CACHE, f"{ex['id']}.webp")
    if not os.path.exists(path):
        im = Image.open(io.BytesIO(get(image_url(ex['images'][0])))).convert('RGB')
        im.thumbnail((128, 128))
        im.save(path, 'WEBP', quality=60, method=6)
    with open(path, 'rb') as f:
        return 'data:image/webp;base64,' + base64.b64encode(f.read()).decode('ascii')


def record(ex, thumb_url):
    category = (ex.get('category') or '').lower()
    equipment = (ex.get('equipment') or '').lower()
    if category in ('cardio', 'stretching'):
        kind = 'duration'
    elif equipment in ('body only', ''):
        kind = 'reps_only'
    else:
        kind = 'weight_reps'
    title = lambda xs: [x.title() for x in xs or []]  # noqa: E731
    return {
        'sid': ex['id'],
        'slug': ex['id'].lower().replace('_', '-'),
        'url': f"https://github.com/yuhonas/free-exercise-db/tree/main/exercises/{urllib.parse.quote(ex['id'])}",
        'name': ex['name'],
        'bodyParts': [category] if category in STYLE else [],
        'equipment': [EQUIPMENT.get(equipment, equipment)] if equipment else [],
        'type': kind,
        'primary': title(ex.get('primaryMuscles')),
        'secondary': title(ex.get('secondaryMuscles')),
        'overview': '',
        'steps': [s.strip() for s in ex.get('instructions') or [] if s.strip()],
        'tips': [],
        'video': '',
        'thumb': thumb_url,
        'imageUrl': image_url(ex['images'][0]) if ex.get('images') else '',
        'related': [],
    }


def main():
    exercises = json.loads(get(f'{REPO}/dist/exercises.json'))
    os.makedirs(CACHE, exist_ok=True)
    print(f'{len(exercises)} exercises', flush=True)
    with cf.ThreadPoolExecutor(6) as pool:
        thumbs = list(pool.map(thumb, exercises))
    recs = [record(ex, t) for ex, t in zip(exercises, thumbs)]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out = {
        'format': 'mygymprogression-library', 'version': 1, 'source': 'free-exercise-db (public domain)',
        'fetchedAt': time.strftime('%Y-%m-%d'), 'exercises': recs,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {len(recs)} exercises ({sum(1 for t in thumbs if t)} thumbnails), {os.path.getsize(OUT) // 1024} KB -> {OUT}', flush=True)


if __name__ == '__main__':
    main()
