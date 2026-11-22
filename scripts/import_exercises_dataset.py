"""
Builds the v2 exercise library from exercises-dataset
(https://github.com/hasaneyldrm/exercises-dataset; data under the MIT licence).

Output: public/library/exercises-dataset.json, a library file (docs/data-format.md) with English names and steps,
Portuguese names from scripts/data/exercises-dataset-pt.tsv, and media URLs.

The media (thumbnails and animations, © Gym visual) is NOT copied into the app. The URLs point to jsDelivr, pinned
to one dataset commit; the phone downloads them only when the user asks (V2-D4, V2-D12).

Usage:
  python -I scripts/import_exercises_dataset.py                 # downloads data/exercises.json of the pinned commit
  python -I scripts/import_exercises_dataset.py <exercises.json> # uses a local copy of that file
"""
import csv
import json
import os
import re
import sys
import time
import urllib.request

COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
REPO = 'hasaneyldrm/exercises-dataset'
CDN = f'https://cdn.jsdelivr.net/gh/{REPO}@{COMMIT}'
UA = 'MyGymProgression-library-build/0.2'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PT = os.path.join(ROOT, 'scripts', 'data', 'exercises-dataset-pt.tsv')
OUT = os.path.join(ROOT, 'public', 'library', 'exercises-dataset.json')

# Small words kept in lower case in English display names.
SMALL = {'a', 'and', 'on', 'with', 'to', 'of', 'the', 'in', 'from', 'between', 'against', 'over', 'under', 'off', 'for', 'at', 'by'}
UPPER = {'ez': 'EZ', 'jm': 'JM', 'pov': 'POV', 'sz': 'SZ', 'v': 'V', 'w': 'W', 't': 'T', 'y': 'Y', 'l': 'L'}

HOLD = re.compile(r'\bstretch\b|\bisometric\b|\bwall sit\b|\bhold\b|\bdead hang\b|\bplanche\b|\bl-sit\b|\bfront lever\b|\bback lever\b|\bmaltese\b|\biron cross\b|\bpose\b')
PLANK_MOVES = re.compile(r'tap|twist|jack|walk|row|reach|fly|up\b|down|rotation|kick|knee|march|climber|jump|hip dip|to ')
# Names that match HOLD or "plank" but are done for repetitions.
MOVES = re.compile(r'\breps\b|push-up|\blunge\b|adduction|leg lift')
DIST = re.compile(r'\brun\b|\bwalk\b|\bwalking on\b|treadmill|stepmill|elliptical|cross trainer|\bbike\b|\bcycle\b|ergometer|skierg|\bski step\b')
DIST_EQUIPMENT = {'stationary bike', 'elliptical machine', 'stepmill machine', 'skierg machine', 'upper body ergometer'}
NO_LOAD = {'body weight', 'stability ball', 'bosu ball', 'roller', 'wheel roller', 'band', 'resistance band'}


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def clean(name):
    """Fixes encoding damage in the source: some names have a stray Cyrillic 'в' before the degree sign."""
    return name.replace('в°', '°').strip()


def display_name(name):
    """'dumbbell incline curl v. 2' -> 'Dumbbell Incline Curl V. 2' (small words stay lower case)."""
    words = clean(name).split(' ')
    out = []
    for i, w in enumerate(words):
        low = w.lower()
        if low in UPPER:
            out.append(UPPER[low])
        elif i > 0 and low in SMALL:
            out.append(low)
        elif w[:1] == '(' and len(w) > 1:
            out.append('(' + w[1:2].upper() + w[2:])
        else:
            out.append('-'.join(p[:1].upper() + p[1:] for p in w.split('-')))
    return ' '.join(out)


def title(xs):
    return [' '.join(p.capitalize() for p in x.split(' ')) for x in xs or [] if x]


def kind_of(ex):
    """Library type read by the app (src/domain/library.ts, presetOf)."""
    name = ex['name'].lower()
    equipment = (ex.get('equipment') or '').lower()
    if equipment in DIST_EQUIPMENT or (ex.get('body_part') == 'cardio' and DIST.search(name)):
        return 'distance'
    held = HOLD.search(name) or ('plank' in name and not PLANK_MOVES.search(name.replace('plank', '')))
    if 'jump rope' in name or (held and not MOVES.search(name)):
        return 'duration'
    if equipment in NO_LOAD:
        return 'reps_only'
    return 'weight_reps'


def load_pt():
    if not os.path.exists(PT):
        return {}
    with open(PT, encoding='utf-8', newline='') as f:
        rows = csv.reader(f, delimiter='\t')
        return {r[0]: r[1].strip() for r in rows if len(r) >= 2 and r[0] and not r[0].startswith('#') and r[1].strip()}


def record(ex, pt):
    steps = [s.strip() for s in (ex.get('instruction_steps') or {}).get('en') or [] if s and s.strip()]
    rec = {
        'sid': ex['id'],
        'slug': f"exds-{ex['id']}",
        'url': f'https://github.com/{REPO}',
        'name': display_name(ex['name']),
        'bodyParts': [ex['body_part']] if ex.get('body_part') else [],
        'equipment': [ex['equipment']] if ex.get('equipment') else [],
        'type': kind_of(ex),
        'primary': title([ex.get('target')]),
        'secondary': [m for m in title(ex.get('secondary_muscles')) if m not in title([ex.get('target')])],
        'overview': '',
        'steps': steps,
        'tips': [],
        'video': '',
        'thumb': f"{CDN}/{ex['image']}" if ex.get('image') else '',
        'imageUrl': f"{CDN}/{ex['gif_url']}" if ex.get('gif_url') else '',
        'related': [],
    }
    if ex['id'] in pt:
        rec['pt'] = {'name': pt[ex['id']]}
    return rec


def main():
    raw = open(sys.argv[1], 'rb').read() if len(sys.argv) > 1 else get(f'{CDN}/data/exercises.json')
    exercises = json.loads(raw)
    pt = load_pt()
    recs = [record(ex, pt) for ex in exercises]
    ids = [r['sid'] for r in recs]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    unknown = sorted(set(pt) - set(ids))
    assert not unknown, f'Portuguese names for unknown ids: {unknown[:5]}'
    out = {
        'format': 'mygymprogression-library', 'version': 2, 'source': 'exercises-dataset (MIT)',
        'sourceUrl': f'https://github.com/{REPO}', 'commit': COMMIT,
        'mediaCredit': '© Gym visual — https://gymvisual.com/', 'fetchedAt': time.strftime('%Y-%m-%d'), 'exercises': recs,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    kinds = {k: sum(1 for r in recs if r['type'] == k) for k in ('weight_reps', 'reps_only', 'duration', 'distance')}
    print(f"wrote {len(recs)} exercises, {sum(1 for r in recs if 'pt' in r)} with a Portuguese name, types {kinds}, "
          f'{os.path.getsize(OUT) // 1024} KB -> {OUT}', flush=True)


if __name__ == '__main__':
    main()
