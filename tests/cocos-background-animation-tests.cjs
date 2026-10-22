const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'assets/resources/animations/ruins-background');
const prefab=JSON.parse(fs.readFileSync(root+'/assets/resources/backgrounds/RuinsBackground.prefab','utf8'));
const nodes=prefab.map((n,i)=>({...n,index:i})).filter(n=>n.__type__==='cc.Node');
const clips=fs.readdirSync(folder).filter(n=>n.endsWith('.anim'));
assert.equal(clips.length,17);assert.equal(nodes.filter(n=>n._name.startsWith('SM_Hex_')).length,56);
assert.equal(prefab.filter(n=>n.__type__==='cc.Animation').length,17);
for(const file of clips){const data=JSON.parse(fs.readFileSync(path.join(folder,file))),clip=data[0];
 assert.equal(clip.__type__,'cc.AnimationClip');assert.equal(clip.wrapMode,2);assert.equal(clip.enableTrsBlending,false);
 assert.ok(clip._duration>0);assert.deepEqual(clip._events,[]);
 const node=nodes.find(n=>n._name===clip._name),components=node._components.map(c=>prefab[c.__id__]);
 const a=components.find(c=>c.__type__==='cc.Animation');assert.ok(a);assert.equal(a.playOnLoad,false);
 const meta=JSON.parse(fs.readFileSync(path.join(folder,file+'.meta')));assert.equal(a._defaultClip.__uuid__,meta.uuid);
 assert.equal(meta.importer,'animation-clip');
}
for(const n of nodes.filter(n=>n._name.startsWith('SM_Hex_')))assert.ok(!n._components.some(c=>prefab[c.__id__].__type__==='cc.Animation'));
class Value {constructor(x=0,y=0,z=0,w=1){Object.assign(this,{x,y,z,w});}set(x,y,z,w=1){Object.assign(this,{x,y,z,w});return this;}static transformMat4(o,p,m){return o.set(p.x+m.x,p.y+m.y,p.z+m.z);}}
class Animation {getState(){return this.state;}createState(clip){const self=this;return this.state={time:0,setTime(t){this.time=t;},sample(){assert.ok(!this.stale,'must reacquire state after Animation.onLoad');self.node.position.y=self.baseline+this.time*.001;}};}stop(){this.stops=(this.stops||0)+1;}}
class FakeNode {constructor(name){this.name=name;this.children=[];this.position=new Value();this.rotation=new Value();this.scale=new Value(1,1,1);this.isValid=true;this.layer=1;this.active=true;this.sharedMaterial=Object.freeze({pbr:'unchanged'});}
 get worldMatrix(){return this.position;}addChild(n){n.parent=this;this.children.push(n);}addComponent(C){const c=new C();c.node=this;return c;}
 getComponent(C){return C===Animation?this.animation:null;}setSiblingIndex(){}removeFromParent(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 setPosition(...v){this.position.set(...v);}setRotation(q){this.rotation.set(q.x,q.y,q.z,q.w);}setScale(...v){this.scale.set(...v);}destroy(){this.isValid=false;this.removeFromParent();}}
class Graphics {clear(){}circle(){}fill(){}}class UITransform {setContentSize(){}}class Component {enabledInHierarchy=true;}
const cc={_decorator:{ccclass:()=>C=>C},Animation,Component,Node:FakeNode,Vec3:Value,Quat:Value,Graphics,Color:Value,UITransform};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const e={};cache.set(file,e);
 new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText)(id=>id==='cc'?cc:load(path.resolve(path.dirname(file),id+'.ts')),e);return e;}
const {RUINS_MOTIONS}=load(root+'/assets/scripts/view/FloatingRuinsP2Bindings.ts');
const {FloatingRuinsEnvironmentAnimator:Animator}=load(root+'/assets/scripts/view/FloatingRuinsEnvironmentAnimator.ts');
function make(){const model=new FakeNode('model'),board=new FakeNode('board');for(const spec of RUINS_MOTIONS){const n=new FakeNode(spec.name);n.position.y=-.5;n.addChild(new FakeNode('mesh'));
 const a=n.animation=new Animation();a.node=n;a.baseline=n.position.y;a.defaultClip={name:n.name,duration:spec.period,speed:1,enableTrsBlending:false};model.addChild(n);}return {model,board};}
for(let cycle=0;cycle<20;cycle++){
 let now=0;const controller=new Animator(),{model,board}=make();controller.now=()=>now;
 controller.bind(model,board,true);controller.update();assert.equal(controller.diagnostics().clips,17);assert.equal(controller.diagnostics().driver,'cocos-animation-clip');
 now=3;controller.update();assert.equal(controller.elapsedSeconds,3);assert.ok(model.children.every(n=>n.position.y>-.5));
 // Reproduce inactive prefab activation recreating automatic states after binding.
 for(const n of model.children){n.animation.state.stale=true;n.animation.state=null;}
 now=4;controller.update();assert.ok(model.children.every(n=>n.animation.state.time===4%n.animation.defaultClip.duration));
 controller.setPlaying(false);const paused=model.children.map(n=>n.position.y);now=40;controller.update();assert.deepEqual(model.children.map(n=>n.position.y),paused);
 controller.setPlaying(true);now=41;controller.update();assert.equal(controller.elapsedSeconds,5);
 controller.setQuality('off');assert.ok(model.children.every(n=>n.position.y===-.5));now=100;controller.update();assert.equal(controller.elapsedSeconds,5);
 controller.setQuality('low');now=101;controller.update();assert.equal(controller.elapsedSeconds,6);
 controller.setVisualMode('2d');assert.ok(model.children.every(n=>n.position.y===-.5));controller.setVisualMode('3d');
 controller.dispose();controller.dispose();assert.equal(board.children.length,0);assert.ok(model.children.every(n=>n.position.y===-.5));
}
const missing=make();missing.model.children[7].animation=null;const broken=new Animator();assert.throws(()=>broken.bind(missing.model,missing.board,true),/clip missing/);assert.equal(missing.board.children.length,0);
console.log('PASS Cocos background: 17 editable clips/prefab bindings, static 56 tiles, 20 absolute-time pause/off/re-entry cycles, inactive-prefab state recreation, strict missing-clip rejection');
