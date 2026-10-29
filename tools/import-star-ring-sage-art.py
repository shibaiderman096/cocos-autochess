"""Slice, register and pad image-generated spell cels; no painted pixels are authored here."""
from pathlib import Path
import hashlib, importlib.util, json, sys
from PIL import Image
import numpy as np
from scipy.ndimage import label, binary_dilation

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/star-ring-sage/star_ring_sage_raw.png'
TARGET = ROOT / 'assets/resources/art/fx/star_ring_sage.png'

def main():
    image = Image.open(SOURCE).convert('RGBA')
    # The selected source has four separated effect families with uneven row gutters.
    ys = [0, round(image.height * 400 / 1254), round(image.height * 700 / 1254),
          round(image.height * 950 / 1254), image.height]
    xs = [round(image.width * c / 4) for c in range(5)]
    sheet = Image.new('RGBA', (1024, 1024))
    records = []
    for row in range(4):
        cels = []
        for col in range(4):
            rect = (xs[col], ys[row], xs[col + 1], ys[row + 1])
            cel = image.crop(rect)
            alpha = cel.getchannel('A')
            bounds = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
            assert bounds, (row, col, 'empty painted cel')
            box = (max(0, bounds[0] - 3), max(0, bounds[1] - 3),
                   min(cel.width, bounds[2] + 3), min(cel.height, bounds[3] + 3))
            cel.putalpha(alpha.point(lambda a: 0 if a <= 4 else a))
            cels.append((cel.crop(box), rect, box))
        # Shared family scale preserves the drawn charge/projectile growth.
        scale = 176 / max(max(c.width, c.height) for c, _, _ in cels)
        for col, (cel, rect, box) in enumerate(cels):
            width = 176 if row == 3 else max(1, round(cel.width * scale))
            height = max(1, round(cel.height * scale))
            cel = cel.convert('RGBa').resize((width, height), Image.Resampling.LANCZOS).convert('RGBA')
            # Comet tips register at x=216; beam emitters register at x=40.
            x = 216 - width if row == 2 else 40 if row == 3 else (256 - width) // 2
            y = (256 - height) // 2
            sheet.alpha_composite(cel, (col * 256 + x, row * 256 + y))
            records.append({'index': row * 4 + col, 'sourceRect': rect, 'paintedBounds': box,
                            'runtimeSize': [width, height], 'runtimeOffset': [x, y]})
    # Downsampling reintroduces alpha 1-4 haze; remove that and detached faint islands.
    pixels = np.array(sheet)
    alpha = pixels[..., 3]
    visible = alpha > 4
    labels, count = label(visible, structure=np.ones((3, 3)))
    attached = np.zeros(count + 1, dtype=bool)
    attached[labels[binary_dilation(visible & (alpha >= 32), structure=np.ones((5, 5)))]] = True
    attached[0] = True
    removed = ((alpha > 0) & ~visible) | ~attached[labels]
    hygiene = {'floorPixels': int(((alpha > 0) & ~visible).sum()), 'detachedPixels': int((~attached[labels]).sum()),
               'maxRemovedAlpha': int(alpha[removed].max()) if removed.any() else 0}
    pixels[removed] = 0
    Image.fromarray(pixels).save(TARGET, optimize=True)
    spec = importlib.util.spec_from_file_location('blood_art', ROOT / 'tools/import-bloodfiend-art.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    art.write_meta(TARGET)
    report = {'route': 'Built-in image_gen', 'art_source': 'host_image', 'model': 'Tool-managed, not exposed',
              'estimateUsd': None, 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'prompts': 'tools/star-ring-sage-vfx-prompt.json', 'grid': [4, 4], 'cell': [256, 256],
              'padding': 40, 'alphaFloor': 4, 'geometryAlphaThreshold': 16, 'hygiene': hygiene,
              'asset': art.alpha_report(TARGET), 'frames': records}
    dest = ROOT / 'docs/art-provenance/star-ring-sage.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report['asset']))

if __name__ == '__main__':
    main()
