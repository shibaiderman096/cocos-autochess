const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('tsx/cjs');const {FX_SPRITE,UNIT_ART}=require('../assets/scripts/view/ArtPaths.ts');
const pending=[];
class Vec3 {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}static lerp(out,a,b,t){out.x=a.x+(b.x-a.x)*t;out.y=a.y+(b.y-a.y)*t;}}
class Node {
  constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new Vec3();}
  addChild(n){n.parent=this;this.children.push(n);}getChildByName(name){return this.children.find(n=>n.name===name);}
  addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
  setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new Vec3(x,y,z);}setScale(x,y,z){this.scale=typeof x==='object'?x:new Vec3(x,y,z);}
  setSiblingIndex(i){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(i,0,this);}destroy(){this.isValid=false;}
}
class UITransform{contentSize={width:100,height:10};setContentSize(width,height){this.contentSize={width,height};}}
class Sprite{static SizeMode={CUSTOM:1};}class Component{isValid=true;}class UIOpacity{opacity=255;}
const cc={Component,Node,Vec3,Sprite,UITransform,UIOpacity,SpriteFrame:class{},Color:class{},Label:class{},LabelOutline:class{},
  Tween:{stopAllByTarget(){}},_decorator:{ccclass:()=>T=>T},
  resources:{load:(path,T,callback)=>pending.push({path,callback})},
  tween:target=>({to(){return this;},call(fn){this.done=fn;return this;},start(){}})};
function load(file){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText)(name=>name==='cc'?cc:name==='./GameAudio'?{GameAudio:{play(){}}}:name==='./ArtPaths'?{FX_SPRITE,UNIT_ART}:name==='./HealthBar'?{healthBarSegments:()=>({health:1,shield:0})}:{},exports);return exports;}
const {BattleReplayer}=load('assets/scripts/view/BattleReplayer.ts');
const {UnitView}=load('assets/scripts/view/UnitView.ts');
const root=new Node('fx'),source={node:new Node('source'),playAttack(){}},target={node:new Node('target')};
const sim={tick:0,units:[{id:1,cfg:{basicAttackFx:'arrow'}}],events:[]};
const replay=new BattleReplayer();replay.bind(sim,new Map([[1,source],[2,target]]),56,{boardPixelW:600,boardPixelH:350});replay.setFxRoot(root);
for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
  source.node.setPosition(0,0,0);target.node.setPosition(x*60,y*60,0);
  const previous=pending.length;sim.events.push({t:'attack',tick:1,id:1,target:2,shadow:true});replay.consumeEvents();
  assert.equal(pending.length,previous+1,'one shadow projectile replaces the base projectile');assert.equal(pending.at(-1).path,FX_SPRITE.shadowProjectile);
  assert.equal(root.children.at(-1).angle,Math.atan2(y,x)*180/Math.PI,'all eight directions point the projectile head forward');
  pending.at(-1).callback(null,{});
}
sim.events.push({t:'shadow_board',tick:0,side:0},{t:'shadow_board',tick:0,side:1});replay.consumeEvents();
const fog=replay.shadowFog;assert.ok(fog);assert.equal(pending.filter(p=>p.path===FX_SPRITE.shadowBoardFog).length,1);
assert.deepEqual(fog.getComponent(UITransform).contentSize,{width:755,height:450});assert.equal(fog.getComponent(Sprite).trim,false);
pending.at(-1).callback(null,{});sim.units=[];sim.tick=100;replay.syncViews(0);
const scale={...fog.scale},opacity=fog.getComponent(UIOpacity).opacity;replay.syncViews(0);assert.deepEqual({...fog.scale},scale);assert.equal(fog.getComponent(UIOpacity).opacity,opacity,'pause freezes fog');
sim.tick=120;replay.syncViews(0);assert.notDeepEqual(fog.scale,scale,'simulation clock animates fog');
sim.events.push({t:'end',tick:120,winner:0});replay.consumeEvents();assert.equal(fog.isValid,false);assert.equal(replay.shadowFog,null);
sim.events.push({t:'shadow_board',tick:0,side:0});replay.consumeEvents();const second=replay.shadowFog;
replay.bind({...sim,events:[],tick:0},new Map(),56,{});assert.equal(second.isValid,false,'rebind clears previous mist, including delayed texture callbacks');
pending.at(-1).callback(null,{});assert.equal(second.isValid,false);
const view=new UnitView();view.node=new Node('unit');view.hpBarContent=new Node('bar');view.hpBarContent.addComponent(UITransform);
view.sync({shadowCorrupted:true,hp:100,maxHp:100,maxMana:0,alive:true},56);
const aura=view.shadowView;assert.ok(aura.active);assert.equal(pending.at(-1).path,FX_SPRITE.shadowWisp);pending.at(-1).callback(null,{});
assert.equal(aura.getComponent(Sprite),undefined,'infection no longer uses a ground-ring sprite');
assert.equal(aura.children.length,3,'three attached wisps form the corruption loop');
view.animateShadowCorruption(10,50,56);
const wispState=()=>aura.children.map(node=>({position:{...node.position},scale:{...node.scale},angle:node.angle,opacity:node.getComponent(UIOpacity).opacity}));
const frozenWisps=wispState();view.animateShadowCorruption(10,50,56);assert.deepEqual(wispState(),frozenWisps,'pause freezes corruption flow');
view.animateShadowCorruption(20,50,56);assert.notDeepEqual(wispState(),frozenWisps,'corruption rises and sways with replay clock');
view.sync({hp:100,maxHp:100,maxMana:0,alive:true},56);assert.equal(aura.active,false,'unmarked snapshot resets reusable view');
view.sync({shadowCorrupted:true,hp:100,maxHp:100,maxMana:0,alive:true},56);assert.equal(view.shadowView,aura,'reuse one aura per unit');
view.playDeath();assert.equal(aura.active,false,'death clears aura immediately');
for(const name of ['shadow_projectile','shadow_board_fog','shadow_corruption','shadow_corruption_wisp']) {
  const file=`assets/resources/art/fx/${name}.png`,png=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.meta','utf8'));
  assert.equal(png[25],6,'RGBA transparent PNG');assert.equal(meta.subMetas.f9941.userData.rawWidth,png.readUInt32BE(16));assert.equal(meta.subMetas.f9941.userData.rawHeight,png.readUInt32BE(20));
}
console.log('PASS shadow VFX: eight projectile directions, transparent dimensions, single fog for both sides, tick-driven motion/pause, event cursor, rebind/end cleanup, persistent/resettable unit aura and death (no renderer)');
