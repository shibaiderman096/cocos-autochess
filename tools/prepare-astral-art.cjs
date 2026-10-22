// Package generated native-alpha PNGs without changing their pixels or registration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'art-source/astral-v2');
const template=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/art/fx/sunlight_field.png.meta'),'utf8'));
const report=[];
for(const name of ['tile','ring','meteor','impact']){
  const src=path.join(source,`astral-${name}-source.png`),data=fs.readFileSync(src);
  const w=data.readUInt32BE(16),h=data.readUInt32BE(20),id=crypto.randomUUID();
  const file=path.join(root,`assets/resources/art/fx/astral_${name}.png`);
  fs.copyFileSync(src,file);
  // Preserve existing UUIDs when repackaging.
  const meta=fs.existsSync(file+'.meta')?JSON.parse(fs.readFileSync(file+'.meta','utf8')):
    JSON.parse(JSON.stringify(template).replaceAll(template.uuid,id).replaceAll('sunlight_field',`astral_${name}`));
  const d=meta.subMetas.f9941.userData;
  Object.assign(d,{offsetX:0,offsetY:0,trimX:0,trimY:0,width:w,height:h,rawWidth:w,rawHeight:h,trimType:'none',packable:false});
  Object.assign(d.vertices,{rawPosition:[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
    uv:[0,h,w,h,0,0,w,0],minPos:[-w/2,-h/2,0],maxPos:[w/2,h/2,0]});
  fs.writeFileSync(file+'.meta',JSON.stringify(meta,null,2)+'\n');
  report.push({name,width:w,height:h,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),
    resource:`art/fx/astral_${name}/spriteFrame`,source:path.relative(root,src),runtime:path.relative(root,file)});
}
fs.writeFileSync(path.join(source,'runtime-assets.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
