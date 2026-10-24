// Reproduce child-before-Canvas teardown and repeated controller disposal.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
class Value { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} }
class Component { isValid=true; }
const cc={input:{on(){},off(){}},Input:{EventType:{MOUSE_WHEEL:'wheel'}},_decorator:{ccclass:()=>C=>C,executionOrder:()=>C=>C},Component,Vec3:Value,Quat:Value,Color:Value,
  isValid:(value,strict)=>!!value&&value.isValid!==false&&(!strict||!value.destroyQueued)};
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const out={};cache.set(file,out);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 new Function('require','exports',js)(id=>id==='cc'?cc:load(path.resolve(path.dirname(file),id+'.ts')),out);return out;
}
const {FloatingRuinsEnvironmentAnimator:Animator}=load(root+'/assets/scripts/view/FloatingRuinsEnvironmentAnimator.ts');
const {FloatingRuinsBoard:Board}=load(root+'/assets/scripts/view/FloatingRuinsBoard.ts');
for(const deadNode of [null,{isValid:false}]){
 const animator=new Animator();animator.overlay={node:deadNode,clear(){throw Error('clearing an already destroyed child');}};
 animator.onDisable();animator.dispose();animator.onDestroy();assert.equal(animator.overlay,null);
}
let clears=0,destroys=0;
const liveNode={isValid:true,active:true,removeFromParent(){},destroy(){assert.equal(this.isValid,true);this.isValid=false;destroys++;}};
const animator=new Animator();animator.overlay={node:liveNode,clear(){clears++;}};
animator.dispose();animator.dispose();animator.onDestroy();assert.equal(clears,1);assert.equal(destroys,1);
for(const state of ['destroyed','queued','live']){
 const board=new Board();const destroyed=[];board.unscheduleAllCallbacks=()=>{};board.node={getChildByName:()=>null};
 const resource=name=>({isValid:state!=='destroyed',destroyQueued:state==='queued',destroy(){destroyed.push(name);this.destroyQueued=true;}});
 board.surface=resource('surface');board.sky=resource('sky');board.bench=resource('bench');board.frame=resource('frame');board.texture=resource('texture');
 board.animator={isValid:false,dispose(){throw Error('disposed a dead controller');}};
 board.board={isValid:false,setVisualMode(){throw Error('wrote a dead board');}};
 board.onDestroy();board.onDestroy();assert.deepEqual(destroyed,state==='live'?['frame','texture','bench','surface','sky']:[]);
}
const {AstralBoardArt}=load(root+'/assets/scripts/view/AstralBoardArt.ts');
for(const astralRoot of [null,{isValid:false},{isValid:true,destroyQueued:true},{isValid:true,children:undefined}]) {
 const art=new AstralBoardArt(astralRoot);art.tiles=[{node:{},phase:0}];art.rings=[{}];
 art.clear();art.clear();assert.equal(art.stopped,true);assert.equal(art.tiles.length,0);assert.equal(art.rings.length,0);
 assert.doesNotThrow(()=>art.update(1,50),'teardown invalidates animation work');
}
let astralRemoves=0,astralDestroys=0;
const astralChild={isValid:true,removeFromParent(){astralRemoves++;},destroy(){this.destroyQueued=true;astralDestroys++;}};
const astral=new AstralBoardArt({isValid:true,children:[null,{isValid:false},astralChild]});
astral.clear();astral.clear();assert.equal(astralRemoves,1);assert.equal(astralDestroys,1);
console.log('PASS scene lifecycle: null/destroyed child, repeated disposal, queued resources and Canvas teardown');
// Reuse P2's actual component lifecycle checks against the new GLB, without
// running its historical evidence writers or the old model's geometry checks.
const p2=fs.readFileSync(path.join(__dirname,'floating-ruins-p2-tests.cjs'),'utf8');
const start=p2.indexOf('// Execute the actual component with an engine boundary double:');
const end=p2.indexOf('// Re-run the unchanged P1 392 point contract',start);
assert.ok(start>=0&&end>start);
const g=require('../tools/floating-ruins-p2-glb.cjs').readGlb(path.join(root,'assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb')).gltf;
const {RUINS_MOTIONS}=load(root+'/assets/scripts/view/FloatingRuinsP2Bindings.ts');
const base=n=>({position:n.translation||[0,0,0],rotation:n.rotation||[0,0,0,1],scale:n.scale||[1,1,1]});
const componentRequire=id=>id.startsWith('../assets/scripts/view/')?load(path.join(__dirname,id)):require(id);
new Function('require','fs','assert','ts','g','base','RUINS_MOTIONS',p2.slice(start,end))(componentRequire,fs,assert,ts,g,base,RUINS_MOTIONS);
console.log('PASS new model: 20 P2 mode/quality/pause/rebind/restore cycles, no historical evidence overwritten');
