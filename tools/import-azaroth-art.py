"""Import supplied portrait unchanged and pad generated painted cels for the runtime atlas."""
from pathlib import Path
import hashlib, importlib.util, json, shutil, sys
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]

def main():
    spec = importlib.util.spec_from_file_location('blood_art', ROOT / 'tools/import-bloodfiend-art.py')
    art = importlib.util.module_from_spec(spec); spec.loader.exec_module(art)
    source = Path(sys.argv[1]); generated = Path(sys.argv[2])
    portrait = ROOT / 'assets/resources/art/units/demon/azaroth.png'
    portrait.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, portrait); art.write_meta(portrait)
    raw = ROOT / 'art-source/demon/azaroth_vfx_raw.png'
    raw.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(generated, raw)
    image = Image.open(raw).convert('RGBA'); sheet = Image.new('RGBA', (1024,1024)); records=[]
    for row in range(4):
        cels=[]
        for col in range(4):
            rect=tuple(round(v) for v in (col*image.width/4,row*image.height/4,(col+1)*image.width/4,(row+1)*image.height/4))
            cel=image.crop(rect); alpha=cel.getchannel('A')
            bounds=alpha.point(lambda a:255 if a>16 else 0).getbbox()
            if bounds is None: raise ValueError('Empty generated cel')
            cel.putalpha(alpha.point(lambda a:0 if a<=4 else a)); cels.append((cel.crop(bounds),rect))
        scale=176/max(max(c.width,c.height) for c,_ in cels)
        for col,(cel,rect) in enumerate(cels):
            size=(max(1,round(cel.width*scale)),max(1,round(cel.height*scale)))
            cel=cel.convert('RGBa').resize(size,Image.Resampling.LANCZOS).convert('RGBA')
            cel.putalpha(cel.getchannel('A').point(lambda a:0 if a<=4 else a))
            offset=((256-size[0])//2,(256-size[1])//2)
            sheet.alpha_composite(cel,(col*256+offset[0],row*256+offset[1]))
            records.append({'index':row*4+col,'sourceRect':rect,'size':size,'offset':offset})
    target=ROOT/'assets/resources/art/fx/demon_azaroth.png'
    sheet.save(target,optimize=True,compress_level=9); art.write_meta(target)
    report={'route':'Built-in image_gen','sourceSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
            'portraitSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'grid':[4,4],'cell':[256,256],
            'padding':40,'frames':records,'asset':art.alpha_report(target)}
    (ROOT/'docs/art-provenance/azaroth.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'portrait':str(portrait),'fxBytes':target.stat().st_size,'size':sheet.size}))

if __name__=='__main__': main()
