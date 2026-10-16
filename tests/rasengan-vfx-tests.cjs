// Exercise the real replay component with asynchronous resource loading, without a renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const pending = [];
const tweens = [];
class Vec3 { constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); } clone() { return new Vec3(this.x,this.y,this.z); } }
class Node {
  constructor(name) { this.name=name; this.children=[]; this.isValid=true; }
  addComponent(Type) { const c=new Type(); c.node=this; if(Type===Sprite)this.sprite=c; return c; }
  addChild(n) { this.children.push(n); }
  setPosition(p) { this.position=p; }
  setScale(p) { this.scale=p; }
  destroy() { this.isValid=false; }
}
class UITransform { setContentSize(w,h) { this.node.size=[w,h]; } }
class Sprite { static SizeMode={CUSTOM:1}; }
class Component {}
class UIOpacity {}
const cc={Component,Node,Vec3,Sprite,UITransform,UIOpacity,SpriteFrame:class{},Color:class{constructor(...rgb){this.rgb=rgb;}},
  _decorator:{ccclass:()=>Type=>Type},
  resources:{load:(path,Type,callback)=>pending.push({path,callback})},
  tween:target=>({to(seconds,props){ tweens.push({target,seconds,props}); return this; },call(fn){ this.done=fn; return this; },start(){}}),
};
require('tsx/cjs');
const {FX_SPRITE}=require('../assets/scripts/view/ArtPaths.ts');
const source=fs.readFileSync(require.resolve('../assets/scripts/view/BattleReplayer.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const result={exports:{}};
new Function('require','module','exports',compiled)(name=>name==='cc'?cc:name==='./ArtPaths'?{FX_SPRITE}:{},result,result.exports);
const replayer=new result.exports.BattleReplayer();
const from={node:{position:new Vec3(-60,0)},playAttack(){this.attacked=true;}};
const to={node:{position:new Vec3(60,0)},playHit(){}};
const root=new Node('fx');
const sim={units:[{id:1,cfg:{id:'warrior',skillId:'rasengan'}}],events:[
  {t:'attack',id:1,target:2,tick:1},
  {t:'skill_impact',id:1,target:2,skillId:'rasengan',tick:3},
]};
replayer.bind(sim,new Map([[1,from],[2,to]]),56,{});replayer.setFxRoot(root);replayer.consumeEvents();
assert.equal(from.attacked,true);
assert.deepEqual(pending.map(p=>p.path),[FX_SPRITE.rasenganSmall,FX_SPRITE.rasenganLarge]);
assert.deepEqual(root.children.map(n=>n.size),[[56*.65,56*.65],[56*4.6,56*4.6]]);
pending.forEach(p=>p.callback(null,{}));
assert.equal(tweens[0].seconds,.25);assert.deepEqual(tweens[0].props.position,to.node.position);
assert.equal(tweens[1].seconds,.45);assert.deepEqual(tweens[1].props,{opacity:0});
replayer.consumeEvents();assert.equal(pending.length,2,'events play only once');
sim.units[0].cfg={id:'champion',skillId:'sage_clone_rasengan'};
sim.events.push({t:'attack',id:1,target:2,tick:4});
replayer.consumeEvents();
assert.equal(pending.at(-1).path,FX_SPRITE.rasenganSmall,'Sage Naruto reuses the small Rasengan basic attack');
assert.deepEqual(root.children.at(-1).size,[56*.65,56*.65]);
pending.at(-1).callback(null,{});
assert.equal(tweens.at(-1).seconds,.25);
assert.deepEqual(tweens.at(-1).props.position,to.node.position);
for(const left of [false,true]) {
  from.node.position.x=left?120:-60;
  sim.events.push({t:'skill_impact',id:1,target:2,skillId:'sage_clone_rasengan',tick:4});
  replayer.consumeEvents();
  const effect=root.children.at(-1);
  assert.equal(pending.at(-1).path,FX_SPRITE.sageCloneRasengan);
  assert.equal(effect.position.x,60+(left?1:-1)*56*.65);
  assert.equal(effect.scale?.x??1,left?-1:1,'clone faces target from either side');
  assert.deepEqual(effect.size,[56*2.8,56*(2.8*2/3)]);
  pending.at(-1).callback(null,{});
}
const roster=require('../assets/resources/config/units.json');
for(const id of ['archer','ranger','mage','sorcerer','shaman'])for(const left of [false,true]) {
  const card=roster.find(u=>u.id===id);sim.units[0].cfg=card;
  from.node.position=new Vec3(left?120:-60,-60);
  sim.events.push({t:'attack',id:1,target:2,tick:5});replayer.consumeEvents();
  const effect=root.children.at(-1);
  assert.equal(pending.at(-1).path,FX_SPRITE[card.basicAttackFx]);
  assert.deepEqual(effect.sprite.color.rgb,card.basicAttackTint);
  assert.equal(effect.angle,Math.atan2(60,left?-60:120)*180/Math.PI,'projectile faces its full 2D travel direction');
  pending.at(-1).callback(null,{});
  assert.deepEqual(tweens.at(-1).props.position,to.node.position);
  sim.events.push({t:'skill_impact',id:1,target:2,skillId:card.skillId,tick:6});replayer.consumeEvents();
  assert.ok(pending.at(-1).path);pending.at(-1).callback(null,{});
}
sim.units[0].cfg=roster.find(u=>u.id==='young_sasuke');
sim.events.push({t:'attack',id:1,target:2,tick:7});
replayer.consumeEvents();
assert.equal(pending.at(-1).path,FX_SPRITE.ninjaBolt,'young Sasuke has a basic-attack projectile');
assert.deepEqual(root.children.at(-1).size,[56*1.1,56*(1.1*2/3)],'basic bolt is smaller than the skill bolt');
pending.at(-1).callback(null,{});
for(const pos of [new Vec3(-60,-60),new Vec3(120,-60),new Vec3(60,-120)]) {
  from.node.position=pos;
  sim.events.push({t:'cast',id:1,target:2,skillId:'hybrid_bolt',tick:7});
  const count=pending.length;replayer.consumeEvents();
  assert.equal(pending.length,count+1,'one projectile per actual instant cast');
  assert.equal(pending.at(-1).path,FX_SPRITE.ninjaBolt);
  const effect=root.children.at(-1);
  assert.deepEqual(effect.size,[56*1.8,56*1.2]);
  assert.equal(effect.angle,Math.atan2(to.node.position.y-pos.y,to.node.position.x-pos.x)*180/Math.PI);
  pending.at(-1).callback(null,{});
  assert.equal(tweens.at(-1).seconds,.25);
  assert.deepEqual(tweens.at(-1).props.position,to.node.position);
  replayer.consumeEvents();assert.equal(pending.length,count+1,'cast cursor prevents repeated VFX');
}
for(const name of ['young_sasuke_ninja_bolt','rasengan_small','rasengan_large','sage_clone_rasengan','fx_arrow','fx_fireball','fx_ring','fx_hit','fx_slash']) {
  const path=`assets/resources/art/fx/${name}.png`;
  const png=fs.readFileSync(path);assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png[25],6,'RGBA PNG');
  const meta=JSON.parse(fs.readFileSync(path+'.meta','utf8'));
  assert.equal(meta.subMetas.f9941.name,'spriteFrame');
  assert.equal(meta.subMetas.f9941.userData.rawWidth,png.readUInt32BE(16));
}
console.log('PASS replay VFX: Naruto effects, five ranged roles, both directions, tint/rotation, resource paths, projectile/fade, sizing, once-only playback and RGBA imports (no renderer)');
