require('tsx/cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const {readGlb}=require('../tools/floating-ruins-p2-glb.cjs');
const {motionPose,rotatePoint,multiplyRotation,overlaySafe}=require('../assets/scripts/view/FloatingRuinsMotion.ts');
const {RUINS_MOTIONS,P1_MODEL_SHA256}=require('../assets/scripts/view/FloatingRuinsP2Bindings.ts');
const {BoardProjectionAdapter}=require('../assets/scripts/view/BoardProjectionAdapter.ts');
const art=readGlb(require('./board-model-path.cjs')('floating-ruins-p1')),g=art.gltf;
assert.equal(crypto.createHash('sha256').update(art.bytes).digest('hex'),P1_MODEL_SHA256);
assert.equal(RUINS_MOTIONS.length,17);assert.equal(new Set(RUINS_MOTIONS.map(s=>s.name)).size,17);
const base=n=>({position:n.translation||[0,0,0],rotation:n.rotation||[0,0,0,1],scale:n.scale||[1,1,1]});
const transform=(p,pose)=>{const v=rotatePoint(p.map((a,i)=>a*pose.scale[i]),pose.rotation);return v.map((a,i)=>a+pose.position[i]);};
function childrenVertices(n){return [...art.vertices(n),...(n.children||[]).flatMap(i=>childrenVertices(g.nodes[i]).map(p=>transform(p,base(g.nodes[i]))))];}
const parents=g.nodes.map(()=>[]);g.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents[c].push(i)));
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const quaternionClose=(a,b)=>assert.ok(Math.abs(Math.abs(a.reduce((n,v,i)=>n+v*b[i],0))-1)<1e-8);
const adapter=new BoardProjectionAdapter();
const crown=g.nodes.find(n=>n.name==='SM_Island_Crown'),crownVertices=art.vertices(crown);
const crownTop=Math.max(...crownVertices.map(p=>p[1]));
const topTriangles=[];
for(const primitive of g.meshes[crown.mesh].primitives){const positions=art.attribute(primitive.attributes.POSITION),indices=art.attribute(primitive.indices).flat();
 for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3).map(k=>transform(positions[k],base(crown)));if(tri.every(p=>Math.abs(p[1]-crownTop)<1e-5))topTriangles.push(tri);}}
assert.ok(topTriangles.length>0,'Actual opaque crown top exists');
function triangleContainsXZ(p,tri){let plus=false,minus=false;for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],c=(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);if(c>1e-5)plus=true;if(c< -1e-5)minus=true;}return !(plus&&minus);}
function signedArea(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
function clip(subject,polygon){let out=subject,sign=Math.sign(signedArea(polygon));
 for(let i=0;i<polygon.length&&out.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
  const input=out;out=[];for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],d=cross(p),e=cross(q);if(d>=-1e-9)out.push(p);if((d<0&&e>0)||(d>0&&e<0)){const t=d/(d-e);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}}
 return out;
}
// Continuous coverage proof: projected crown triangles tile the entire expanded operation rectangle,
// with no positive-area overlaps. This complements, rather than replaces, full-period vertex sampling.
const rectangle=[[-335,-180],[335,-180],[335,180],[-335,180]];
const crownProjected=topTriangles.map(t=>t.map(p=>[p[0]*100,80*p[1]-60*p[2]]));
const pieces=crownProjected.map(t=>clip(t,rectangle)).filter(p=>p.length>=3);
close(pieces.reduce((sum,p)=>sum+Math.abs(signedArea(p)),0),670*360,1e-5);
for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++)assert.ok(Math.abs(signedArea(clip(pieces[i],pieces[j])))<1e-5,'Crown coverage triangles do not overlap in area');
let points=0,occluded=0;const bounds=[],pivotChecks=[];
for(const spec of RUINS_MOTIONS){
 const index=g.nodes.findIndex(n=>n.name===spec.name),n=g.nodes[index];assert.ok(n);assert.equal(parents[index].length,0,'P1 pivot is in root world basis');
 assert.ok(n.children.length);assert.deepEqual(base(n).rotation,[0,0,0,1]);assert.deepEqual(base(n).scale,[1,1,1]);
 const b=base(n),vertices=childrenVertices(n);assert.ok(vertices.length);
 const lo=[0,1,2].map(k=>Math.min(...vertices.map(v=>v[k]))),hi=[0,1,2].map(k=>Math.max(...vertices.map(v=>v[k])));
 if(spec.kind==='ring'){
  close((lo[0]+hi[0])/2,0,1e-5);close((lo[2]+hi[2])/2,0,1e-5);assert.ok(hi[1]<.1,'Ring horizontal about Y pivot');
  const ring=g.nodes[n.children.find(i=>g.nodes[i].name.startsWith('SM_RuneRing_'))],v=art.vertices(ring);
  close(spec.radiusX,Math.max(...v.map(p=>p[0])));close(spec.radiusZ,Math.max(...v.map(p=>p[2])));
 }
 else if(spec.kind==='crystal')assert.ok(lo[1]>=-.001,'Actual crystal pivot is at its base');
 else for(let k=0;k<3;k++)assert.ok(lo[k]<0 && hi[k]>0,'Actual rock pivot lies inside its mesh');
 // Rotation-independent lateral bounds prove safety even between the sampled frames.
 if(spec.kind==='crystal')assert.ok(Math.min(...vertices.map(v=>Math.abs(v[0]+b.position[0])))*100>335);
 if(spec.kind==='rock')assert.ok((Math.abs(b.position[0])-Math.max(...vertices.map(v=>Math.hypot(...v))))*100>335);
 if(spec.kind==='ring')assert.ok(b.position[1]+hi[1]<crownTop);
 for(const t of [0,.000001,.13,1.3,spec.period*.499999,spec.period*.999999]){
  const a=motionPose(spec,b,t),c=motionPose(spec,b,t+spec.period*1000);
  a.position.forEach((v,i)=>close(v,c.position[i],1e-8));quaternionClose(a.rotation,c.rotation);assert.deepEqual(a.scale,b.scale);
 }
 // One-sided limits straddle the seam; speed must stay linear for the rings.
 const seam0=motionPose(spec,b,1e-7),seam1=motionPose(spec,b,spec.period-1e-7);
 seam0.position.forEach((v,i)=>close(v,seam1.position[i],1e-6));quaternionClose(seam0.rotation,seam1.rotation);
 if(spec.kind==='ring'){const a=rotatePoint([1,0,0],motionPose(spec,b,spec.period/4).rotation);close(a[2],-spec.direction);}
 if(spec.kind==='crystal'){assert.ok(spec.period>=3.5&&spec.period<=5);assert.ok(spec.amplitude>=.05&&spec.amplitude<=.10);}
 if(spec.kind==='rock')assert.ok(spec.period>=6&&spec.period<=10);
 // Every cycle phase at 0.5 degree intervals, plus exact sine extrema for each phase.
 const times=Array.from({length:721},(_,i)=>spec.period*i/720);
 for(let k=0;k<4;k++)times.push((((Math.PI/2+k*Math.PI/2-spec.phase)/(2*Math.PI))%1+1)%1*spec.period);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,inner=0;
 for(const t of times){const pose=motionPose(spec,b,t);
  for(const v of vertices){const p=transform(v,pose),s=adapter.toBoard({x:p[0],y:p[1],z:p[2]});points++;
   minX=Math.min(minX,s.x);maxX=Math.max(maxX,s.x);minY=Math.min(minY,s.y);maxY=Math.max(maxY,s.y);
   if(Math.abs(s.x)<=335&&Math.abs(s.y)<=180){
    inner++;assert.equal(spec.kind,'ring',`${spec.name} enters operation safety rectangle`);
    assert.ok(p[1]<crownTop,'Ring remains below real opaque island top');
    const ray=[p[0],crownTop,p[2]+(crownTop-p[1])*4/3];
    assert.ok(topTriangles.some(tri=>triangleContainsXZ(ray,tri)),`${spec.name} not occluded by actual crown at ${t}: ${s.x},${s.y}`);occluded++;
   }
  }
 }
 bounds.push({name:spec.name,phases:times.length,minX,maxX,minY,maxY,insideOperationRectangle:inner});
 pivotChecks.push({name:spec.name,index,children:n.children,localBounds:{lo,hi},base:b});
}
// Check the actual crown on a 5 px lattice as well as every sampled moving vertex.
// This discrete check is not presented as a continuous intersection proof.
for(let x=-335;x<=335;x+=5)for(let y=-180;y<=180;y+=5){
 const ray=[x/100,crownTop,(80*crownTop-y)/60];assert.ok(topTriangles.some(t=>triangleContainsXZ(ray,t)));}
assert.deepEqual(RUINS_MOTIONS.filter(s=>s.kind==='ring').map(s=>s.period),[18,26,36]);
assert.deepEqual(RUINS_MOTIONS.filter(s=>s.kind==='ring').map(s=>s.direction),[1,-1,1]);
// Overlay guard includes the full raster primitive radius, not only its center.
for(let x=-500;x<=500;x+=2)for(let y=-300;y<=300;y+=3)if(overlaySafe(x,y,10))assert.ok(Math.abs(x)-10>=350&&Math.abs(y)+10<=185);

// Execute the actual component with an engine boundary double: lifecycle / TRS / material isolation.
class Vec {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}set(x,y,z,w){Object.assign(this,{x,y,z});if(w!==undefined)this.w=w;return this;}static transformMat4(out,p,m){return out.set(p.x+m.x,p.y+m.y,p.z+m.z);}}
class Quat extends Vec{constructor(){super();this.w=1;}}
class FakeNode{constructor(name){this.name=name;this.children=[];this.position=new Vec();this.rotation=new Quat();this.scale=new Vec(1,1,1);this.isValid=true;this.active=true;this.layer=1;this.worldMatrix=this.position;this.sharedMaterial=Object.freeze({pbr:'untouched'});}
 addChild(n){n.parent=this;this.children.push(n);}removeFromParent(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 setSiblingIndex(i){const p=this.parent;this.removeFromParent();this.parent=p;p.children.splice(i,0,this);}addComponent(C){const c=new C();c.node=this;return c;}
 setPosition(...p){this.position.set(...p);}setRotation(q){this.rotation.set(q.x,q.y,q.z,q.w);}setScale(...p){this.scale.set(...p);}destroy(){this.isValid=false;this.removeFromParent();}}
class Graphics{clear(){}circle(){}fill(){}}
class UITransform{setContentSize(){}}
class Component{constructor(){this.enabledInHierarchy=true;}}
const cc={_decorator:{ccclass:()=>C=>C},Component,Node:FakeNode,Vec3:Vec,Quat,Graphics,Color:Vec,UITransform};
const source=fs.readFileSync('assets/scripts/view/FloatingRuinsEnvironmentAnimator.ts','utf8');
assert.ok(!/Math\.random|setInterval|setTimeout|\.on\(|getMaterialInstance|setProperty|BattleSim|RunSession|BattleReplayer/.test(source));
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const exportsObject={};new Function('require','exports',js)(id=>id==='cc'?cc:require('../assets/scripts/view/'+id.replace('./','')+'.ts'),exportsObject);
const C=exportsObject.FloatingRuinsEnvironmentAnimator,model=new FakeNode('P1'),board=new FakeNode('Board');
const nodes=RUINS_MOTIONS.map(s=>{const n=new FakeNode(s.name),b=base(g.nodes.find(n=>n.name===s.name));n.setPosition(...b.position);n.addChild(new FakeNode('actualMesh'));model.addChild(n);return n;});
board.addChild(new FakeNode('ruins3DSurface'));board.addChild(new FakeNode('dragHighlight'));board.addChild(new FakeNode('units'));board.addChild(new FakeNode('fx'));
const original=nodes.map(n=>[n.position.x,n.position.y,n.position.z,n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w,n.scale.x,n.scale.y,n.scale.z]);
const materials=nodes.map(n=>n.sharedMaterial);let clock=0;
const c=new C();c.now=()=>clock;c.bind(model,board);c.update();clock=7.3;c.update();
const assertRestored=()=>nodes.forEach((n,i)=>assert.deepEqual([n.position.x,n.position.y,n.position.z,n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w,n.scale.x,n.scale.y,n.scale.z],original[i]));
const poseNow=()=>JSON.stringify(nodes.map(n=>[n.position.x,n.position.y,n.position.z,n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w]));
const elapsed=c.elapsedSeconds;c.setPlaying(false);const paused=poseNow();clock+=123;c.update();assert.equal(c.elapsedSeconds,elapsed);assert.equal(poseNow(),paused);c.setPlaying(true);
for(let i=0;i<20;i++){
 c.setQuality('off');assertRestored();assert.equal(c.overlay.node.active,false);clock+=1;c.update();assertRestored();
 c.setQuality(i%2?'high':'low');clock+=.123;c.update();
 c.setVisualMode('2d');assertRestored();clock+=1;c.update();assertRestored();c.setVisualMode('3d');
 c.onDisable();assertRestored();c.onEnable();clock+=.4;c.update();
 c.bind(model,board);assert.equal(board.children.filter(n=>n.name==='floatingRuinsP2Overlay').length,1);
 assert.equal(board.children[0].name,'ruins3DSurface');assert.equal(board.children[1].name,'floatingRuinsP2Overlay');
 assert.ok(board.children.findIndex(n=>n.name==='units')>1);nodes.forEach((n,k)=>assert.equal(n.sharedMaterial,materials[k]));
}
c.dispose();assertRestored();assert.equal(board.children.filter(n=>n.name==='floatingRuinsP2Overlay').length,0);c.dispose();
const bad=new C();model.children.pop();assert.throws(()=>bad.bind(model,board),/missing/);assert.equal(board.children.filter(n=>n.name==='floatingRuinsP2Overlay').length,0);
// Re-run the unchanged P1 392 point contract against the same actual GLB in this P2 invocation.
require('./floating-ruins-p1-tests.cjs');
const result={pass:true,modelSha256:P1_MODEL_SHA256,pivots:17,pivotChecks,motionBounds:bounds,
 dynamicVertexSamples:points,occludedRingSamples:occluded,phaseSamplesPerPivot:725,crownCoverageGridStepPixels:5,
 continuousSafetyCertificate:{crownRectangleCoverage:true,nonOverlappingTriangleArea:670*360,rockBoundingSpheresOutside:true,crystalFixedXOutside:true,ringsAlwaysBelowCrown:true},
 lifecycleSwitchRebindCycles:20,restoredTRS:true,sharedMaterialsUnchanged:true,combatDependencies:0,
 caveat:'Engine boundary double proves lifecycle logic, not actual browser/device rendering or GPU performance.'};
const output=process.env.FLOATING_RUINS_P2_REPORT||'temp/board-test-reports/p2-tests-result.json';
fs.mkdirSync(require('node:path').dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log('PASS P2 motion, dynamic safety, actual GLB pivots, lifecycle and isolation: '+JSON.stringify({pivots:17,points,occluded,lifecycleCycles:20}));
