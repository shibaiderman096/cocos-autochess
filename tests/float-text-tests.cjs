// Exercise real floating-text/replay code, including pooled state and animation timing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const active = [];
class Vec3 {
  constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); }
  clone() { return new Vec3(this.x,this.y,this.z); }
  static ONE = new Vec3(1,1,1);
}
class Component { isValid = true; getComponent(T) { return this.node.getComponent(T); } }
class Node {
  children=[]; components=new Map(); position=new Vec3(); scale=Vec3.ONE;
  addChild(n) { n.parent=this; this.children.push(n); }
  removeFromParent() { this.parent.children=this.parent.children.filter(n=>n!==this); this.parent=null; }
  addComponent(T) { const c=new T(); c.node=this; this.components.set(T,c); c.onLoad?.(); return c; }
  getComponent(T) { return this.components.get(T); }
  setPosition(x,y,z) { this.position=new Vec3(x,y,z); }
  setScale(x,y,z) { this.scale=new Vec3(x,y,z); }
}
class Label {}
class UIOpacity {}
class Color { constructor(r,g,b,a=255) { Object.assign(this,{r,g,b,a}); } static WHITE=new Color(255,255,255); }
function tween(target) {
  const steps=[];
  const chain={target,steps,
    by(time,props,options){steps.push({kind:'by',time,props,options});return this;},
    to(time,props,options){steps.push({kind:'to',time,props,options});return this;},
    delay(time){steps.push({time});return this;},
    call(fn){steps.push({fn});return this;},
    start(){active.push(this);return this;},
  }; return chain;
}
const cc={Component,Node,Label,UITransform:class{},UIOpacity,Color,Vec3,tween,
  Tween:{stopAllByTarget(target){for(let i=active.length-1;i>=0;i--)if(active[i].target===target)active.splice(i,1);}},
  _decorator:{ccclass:()=>T=>T},
};
function load(file,deps={}) {
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
  const out={}; new Function('require','exports',code)(name=>name==='cc'?cc:deps[name]??{},out); return out;
}
const floats=load(require.resolve('../assets/scripts/view/FloatText.ts'));
const {FloatText,FloatTextPool}=floats;
const values=[0,25,50,100,250,500,1000,5000,1000000];
const sizes=values.map(v=>FloatText.fontSizeForDamage(v));
assert.ok(sizes.every((v,i)=>v>=20&&v<=40&&(i===0||v>=sizes[i-1])));
assert.ok(new Set(sizes).size>=6,'damage magnitude remains distinguishable across a useful range');
for(const v of values)assert.equal(FloatText.fontSizeForDamage(v,true),FloatText.fontSizeForDamage(v)+6);
for(const v of [-1,NaN,Infinity])assert.equal(FloatText.fontSizeForDamage(v),20);
const root=new Node();
const ft=FloatTextPool.get();
ft.show('!500',Color.WHITE,new Vec3(),root,{damage:500,critical:true,direction:1});
const label=ft.getComponent(Label), opacity=ft.getComponent(UIOpacity);
assert.equal(label.isBold,true);assert.equal(label.fontSize,FloatText.fontSizeForDamage(500,true));
assert.equal(ft.node.scale.x,.65);
let motion=active.find(t=>t.target===ft.node&&t.steps[0].kind==='by');
assert.ok(motion.steps[0].props.position.x>0);assert.ok(motion.steps[1].props.position.y<0,'arc falls after rising');
const fade=active.find(t=>t.target===opacity);
assert.equal(fade.steps.reduce((n,s)=>n+(s.time??0),0),.64,'release waits for full movement duration');
fade.steps.at(-1).fn();assert.equal(ft.node.parent,null);
assert.equal(FloatTextPool.get(),ft,'reuses the same component');
ft.show('25',Color.WHITE,new Vec3(),root,{damage:25,direction:-1});
assert.equal(label.isBold,false);assert.ok(label.fontSize<FloatText.fontSizeForDamage(500,true));
motion=active.find(t=>t.target===ft.node&&t.steps[0].kind==='by');
assert.ok(motion.steps.every(s=>s.props.position.x<0),'drift follows leftward impact');
assert.equal(active.filter(t=>t.target===opacity).length,1,'reuse cancels previous fade callbacks');
const centered=[];
for(let i=0;i<4;i++) {
  ft.show('50',Color.WHITE,new Vec3(),root,{damage:50});
  centered.push(Math.sign(active.find(t=>t.target===ft.node&&t.steps[0].kind==='by').steps[0].props.position.x));
}
assert.deepEqual(centered,[-1,1,-1,1],'same-column hits fan to both sides');
ft.show('+100',Color.WHITE,new Vec3(),root);
assert.equal(label.fontSize,22);assert.equal(label.isBold,false);assert.equal(ft.node.scale.x,1);
assert.equal(opacity.opacity,255);assert.equal(active.filter(t=>t.target===ft.node).length,1);
const {BattleReplayer}=load(require.resolve('../assets/scripts/view/BattleReplayer.ts'),{
  './FloatText':floats,
  './ArtPaths':load(require.resolve('../assets/scripts/view/ArtPaths.ts')),
});
let hitAnimations=0;
const replay=new BattleReplayer(), target={side:1,node:new Node(),playHit(){hitAnimations++;}};
target.node.setPosition(30,20,0);
const source={node:new Node()};source.node.setPosition(-30,20,0);
const sim={events:[{t:'hit',id:2,source:1,dmg:125,dmgType:'magic',critical:true}],units:[]};
replay.bind(sim,new Map([[1,source],[2,target]]),56,{});replay.setFxRoot(root);replay.consumeEvents();
const hit=root.children.at(-1).getComponent(Label);
assert.equal(hit.string,'!125','critical marker precedes damage, without a minus sign');
assert.equal(hit.isBold,true);assert.equal(hit.fontSize,FloatText.fontSizeForDamage(125,true));
assert.equal(hit.color,FloatText.colorForType('magic'));
const count=root.children.length;replay.consumeEvents();assert.equal(root.children.length,count,'events consumed once');
target.side=0;sim.events.push({t:'hit',id:2,source:1,dmg:30,dmgType:'physical'});replay.consumeEvents();
assert.equal(root.children.length,count,'own unit damage numbers are hidden');assert.equal(hitAnimations,2,'hit feedback remains');
sim.events.push({t:'heal',id:2,source:2,amount:10});replay.consumeEvents();
assert.equal(root.children.at(-1).getComponent(Label).string,'+10','own healing text stays visible');
sim.events.push({t:'shield',id:2,source:2,amount:20});replay.consumeEvents();
assert.equal(root.children.at(-1).getComponent(Label).string,'+20护盾','own shield text stays visible');
console.log('PASS floating text: damage scaling/cap, critical prefix, impact direction, arc, fade timing, pooled reset and replay integration');
