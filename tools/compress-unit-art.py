"""Resize runtime character art and its portrait regions together; keep asset UUIDs."""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'assets/resources/art/units'
PATHS = ROOT / 'assets/scripts/view/ArtPaths.ts'
MANIFEST = ROOT / 'docs/art-provenance/unit-art-compression.json'

def compress(edge, apply, units=None):
    source = PATHS.read_text(encoding='utf-8')
    mappings = dict(re.findall(r"\b(\w+):\s*'(art/units/[^']+)/spriteFrame'", source))
    portraits = re.search(r'(export const UNIT_PORTRAIT:.*?Object\.entries\(\{)(.*?)(\}\)\.map)', source, re.S)
    assert portraits, 'Portrait table not found'
    regions = dict(re.findall(r"\b(\w+):\s*'([\d,]+)'", portraits[2]))
    existing = json.loads(MANIFEST.read_text(encoding='utf-8'))['assets'] if MANIFEST.exists() else []
    records = {item['file']: item for item in existing}
    changes = []
    for unit, resource in mappings.items():
        if units and unit not in units:
            continue
        file = ROOT / 'assets/resources' / (resource + '.png')
        original = file.read_bytes()
        with Image.open(file) as image:
            width, height = image.size
            if max(width, height) <= edge:
                continue
            size = (round(width * edge / max(width, height)), round(height * edge / max(width, height)))
            resized = image.convert('RGBA').resize(size, Image.Resampling.LANCZOS)
            output = io.BytesIO()
            resized.save(output, format='PNG', optimize=True, compress_level=9)
        data = output.getvalue()
        record = {'file': file.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(original).hexdigest(),
                  'sha256': hashlib.sha256(data).hexdigest(), 'sourceSize': [width, height],
                  'width': size[0], 'height': size[1], 'sourceBytes': len(original), 'bytes': len(data)}
        if unit in regions:
            x, y, w, h = map(int, regions[unit].split(','))
            rect = [round(x * size[0] / width), round(y * size[1] / height),
                    max(1, round(w * size[0] / width)), max(1, round(h * size[1] / height))]
            rect[2] = min(rect[2], size[0] - rect[0]); rect[3] = min(rect[3], size[1] - rect[1])
            assert min(rect[2:]) > 0 and min(rect[:2]) >= 0
            regions[unit] = ','.join(map(str, rect))
        if apply:
            file.write_bytes(data)
            # Imported sprite geometry must never retain the old pixel dimensions.
            meta_file = Path(str(file) + '.meta')
            meta = json.loads(meta_file.read_text(encoding='utf-8'))
            for sub in meta['subMetas'].values():
                if sub['importer'] != 'sprite-frame': continue
                u = sub['userData']; w, h = size
                u.update(width=w, height=h, rawWidth=w, rawHeight=h, trimX=0, trimY=0, offsetX=0, offsetY=0, trimType='none')
                if 'vertices' in u:
                    u['vertices'].update(rawPosition=[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
                                         uv=[0,h,w,h,0,0,w,0], minPos=[-w/2,-h/2,0], maxPos=[w/2,h/2,0])
            meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        records[record['file']] = record
        changes.append(record)
    if apply and changes:
        block = re.sub(r"\b(\w+):\s*'([\d,]+)'", lambda match: f"{match[1]}:'{regions[match[1]]}'", portraits[2])
        source = source[:portraits.start(2)] + block + source[portraits.end(2):]
        PATHS.write_text(source, encoding='utf-8')
        MANIFEST.write_text(json.dumps({'maxEdge': edge, 'method': 'RGBA Lanczos resize; lossless PNG encoding; original framing preserved',
                                       'assets': sorted(records.values(), key=lambda row: row['file'])}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'applied': apply, 'images': len(changes), 'beforeBytes': sum(row['sourceBytes'] for row in changes),
                      'afterBytes': sum(row['bytes'] for row in changes), 'maximumEdge': edge}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--max-edge', type=int, default=1024); parser.add_argument('--apply', action='store_true')
    parser.add_argument('--unit', action='append', default=[])
    args = parser.parse_args(); assert args.max_edge >= 512
    compress(args.max_edge, args.apply, args.unit)
