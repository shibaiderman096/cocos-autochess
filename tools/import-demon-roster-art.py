"""Import supplied demon portraits and register generated painted FX without redrawing pixels."""
from pathlib import Path
import argparse, hashlib, importlib.util, json, shutil, sys
from PIL import Image

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
PORTRAITS={
    'redhorn_imp':'ChatGPT 图像 2026年10月28日 20_57_54.png',
    'hellflame_hound':'ChatGPT 图像 2026年10月28日 20_58_04.png',
    'saien':'猩红魔铠的深渊骑士.png',
    'infernal_axe_guard':'ChatGPT 图像 2026年10月28日 22_05_21.png',
}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--portraits',action='store_true');parser.add_argument('--fx',action='append',default=[]);parser.add_argument('--portrait',action='append',default=[])
    args=parser.parse_args()
    spec=importlib.util.spec_from_file_location('blood_art',ROOT/'tools/import-bloodfiend-art.py')
    art=importlib.util.module_from_spec(spec);spec.loader.exec_module(art)
    dest=ROOT/'docs/art-provenance/demon-roster.json'
    report=json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else {'portraits':{},'effects':{}}
    if args.portraits:
        for id,name in PORTRAITS.items():
            source=Path('C:/Users/man/Downloads')/name;target=ROOT/f'assets/resources/art/units/demon/{id}.png'
            shutil.copyfile(source,target);art.write_meta(target)
            report['portraits'][id]={'route':'User supplied, unchanged framing','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    for item in args.portrait:
        id,path=item.split('=',1);source=Path(path);target=ROOT/f'assets/resources/art/units/demon/{id}.png'
        shutil.copyfile(source,target);art.write_meta(target)
        report['portraits'][id]={'route':'User supplied, unchanged framing' if source.parent==Path('C:/Users/man/Downloads') else 'Built-in image_gen background removal','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    for item in args.fx:
        id,path=item.split('=',1);source=Path(path);raw=ROOT/f'art-source/demon-roster/{id}_raw.png'
        raw.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,raw)
        image=Image.open(raw).convert('RGBA');sheet=Image.new('RGBA',(1024,768));frames=[]
        for row in range(3):
            cels=[]
            for col in range(4):
                rect=tuple(round(n) for n in (col*image.width/4,row*image.height/3,(col+1)*image.width/4,(row+1)*image.height/3))
                cel=image.crop(rect);alpha=cel.getchannel('A');box=alpha.point(lambda a:255 if a>16 else 0).getbbox()
                if box is None:raise ValueError(f'Empty generated cel {id}:{row}:{col}')
                cel.putalpha(alpha.point(lambda a:0 if a<=4 else a));cels.append((cel.crop(box),rect,box,cel.size))
            scale=176/max(max(c.width,c.height) for c,_,_,_ in cels)
            for col,(cel,rect,box,source_size) in enumerate(cels):
                size=(max(1,round(cel.width*scale)),max(1,round(cel.height*scale)))
                cel=cel.convert('RGBa').resize(size,Image.Resampling.LANCZOS).convert('RGBA')
                cel.putalpha(cel.getchannel('A').point(lambda a:0 if a<=4 else a))
                offset=(40 if id in ('hellhound_breath','thornchain_pull') and row==1 else 216-size[0] if id=='infernal_gunfire' and row==2 else (256-size[0])//2,(256-size[1])//2)
                if id=='raven_soul_theft' and row==1:
                    offset=(128+round((box[0]-source_size[0]/2)*scale),128+round((box[1]-source_size[1]/2)*scale))
                sheet.alpha_composite(cel,(col*256+offset[0],row*256+offset[1]))
                frames.append({'index':row*4+col,'sourceRect':rect,'size':size,'offset':offset})
        target=ROOT/f'assets/resources/art/fx/{id}.png';sheet.save(target,optimize=True,compress_level=9);art.write_meta(target)
        report['effects'][id]={'route':'Built-in image_gen','art_source':'host_image','model':'Tool-managed','estimateUsd':None,
            'sourceSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'prompts':'tools/demon-roster-vfx-prompts.json',
            'grid':[4,3],'cell':[256,256],'padding':40,'frames':frames,'asset':art.alpha_report(target)}
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'portraits':len(report['portraits']),'paintedEffects':len(report['effects'])}))

if __name__=='__main__':main()
