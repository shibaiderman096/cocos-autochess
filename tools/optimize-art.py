"""Prune verified retired FX, extract used UI regions, and compress runtime PNGs.

Dry run by default. --apply keeps existing asset UUIDs except newly extracted icons.
Pillow is required; imagequant is optional (otherwise use lossless PNG encoding).
"""
import argparse
import copy
import io
import json
import math
import re
import uuid
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

try:
    import imagequant
except ImportError:
    imagequant = None

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'assets/resources/art'
RETIRED = {
    'stellarBarrier': 'stellar_barrier', 'stellarRush': 'stellar_rush',
    'miluStarTrail': 'milu_star_trail', 'miluStarImpact': 'milu_star_impact',
    'hit': 'fx_hit', 'ring': 'fx_ring', 'slash': 'fx_slash',
}
BADGES = {
    'bronze': (40, 148, 406, 404), 'silver': (460, 147, 405, 405),
    'gold': (874, 147, 407, 406), 'prismatic': (1293, 141, 425, 414),
    'inactive': (1731, 148, 405, 403),
}


def png(image):
    output = io.BytesIO()
    image.save(output, format='PNG', optimize=True, compress_level=9)
    return output.getvalue()


def display_psnr(before, after):
    """Compare compositing on both board-dark and panel-light backgrounds."""
    worst = 100.0
    for rgb in [(20, 30, 40), (235, 228, 211)]:
        a = Image.new('RGBA', before.size, rgb + (255,))
        b = a.copy()
        a.alpha_composite(before)
        b.alpha_composite(after)
        a.thumbnail((350, 350), Image.Resampling.LANCZOS)
        b.thumbnail((350, 350), Image.Resampling.LANCZOS)
        rms = ImageStat.Stat(ImageChops.difference(a.convert('RGB'), b.convert('RGB'))).rms
        mse = sum(x*x for x in rms)/3
        worst = min(worst, 10*math.log10(255**2/max(mse, 1e-9)))
    return worst


def compress(image):
    original = image.convert('RGBA')
    clean = original.copy()
    invisible = clean.getchannel('A').point(lambda a: 255 if a == 0 else 0)
    clean.paste((0, 0, 0, 0), mask=invisible)
    best = png(clean)
    method, score = 'lossless-visible-pixels', 100.0
    # Already paletted files must not undergo another lossy conversion.
    if imagequant and image.mode != 'P':
        candidate = imagequant.quantize_pil_image(clean, dithering_level=.7, max_quality=100)
        decoded = candidate.convert('RGBA')
        # Fully transparent pixels stay exactly transparent; guard glow/edge leakage.
        leaked = ImageChops.multiply(decoded.getchannel('A'), invisible).getextrema()[1]
        quality = display_psnr(original, decoded)
        data = png(candidate)
        if not leaked and quality >= 43 and len(data) < len(best):
            best, method, score = data, 'perceptual-palette', quality
    return best, method, score


def sized_meta(meta, size, new_name=None):
    meta = copy.deepcopy(meta)
    if new_name:
        old = meta['uuid']
        meta = json.loads(json.dumps(meta).replace(old, str(uuid.uuid4())))
        for sub in meta['subMetas'].values():
            sub['displayName'] = new_name
    width, height = size
    for sub in meta.get('subMetas', {}).values():
        if sub['importer'] != 'sprite-frame':
            continue
        data = sub['userData']
        data.update(width=width, height=height, rawWidth=width, rawHeight=height,
                    trimX=0, trimY=0, offsetX=0, offsetY=0, trimType='none')
        if 'vertices' in data:
            data['vertices'].update(
                rawPosition=[-width/2, -height/2, 0, width/2, -height/2, 0,
                             -width/2, height/2, 0, width/2, height/2, 0],
                uv=[0, height, width, height, 0, 0, width, 0],
                minPos=[-width/2, -height/2, 0], maxPos=[width/2, height/2, 0])
    return meta


def main(apply):
    paths_file = ROOT / 'assets/scripts/view/ArtPaths.ts'
    paths = paths_file.read_text(encoding='utf-8')
    consumers = [(p, p.read_text(encoding='utf-8')) for p in (ROOT/'assets').rglob('*')
                 if p.is_file() and p.suffix in {'.ts', '.scene', '.prefab', '.anim', '.json', '.mtl', '.meta'}]
    planned, removed = {}, []
    # These seven registry entries have been replaced by the current animated sheets.
    for key, name in RETIRED.items():
        file = ART/'fx'/f'{name}.png'
        if not file.exists():
            continue
        meta = json.loads(file.with_suffix('.png.meta').read_text(encoding='utf-8'))
        for consumer, text in consumers:
            if consumer in [paths_file, file.with_suffix('.png.meta')]:
                continue
            assert f'art/fx/{name}' not in text, f'Live resource path: {consumer}'
            assert not re.search(r'FX_SPRITE\.'+key+r'\b', text), f'Live FX: {consumer}'
            assert meta['uuid'] not in text, f'Live UUID: {consumer}'
        paths = re.sub(r'^\s*'+key+r":\s*'art/fx/"+name+r"/spriteFrame',\r?\n", '', paths, flags=re.M)
        removed.extend([file, file.with_suffix('.png.meta')])

    # Keep the exact authored regions and resolution, dropping the unused sheet area.
    for sheet, regions in [
        ('trait_badges', {f'trait_badge_{k}': v for k, v in BADGES.items()}),
        ('trait_portrait_frames', {f'trait_portrait_cost{i+1}': (x, 128, 410, 410)
                                   for i, x in enumerate([20, 456, 885, 1315, 1747])}),
    ]:
        file = ART/'ui'/f'{sheet}.png'
        if not file.exists():
            continue
        image = Image.open(file)
        meta = json.loads(file.with_suffix('.png.meta').read_text(encoding='utf-8'))
        for consumer, text in consumers:
            if consumer == file.with_suffix('.png.meta'):
                continue
            assert meta['uuid'] not in text, f'Live sheet UUID: {consumer}'
        for name, (x, y, width, height) in regions.items():
            target = ART/'ui'/f'{name}.png'
            assert not target.exists(), f'Existing extracted icon: {target}'
            planned[target] = (image.crop((x, y, x+width, y+height)), sized_meta(meta, (width, height), name))
        removed.extend([file, file.with_suffix('.png.meta')])

    soul = ART/'fx/soul_realm_vfx.png'
    # Rows 1 and 3 were superseded by the dedicated SoulRealmBorder artwork.
    painted_file = ROOT/'assets/scripts/view/RolePaintedVfx.ts'
    painted = painted_file.read_text(encoding='utf-8')
    if "atlas==='soul'?[0,350,627,940,1254]" in painted:
        image = Image.open(soul).convert('RGBA')
        assert image.size == (1254, 1254)
        compact = Image.new('RGBA', (1254, 663))
        compact.paste(image.crop((0, 0, 1254, 350)), (0, 0))
        compact.paste(image.crop((0, 627, 1254, 940)), (0, 350))
        planned[soul] = (compact, sized_meta(json.loads(soul.with_suffix('.png.meta').read_text()), compact.size))
        painted = painted.replace("atlas==='soul'||atlas==='basicBlood'", "atlas==='soul'?2:atlas==='basicBlood'")
        painted = painted.replace("atlas==='soul'?[0,350,627,940,1254]", "atlas==='soul'?[0,350,663]")
        painted = painted.replace("atlas==='soul'?1254:1536", "atlas==='soul'?663:1536")
        painted = painted.replace("atlas:'soul',row:2", "atlas:'soul',row:1")

    initial = sum(p.stat().st_size for p in ART.rglob('*.png'))
    rows, outputs = [], {}
    for file in sorted(set(ART.rglob('*.png')) | set(planned)):
        if file in removed:
            continue
        image = planned[file][0] if file in planned else Image.open(file)
        original = file.read_bytes() if file.exists() else b''
        data, method, score = compress(image)
        # An optimization must never enlarge an unchanged source.
        if file not in planned and len(data) >= len(original):
            continue
        assert Image.open(io.BytesIO(data)).size == image.size
        outputs[file] = data
        rows.append({'path': file.relative_to(ROOT).as_posix(), 'before': len(original),
                     'after': len(data), 'method': method, 'displayPSNR': round(score, 2)})
        if len(rows) % 25 == 0:
            print(json.dumps({'processed': len(rows)}, ensure_ascii=False), flush=True)

    if apply:
        for file, data in outputs.items():
            temp = file.with_suffix('.png.optimizing')
            temp.write_bytes(data)
            temp.replace(file)
        for file, (_, meta) in planned.items():
            file.with_suffix('.png.meta').write_text(json.dumps(meta, indent=2)+'\n', encoding='utf-8')
        paths_file.write_text(paths, encoding='utf-8')
        painted_file.write_text(painted, encoding='utf-8')
        for file in removed:
            assert file.resolve().is_relative_to(ART.resolve()), f'Outside art: {file}'
            file.unlink()
    final = initial - sum(p.stat().st_size for p in removed if p.suffix == '.png') if not apply else sum(p.stat().st_size for p in ART.rglob('*.png'))
    if not apply:
        final += sum(row['after']-row['before'] for row in rows)
    print(json.dumps({'applied': apply, 'beforeBytes': initial, 'afterBytes': final,
                      'savedBytes': initial-final, 'removedImages': len(removed)//2,
                      'extractedIcons': sum(1 for p in planned if p.parent.name == 'ui'),
                      'compressedImages': len(rows), 'paletteImages': sum(row['method']=='perceptual-palette' for row in rows),
                      'worstAcceptedDisplayPSNR': min((row['displayPSNR'] for row in rows if row['method']=='perceptual-palette'), default=None),
                      'largestSavings': sorted(rows, key=lambda r: r['before']-r['after'], reverse=True)[:8]}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    main(parser.parse_args().apply)
