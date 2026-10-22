require('tsx/cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readGlb}=require('../tools/floating-ruins-p2-glb.cjs');
const {RUINS_MOTIONS}=require('../assets/scripts/view/FloatingRuinsP2Bindings.ts');
const {motionPose,rotatePoint}=require('../assets/scripts/view/FloatingRuinsMotion.ts');
const art=readGlb('assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb'),g=art.gltf;
const base=n=>({position:n.translation||[0,0,0],rotation:n.rotation||[0,0,0,1],scale:n.scale||[1,1,1]});
const transform=(p,b)=>rotatePoint(p.map((v,i)=>v*b.scale[i]),b.rotation).map((v,i)=>v+b.position[i]);
function vertices(n){return [...art.vertices(n),...(n.children||[]).flatMap(i=>vertices(g.nodes[i]).map(p=>transform(p,base(g.nodes[i]))))];}
const old=readGlb(require('./board-model-path.cjs')('floating-ruins-p1'));
const original=old.gltf.nodes.find(n=>n.name==='SM_Island_Crown'),top=Math.max(...old.vertices(original).map(v=>v[1]));
const cap=g.nodes.find(n=>n.name==='SM_Static_Basalt'),triangles=[];
for(const p of g.meshes[cap.mesh].primitives){const vs=art.attribute(p.attributes.POSITION),indices=art.attribute(p.indices).flat();
 for(let i=0;i<indices.length;i+=3){const t=indices.slice(i,i+3).map(k=>transform(vs[k],base(cap)));if(t.every(v=>Math.abs(v[1]-top)<1e-6))triangles.push(t);}}
assert.equal(triangles.length,6,'Exact original octagonal opaque crown retained in batched model');
function inside(p,t){let pos=false,neg=false;for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],d=(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);pos||=d>1e-6;neg||=d< -1e-6;}return !(pos&&neg);}
let samples=0,occluded=0;const bounds=[];
assert.equal(g.nodes.filter(n=>n.name.startsWith('PIV_')).length,17);
for(const spec of RUINS_MOTIONS){
 const n=g.nodes.find(n=>n.name===spec.name);assert.ok(n&&n.children?.length,spec.name);const b=base(n),vs=vertices(n);
 assert.ok(!g.nodes.some(p=>p.children?.includes(g.nodes.indexOf(n))),'Pivot remains in root basis');
 assert.deepEqual(b.rotation,[0,0,0,1]);assert.deepEqual(b.scale,[1,1,1]);
 if(spec.kind==='crystal')assert.ok(Math.min(...vs.map(v=>Math.abs(v[0]+b.position[0])))*100>335,'Continuous crystal X safety');
 if(spec.kind==='rock')assert.ok((Math.abs(b.position[0])-Math.max(...vs.map(v=>Math.hypot(...v))))*100>335,'Continuous rotating sphere X safety');
 const times=Array.from({length:721},(_,i)=>i*spec.period/720);
 for(let i=0;i<4;i++)times.push((((Math.PI/2+i*Math.PI/2-spec.phase)/(2*Math.PI))%1+1)%1*spec.period);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const time of times){const pose=motionPose(spec,b,time);for(const v of vs){
  const p=transform(v,pose),x=p[0]*100,y=(.8*p[1]-.6*p[2])*100;samples++;
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  if(Math.abs(x)<=335&&Math.abs(y)<=180){assert.equal(spec.kind,'ring');assert.ok(p[1]<top);const ray=[p[0],top,p[2]+(top-p[1])*4/3];assert.ok(triangles.some(t=>inside(ray,t)));occluded++;}
 }}
 for(const time of [.000001,.13,spec.period*.49999,spec.period-.000001]){
  const a=motionPose(spec,b,time),c=motionPose(spec,b,time+spec.period*1000);
  a.position.forEach((v,i)=>assert.ok(Math.abs(v-c.position[i])<1e-8));
  assert.ok(Math.abs(Math.abs(a.rotation.reduce((s,v,i)=>s+v*c.rotation[i],0))-1)<1e-8);
 }
 bounds.push({name:spec.name,phases:times.length,vertices:vs.length,minX,maxX,minY,maxY});
}
const result={pass:true,modelSha256:crypto.createHash('sha256').update(art.bytes).digest('hex'),pivots:17,samples,occludedRingSamples:occluded,phaseSamplesPerPivot:725,bounds,scope:'New actual GLB dynamic safety and periodic poses; existing P2 controller reused, no new combat dependency. Static outer orbits are intentionally not animated.'};
const output=process.env.FLOATING_RUINS_REFERENCE_MOTION_REPORT||'temp/board-test-reports/motion-safety.json';
fs.mkdirSync(require('node:path').dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2));console.log('PASS reference model motion '+JSON.stringify({pivots:17,samples,occluded}));
