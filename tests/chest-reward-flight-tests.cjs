require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {rewardDeliveryPlan:plan}=require('../assets/scripts/view/RewardDeliveryPlan.ts');
const rewardDeliveryPlan=(ids,before,after)=>plan(ids.map(unitId=>({unitId,star:1})),before,after);
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const unit=(uid,id,star=1,location='bench',y=0)=>({uid,unitId:id,star,location,x:location==='board'?3:-1,y});
const before=[unit(1,'helion')],after=[...before,unit(2,'kaeru',1,'bench',4),unit(3,'bronda',1,'bench',7)];
const immutable=JSON.stringify({before,after});
assert.deepEqual(rewardDeliveryPlan(['kaeru','bronda'],before,after),[{unitId:'kaeru',uid:2},{unitId:'bronda',uid:3}]);
assert.equal(JSON.stringify({before,after}),immutable,'planning cannot mutate inventory');
assert.deepEqual(rewardDeliveryPlan(['kaeru'],before,before),[{unitId:'kaeru'}],'full bench uses storage, never an occupied fake slot');
// Use actual merge rules: incoming copy disappears but the deployed survivor is the real target.
const owned=new OwnedUnits([unit(1,'helion',1,'board',2),unit(2,'helion',1,'bench',0)],3);
const old=owned.snapshot();owned.addToBench('helion',9);
assert.deepEqual(rewardDeliveryPlan(['helion'],old,owned.snapshot()),[{unitId:'helion',uid:1}]);
assert.equal(owned.get(1).star,2);
const chain=new OwnedUnits([unit(1,'helion',2,'board',2),unit(2,'helion',2,'bench',0),unit(3,'helion',1,'bench',1),unit(4,'helion',1,'bench',2)],5);
const chainOld=chain.snapshot();chain.addToBench('helion',9);
assert.deepEqual(rewardDeliveryPlan(['helion'],chainOld,chain.snapshot()),[{unitId:'helion',uid:1}]);assert.equal(chain.get(1).star,3);
assert.deepEqual(rewardDeliveryPlan(['helion','helion','kaeru'],old,[unit(1,'helion',2,'board',2)]),[{unitId:'helion',uid:1},{unitId:'helion'},{unitId:'kaeru'}]);
assert.deepEqual(plan([{unitId:'helion',star:2},{unitId:'helion',star:1}],[],[unit(1,'helion',2),unit(2,'helion')]),
 [{unitId:'helion',uid:1},{unitId:'helion',uid:2}],'a two-star reward consumes three copies of landing capacity');
const ranked=new OwnedUnits([unit(1,'helion',2,'board',2),unit(2,'helion',2,'bench',0)],3),rankedBefore=ranked.snapshot();
ranked.addToBench('helion',9,-1,2);
assert.deepEqual(plan([{unitId:'helion',star:2}],rankedBefore,ranked.snapshot()),[{unitId:'helion',uid:1}]);

// Run the real component against a narrow engine boundary. Native rendering is verified separately.
const pending=[];
class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}}
class Component{isValid=true;}
class Node{constructor(name){this.name=name;this.children=[];this.components=new Map();this.active=true;this.isValid=true;this.position=new Vec3();}
 addChild(n){n.parent=this;this.children.push(n);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}
 getComponent(T){return this.components.get(T)||null;}setPosition(v){this.position=v.clone();}setScale(x,y,z){this.scale={x,y,z};}
 destroy(){if(!this.isValid)return;this.isValid=false;for(const c of this.components.values()){c.onDestroy?.();c.isValid=false;}for(const n of [...this.children])n.destroy();this.parent?.children.splice(this.parent.children.indexOf(this),1);}}
class UIOpacity extends Component{opacity=255;}
class UITransform extends Component{setContentSize(){}}
class Sprite extends Component{static SizeMode={CUSTOM:0};}
class Graphics extends Component{dots=[];clear(){this.dots=[];}circle(x,y,r){assert.ok([x,y,r].every(Number.isFinite));this.dots.push([x,y,r]);}fill(){}}
class Color{constructor(...values){this.values=values;}}
class BlockInputEvents extends Component{}
const cc={Component,Node,Vec3,UITransform,Sprite,Graphics,Color,UIOpacity,BlockInputEvents,isValid:o=>!!o?.isValid,_decorator:{ccclass:()=>T=>T}};
const file=path.resolve(__dirname,'../assets/scripts/view/ChestRewardFlight.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
const out={};new Function('require','exports',compiled)(id=>id==='cc'?cc:{loadArtSprite:(path,cb)=>pending.push(cb)},out);
function fixture(){const canvas=new Node('canvas'),node=new Node('fx');canvas.addChild(node);return {canvas,node,fx:node.addComponent(out.ChestRewardFlight)};}
let complete=0,landed=0,zoom=1;
const a=new Node('bench_4'),b=new Node('bench_7');a.addComponent(UIOpacity).opacity=210;
const f=fixture();f.fx.play(()=>new Vec3(0,100),[
 {art:'a',recipient:a,position:()=>new Vec3(-100*zoom,-100*zoom),land:()=>landed++},
 {art:'a',recipient:a,position:()=>new Vec3(-100*zoom,-100*zoom),land:()=>landed++},
 {art:'b',recipient:b,position:()=>new Vec3(130*zoom,-100*zoom)}],()=>complete++);
assert.equal(a.getComponent(UIOpacity).opacity,0);assert.equal(b.getComponent(UIOpacity).opacity,0);
f.fx.update(.50);assert.equal(complete,0);const first=f.fx.orbs[0].sprite.position.clone();zoom=1.2;f.fx.update(0);
assert.notEqual(f.fx.orbs[0].sprite.position.x,first.x,'tracks live zoom/landing target');
assert.ok(f.fx.ink.dots.length<100,'fixed-count particles stay bounded');
f.fx.update(.50);assert.equal(a.getComponent(UIOpacity).opacity,0,'two copies to one merge target wait for last orb');
f.fx.update(.15);assert.equal(a.getComponent(UIOpacity).opacity,210);assert.equal(landed,1,'one upgrade impact for shared recipient');
f.fx.update(1);assert.equal(complete,1);assert.equal(b.getComponent(UIOpacity).opacity,255);assert.equal(f.node.isValid,false);
pending.splice(0).forEach(cb=>cb(null,{name:'late'}));assert.equal(complete,1,'late sprite callbacks cannot resurrect disposed effect');
for(let cycle=0;cycle<20;cycle++){
 const v=fixture(),target=new Node('target');target.addComponent(UIOpacity).opacity=170;
 v.fx.play(()=>new Vec3(),[{art:'a',recipient:target,position:()=>new Vec3(12,-22)}],()=>{throw Error('cancel must not award/advance');});
 v.fx.update(.4);v.fx.onDisable();assert.equal(target.getComponent(UIOpacity).opacity,170);assert.equal(v.fx.hidden.size,0);
 v.fx.update(10);v.node.destroy();pending.splice(0).forEach(cb=>cb(null,{}));assert.equal(v.canvas.children.length,0);
}
const empty=fixture();empty.fx.play(()=>new Vec3(),[],()=>complete++);assert.equal(complete,2);
const health=fixture(),hud=new Node('health');hud.addComponent(UIOpacity).opacity=230;let healed=0;
health.fx.play(()=>new Vec3(),[{art:'heart',recipient:hud,hideRecipient:false,size:{width:48,height:48},position:()=>new Vec3(100,200),land:()=>healed++}],()=>{});
assert.equal(hud.getComponent(UIOpacity).opacity,230,'the destination HUD remains visible');
health.fx.update(.97);assert.equal(healed,0);health.fx.update(.02);assert.equal(healed,1,'health display updates on arrival even without a hidden recipient');
health.fx.update(1);assert.equal(healed,1,'arrival settles once');
const top=fixture();top.fx.play(()=>new Vec3(0,180),[{art:'heart',position:()=>new Vec3(490,320)}],()=>{});
for(let i=0;i<20;i++){top.fx.update(.045);assert.ok(top.fx.orbs[0].sprite.position.y<=328,'health arc keeps the full heart below the top edge');}top.fx.update(2);
console.log('PASS actual reward/merge destinations, storage fallback, live target tracking, bounded particles, arrivals, cancellation and 20 cleanup cycles');
