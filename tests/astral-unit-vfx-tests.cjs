const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const pending=[];
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}}
class N {
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new V();}
 addChild(n){n.parent=this;this.children.push(n);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
 getChildByName(name){return this.children.find(n=>n.name===name);}getSiblingIndex(){return this.parent.children.indexOf(this);}setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}
 setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new V(x,y,z);}setScale(x,y,z){this.scale=new V(x,y,z);}destroy(){this.isValid=false;}
}
class S {static SizeMode={CUSTOM:1};}class U {setContentSize(width,height){this.contentSize={width,height};}}class O {opacity=255;}
class G {moveTo(){}lineTo(){}quadraticCurveTo(){}ellipse(){}stroke(){}fill(){}close(){}}
class C {constructor(...values){this.values=values;}}
const cc={Node:N,Sprite:S,UITransform:U,UIOpacity:O,Vec3:V,Graphics:G,Color:C};
function load(file,imports){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText)(id=>id==='cc'?cc:imports[id]??{},out);return out;}
const loader={loadArtSprite:(path,cb)=>pending.push(()=>cb(null,{path}))};
const {astralSprite}=load('assets/scripts/view/AstralArt.ts',{'./ArtSpriteLoader':loader});
const {FX_SPRITE}=require('tsx/cjs')&&require('../assets/scripts/view/ArtPaths.ts');
const {AstralUnitVfx}=load('assets/scripts/view/AstralUnitVfx.ts',{'./AstralArt':{astralSprite},'./ArtPaths':{FX_SPRITE},'./ArtSpriteLoader':loader});
const project=(x,y)=>new V(x*50,y*30),root=new N('fx'),target=new N('target');target.setPosition(100,90,0);
const fx=new AstralUnitVfx(root,50,50,project,()=>target,id=>id===1?'stellar_bulwark':'milu_star_leap');
const dash={t:'dash',tick:1,id:1,from:{x:2,y:3},to:{x:4,y:3},durationTicks:6};
const jump={t:'dash',tick:1,id:2,from:{x:5,y:2},to:{x:6,y:2},durationTicks:4};
const impact={t:'skill_impact',tick:1,id:2,target:3,skillId:'milu_star_leap'};
fx.play(dash);fx.play(jump);fx.play(impact);while(pending.length)pending.shift()();fx.update(3);
assert.equal(fx.slots.length,3);assert.ok(fx.slots.every(s=>s.sprite.node.active&&s.sprite.spriteFrame));
const snapshot=()=>JSON.stringify(fx.slots.map(s=>({position:s.sprite.node.position,scale:s.sprite.node.scale,angle:s.sprite.node.angle,opacity:s.sprite.node.getComponent(O).opacity})));
const before=snapshot();fx.update(3);assert.equal(snapshot(),before,'pause freezes every effect transform');
assert.equal(fx.slots.find(s=>s.path===FX_SPRITE.miluSkillSheet&&s.firstFrame===0).sprite.node.angle,0,'trail follows projected movement vector');
assert.ok(fx.slots.every(s=>s.frames.length===8&&s.frameIndex>0),'fox trail/impact and guardian rush all advance through painted frames');
fx.play({t:'teleport',tick:3,id:1,from:{x:3,y:3},to:{x:2,y:3}});assert.equal(fx.slots.filter(s=>s.motion?.source===1).length,0,'interrupted guard rush clears');
fx.play({t:'death',tick:3,id:2});assert.ok(fx.slots.every(s=>!s.motion));
fx.play({...jump,tick:3});fx.play({t:'dash_stop',tick:4,id:2,at:jump.from});assert.ok(fx.slots.every(s=>!s.motion),'interrupted fox dash clears its trail');
for(let i=0;i<20;i++){fx.play({...dash,tick:i*20});fx.play({...jump,tick:i*20});fx.play({...impact,tick:i*20});fx.update(i*20+15);}
assert.equal(fx.slots.length,3,'same-scene casts reuse native-alpha sprite nodes');
fx.play({...impact,tick:401});fx.play({t:'end',tick:401,winner:0});fx.update(402);assert.ok(fx.slots.every(s=>!s.motion&&!s.sprite.node.active));
fx.play({...impact,tick:402});assert.ok(fx.slots.every(s=>!s.motion),'settled scene cannot restart effects');
const late=new AstralUnitVfx(root,50,50,project,()=>target,()=> 'milu_star_leap');late.play(impact);const node=late.slots[0].sprite.node;late.destroy();while(pending.length)pending.shift()();assert.equal(node.isValid,false);assert.equal(late.slots.length,0);
console.log('PASS Astral painted unit effects: correct assets and trajectory, pause/expiry, guard interruption, death/end, fixed pool reuse and asynchronous destroy cleanup');
const moons=new AstralUnitVfx(root,50,50,project,()=>target,()=> 'moon_triple_arrow');
for(const [x,y]of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 moons.play({t:'moon_arrow',tick:1,id:1,target:2,from:{x:0,y:0},to:{x,y}});moons.update(2);
 const slot=moons.moonSlots.find(s=>s.active);assert.ok(slot.node.active);assert.equal(slot.node.angle,Math.atan2(y*30,x*50)*180/Math.PI);
 const pos=slot.node.position.clone(),opacity=slot.node.getComponent(O).opacity;moons.update(2);assert.deepEqual(slot.node.position,pos);assert.equal(slot.node.getComponent(O).opacity,opacity);
 moons.update(8);assert.ok(moons.moonSlots.every(s=>!s.active&&!s.node.active));
}
assert.equal(moons.moonSlots.length,1,'arrows recycle across eight directions');
moons.play({t:'nebula',tick:10,id:1,center:{x:3,y:3},radius:1,durationTicks:60});moons.update(20);
const cloud=moons.nebulaSlots[0];assert.ok(cloud.node.active);assert.deepEqual(cloud.node.position,project(3,3));
moons.play({t:'death',tick:21,id:1});assert.equal(cloud.active,true,'ground field persists after caster death');
moons.update(70);assert.equal(cloud.node.active,false,'field expires at three seconds');
moons.play({t:'nebula',tick:80,id:1,center:{x:4,y:3},radius:1,durationTicks:60});assert.equal(moons.nebulaSlots.length,1,'field node reused');
moons.play({t:'end',tick:90,winner:0});assert.ok(moons.nebulaSlots.every(s=>!s.active&&!s.node.active));moons.destroy();assert.equal(moons.nebulaSlots.length,0);
console.log('PASS Moon arrows and nebula: eight directions, pause, expiry, object reuse, independent field lifetime and end/destroy cleanup');
const gravity=new AstralUnitVfx(root,50,50,project,()=>target,()=> 'gravity_collapse');
gravity.play({t:'gravity_field',tick:1,id:1,center:{x:2,y:3},radius:2,durationTicks:80});gravity.update(20);
assert.equal(gravity.nebulaSlots[0].node.name,'gravityCollapse');assert.deepEqual(gravity.nebulaSlots[0].node.position,target.position);
target.setPosition(150,180,0);gravity.update(21);assert.deepEqual(gravity.nebulaSlots[0].node.position,target.position,'gravity follows owner');
gravity.play({t:'death',tick:22,id:1});assert.equal(gravity.nebulaSlots[0].node.active,false,'gravity clears when caster dies');
gravity.destroy();

// Real frame selection uses simulated time, including asynchronous first load while paused.
const board=new N('board'),units=new N('units'),overlay=new N('overlay');board.addChild(units);board.addChild(overlay);overlay.layer=17;
const animated=new AstralUnitVfx(overlay,50,50,project,()=>target,()=> 'moon_triple_arrow');
animated.play({t:'moon_arrow',tick:0,id:1,target:2,from:{x:0,y:0},to:{x:2,y:1}});animated.update(2);
const arrow=animated.moonSlots[0];assert.equal(arrow.frameIndex,3);
while(pending.length)pending.pop()(); // Reverse completion must not replace phase 3 with phase 0.
assert.equal(arrow.sprite.spriteFrame.path,FX_SPRITE.moonArrowSheet+'#3,4,2');
assert.equal(arrow.node.layer,overlay.layer);
animated.update(3);assert.equal(arrow.sprite.spriteFrame.path,FX_SPRITE.moonArrowSheet+'#5,4,2');
animated.play({t:'nebula',tick:0,id:2,center:{x:3,y:3},radius:1,durationTicks:60});animated.update(5);
const field=animated.nebulaSlots[0];while(pending.length)pending.pop()();
assert.equal(field.frameIndex,3);assert.equal(field.sprite.spriteFrame.path,FX_SPRITE.nebulaTideSheet+'#3,4,2');
assert.ok(animated.groundRoot.getSiblingIndex()<units.getSiblingIndex(),'painted ground stays below units');
animated.update(5);assert.equal(field.frameIndex,3,'pause freezes the painted frame');
animated.update(15);assert.equal(field.frameIndex,1,'loop wraps after eight frames at 12 fps');
animated.play({t:'gravity_field',tick:15,id:3,center:{x:3,y:3},radius:2,durationTicks:80});animated.update(20);
const hole=animated.nebulaSlots[1];while(pending.length)pending.pop()();
assert.equal(hole.sprite.spriteFrame.path,FX_SPRITE.gravityCollapseSheet+'#3,4,2');
animated.update(60);assert.equal(field.node.active,false);assert.equal(hole.node.active,true);
animated.destroy();assert.equal(animated.groundRoot,undefined);
const loading=new AstralUnitVfx(overlay,50,50,project,()=>target,()=> 'moon_triple_arrow');
loading.play({t:'moon_arrow',tick:0,id:1,target:2,from:{x:0,y:0},to:{x:2,y:0}});
const disposed=loading.moonSlots[0];loading.destroy();while(pending.length)pending.pop()();assert.equal(disposed.sprite.spriteFrame,undefined);
console.log('PASS 3 painted sheets: phase/loop, reversed async loads while paused, owner layer, fields below units and load-after-destroy');
const completed=new AstralUnitVfx(overlay,50,50,project,()=>target,()=> 'milu_star_leap');
completed.play({...jump,tick:0});completed.play({...impact,tick:0});completed.update(2);
while(pending.length)pending.pop()();
const trail=completed.slots.find(s=>s.firstFrame===0),landing=completed.slots.find(s=>s.firstFrame===8);
assert.equal(trail.sprite.spriteFrame.path,FX_SPRITE.miluSkillSheet+'#2,4,4');
assert.equal(landing.sprite.spriteFrame.path,FX_SPRITE.miluSkillSheet+'#9,4,4','landing uses its own eight-frame strip');
const frozen=landing.sprite.spriteFrame;completed.update(2);assert.equal(landing.sprite.spriteFrame,frozen);
completed.update(4);assert.notEqual(landing.sprite.spriteFrame,frozen);completed.destroy();
for(const skill of ['milu_star_leap','stellar_bulwark'])for(const [x,y]of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 const directional=new AstralUnitVfx(overlay,50,50,project,()=>target,()=>skill);
 directional.play({t:'dash',tick:0,id:1,from:{x:0,y:0},to:{x,y},durationTicks:6});directional.update(1);
 assert.equal(directional.slots[0].sprite.node.angle,Math.atan2(y*30,x*50)*180/Math.PI);directional.destroy();
}
while(pending.length)pending.pop()();
console.log('PASS completed fox/guardian: separate eight-frame clips, reverse asynchronous phase, pause, frame changes and eight-direction movement');
