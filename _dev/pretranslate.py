# -*- coding: utf-8 -*-
"""
pretranslate.py — bake zh-TW translations of all JMdict English
definitions into data/zh_defs.js so the app never needs the runtime
Google Translate endpoint for definitions.

Usage:  python _dev/pretranslate.py
Resumable: progress is checkpointed to _dev/zh_defs_checkpoint.json
after every batch; re-running skips already-translated strings.
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKPOINT = os.path.join(ROOT, '_dev', 'zh_defs_checkpoint.json')
OUT        = os.path.join(ROOT, 'data', 'zh_defs.js')
BATCH      = 80          # lines per request
DELAY      = 0.4         # seconds between requests

def collect_defs():
    defs = set()
    for lv in ['n1', 'n2', 'n3', 'n4', 'n5']:
        path = os.path.join(ROOT, 'data', f'{lv}_dict.js')
        s = open(path, encoding='utf-8').read()
        data = json.loads(s[s.index('=')+1:].rstrip().rstrip(';'))
        for entry in data.values():
            for d in entry[2]:
                if d and d.strip():
                    defs.add(d)
    return sorted(defs)

def gtx(text):
    url = ('https://translate.googleapis.com/translate_a/single'
           '?client=gtx&sl=en&tl=zh-TW&dt=t&q=' + urllib.parse.quote(text))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        j = json.loads(r.read().decode('utf-8'))
    return ''.join(seg[0] or '' for seg in (j[0] or []))

def translate_batch(lines):
    """Translate a batch joined by newlines; fall back to per-line on mismatch."""
    joined = '\n'.join(lines)
    out = gtx(joined).split('\n')
    if len(out) == len(lines) and all(o.strip() for o in out):
        return [o.strip() for o in out]
    # line-count mismatch → translate individually (slow path)
    result = []
    for ln in lines:
        result.append(gtx(ln).strip() or ln)
        time.sleep(DELAY)
    return result

def main():
    defs = collect_defs()
    done = {}
    if os.path.exists(CHECKPOINT):
        done = json.load(open(CHECKPOINT, encoding='utf-8'))
        print(f'resuming: {len(done)} already translated')

    todo = [d for d in defs if d not in done]
    print(f'{len(defs)} unique defs, {len(todo)} to translate')

    for i in range(0, len(todo), BATCH):
        batch = todo[i:i+BATCH]
        for attempt in range(3):
            try:
                zh = translate_batch(batch)
                break
            except Exception as e:
                wait = 10 * (attempt + 1)
                print(f'  batch error ({e}); retrying in {wait}s')
                time.sleep(wait)
        else:
            print('giving up on this run — re-run to resume')
            sys.exit(1)
        for en, z in zip(batch, zh):
            done[en] = z
        json.dump(done, open(CHECKPOINT, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'  {min(i+BATCH, len(todo))}/{len(todo)}')
        time.sleep(DELAY)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('window.ZH_DEFS=')
        json.dump(done, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';')
    print('wrote zh_defs.js (%d KB, %d entries)' % (os.path.getsize(OUT)//1024, len(done)))

if __name__ == '__main__':
    main()
