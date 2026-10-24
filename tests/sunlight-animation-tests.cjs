require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {FX_SPRITE,UNIT_ART}=require('../assets/scripts/view/ArtPaths.ts');
const pending=[];
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}static lerp(o,a,b,t){o.x=a.x+(b.x-a.x)*t;o.y=a.y+(b.y-a.y)*t;return o;}}
class N {
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new V();}
 addChild(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);n.parent=this;this.children.push(n);}
 getChildByName(name){return this.children.find(n=>n.name===name);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
 setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new V(x,y,z);}setScale(x,y,z){this.scale=new V(x,y,z);}
 setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}destroy(){this.isValid=false;for(const n of this.children)n.destroy();}
}
class U {setContentSize(width,height){this.contentSize={width,height};}setAnchorPoint(x,y){this.anchorPoint={x,y};}}
class S {static SizeMode={CUSTOM:1};}class O {opacity=255;}
const cc={Node:N,Sprite:S,SpriteFrame:class{},UITransform:U,UIOpacity:O,Vec3:V,Color:class {constructor(...rgba){this.rgba=rgba;}},Component:class{},_decorator:{ccclass:()=>c=>c},resources:{load:(path,T,ready)=>pending.push({path,ready})}};
function load(file,imports){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText)(id=>id==='cc'?cc:imports[id]??{},exports);return exports;}
const {SunlightSpriteVfx}=load('assets/scripts/view/SunlightSpriteVfx.ts',{'./ArtPaths':{FX_SPRITE}});
const {BattleReplayer}=load('assets/scripts/view/BattleReplayer.ts',{'./GameAudio':{GameAudio:{play(){}}},'./ArtPaths':{FX_SPRITE,UNIT_ART},'./SunlightSpriteVfx':{SunlightSpriteVfx},'./SunlightVfx':{SunlightVfx:class{play(){}update(){}clear(){}destroy(){}}}});
const flush=()=>{while(pending.length){const {path,ready}=pending.shift();assert.ok(fs.existsSync('assets/resources/'+path.replace('/spriteFrame','.png')));ready(null,{name:path});}};
const project=(x,y)=>new V((x-3)*50,(y-3)*30);
function fixture(){const parent=new N('board');parent.addChild(new N('arenaArt'));parent.addChild(new N('boardGrid'));const unit=new N('owner');parent.addChild(unit);const root=new N('fx');parent.addChild(root);const state={alive:true,shield:100,empowered:true};const fx=new SunlightSpriteVfx(root,50,50,project,()=>unit,{width:600,height:350},()=>state);return {parent,root,unit,state,fx};}
const base={t:'sun_pulse',tick:10,id:1,center:{x:3,y:3},radius:1,duration:1};
const f=fixture();flush();
f.fx.play({...base,effect:'slash',kind:'transit',step:0,from:{x:2,y:3}});
const ordinary=f.fx.slots.find(s=>s.layer?.motion==='slash').layer;f.fx.clear();
f.fx.play({...base,effect:'slash',kind:'transit',step:4,finisher:true,from:{x:2,y:3}});
const finisher=f.fx.slots.find(s=>s.layer?.motion==='slash').layer;
assert.ok(finisher.width>ordinary.width&&finisher.height>ordinary.height&&finisher.seconds>ordinary.seconds,'transit finisher has a larger, longer slash');
assert.ok(f.fx.slots.some(s=>s.layer?.width===2.3),'finisher has an enlarged impact sigil');f.fx.clear();
for(const effect of ['shield','burst','judgment','warning','formation','prayer','bolt','slash','flare']){
 f.fx.play({...base,effect,kind:effect==='formation'?'empower':undefined,targetId:1,from:{x:2,y:2}});f.fx.update(15);
 assert.ok(f.fx.slots.some(s=>s.layer&&s.node.active&&s.opacity.opacity>0),effect);
 const snap=()=>JSON.stringify(f.fx.slots.filter(s=>s.layer).map(s=>[s.node.position,s.node.scale,s.node.angle,s.sprite.node.angle,s.opacity.opacity]));
 const first=snap();f.fx.update(15);assert.equal(snap(),first,'pause freezes '+effect);f.fx.update(17);assert.notEqual(snap(),first,'clock advances '+effect);f.fx.clear();
}
f.fx.play({...base,effect:'board',trait:true});f.fx.play({...base,id:2,effect:'board',trait:true});f.fx.update(210);
assert.equal(f.fx.slots.filter(s=>s.layer?.motion==='field').length,1,'both armies share one terrain overlay');
assert.equal(f.fx.slots.filter(s=>s.layer?.motion==='wave').length,1);
assert.ok(f.fx.slots.filter(s=>s.layer).every(s=>s.node.parent.name==='sunlightGround'));
assert.ok(f.parent.children.indexOf(f.fx.ground)>f.parent.children.findIndex(n=>n.name==='boardGrid'));
assert.ok(f.parent.children.indexOf(f.fx.ground)<f.parent.children.indexOf(f.unit),'terrain is below units');
assert.ok(f.fx.slots.find(s=>s.layer?.motion==='field').node.active,'terrain survives the old 2s introduction');
const field=JSON.stringify(f.fx.slots.filter(s=>s.layer).map(s=>[s.node.position,s.node.scale,s.sprite.node.angle,s.opacity.opacity]));f.fx.update(210);assert.equal(JSON.stringify(f.fx.slots.filter(s=>s.layer).map(s=>[s.node.position,s.node.scale,s.sprite.node.angle,s.opacity.opacity])),field);
f.state.alive=false;f.fx.update(211);assert.ok(f.fx.slots.find(s=>s.layer?.motion==='field').node.active,'terrain survives its original source death');f.state.alive=true;f.fx.clear();
f.fx.play({...base,effect:'shield',kind:'bastion',targetId:1});f.fx.update(15);f.unit.setPosition(75,80,0);f.fx.update(16);assert.equal(f.fx.slots.find(s=>s.layer?.motion==='shield').node.position.x,75);f.state.shield=0;f.fx.update(17);assert.ok(!f.fx.slots.some(s=>s.layer?.tag==='shield'),'shield loss cancels its art');f.fx.clear();
f.fx.play({...base,effect:'formation',kind:'empower'});f.fx.update(15);f.state.empowered=false;f.fx.update(16);assert.ok(!f.fx.slots.some(s=>s.layer?.tag==='empower'));f.fx.clear();
f.fx.play({...base,effect:'judgment'});f.fx.update(15);assert.equal(f.fx.slots.find(s=>s.layer?.motion==='pillar').sprite.node.getComponent(U).anchorPoint.y,.1,'pillar anchors its impact near the target feet');f.fx.update(40);assert.ok(f.fx.slots.every(s=>!s.layer));
for(let i=0;i<300;i++)f.fx.play({...base,effect:'burst'});assert.equal(f.fx.slots.length,192);f.fx.clear();f.fx.play({...base,effect:'judgment'});assert.equal(f.fx.slots.length,192);f.fx.destroy();
// Requests completing after a reset or destruction cannot revive recycled nodes.
const late=fixture();late.fx.play({...base,effect:'judgment'});const old=late.fx.slots[0];late.fx.clear();late.fx.play({...base,effect:'bolt',from:{x:2,y:3}});flush();assert.equal(old.sprite.spriteFrame.name,FX_SPRITE.sunlightArrow);late.fx.destroy();
const disposed=fixture();disposed.fx.play({...base,effect:'judgment'});const dead=disposed.fx.slots[0];disposed.fx.destroy();flush();assert.equal(dead.sprite.spriteFrame,null);
// The actual replay dispatch preserves right-facing arrows and right-convex crescents in all directions.
for(const effect of ['bolt','slash'])for(const [x,y] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 const parent=new N('board'),root=new N('fx');parent.addChild(root);const replay=new BattleReplayer(),unit=new N('owner');
 const sim={tick:12,finished:false,units:[{id:1,cfg:{id:"helion",artId:"helion"},alive:true,hp:100,shield:0,skillAttackSpeedBonus:0}],events:[{...base,effect,...(effect==='slash'?{kind:'transit',finisher:true}:{}),from:{x:3,y:3},center:{x:3+x,y:3+y}}]};
 replay.bind(sim,new Map([[1,{node:unit}]]),50,{boardPixelW:600,boardPixelH:350,cellToWorld:project});replay.setFxRoot(root);replay.consumeEvents();flush();replay.sunlightSprites.update(12);
 const layer=replay.sunlightSprites.slots.find(s=>s.layer?.motion===(effect==='bolt'?'travel':'slash')).layer;
 assert.equal(layer.angle,Math.atan2(y*30,x*50)*180/Math.PI,effect+' direction at the real callsite');
 sim.events.push({t:'end',tick:12,winner:0});replay.consumeEvents();assert.ok(replay.sunlightSprites.slots.every(s=>!s.layer&&!s.node.active));replay.bind(sim,new Map(),50,{});assert.equal(replay.sunlightSprites,null,'rebind destroys the old field/pool');
}
// Every roster member reaches the drawn-effect renderer through real full-mana battle casts.
const units=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const trait=battle.traits.find(t=>t.id==='sunlight'),seen=new Set();
for(const id of trait.members){
 const cfg=new ConfigManager();cfg.setUnits(units);cfg.setSkills(skills);cfg.setBattle({...battle,traits:[]});
 const hero=cfg.getUnit(id),dummy={...cfg.getUnit('helion'),hp:100000,atk:0,range:7,maxMana:0,startMana:0,skillId:undefined};
 const sim=new BattleSim(cfg,[{cfg:hero,side:0,x:3,y:2},...[{x:3,y:3},{x:5,y:5},{x:1,y:5}].map(p=>({cfg:dummy,side:1,...p}))],{seed:1019});sim.units[0].mana=sim.units[0].cfg.maxMana;
 for(let tick=0;tick<140&&!sim.finished;tick++)sim.step();
 const pulses=sim.events.filter(e=>e.t==='sun_pulse'&&e.kind===skills[hero.skillId].sunlight.kind);assert.ok(pulses.length,id+' emits skill-specific art events');assert.ok(pulses.every(e=>Number.isFinite(e.duration)),'cosmetic events serialize without Infinity');
 const test=fixture();test.state.shield=100;test.state.empowered=true;flush();for(const pulse of pulses){test.fx.play(pulse);test.fx.update(pulse.tick+1);for(const slot of test.fx.slots)if(slot.layer&&slot.sprite.spriteFrame)seen.add(id);}assert.ok(seen.has(id),id+' has drawn sprite consumers');test.fx.destroy();
}
assert.equal(seen.size,8);
console.log('PASS drawn sunlight animations: all eight retained real skills, nine transient effects, actual replay eight-direction arrows/slashes, pause/expiry, moving shields, buff cancellation, persistent terrain, both-side deduplication, ground layering, source death, bounded pool, late loads, end/rebind/destroy cleanup');
