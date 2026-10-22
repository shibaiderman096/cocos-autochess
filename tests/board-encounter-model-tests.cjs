const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),pending=[];
class Node {
  constructor(name){this.name=name;this.children=[];this.components=new Map();this.events=new Map();this.isValid=true;this.active=true;this.eulerAngles=new Vec3();}
  static EventType={TOUCH_END:'end'};
  addChild(n){n.parent=this;this.children.push(n);}
  addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}
  getChildByName(name){return this.children.find(n=>n.name===name);}
  setPosition(x,y,z){this.position=typeof x==='object'?{...x}:{x,y,z};}
  setRotationFromEuler(v){this.eulerAngles=v.clone();}
  on(type,fn){this.events.set(type,fn);}
  setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}
  destroy(){this.isValid=false;this.parent.children=this.parent.children.filter(n=>n!==this);}
}
class UITransform{setContentSize(w,h){this.width=w;this.height=h;}setAnchorPoint(){}}
class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}}
class AnimationClip{static WrapMode={Normal:0};tracks=[];addTrack(t){this.tracks.push(t);}destroy(){this.destroyed=true;}}
class VectorTrack{constructor(){this.path={toProperty:p=>this.property=p};this.axes=Array.from({length:4},()=>({curve:{assignSorted(values){this.values=values;}}}));}channels(){return this.axes;}}
class Animation{
 static EventType={FINISHED:'finished'};isValid=true;events=new Map();
 addClip(c){this.clip=c;}removeClip(c){assert.equal(c,this.clip);this.clip=null;}
 once(t,f){this.events.set(t,f);}off(t,f){if(this.events.get(t)===f)this.events.delete(t);}
 play(name){this.playing=name;}stop(){this.playing=null;}
 finish(){const f=this.events.get('finished');this.events.delete('finished');f?.();}
}
const env=new Node('FloatingRuinsEnvironment'),scene=new Node('Scene');scene.addChild(env);
let missingHinge=false;
const cc={Node,UITransform,Vec3,Animation,AnimationClip,animation:{VectorTrack},Layers:{Enum:{DEFAULT:1<<30}},Prefab:class{},director:{getScene:()=>scene},
 resources:{load:(p,T,cb)=>pending.push(()=>cb(null,p))},instantiate:p=>{const n=new Node(p);if(p.includes('chest')&&!missingHinge)n.addChild(new Node('PIV_ChestLid'));return n;},isValid:n=>n?.isValid};
const {projectBoardPoint}=require('tsx/cjs')&&require('../assets/scripts/view/BoardPresentation.ts');
const js=ts.transpileModule(fs.readFileSync(root+'/assets/scripts/view/ShopVisitor.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const out={};new Function('require','exports',js)(id=>id==='cc'?cc:require(path.resolve(root,'assets/scripts/view',id+'.ts')),out);
const board=new Node('Board');board.layer=1<<25;
for(let i=0;i<20;i++)for(const kind of ['shop','chest']){
 let clicks=0;const p=projectBoardPoint({x:90,y:-60}),visitor=new out.ShopVisitor(board,p,()=>clicks++,kind);
 visitor.setVisible(false);pending.shift()();assert.equal(visitor.model.active,false);
 assert.equal(visitor.root.children.length,0,'no retired billboard or ellipse');
 assert.ok(Math.abs(visitor.model.position.x-.9)<1e-10);assert.ok(Math.abs(visitor.model.position.z-1)<1e-10);
 visitor.setVisible(true);assert.equal(visitor.model.active,true);const e={};visitor.root.events.get('end')(e);assert.equal(e.propagationStopped,true);
 if(kind==='chest'){
  assert.equal(clicks,0,'claim waits for lid animation');assert.equal(visitor.opening,true);
  visitor.root.events.get('end')({});assert.equal(clicks,0,'double click cannot claim early');
  const clip=visitor.openClip;assert.equal(clip.duration,1.1);assert.equal(clip.wrapMode,AnimationClip.WrapMode.Normal);
  const t=clip.tracks[0];assert.equal(t.property,'eulerAngles');const samples=t.axes[0].curve.values;
  assert.equal(samples.length,67);assert.equal(samples[0][1],0);assert.equal(samples.at(-1)[1],-104);
  assert.ok(Math.min(...samples.map(p=>p[1]))>=-108.000001);
  visitor.lidAnimation.finish();assert.equal(clicks,1);
  visitor.root.events.get('end')({});assert.equal(clicks,1,'finished chest cannot claim twice');
 }
 assert.equal(clicks,1);
 visitor.dispose();visitor.dispose();assert.equal(env.children.length,0,'no leftover models after repeated destroy');
}
const late=new out.ShopVisitor(board,{x:0,y:0},()=>{});late.dispose();pending.shift()();assert.equal(env.children.length,0);
// Hiding or destroying mid-open cancels the pending claim and restores the authored rotation.
let awards=0;const cancelled=new out.ShopVisitor(board,{x:0,y:0},()=>awards++,'chest');pending.shift()();
const anim=cancelled.lidAnimation,clip=cancelled.openClip;
cancelled.root.events.get('end')({});cancelled.lid.eulerAngles.x=-70;cancelled.setVisible(false);
assert.equal(cancelled.lid.eulerAngles.x,0);anim.finish();assert.equal(awards,0);
cancelled.setVisible(true);cancelled.root.events.get('end')({});assert.equal(cancelled.opening,true);
cancelled.dispose();anim.finish();assert.equal(awards,0);assert.equal(clip.destroyed,true);assert.equal(anim.events.size,0);
assert.equal(env.children.length,0);
// Asset load delay/failure and missing hinge must never trap an existing pending reward.
const waiting=new out.ShopVisitor(board,{x:0,y:0},()=>awards++,'chest');waiting.root.events.get('end')({});assert.equal(awards,1);waiting.dispose();pending.shift()();
missingHinge=true;const fallback=new out.ShopVisitor(board,{x:0,y:0},()=>awards++,'chest');pending.shift()();fallback.root.events.get('end')({});assert.equal(awards,2);fallback.dispose();missingHinge=false;
const {readGlb}=require('../tools/floating-ruins-p2-glb.cjs');
for(const [kind,tris] of [['chest',1092],['shop',1964]]){
 const file=root+'/assets/resources/models/board-encounters/ruins-'+kind+'.glb',g=readGlb(file).gltf;
 assert.equal(g.meshes.length,kind==='chest'?2:1);assert.equal(g.materials.length,1);
 const primitives=g.meshes.flatMap(m=>m.primitives);assert.equal(primitives.length,kind==='chest'?2:1);
 assert.equal(primitives.reduce((sum,p)=>sum+g.accessors[p.indices].count/3,0),tris);
 assert.ok(primitives.every(p=>p.attributes.TEXCOORD_0!==undefined));
 if(kind==='chest'){
  assert.equal(g.scenes.length,1,'single scene preserves the existing Cocos resource prefab path');
  const piv=g.nodes.filter(n=>n.name==='PIV_ChestLid');assert.equal(piv.length,1);
  assert.deepEqual(piv[0].children.map(i=>g.nodes[i].name),['SM_Chest_Lid']);
  assert.ok(Math.abs(piv[0].translation[1]-.55)<1e-6&&Math.abs(piv[0].translation[2]+.37)<1e-6,'rear hinge converted to glTF Y-up');
 }
 const material=g.materials[0].pbrMetallicRoughness;assert.ok(material.baseColorTexture);assert.ok(material.metallicRoughnessTexture);
 assert.ok(g.images.length>=2&&g.images.every(im=>im.bufferView!==undefined),'real albedo/metal/rough image data embedded in GLB');
 const qa=JSON.parse(fs.readFileSync(root+'/docs/evidence/'+(kind==='chest'?'chest-opening/source-qa.json':'board-ui-encounters/shop-qa.json'),'utf8'));assert.equal(qa.pass,true);assert.deepEqual(qa.errors,[]);
}
for(const old of ['board_shop','board_boss_chest'])assert.ok(!fs.existsSync(root+'/assets/resources/art/ui/'+old+'.png'),'retired texture removed');
console.log('PASS textured encounter GLBs, actual UI proxy/3D positions, visibility/clicks, 20 reentry/disposal cycles and late callback cleanup');
