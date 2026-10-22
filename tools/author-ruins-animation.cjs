// Run in the Creator scene process through MCP. Refuses to overwrite authored assets.
module.exports = async function author({cc}) {
 const fs=require('node:fs'),path=require('node:path'),ts=require('../node_modules/typescript');
 const root=path.resolve(__dirname,'..'),out=path.join(root,'assets/resources/animations/ruins-background');
 const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(root,'assets/scripts/view/FloatingRuinsP2Bindings.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
 const b=fs.readFileSync(path.join(root,'assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb'));
 const glb=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 fs.mkdirSync(out,{recursive:true});const report=[];
 for(const spec of exports.RUINS_MOTIONS){
  const file=path.join(out,spec.name+'.anim');if(fs.existsSync(file))throw Error('Preserve existing authored clip: '+file);
  const node=glb.nodes.find(n=>n.name===spec.name);if(!node)throw Error('Missing exported pivot '+spec.name);
  if(node.rotation||node.scale)throw Error('Re-author non-identity baseline explicitly: '+spec.name);
  const base=node.translation||[0,0,0],clip=new cc.AnimationClip();clip.name=spec.name;clip.duration=spec.period;
  clip.sample=60;clip.wrapMode=cc.AnimationClip.WrapMode.Loop;clip.enableTrsBlending=false;
  const vector=(property,values)=>{const track=new cc.animation.VectorTrack();track.componentsCount=3;
   track.path.toProperty(property);track.channels().slice(0,3).forEach((channel,axis)=>channel.curve.assignSorted(values.map(([t,v])=>[t,v[axis]])));clip.addTrack(track);};
  if(spec.kind==='ring')vector('eulerAngles',[[0,[0,0,0]],[spec.period,[0,360*spec.direction,0]]]);
  else {
   const values=Array.from({length:65},(_,i)=>{const a=i===64?spec.phase:i*Math.PI*2/64+spec.phase;
    return [i*spec.period/64,[base[0],base[1]+(spec.kind==='crystal'?.12:0)+spec.amplitude*Math.sin(a),base[2]]];});
   vector('position',values);
   if(spec.kind==='rock') {
    const track=new cc.animation.QuatTrack();track.path.toProperty('rotation');
    const values=Array.from({length:65},(_,i)=>{const a=i===64?spec.phase:i*Math.PI*2/64+spec.phase;
     const x=spec.tilt*Math.sin(a)/2,z=spec.tilt*Math.cos(a)/2;
     return [i*spec.period/64,{value:new cc.Quat(Math.sin(x)*Math.cos(z),-Math.sin(x)*Math.sin(z),Math.cos(x)*Math.sin(z),Math.cos(x)*Math.cos(z))}];});
    track.channel.curve.assignSorted(values);clip.addTrack(track);
   }
  }
  fs.writeFileSync(file,cce.Utils.serialize(clip));
  report.push({name:spec.name,kind:spec.kind,duration:clip.duration,tracks:clip.tracksCount,base,keys:spec.kind==='ring'?2:65});
 }
 fs.writeFileSync(path.join(root,'docs/evidence/cocos-background-animation/authored-clips.json'),JSON.stringify(report,null,2));
 return {clips:report.length,folder:out};
};
