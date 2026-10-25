"""Register generated bloodfiend art; only slice/pad/downscale source-painted VFX."""
import hashlib, json, shutil, uuid
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'art-source/bloodfiend-update'
RESOURCE=ROOT/'assets/resources/art'
def write_meta(path):
    meta=path.with_suffix(path.suffix+'.meta')
    template=json.loads((RESOURCE/'units/bloodfiend/crimson_riftclaw.png.meta').read_text(encoding='utf-8'))
    if meta.exists():
        template=json.loads(meta.read_text(encoding='utf-8'))
    else:
        old=template['uuid'];new=str(uuid.uuid4())
        template=json.loads(json.dumps(template).replace(old,new).replace('crimson_riftclaw',path.stem))
    w,h=Image.open(path).size
    for sub in template['subMetas'].values():
        d=sub.get('userData',{})
        if sub['importer']=='sprite-frame':
            d.update({'trimType':'custom','trimX':0,'trimY':0,'width':w,'height':h,'rawWidth':w,'rawHeight':h,'offsetX':0,'offsetY':0,'rotated':False})
            if 'vertices' in d:
                d['vertices']['rawPosition']=[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0]
                d['vertices']['uv']=[0,h,w,h,0,0,w,0]
                d['vertices']['nuv']=[0,0,1,0,0,1,1,1]
                d['vertices']['minPos']=[-w/2,-h/2,0];d['vertices']['maxPos']=[w/2,h/2,0]
    meta.write_text(json.dumps(template,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def alpha_report(path):
    im=Image.open(path).convert('RGBA');alpha=im.getchannel('A');hist=alpha.histogram()
    return {'file':str(path.relative_to(ROOT)).replace('\\','/'),'width':im.width,'height':im.height,'transparentFraction':hist[0]/(im.width*im.height),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    report=[]
    for source,target in [('voidscar_blood','units/shadow/voidscar_reaver'),('crimson_devourer_cutout','units/bloodfiend/crimson_devourer')]:
        src=RAW/(source+'.png')
        if not src.exists():continue
        out=RESOURCE/(target+'.png');out.parent.mkdir(parents=True,exist_ok=True)
        assert alpha_report(src)['transparentFraction']>.08, f'{source}: background is not transparent'
        shutil.copy2(src,out);write_meta(out);report.append(alpha_report(out))
    for name in ['crimson_upheaval','bloodline_siphon','voidscar_transit','frostblood_roar']:
        src=RAW/(name+'.png');im=Image.open(src).convert('RGBA')
        assert alpha_report(src)['transparentFraction']>.1
        cells=[im.crop((round(c*im.width/4),round(r*im.height/2),round((c+1)*im.width/4),round((r+1)*im.height/2))) for r in range(2) for c in range(4)]
        # All eight painted shapes use one scale; shifts center each independent effect pivot.
        bounds=[cel.getchannel('A').getbbox() for cel in cells]
        assert all(bounds)
        scale=224/max(max(b[2]-b[0],b[3]-b[1]) for b in bounds)
        sheet=Image.new('RGBA',(1024,512))
        frames=[]
        for i,(cel,b) in enumerate(zip(cells,bounds)):
            painted=cel.crop(b);painted=painted.resize((max(1,round(painted.width*scale)),max(1,round(painted.height*scale))),Image.Resampling.LANCZOS)
            sheet.alpha_composite(painted,((i%4)*256+(256-painted.width)//2,(i//4)*256+(256-painted.height)//2))
            frames.append({'index':i,'sourceRect':[round(i%4*im.width/4),round(i//4*im.height/2),cel.width,cel.height],'sourceAlphaBounds':b,'paintedSize':[painted.width,painted.height]})
        out=RESOURCE/'fx'/f'{name}.png';sheet.save(out);write_meta(out)
        report.append({**alpha_report(out),'grid':[4,2],'cell':[256,256],'frames':frames,'scale':scale})
    path=ROOT/'docs/art-provenance/bloodfiend-generated.json';path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps({'route':'host_image','sources':'art-source/bloodfiend-update/manifest.json','assets':report},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
