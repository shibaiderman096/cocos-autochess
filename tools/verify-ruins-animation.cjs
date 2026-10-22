// Samples authored .anim curves using Creator's AnimationState, including four loops.
module.exports=async function({cc}) {
 const fs=require('node:fs'),path=require('node:path'),ts=require('../node_modules/typescript'),root=path.resolve(__dirname,'..');
 const loadTS=file=>{const e={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(e,()=>({}));return e;};
 const specs=loadTS('assets/scripts/view/FloatingRuinsP2Bindings.ts').RUINS_MOTIONS,math=loadTS('assets/scripts/view/FloatingRuinsMotion.ts');
 const uuid=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/backgrounds/RuinsBackground.prefab.meta'),'utf8')).uuid;
 const prefab=await new Promise((resolve,reject)=>cc.assetManager.loadAny({uuid},(e,a)=>e?reject(e):resolve(a)));
 const instance=cc.instantiate(prefab),nodes=[];const visit=n=>{nodes.push(n);n.children.forEach(visit)};visit(instance);
 const floors=nodes.filter(n=>n.name.startsWith('SM_Hex_')),floorBefore=JSON.stringify(floors.map(n=>[n.position,n.rotation,n.scale]));
 const rows=[];let maxPositionError=0,maxRotationRadians=0;
 try {
  for(const spec of specs){
   const n=nodes.find(n=>n.name===spec.name),a=n.getComponent(cc.Animation);
   // Read saved sources afresh so editor asset caching cannot hide edits under test.
   const clip=cc.deserialize(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/animations/ruins-background',spec.name+'.anim'),'utf8')));
   a.clips=[clip];a.defaultClip=clip;const state=a.getState(clip.name)||a.createState(clip);
   const base={position:[n.position.x,n.position.y,n.position.z],rotation:[n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w],scale:[n.scale.x,n.scale.y,n.scale.z]};
   let positionError=0,rotationRadians=0;
   for(let i=0;i<=1024;i++){
    const elapsed=i*spec.period/256,expected=math.motionPose(spec,base,elapsed);
    state.setTime(elapsed%clip.duration);state.sample();
    positionError=Math.max(positionError,Math.hypot(...expected.position.map((v,k)=>v-[n.position.x,n.position.y,n.position.z][k])));
    const q=[n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w],dot=Math.min(1,Math.abs(q.reduce((s,v,k)=>s+v*expected.rotation[k],0)));
    rotationRadians=Math.max(rotationRadians,2*Math.acos(dot));
   }
   maxPositionError=Math.max(maxPositionError,positionError);maxRotationRadians=Math.max(maxRotationRadians,rotationRadians);
   state.setTime(0);state.sample();const first=[n.position.clone(),n.rotation.clone()];
   state.setTime(clip.duration);state.sample();
   const seamPosition=cc.Vec3.distance(first[0],n.position),seamRotation=1-Math.abs(cc.Quat.dot(first[1],n.rotation));
   rows.push({name:n.name,duration:clip.duration,tracks:clip.tracksCount,samples:1025,positionError,rotationRadians,seamPosition,seamRotation,loopSeamExact:seamPosition<1e-12&&Math.abs(seamRotation)<1e-12,playOnLoad:a.playOnLoad,trsBlending:clip.enableTrsBlending});
  }
  const report={pass:rows.length===17&&floors.length===56&&maxPositionError<.00013&&maxRotationRadians<.00025&&rows.every(r=>r.loopSeamExact&&!r.playOnLoad&&!r.trsBlending),clips:rows.length,samples:rows.length*1025,maxPositionError,maxRotationRadians,staticTilesUnchanged:floorBefore===JSON.stringify(floors.map(n=>[n.position,n.rotation,n.scale])),rows};
  report.pass=report.pass&&report.staticTilesUnchanged;
  fs.writeFileSync(path.join(root,'docs/evidence/cocos-background-animation/creator-clip-qa.json'),JSON.stringify(report,null,2));return report;
 }finally{instance.destroy();}
};
