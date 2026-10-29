require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {FX_SPRITE}=require('../assets/scripts/view/ArtPaths.ts');
const pending=[];
class Vec3 {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}}
class Node {
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new Vec3();this.angle=0;}
 addChild(node){node.parent=this;this.children.push(node);}addComponent(Type){const value=new Type();value.node=this;this.components.set(Type,value);return value;}
 getComponent(Type){return this.components.get(Type);}setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new Vec3(x,y,z);}
 destroy(){this.isValid=false;for(const node of this.children)node.destroy();}
}
class Transform {setContentSize(width,height){this.contentSize={width,height};}setAnchorPoint(x,y){this.anchor={x,y};}}
class Sprite {static SizeMode={CUSTOM:1};}
class Frame {destroy(){this.destroyed=true;}}
class Opacity {opacity=255;}
const cc={Node,UITransform:Transform,Sprite,SpriteFrame:Frame,Texture2D:class{},UIOpacity:Opacity,Vec3,
 Rect:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},Size:class{constructor(width,height){Object.assign(this,{width,height});}},
 resources:{load:(path,_Type,callback)=>pending.push({path,callback})}};
const compiled=ts.transpileModule(fs.readFileSync('assets/scripts/view/RunicArcanaVfx.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsObject={};new Function('require','exports',compiled)(id=>id==='cc'?cc:{FX_SPRITE},exportsObject);
const {RunicArcanaVfx}=exportsObject;
const flush=()=>{while(pending.length){const {path,callback}=pending.shift();assert.ok(fs.existsSync('assets/resources/'+path.replace('/texture','.png')));callback(null,{width:1024,height:1024});}};
const project=p=>new Vec3(p.x*50,p.y*30),cell=50;
function fixture(){
 const root=new Node('fx');root.layer=17;const owner=new Node('sage');owner.setPosition(100,90,0);let casting=true;
 const lineEnd=(from,to,length)=>{const a=project(from),b=project(to),n=Math.hypot(b.x-a.x,b.y-a.y);return new Vec3(a.x+(b.x-a.x)/n*length*cell,a.y+(b.y-a.y)/n*length*cell);};
 const fx=new RunicArcanaVfx(root,cell,50,()=>owner,project,()=>casting,lineEnd);
 return {root,owner,fx,stop:()=>casting=false};
}
const snapshot=fx=>JSON.stringify(fx.slots.map(s=>({key:s.key,row:s.row,frame:s.frameIndex,position:s.node.position,angle:s.node.angle,
 opacity:s.opacity.opacity,blends:s.blends.map(b=>b.opacity),rects:s.sprites.map(s=>s.spriteFrame?.rect)})));
const f=fixture();f.fx.play({t:'runic_runes',tick:0,id:1,count:3});f.fx.play({t:'cast',tick:0,id:1,skillId:'runic_arcana',duration:.4});
f.fx.update(4.25);assert.equal(f.fx.root.active,false);flush();assert.equal(f.fx.frames.length,16);assert.equal(f.fx.ready,true);
assert.ok(f.fx.slots.every(s=>s.node.active&&s.sprites[0].spriteFrame&&s.node.layer===17));
const charge=f.fx.slots.find(s=>s.key==='charge:1');assert.equal(charge.frameIndex,1,'late load preserves the requested charge phase');
assert.ok(charge.blends.every(b=>b.opacity>0),'adjacent painted cels crossfade');
const frozen=snapshot(f.fx);f.fx.update(4.25);assert.equal(snapshot(f.fx),frozen,'pause freezes frame, orbit and opacity');
const orbit=f.fx.slots.find(s=>s.key==='rune:1:0'),old=orbit.node.position.clone();f.owner.setPosition(130,110,0);f.fx.update(4.25);
assert.equal(orbit.node.position.x-old.x,30);assert.equal(orbit.node.position.y-old.y,20,'runes follow moving owners');
f.stop();f.fx.update(5);assert.ok(!f.fx.slots.some(s=>s.key==='charge:1'));assert.equal(f.fx.slots.filter(s=>s.key?.startsWith('rune:')).length,3,'interruption keeps three runes');
f.fx.play({t:'death',tick:5,id:1});assert.ok(f.fx.slots.every(s=>!s.key&&!s.node.active),'death removes the persistent rune/charge art');f.fx.destroy();
for(const [x,y]of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 const {fx}=fixture();flush();const from={x:3,y:3},to={x:3+x,y:3+y},angle=Math.atan2(y*30,x*50)*180/Math.PI;
 fx.play({t:'runic_missiles',tick:0,id:1,target:2,from,to,count:1});fx.update(4.2);
 const comet=fx.slots.find(s=>s.key?.startsWith('missile:'));assert.ok(Math.abs(comet.node.angle-angle)<1e-8);assert.equal(comet.row,2);
 assert.equal(comet.sprites[0].node.getComponent(Transform).anchor.x,216/256,'painted comet head uses its registered pivot');
 fx.update(9);assert.ok(fx.slots.some(s=>s.key?.startsWith('impact:')),'painted impact appears at arrival');
 fx.play({t:'runic_wave',tick:10,id:1,from,toward:to,length:7,width:1});fx.update(16);
 const beam=fx.slots.find(s=>s.key?.startsWith('wave:'));assert.equal(beam.row,3);assert.equal(beam.node.angle,angle);
 assert.ok(Math.abs(beam.sprites[0].node.getComponent(Transform).contentSize.width*176/256-350)<1e-8,'transparent margins do not shorten the seven-cell beam');
 assert.equal(beam.sprites[0].node.getComponent(Transform).anchor.x,40/256);assert.deepEqual(beam.node.position,new Vec3(150,110,0));
 assert.equal(beam.sprites[0].node.getComponent(Transform).contentSize.height,cell*4.4,'final laser uses the thicker painted envelope');
 const core=fx.slots.find(s=>s.key?.startsWith('waveCore:'));assert.ok(core,'the beam has a brighter painted core');
 assert.equal(core.sprites[0].spriteFrame.rect.height,32,'beam brightness uses the ribbon art instead of scaling its seal');
 assert.ok(Math.abs(core.sprites[0].node.getComponent(Transform).contentSize.width-350)<1e-8);
 const paused=snapshot(fx);fx.update(16);assert.equal(snapshot(fx),paused);fx.update(30);assert.ok(fx.slots.every(s=>!s.key&&!s.node.active));fx.destroy();
}
const pooled=fixture();flush();for(let i=0;i<30;i++){
 pooled.fx.play({t:'runic_missiles',tick:i*30,id:1,target:2,from:{x:0,y:0},to:{x:3,y:2},count:3});
 for(const tick of [i*30+4,i*30+10,i*30+16])pooled.fx.update(tick);
}
assert.ok(pooled.fx.slots.length<=8,'repeated volleys recycle sprite nodes');
pooled.fx.play({t:'runic_runes',tick:900,id:1,count:3});pooled.fx.update(900);pooled.fx.play({t:'end',tick:900,winner:0});
pooled.fx.play({t:'runic_runes',tick:901,id:1,count:1});pooled.fx.update(902);assert.ok(pooled.fx.slots.every(s=>!s.key&&!s.node.active));assert.equal(pooled.fx.root.active,false);
const frames=pooled.fx.frames.slice();pooled.fx.destroy();assert.ok(frames.every(f=>f.destroyed));
for(const end of ['destroy','end']){const late=fixture();late.fx.update(20);if(end==='destroy')late.fx.destroy();else late.fx.play({t:'end',tick:20,winner:0});flush();assert.equal(late.fx.frames.length,0,'late texture completion cannot resurrect a closed replay');}
console.log('PASS painted runic VFX: 16 alpha cels, deferred loading/current phase, crossfade, pause, owner following, interrupt/death, eight-direction comet/beam and range, arrival, pooling, end and late-load cleanup');
