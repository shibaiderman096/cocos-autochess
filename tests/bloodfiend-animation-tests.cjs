require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts'),{BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {FX_SPRITE,UNIT_ART}=require('../assets/scripts/view/ArtPaths.ts');
const {BoardGeometry}=require('../assets/scripts/view/BoardGeometry.ts');
const {offsetToWorld}=require('../assets/scripts/battle/HexMath.ts');
const pending=[];
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}static lerp(o,a,b,t){o.x=a.x+(b.x-a.x)*t;o.y=a.y+(b.y-a.y)*t;return o;}}
class N {constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new V();this.angle=0;}addChild(n){n.parent=this;this.children.push(n);}getChildByName(name){return this.children.find(n=>n.name===name);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new V(x,y,z);}setScale(x,y,z){this.scale=new V(x,y,z);}setSiblingIndex(){}destroy(){this.isValid=false;for(const n of this.children)n.destroy();}}
class U {setContentSize(width,height){this.contentSize={width,height};}}
class S {static SizeMode={CUSTOM:1};}class O {opacity=255;}class F {destroy(){this.destroyed=true;}}
const cc={Node:N,Sprite:S,SpriteFrame:F,Texture2D:class{},Rect:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},Size:class{constructor(width,height){Object.assign(this,{width,height});}},UITransform:U,UIOpacity:O,Vec3:V,Color:class{},Component:class{},_decorator:{ccclass:()=>c=>c},resources:{load:(path,T,ready)=>pending.push({path,ready})}};
function load(file,imports){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText)(id=>id==='cc'?cc:imports[id]??{},exports);return exports;}
const {BloodfiendVfx}=load('assets/scripts/view/BloodfiendVfx.ts',{'./ArtPaths':{FX_SPRITE}});
class Shadow {play(){}teleport(){}cancel(){}clear(){}destroy(){}basicMelee(){}update(){}charge(){}}
const float={FloatText:{colorForType(){}},FloatTextPool:{get:()=>({show(){}})}};
const {BattleReplayer}=load('assets/scripts/view/BattleReplayer.ts',{'./ArtPaths':{FX_SPRITE,UNIT_ART},'./BloodfiendVfx':{BloodfiendVfx},'./ShadowSkillVfx':{ShadowSkillVfx:Shadow},'./GameAudio':{GameAudio:{play(){}}},'./FloatText':float});
const project=(x,y)=>new V(x*50,y*30);
const lineEnd=(a,b,length)=>{const dx=b.x-a.x,dy=(b.y-a.y)*.6,n=Math.hypot(dx,dy);return new V(a.x*50+dx/n*length*50,a.y*30+dy/n*length*50);};
function flush(){while(pending.length){const {path,ready}=pending.shift();assert.ok(fs.existsSync('assets/resources/'+path.replace('/texture','.png')));ready(null,{width:1024,height:512});}}
function fixture(){const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));cfg.setBattle({...require('../assets/resources/config/battle.json'),traits:[]});const ids=['crimson_riftclaw','bloodline_earl','crimson_devourer','voidscar_reaver'];const dummy={...cfg.getUnit('helion'),id:'dummy',hp:100000,atk:0,maxMana:0,skillId:undefined,mr:0,armor:0,critChance:0};const sim=new BattleSim(cfg,[...ids.map((id,i)=>({cfg:{...cfg.getUnit(id),critChance:0},side:0,x:i*2,y:3})),...[0,2,4,6].map(x=>({cfg:dummy,side:1,x,y:4}))],{seed:88});sim.units.forEach(u=>u.atkCd=u.moveCd=100000);const root=new N('fx'),views=new Map(sim.units.map(u=>{const node=new N(u.cfg.id);node.setPosition(project(u.x,u.y));return [u.id,{node,side:u.side,sync(){},playCast(){},playHit(){},playDeath(){},playAttack(){}}];}));const replay=new BattleReplayer();replay.bind(sim,views,50,{cellToWorld:project,lineEndToWorld:lineEnd});replay.setFxRoot(root);sim.start();replay.consumeEvents();return {cfg,sim,views,replay,fx:replay.bloodfiendSprites};}
const f=fixture();flush();assert.equal(f.fx.frames.size,8);assert.deepEqual({...f.fx.frames.get('frostbloodRoar')[7].rect},{x:768,y:256,width:256,height:256});
for(let i=0;i<4;i++){const u=f.sim.units[i];u.hp=300;if(i===3){u.mana=u.cfg.maxMana;u.atkCd=0;}else f.sim.cast(u,f.cfg.getSkill(u.cfg.skillId),f.sim.units[4+i]);}
f.sim.resolveDamage();f.sim.pendingDamage.length=0;f.replay.consumeEvents();flush();
const arts=new Set();for(let t=1;t<=32;t++){f.sim.step();f.replay.consumeEvents();f.replay.syncViews(0,.4);for(const slot of f.fx.slots)if(slot.node.active&&slot.layer)arts.add(slot.layer.art);}
assert.deepEqual([...arts].sort(),['bloodlineSiphon','crimsonUpheaval','frostbloodRoar','voidscarTransit']);
// Projected roar uses its actual finite endpoint, including origins on the last column.
for(const kind of ['line_roar','blood_cleave'])for(const [dx,dy] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 f.fx.clear();const from={x:6,y:3},toward={x:6+dx,y:3+dy};
 const length=kind==='line_roar'?4:2;
 f.replay.play({t:kind,id:3,tick:f.sim.tick,skillId:kind==='line_roar'?'frostblood_roar':'blood_sovereignty',from,toward,length,width:1});
 const slot=f.fx.slots.find(s=>s.layer),end=lineEnd(from,toward,length+(kind==='blood_cleave'?2:0)),start=project(6,3);
 assert.equal(slot.layer.angle,Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI);
 assert.ok(Number.isFinite(slot.layer.size)&&slot.layer.size>0);
 assert.equal(slot.layer.size,Math.hypot(end.x-start.x,end.y-start.y)/50,'painted cleave extends two cells beyond its unchanged hit length');
 f.fx.update(f.sim.tick+2.25);const snapshot=JSON.stringify({position:slot.node.position,scale:slot.node.scale,angle:slot.node.angle,frame:slot.frame,blends:slot.blends.map(o=>o.opacity),alpha:slot.opacity.opacity});
 f.fx.update(f.sim.tick+2.25);assert.equal(JSON.stringify({position:slot.node.position,scale:slot.node.scale,angle:slot.node.angle,frame:slot.frame,blends:slot.blends.map(o=>o.opacity),alpha:slot.opacity.opacity}),snapshot,'pause freezes all sprite state');
 assert.ok(slot.blends.every(o=>o.opacity>0),'neighbor cels crossfade');
}
f.fx.clear();const src=f.sim.units[0];src.pendingCast={skillId:'crimson_upheaval'};f.replay.play({t:'cast',id:src.id,target:5,tick:f.sim.tick,skillId:'crimson_upheaval',duration:.8});f.fx.update(f.sim.tick+1);assert.ok(f.fx.slots.some(s=>s.layer?.motion==='charge'&&s.node.active));src.pendingCast=null;f.fx.update(f.sim.tick+2);assert.ok(f.fx.slots.every(s=>!s.layer),'interrupted charge cancels');
for(let i=0;i<200;i++)f.replay.play({t:'skill_impact',id:src.id,target:5,tick:f.sim.tick,skillId:'bloodline_siphon'});assert.ok(f.fx.slots.length<=96);f.replay.play({t:'death',id:src.id,tick:f.sim.tick});assert.ok(f.fx.slots.every(s=>!s.layer));
f.replay.play({t:'line_roar',id:3,tick:f.sim.tick,skillId:'frostblood_roar',from:{x:0,y:3},toward:{x:1,y:3},length:4,width:1});f.replay.play({t:'end',tick:f.sim.tick,winner:0});assert.ok(f.fx.slots.every(s=>!s.layer));
const aid=fixture();flush();const caster=aid.sim.units[0],recipient=aid.sim.units[1];
aid.replay.play({t:'blood_aid',tick:0,id:caster.id,target:recipient.id,skillId:'scarlet_aid_dance',phase:'arrive',from:{x:0,y:3},to:{x:1,y:3},untilTick:80});
aid.fx.update(20.5);const ward=aid.fx.slots.find(s=>s.layer?.motion==='ward');assert.ok(ward.node.active);assert.equal(ward.layer.art,'scarletAid');
aid.views.get(recipient.id).node.setPosition(100,200,0);aid.fx.update(21);assert.equal(ward.node.position.y,200,'ward follows recipient');
aid.replay.play({t:'death',id:caster.id,tick:21});assert.ok(ward.layer,'gift survives caster death');
aid.fx.update(79.9);assert.ok(ward.layer);aid.fx.update(80);assert.equal(ward.layer,undefined,'ward expires with actual buff');
aid.replay.play({t:'blood_aid',tick:90,id:caster.id,target:recipient.id,skillId:'scarlet_aid_dance',phase:'arrive',from:{x:0,y:3},to:{x:1,y:3},untilTick:170});
aid.replay.play({t:'death',id:recipient.id,tick:91});assert.ok(aid.fx.slots.every(s=>s.layer?.motion!=='ward'),'recipient death clears gift');aid.replay.onDestroy();
const frames=[...f.fx.frames.values()].flat(),old=f.fx;f.replay.bind(f.sim,f.views,50,{cellToWorld:project,lineEndToWorld:lineEnd});assert.ok(old.disposed&&frames.every(frame=>frame.destroyed));
const late=fixture();late.replay.onDestroy();flush();assert.equal(late.fx.frames.size,0,'late callback cannot resurrect destroyed renderer');
// New unbounded logical projection matches every existing authored center exactly.
const geometry=new BoardGeometry(7,8,48);for(const cell of geometry.cells){const p=offsetToWorld(cell.x,cell.y,1,0,0),actual=geometry.projectLogical(p);assert.ok(Math.abs(actual.x-cell.center.x)<1e-10&&Math.abs(actual.y-cell.center.y)<1e-10);}
console.log('PASS bloodfiend painted animations: four offensive timelines and aid ward, 64 cels, eight directions/edge origins, pause/crossfade, interrupted charge, independent ward lifetime, death/end/rebind/late-load cleanup, bounded pool and unchanged board projection');
