"""Import painted portraits/VFX; slicing, padding and resizing only."""
from pathlib import Path
import importlib.util, sys, json, hashlib, shutil
from PIL import Image
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('blood_art',ROOT/'tools/import-bloodfiend-art.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
RAW=ROOT/'art-source/demon-knight';ART=ROOT/'assets/resources/art'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def portrait(src,out):
    assert module.alpha_report(src)['transparentFraction']>.08,src
    shutil.copy2(src,out);module.write_meta(out)
    return module.alpha_report(out)
def sheet(src,out):
    im=Image.open(src).convert('RGBA');cells=[]
    for i in range(8):
        c,r=i%4,i//4
        cells.append(im.crop((round(c*im.width/4),round(r*im.height/2),round((c+1)*im.width/4),round((r+1)*im.height/2))))
    bounds=[cel.getchannel('A').getbbox() for cel in cells];assert all(bounds)
    scale=224/max(max(b[2]-b[0],b[3]-b[1]) for b in bounds)
    atlas=Image.new('RGBA',(1024,512))
    for i,(cel,b) in enumerate(zip(cells,bounds)):
        cel=cel.crop(b);cel=cel.resize((max(1,round(cel.width*scale)),max(1,round(cel.height*scale))),Image.Resampling.LANCZOS)
        atlas.alpha_composite(cel,((i%4)*256+(256-cel.width)//2,(i//4)*256+(256-cel.height)//2))
    atlas.save(out);module.write_meta(out)
    return {**module.alpha_report(out),'grid':[4,2],'cell':[256,256],'sourceAlphaBounds':bounds,'scale':scale}
report={'route':'Built-in image_gen','art_source':'host_image','model':'Tool-managed, not exposed','estimateUsd':None,
    'prompts':'demon-knight-prompts.json','referenceSha256':digest(Path('C:/Users/man/Downloads/赤晶腐化恶魔骑士.png')),'assets':[]}
report['assets'].append(portrait(RAW/'cutout.png',ART/'units/bloodfiend/crimson_demon_knight.png'))
for name in ['blood_rebirth','blood_cleave']:report['assets'].append(sheet(RAW/(name+'.png'),ART/'fx'/(name+'.png')))
(ROOT/'docs/art-provenance/demon-knight.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
