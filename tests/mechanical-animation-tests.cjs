require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {FX_SPRITE,UNIT_ART}=require('../assets/scripts/view/ArtPaths.ts');
const pending=[];
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}static lerp(o,a,b,t){o.x=a.x+(b.x-a.x)*t;o.y=a.y+(b.y-a.y)*t;return o;}}
class N {
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new V();this.angle=0;}
 addChild(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);n.parent=this;this.children.push(n);}
 getChildByName(name){return this.children.find(n=>n.name===name);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
 setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new V(x,y,z);}setScale(x,y,z){this.scale=new V(x,y,z);}
 setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}destroy(){this.isValid=false;for(const n of this.children)n.destroy();}
}
class U {setContentSize(width,height){this.contentSize={width,height};}}
class S {static SizeMode={CUSTOM:1};}class O {opacity=255;}
class Frame {destroy(){this.destroyed=true;}}class Texture{}
const cc={Node:N,Sprite:S,SpriteFrame:Frame,Texture2D:Texture,Rect:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},Size:class{constructor(width,height){Object.assign(this,{width,height});}},UITransform:U,UIOpacity:O,Vec3:V,Color:class {constructor(...rgba){this.rgba=rgba;}},Component:class{},_decorator:{ccclass:()=>c=>c},resources:{load:(path,T,ready)=>pending.push({path,ready})}};
function load(file,imports){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText)(id=>id==='cc'?cc:imports[id]??{},exports);return exports;}
const {MechanicalVfx}=load('assets/scripts/view/MechanicalVfx.ts',{'./ArtPaths':{FX_SPRITE}});
const {BloodfiendVfx}=load('assets/scripts/view/BloodfiendVfx.ts',{'./ArtPaths':{FX_SPRITE}});
const shownText=[];
const float={FloatText:{colorForType:()=>({})},FloatTextPool:{get:()=>({show(text){shownText.push(text);}})}};
const {BattleReplayer}=load('assets/scripts/view/BattleReplayer.ts',{'./GameAudio':{GameAudio:{play(){}}},'./ArtPaths':{FX_SPRITE,UNIT_ART},'./MechanicalVfx':{MechanicalVfx},'./BloodfiendVfx':{BloodfiendVfx},'./FloatText':float});
const flush=()=>{while(pending.length){const {path,ready}=pending.shift();assert.ok(fs.existsSync('assets/resources/'+path.replace('/texture','.png')));ready(null,{width:1024,height:path.includes('mechanical_skills')?1536:512});}};
const project=(x,y)=>new V((x-3)*50,(y-3)*30);
function fixture(mixed=false){
 const battle=require('../assets/resources/config/battle.json');
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:mixed?battle.traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
 const ids=mixed?['bao_zero','turbo_fist_tiger','ripsaw_spider','crimson_riftclaw','bloodline_earl']:['bao_zero','turbo_fist_tiger','arc_repairer','rail_hunter_07','ripsaw_spider','furnace_executioner','atlas'];
 const placements=ids.map((id,i)=>({cfg:{...cfg.getUnit(id),critChance:0},star:id==='arc_repairer'?3:1,side:0,x:i,y:2}));
 placements.push(...[3,5,7].map((y,i)=>({cfg:{...cfg.getUnit('bao_zero'),id:`dummy_${i}`,skillId:undefined,role:undefined,hp:100000,atk:0,armor:0,mr:0},side:1,x:3,y})));
 const sim=new BattleSim(cfg,placements,{seed:1019});sim.units.forEach(u=>{u.atkCd=u.moveCd=100000;u.hp=Math.round(u.cfg.hp*.6);});
 const parent=new N('board');parent.addChild(new N('boardGrid'));const root=new N('fx');parent.addChild(root);
 const views=new Map(sim.units.map(u=>{const node=new N(u.cfg.id);node.setPosition(project(u.x,u.y));parent.addChild(node);return [u.id,{node,sync(){},playHit(){},playDeath(){},playCast(){},playAttack(){},playKnockup(){},side:u.side}];}));
 const replay=new BattleReplayer(),board={cellToWorld:project,boardPixelW:600,boardPixelH:350};replay.bind(sim,views,50,board);replay.setFxRoot(root);sim.start();replay.consumeEvents();flush();
 return {cfg,sim,root,views,replay,fx:replay.mechanicalSprites};
}
const f=fixture();assert.equal(f.fx.frames.length,32);assert.deepEqual({...f.fx.frames[31].rect},{x:768,y:1332,width:256,height:204});
const rows=new Set();
for(const u of f.sim.units.filter(u=>u.side===0)){
 u.x=3;u.y=2;f.views.get(u.id).node.setPosition(project(3,2));u.mana=u.cfg.maxMana;u.atkCd=0;
 for(let i=0;i<24;i++){f.sim.step();f.replay.consumeEvents();f.replay.syncViews(0);for(const s of f.fx.slots)if(s.layer&&s.node.active)rows.add(s.layer.row);}
}
assert.deepEqual([...rows].sort(),[0,1,2,3,4,5,6,7],'all seven drawn skill rows and activation ring reached through actual simulator/replayer');
const source=f.sim.units[0],target=f.sim.units.at(-1);source.overclockUntilTick=f.sim.tick+120;
f.replay.play({t:'mechanical_overclock',id:source.id,tick:f.sim.tick,untilTick:source.overclockUntilTick,emergency:true});
f.replay.syncViews(0);assert.ok(f.fx.slots.some(s=>s.layer?.row===7&&s.node.active));
f.replay.play({t:'mechanical_overclock',id:source.id,tick:f.sim.tick,untilTick:source.overclockUntilTick+40,emergency:true});
assert.equal(f.fx.slots.filter(s=>s.layer?.key===`overclock:${source.id}`).length,1,'refresh has one persistent layer');
// Eight directions through the real replay entry point, not only a geometry helper.
for(const [x,y] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 f.fx.clear();const from=project(3,3),to=project(3+x,3+y);
 f.replay.play({t:'rail_shot',tick:f.sim.tick,id:source.id,target:target.id,from:{x:3,y:3},to:{x:3+x,y:3+y}});
 const beam=f.fx.slots.find(s=>s.layer?.motion==='beam').layer;
 assert.equal(beam.angle,Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI);
 f.views.get(source.id).node.setPosition(from);f.views.get(target.id).node.setPosition(to);
 f.replay.play({t:'skill_impact',tick:f.sim.tick,id:source.id,target:target.id,skillId:'turbo_hunt'});
 assert.equal(f.fx.slots.find(s=>s.layer?.motion==='slash').layer.angle,beam.angle);
}
f.fx.update(f.sim.tick+2);const slot=f.fx.slots.find(s=>s.layer?.motion==='slash');
const frozen=JSON.stringify({pos:slot.node.position,scale:slot.node.scale,angle:slot.node.angle,alpha:slot.opacity.opacity,blend:slot.blend.map(o=>o.opacity)});
f.fx.update(f.sim.tick+2);assert.equal(JSON.stringify({pos:slot.node.position,scale:slot.node.scale,angle:slot.node.angle,alpha:slot.opacity.opacity,blend:slot.blend.map(o=>o.opacity)}),frozen,'pause leaves frames and motion identical');
assert.ok(slot.blend.every(o=>o.opacity>0),'neighbor cels crossfade');
f.fx.update(f.sim.tick+40);assert.ok(f.fx.slots.every(s=>!s.layer),'one-shots expire');
source.hydraulicBulwark={untilTick:f.sim.tick+60,resistanceBonus:20,healAmount:200};
f.replay.play({t:'cast',id:source.id,target:source.id,tick:f.sim.tick,skillId:'hydraulic_bulwark',duration:0});
f.fx.update(f.sim.tick+1);const wall=f.fx.slots.find(s=>s.layer?.motion==='wall');assert.equal(wall.node.parent.name,'mechanicalGround');
f.views.get(source.id).node.setPosition(10,20,0);f.fx.update(f.sim.tick+2);assert.equal(wall.node.position.x,10,'attached wall follows unit');
source.hydraulicBulwark=null;f.fx.update(f.sim.tick+3);assert.equal(wall.layer,undefined,'wall removes at state end');
const rail=f.sim.units.find(u=>u.cfg.id==='rail_hunter_07');rail.pendingCast={skillId:'rail_execution',remainingTicks:20};
f.replay.play({t:'cast',id:rail.id,target:target.id,tick:f.sim.tick,skillId:'rail_execution',duration:1});
rail.pendingCast=null;f.fx.update(f.sim.tick+1);assert.ok(!f.fx.slots.some(s=>s.layer?.tag==='charge'),'interruption cancels charge');
target.burns=[{skillId:'sky_annihilation',untilBattleEnd:true}];const atlas=f.sim.units.find(u=>u.cfg.id==='atlas');
f.replay.play({t:'burn',id:target.id,source:atlas.id,tick:f.sim.tick,duration:20});
f.replay.play({t:'burn',id:target.id,source:atlas.id,tick:f.sim.tick,duration:20});
assert.equal(f.fx.slots.filter(s=>s.layer?.tag==='burn').length,1);atlas.alive=false;
f.replay.play({t:'death',id:atlas.id,tick:f.sim.tick});f.fx.update(f.sim.tick+1);assert.ok(f.fx.slots.some(s=>s.layer?.tag==='burn'),'burn survives caster death');
f.replay.play({t:'death',id:target.id,tick:f.sim.tick});assert.ok(!f.fx.slots.some(s=>s.layer?.tag==='burn'),'victim death clears burn');
for(let i=0;i<220;i++)f.replay.play({t:'skill_impact',tick:f.sim.tick,id:source.id,target:target.id,skillId:'turbo_hunt'});
assert.ok(f.fx.slots.length<=160,'bounded pool');f.replay.play({t:'end',tick:f.sim.tick,winner:0});f.replay.syncViews(0);assert.ok(f.fx.slots.every(s=>!s.layer));
const previous=f.fx;f.replay.bind(f.sim,f.views,50,{cellToWorld:project});assert.equal(previous.disposed,true);assert.ok(previous.slots.length===0);
const late=fixture();const frames=late.fx.frames;late.replay.onDestroy();flush();assert.equal(late.fx.disposed,true);assert.ok(frames.every(frame=>frame.destroyed));
const parent=new N('late'),fx=new MechanicalVfx(parent,50,50,project,()=>undefined,()=>undefined);fx.destroy();flush();assert.equal(fx.frames.length,0,'late resource callback cannot resurrect destroyed renderer');
const dashRoot=new N('mixed-dashes'),dashFx=new MechanicalVfx(dashRoot,50,50,project,()=>undefined,
 id=>({alive:true,skillId:id===1?'stellar_bulwark':'furnace_overload',wall:false,airborne:false,dashing:true,overclockUntil:0,burning:false}));
flush();
dashFx.play({t:'dash',id:1,tick:0,from:{x:2,y:3},to:{x:4,y:3},durationTicks:6});
assert.equal(dashFx.slots.length,0,'star guard charge must not render a mechanical furnace trail');
dashFx.play({t:'dash',id:2,tick:0,from:{x:2,y:3},to:{x:4,y:3},durationTicks:6});
assert.equal(dashFx.slots.length,1,'furnace charge retains its own mechanical trail');dashFx.destroy();
// Actual trait events on a shared member: no skill or text substitutes for activation.
const mixed=fixture(true),spider=mixed.sim.units.find(u=>u.cfg.id==='ripsaw_spider');flush();
for(let i=0;i<120;i++){mixed.sim.step();mixed.replay.consumeEvents();}
const overclock=mixed.sim.events.find(e=>e.t==='mechanical_overclock'&&e.id===spider.id);
assert.ok(overclock&&!overclock.emergency,'three-mechanical timed trigger comes from the sim');
mixed.sim.damage(spider,mixed.sim.units.at(-1),10000000,'true');mixed.sim.resolveDamage();mixed.sim.pendingDamage.length=0;mixed.replay.consumeEvents();
assert.ok(mixed.sim.events.some(e=>e.t==='bloodfiend_revel'&&e.id===spider.id));
const blood=mixed.replay.bloodfiendSprites,mech=mixed.fx;
mixed.replay.syncViews(0,.5);
assert.ok(blood.slots.some(s=>s.layer?.art==='bloodfiendRevel'&&s.layer.owner===spider.id&&s.node.active));
assert.ok(mech.slots.some(s=>s.layer?.activation&&s.layer.follow===spider.id&&s.node.active));
assert.equal(mech.activationFrames.length,8);assert.deepEqual({...mech.activationFrames[7].rect},{x:768,y:256,width:256,height:256});
assert.ok(!shownText.some(t=>['鲜血狂欢','超频','应急超频'].includes(t)),'trait names no longer float over units');
mixed.views.get(spider.id).node.setPosition(17,39,0);blood.update(mixed.sim.tick+.5);mech.update(mixed.sim.tick+.5);
for(const slot of [...blood.slots,...mech.slots].filter(s=>s.layer?.follow===spider.id&&s.node.active))assert.equal(slot.node.position.x,17,'both painted triggers follow the member');
const snapshot=()=>JSON.stringify([...blood.slots,...mech.slots].filter(s=>s.layer).map(s=>({p:s.node.position,a:s.opacity.opacity,f:(s.sprites??s.art).map(a=>a.spriteFrame?.rect)})));
const frozenBoth=snapshot();blood.update(mixed.sim.tick+.5);mech.update(mixed.sim.tick+.5);assert.equal(snapshot(),frozenBoth,'both triggers freeze on a paused replay tick');
const activation=mech.slots.find(s=>s.layer?.activation&&s.layer.follow===spider.id);
mixed.replay.play({...overclock,tick:mixed.sim.tick+1,emergency:true,untilTick:mixed.sim.tick+121});
assert.equal(mech.slots.filter(s=>s.layer?.activation&&s.layer.follow===spider.id).length,1,'emergency refresh restarts one trigger layer');
assert.equal(activation.art[0].node.getComponent(U).contentSize.width,50*2.05,'emergency redraw uses its larger size');
blood.update(mixed.sim.tick+20);mech.update(mixed.sim.tick+20);
assert.ok(!blood.slots.some(s=>s.layer?.art==='bloodfiendRevel'));
assert.ok(!mech.slots.some(s=>s.layer?.activation));assert.equal(spider.bloodfiendStackCount,1,'short visual does not expire the four-second gameplay stack');
mixed.replay.play({t:'bloodfiend_revel',id:spider.id,tick:mixed.sim.tick,untilTick:mixed.sim.tick+80,attackSpeedBonus:.2});
mixed.replay.play({...overclock,tick:mixed.sim.tick});mixed.replay.play({t:'death',id:spider.id,tick:mixed.sim.tick});
assert.ok([...blood.slots,...mech.slots].every(s=>s.layer?.follow!==spider.id),'death clears both trait effects');
mixed.replay.play({t:'end',tick:mixed.sim.tick,winner:0});assert.ok([...blood.slots,...mech.slots].every(s=>!s.layer));
const activationFrames=mech.activationFrames.slice();mixed.replay.onDestroy();assert.ok(activationFrames.every(f=>f.destroyed));
console.log('PASS mechanical drawn animations: seven skills, painted eight-cel trait trigger, shared spider real blood/mechanical events without text, emergency refresh, follow/pause/expiry/death/end cleanup, unchanged gameplay stacks, bounded pool and resource disposal');
