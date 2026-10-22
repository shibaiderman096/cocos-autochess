// Run through Creator MCP after importing the authored clips.
module.exports=async function({cc}) {
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
 const dest=path.join(root,'assets/resources/backgrounds/RuinsBackground.prefab');
 if(fs.existsSync(dest))throw Error('Preserve authored prefab '+dest);
 const folder=path.join(root,'assets/resources/animations/ruins-background');
 const modelPath=path.join(root,'assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb');
 const modelMeta=JSON.parse(fs.readFileSync(modelPath+'.meta','utf8'));
 const source=Object.values(modelMeta.subMetas).find(s=>s.importer==='gltf-scene'&&s.name.endsWith('.prefab'));if(!source)throw Error('Model prefab missing');
 const load=uuid=>new Promise((resolve,reject)=>cc.assetManager.loadAny({uuid},(e,a)=>e?reject(e):resolve(a)));
 const prefabSource=await load(source.uuid),node=cc.instantiate(prefabSource);node.name='RuinsBackground';
 const all=[];const visit=n=>{all.push(n);n.children.forEach(visit)};visit(node);let count=0;
 try {
  for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.anim'))){
   const clip=await load(JSON.parse(fs.readFileSync(path.join(folder,file+'.meta'),'utf8')).uuid);
   const pivot=all.find(n=>n.name===clip.name);if(!pivot)throw Error('Missing pivot '+clip.name);
   const animation=pivot.addComponent(cc.Animation);animation.clips=[clip];animation.defaultClip=clip;animation.playOnLoad=false;count++;
  }
  if(count!==17)throw Error('Expected 17 authored clips');
  const prefab=new cc.Prefab();prefab.name=node.name;prefab.data=node;
  const helper=require('../extensions/funplay-cocos-mcp/lib/prefab-metadata');
  const metadata=helper.attachPrefabMetadata(node,prefab,{prefabUtils:cc.Prefab._utils});
  const content=cce.Utils.serialize(prefab);helper.assertSerializedPrefabMetadata(content);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);
  return {file:dest,animationComponents:count,metadata};
 } finally {node.destroy();}
};
