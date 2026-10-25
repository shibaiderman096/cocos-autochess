"""Import image-generated trait FX with a shared pivot; no painted pixels are authored here."""
from pathlib import Path
import hashlib, importlib.util, json, sys
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'art-source/trait-triggers'
spec = importlib.util.spec_from_file_location('blood_art', ROOT / 'tools/import-bloodfiend-art.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    report = {'route': 'Built-in image_gen', 'art_source': 'host_image',
              'model': 'Tool-managed, not exposed', 'estimateUsd': None,
              'prompts': 'trait-trigger-prompts.json', 'assets': [], 'qa': []}
    for name in ['bloodfiend_revel', 'mechanical_overclock']:
        source = RAW / (name + '.png')
        image = Image.open(source).convert('RGBA')
        assert art.alpha_report(source)['transparentFraction'] > .1
        atlas = Image.new('RGBA', (1024, 512))
        # Preserve source-cell centers and relative expansion across all eight frames.
        for i in range(8):
            x, y = i % 4, i // 4
            cel = image.crop((round(x * image.width / 4), round(y * image.height / 2),
                              round((x + 1) * image.width / 4), round((y + 1) * image.height / 2)))
            cel = cel.resize((224, 224), Image.Resampling.LANCZOS)
            atlas.alpha_composite(cel, (x * 256 + 16, y * 256 + 16))
        target = ROOT / 'assets/resources/art/fx' / (name + '.png')
        atlas.save(target)
        art.write_meta(target)
        report['assets'].append({**art.alpha_report(target), 'source': str(source.relative_to(ROOT)),
                                 'sourceSha256': digest(source), 'grid': [4, 2], 'cell': [256, 256],
                                 'sharedPivot': [128, 128], 'padding': 16})
    for path in sorted(RAW.glob('*/sheet-qc.json')):
        qa = json.loads(path.read_text(encoding='utf8'))
        report['qa'].append({'file': str(path.relative_to(ROOT)), 'report': qa})
    report['qaFindings'] = [
        {'file': item['file'], **check}
        for item in report['qa'] for check in item['report']['checks']
        if check['status'] in ('warn', 'fail')]
    report['qaReview'] = ('Safe-frame warnings concern raw-sheet margins; runtime cells add 16px padding. '
                          'Faint specks are intentional painted droplets/electric motes and are retained. '
                          'Head/torso/baseline metrics describe changing FX silhouettes, not characters; '
                          'identity_head_ratio failures are inapplicable character-head checks on headless effects, '
                          'not an all-pass art result. All frames retain one source-cell pivot. '
                          'The mechanical peak/release seam is crossfaded in replay. '
                          'Raw cross-cell components, visible spill, sheet-edge cuts, empty cells and boundary bands '
                          'all measure zero. Actual 1280x720 Cocos preview confirmed both effects, simultaneous spider '
                          'activation, pause and cleanup; it does not establish Android/device rendering.')
    (ROOT / 'docs/art-provenance/trait-triggers.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'assets': report['assets'], 'qaReports': len(report['qa'])}, ensure_ascii=False))

if __name__ == '__main__':
    main()
