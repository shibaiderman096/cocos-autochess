const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('tsx/cjs');const art=require('../assets/scripts/view/ArtPaths.ts');
const pending=[];
class Vec3 {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}static lerp(out,a,b,t){out.x=a.x+(b.x-a.x)*t;out.y=a.y+(b.y-a.y)*t;}}
class Node {
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new Vec3();this.scale=new Vec3(1,1,1);}
 addChild(node){node.parent=this;this.children.push(node);}getChildByName(name){return this.children.find(node=>node.name===name);}
 addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
 setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new Vec3(x,y,z);}setScale(x,y,z){this.scale=typeof x==='object'?x.clone():new Vec3(x,y,z);}
 setSiblingIndex(i){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(i,0,this);}destroy(){this.isValid=false;this.active=false;}
}
class UITransform{setContentSize(width,height){this.contentSize={width,height};}}
class Sprite{static SizeMode={CUSTOM:1};}class UIOpacity{opacity=255;}class Color{constructor(...rgba){this.rgba=rgba;}}
const cc={Node,Vec3,Sprite,SpriteFrame:class{destroy(){}},Texture2D:class{},Rect:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},Size:class{constructor(width,height){Object.assign(this,{width,height});}},UITransform,UIOpacity,Color,Component:class{},_decorator:{ccclass:()=>T=>T},resources:{load:(path,T,callback)=>pending.push({path,callback})},tween:()=>({to(){return this;},call(){return this;},start(){}})};
const cache={};function load(file){if(cache[file])return cache[file];const exports={};cache[file]=exports;
 new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText)(name=>name==='cc'?cc:name==='./GameAudio'?{GameAudio:{play(){}}}:name==='./ArtPaths'?art:name==='./ShadowSkillVfx'?load('assets/scripts/view/ShadowSkillVfx.ts'):name==='./BloodfiendVfx'?load('assets/scripts/view/BloodfiendVfx.ts'):{},exports);return exports;}
const {ShadowSkillVfx}=load('assets/scripts/view/ShadowSkillVfx.ts');
const root=new Node('fx'),owner=new Node('owner');const vfx=new ShadowSkillVfx(root,56,50,id=>id===1?owner:undefined);
const flush=()=>{while(pending.length){const {path,callback}=pending.shift();callback(null,{name:path,width:1024,height:512});}};
const snapshot=()=>vfx.slots.filter(slot=>slot.layer).map(slot=>({position:{...slot.node.position},scale:{...slot.node.scale},angle:slot.node.angle,opacity:slot.opacity.opacity,active:slot.node.active}));
const effects=['bulwark','bulwarkBurst','domain','piercing','flurry','cleave','empower','flameBurst','execute','lanterns','blackstars','collapse','void','voidMark'];
for(const effect of effects){vfx.play(effect,1,new Vec3(),effect==='empower'?new Vec3():new Vec3(60,45),0,1,4);flush();vfx.update(2);assert.ok(vfx.slots.some(slot=>slot.layer&&slot.node.active),effect+' has loaded animated layers');vfx.clear();}
vfx.play('domain',1,new Vec3(),new Vec3(),0,2,4);flush();vfx.update(4);const frozen=snapshot();vfx.update(4);assert.deepEqual(snapshot(),frozen,'same replay tick freezes every transform and opacity');
vfx.update(8);assert.notDeepEqual(snapshot(),frozen,'advancing clock moves orbiting lamps');
owner.setPosition(120,60,0);vfx.update(9);assert.ok(snapshot().every(s=>s.position.x>60),'orbit follows moving caster');vfx.cancel(1);assert.equal(vfx.slots.filter(s=>s.layer).length,0,'death/cancel removes following buffs');
for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
 vfx.play('cleave',1,new Vec3(),new Vec3(x*60,y*60),0,2);const slash=vfx.slots.find(slot=>slot.layer?.path===art.FX_SPRITE.shadowSlash);
 assert.equal(slash.layer.angle,Math.atan2(y,x)*180/Math.PI+90,'slash faces the full attack vector');vfx.clear();
}
vfx.teleport(1,art.UNIT_ART.voidscar_reaver,new Vec3(),new Vec3(180,90),0);flush();vfx.update(2);assert.equal(vfx.slots.filter(slot=>slot.layer?.motion==='ghost').length,3,'teleport leaves fading art silhouettes');
const ghosts=snapshot();vfx.update(4);assert.notDeepEqual(snapshot(),ghosts);vfx.update(40);assert.equal(vfx.slots.filter(slot=>slot.layer).length,0,'transient effects expire on clock');
for(let i=0;i<100;i++)vfx.play('collapse',1,new Vec3(),new Vec3(60,45),0,2);
assert.ok(vfx.slots.length<=160,'bounded reusable sprite pool');vfx.update(100);const allocated=vfx.slots.length;
vfx.play('bulwark',1,new Vec3(),new Vec3(),101,0,4);assert.equal(vfx.slots.length,allocated,'new event reuses pool');flush();vfx.update(104);
const shield=vfx.slots.find(s=>s.layer?.tag==='shield');assert.equal(shield.node.angle,0,'reuse resets directional state');vfx.play('bulwarkBurst',1,new Vec3(),new Vec3(),105,1);assert.ok(!vfx.slots.some(s=>s.layer?.tag==='shield'),'break removes shield immediately');
vfx.destroy();assert.ok(root.children.every(node=>!node.isValid));
const delayed=new ShadowSkillVfx(new Node('delayed'),56,50,()=>owner);
delayed.play('bulwark',1,new Vec3(),new Vec3(),0,0,4);delayed.cancel(1);delayed.play('domain',1,new Vec3(),new Vec3(),0,2,4);
const reused=delayed.slots[0];pending.shift().callback(null,{name:'obsolete shield'});assert.notEqual(reused.sprite.spriteFrame?.name,'obsolete shield','obsolete callback cannot overwrite reused slot');delayed.destroy();flush();

const {BattleReplayer}=load('assets/scripts/view/BattleReplayer.ts');
const replay=new BattleReplayer(),view={node:new Node('unit'),playCast(){},playDeath(){},playAttack(){}};
const sim={tick:0,events:[],units:[{id:1,cfg:{id:'voidscar_reaver'}}]};
replay.bind(sim,new Map([[1,view]]),56,{boardPixelW:600,cellToWorld:(x,y)=>new Vec3(x*60,y*45)});replay.setFxRoot(new Node('replayFx'));
for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
 replay.play({t:'skill_pulse',tick:0,id:1,skillId:'soulcleaver_rift',effect:'cleave',center:{x,y},radius:2});
 assert.equal(replay.shadowSkillVfx.slots.find(slot=>slot.layer?.motion==='slash').layer.angle,Math.atan2(y*45,x*60)*180/Math.PI+90,'replayer forwards the actual directional vector');replay.shadowSkillVfx.clear();
}
replay.play({t:'shadow_pulse',tick:10,side:0,damage:true,attackSpeed:false});assert.ok(replay.shadowSkillVfx.slots.some(s=>s.layer?.opacity===65),'half-second damage pulse animates the board');
const targetView={node:new Node('meleeTarget')};replay.unitViews.set(2,targetView);
const meleeUnits=require('../assets/resources/config/units.json').filter(unit=>unit.range===1&&art.UNIT_ART[unit.artId??unit.id]?.includes('/units/shadow/'));
assert.equal(meleeUnits.length,4);
for(const unit of meleeUnits)for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
 sim.units[0].cfg=unit;targetView.node.setPosition(x*60,y*45,0);replay.shadowSkillVfx.clear();
 const before=pending.length;replay.play({t:'attack',tick:1,id:1,target:2,shadow:true});
 const basic=replay.shadowSkillVfx.slots.find(slot=>slot.layer?.motion==='slash');assert.ok(basic,unit.id+' has a close-range slash');
 assert.equal(basic.layer.angle,Math.atan2(y*45,x*60)*180/Math.PI+90);
 assert.ok(pending.slice(before).every(request=>request.path!==art.FX_SPRITE.shadowProjectile),'melee never fires the fog cannonball');flush();
}
sim.units[0].cfg=meleeUnits[0];replay.shadowSkillVfx.clear();replay.play({t:'attack',tick:2,id:1,target:2});
assert.ok(replay.shadowSkillVfx.slots.some(slot=>slot.layer?.motion==='slash'),'melee animation also works before trait activation');flush();
sim.units[0].cfg={...meleeUnits[0],range:4};replay.shadowSkillVfx.clear();replay.play({t:'attack',tick:3,id:1,target:2,shadow:true});
assert.equal(pending.at(-1).path,art.FX_SPRITE.shadowProjectile,'ranged shadow attacks keep the fog projectile');flush();
replay.play({t:'end',tick:10,winner:0});assert.equal(replay.shadowSkillVfx.slots.filter(s=>s.layer).length,0,'battle end clears cosmetic layers');replay.onDestroy();flush();
for(const item of require('../art-source/shadow-animations/manifest.json')){const png=fs.readFileSync(item.path);assert.equal(png[25],6);assert.equal(png.readUInt32BE(16),item.width);assert.equal(png.readUInt32BE(20),item.height);}
console.log('PASS shadow skill animation: all effect kinds, eight directions at replay callsite, fixed-clock movement/pause/expiry, follow/cancel, bounded reuse, delayed callback safety, teleport silhouettes, half-second board pulse, end cleanup and transparent assets (no renderer)');
