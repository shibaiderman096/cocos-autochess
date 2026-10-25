"""Copy user-reference cutout; slice/pad generated VFX without repainting it."""
import importlib.util,json,hashlib,shutil
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bloodfiend_import',ROOT/'tools/import-bloodfiend-art.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
RAW=ROOT/'art-source/scarlet-enchantress'
source=RAW/'cutout.png';portrait=ROOT/'assets/resources/art/units/bloodfiend/scarlet_enchantress.png'
assert module.alpha_report(source)['transparentFraction']>.1,'cutout must have a real transparent background'
shutil.copy2(source,portrait);module.write_meta(portrait)
im=Image.open(RAW/'fx.png').convert('RGBA');sheet=Image.new('RGBA',(1024,512));cells=[]
for i in range(8):
 x,y=i%4,i//4;cel=im.crop((round(x*im.width/4),round(y*im.height/2),round((x+1)*im.width/4),round((y+1)*im.height/2)))
 cells.append(cel)
bounds=[c.getchannel('A').getbbox() for c in cells];assert all(bounds)
scale=224/max(max(b[2]-b[0],b[3]-b[1]) for b in bounds)
for i,(cel,b) in enumerate(zip(cells,bounds)):
 cel=cel.crop(b);cel=cel.resize((max(1,round(cel.width*scale)),max(1,round(cel.height*scale))),Image.Resampling.LANCZOS)
 sheet.alpha_composite(cel,((i%4)*256+(256-cel.width)//2,(i//4)*256+(256-cel.height)//2))
out=ROOT/'assets/resources/art/fx/scarlet_aid.png';sheet.save(out);module.write_meta(out)
reference=Path('C:/Users/man/Downloads/血色流光中的鬼角少女.png')
report={'route':'Built-in image_gen','reference':{'filename':reference.name,'sha256':hashlib.sha256(reference.read_bytes()).hexdigest()},'prompts':'scarlet-enchantress-prompts.json','assets':[module.alpha_report(portrait),{**module.alpha_report(out),'grid':[4,2],'cell':[256,256],'sourceAlphaBounds':bounds,'scale':scale}]}
(ROOT/'docs/art-provenance/scarlet-enchantress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
