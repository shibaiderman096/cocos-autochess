// Actual presentation component + authored GLB, without changing any gameplay fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),listeners=[];
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
class C {}
const cc={_decorator:{ccclass:()=>c=>c,executionOrder:()=>c=>c,property:()=>{}},Component:C,Vec3:V,Color:V,Quat:V,
 UITransform:class{},Node:{EventType:{MOUSE_WHEEL:'wheel',TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'}},Input:{EventType:{MOUSE_WHEEL:'wheel'}},Game:{EVENT_HIDE:'hide'},
 input:{on:(type,fn,target,capture)=>listeners.push({type,fn,target,capture}),off:(type,fn,target,capture)=>{const i=listeners.findIndex(l=>l.type===type&&l.fn===fn&&l.target===target&&l.capture===capture);if(i>=0)listeners.splice(i,1);}},
 isValid:v=>!!v&&v.isValid!==false};
cc.game={on:cc.input.on,off:cc.input.off};
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 new Function('require','exports',src)(id=>id==='cc'?cc:id==='../ui/BattleUI'?{}:load(path.resolve(path.dirname(file),id+'.ts')),exports);return exports;}
const P=load(root+'/assets/scripts/view/BoardPresentation.ts');
const {BoardView}=load(root+'/assets/scripts/view/BoardView.ts');
const {BoardGeometry}=load(root+'/assets/scripts/view/BoardGeometry.ts');
const {BoardProjectionAdapter}=load(root+'/assets/scripts/view/BoardProjectionAdapter.ts');
const {FloatingRuinsBoard}=load(root+'/assets/scripts/view/FloatingRuinsBoard.ts');
const geo=new BoardGeometry(7,8,48),adapter=new BoardProjectionAdapter();
const board=new BoardView();board.geometry=geo;board.boardPixelH=geo.height;
const {readGlb}=require('../tools/floating-ruins-p2-glb.cjs');
// Read source vertices independently (the helper's API is intentionally not assumed).
const file=root+'/assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb';
const bytes=fs.readFileSync(file),jl=bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,20+jl)),bin=bytes.subarray(28+jl);
function verts(primitive){const a=g.accessors[primitive.attributes.POSITION],v=g.bufferViews[a.bufferView],s=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||12;
 return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>bin.readFloatLE(s+i*stride+k*4)));}
let samples=0,maxError=0;
for(const zoom of [.64,.84,.90,1.1,1.344])for(const cell of adapter.manifest().cells){
 const node=g.nodes.find(n=>n.name===cell.name),center=node.translation||[0,0,0];
 const values=g.meshes[node.mesh].primitives.flatMap(p=>verts(p).map(v=>v.map((n,i)=>n+center[i])));
 // Independent perspective divide from eye=(0,10/sqrt(2),10/sqrt(2)), vertical FOV 50°.
 const camera=v=>{const depth=10-(v[1]+v[2])/Math.sqrt(2),focal=384/Math.tan(25*Math.PI/180);
  return {x:v[0]*focal/depth*zoom,y:(v[1]-v[2])/Math.sqrt(2)*focal/depth*zoom};};
 const expected=[cell.center,...cell.polygon];
 for(let i=0;i<7;i++){
  const t=i===0?{x:center[0],y:center[1],z:center[2]}:cell.groundPolygon[i-1];
  const nearest=i===0?center:values.reduce((a,b)=>Math.hypot(...b.map((n,k)=>n-[t.x,t.y,t.z][k]))<Math.hypot(...a.map((n,k)=>n-[t.x,t.y,t.z][k]))?b:a);
  const actual=camera(nearest),want=P.projectBoardPoint(expected[i]);
  maxError=Math.max(maxError,Math.hypot(actual.x-want.x*zoom,actual.y-want.y*zoom));samples++;
 }
 const p=board.cellToWorld(cell.x,cell.y),hit=board.worldToCell(p.x,p.y);assert.deepEqual(hit,{x:cell.x,y:cell.y});
 for(const corner of cell.polygon){const near={x:corner.x*.999+cell.center.x*.001,y:corner.y*.999+cell.center.y*.001};
  const screen=P.projectBoardPoint(near),local={x:screen.x*zoom/zoom,y:screen.y*zoom/zoom};
  assert.deepEqual(board.worldToCell(local.x,local.y),{x:cell.x,y:cell.y});}
}
assert.equal(samples,1960);assert.ok(maxError<.001);
for(const count of [1,9,12]){board.benchSlots=count;
 for(let slot=0;slot<count;slot++){const world=P.benchGroundPoint(slot,count,geo.height),p=board.benchPosition(slot);
  const focal=384/Math.tan(25*Math.PI/180),depth=10-world.z/Math.sqrt(2);
  const want={x:world.x*focal/depth,y:-world.z/Math.sqrt(2)*focal/depth};
  assert.ok(Math.hypot(p.x-want.x,p.y-want.y)<1e-10);}}
assert.equal(P.wheelBoardZoom(.84,Infinity),.84);assert.equal(P.clampBoardZoom(NaN),.84);
assert.equal(P.clampBoardZoom(-100),.64);assert.equal(P.clampBoardZoom(100),1.344);
assert.ok(P.wheelBoardZoom(.84,120)>.84);assert.ok(P.wheelBoardZoom(.84,-120)<.84);
const event=(x,y,scroll=120)=>({getUILocation:()=>({x,y}),getScrollY:()=>scroll});
for(let i=0;i<20;i++){
 const c=new FloatingRuinsBoard();c.ready=true;c.scheduleOnce=()=>{};c.unschedule=()=>{};c.unscheduleAllCallbacks=()=>{};
 let scale;c.board={interactionActive:false,node:{setScale:(...v)=>scale=v}};
 c.node={on:cc.input.on,off:cc.input.off,emit(){},getComponent:()=>({convertToNodeSpaceAR:p=>new V(p.x-640,p.y-360)}),getChildByName:()=>null};
 c.onEnable();c.onEnable();assert.equal(listeners.length,6);
 assert.equal(listeners.find(l=>l.type==='wheel').capture,true,'wheel is handled before mouse-aware UI swallows it');
 const start=c.zoom;c.onWheel(event(640,360));assert.ok(c.zoom>start);assert.equal(scale[0],scale[1]);
 const changed=c.zoom;c.onWheel(event(30,500));assert.equal(c.zoom,changed,'side-panel scroll is ignored');
 c.onWheel(event(640,650));assert.equal(c.zoom,changed,'shop scroll is ignored');
 c.board.interactionActive=true;c.onWheel(event(640,360,-120));assert.equal(c.zoom,changed,'drag locks zoom');
 c.board.interactionActive=false;
 c.node.getChildByName=()=>({children:[{name:'debugPanel',activeInHierarchy:true,children:[]}]});
 c.onWheel(event(640,360,-120));assert.equal(c.zoom,changed,'modal blocks zoom');
 c.onDisable();c.onDisable();assert.equal(listeners.length,0);c.onEnable();c.onDisable();assert.equal(listeners.length,0);
}
const pinch=new FloatingRuinsBoard();pinch.ready=true;let validations=0,cancels=0;
pinch.scheduleOnce=()=>validations++;pinch.unschedule=()=>{};
pinch.board={interactionActive:false,node:{setScale(x,y){assert.equal(x,y);}}};
pinch.node={getComponent:()=>({convertToNodeSpaceAR:p=>new V(p.x-640,p.y-360)}),getChildByName:()=>null,
 emit(){cancels++;pinch.board.interactionActive=false;}};
const touch=(id,x,y)=>({getID:()=>id,getUILocation:()=>({x,y}),propagationStopped:false});
pinch.onTouchStart(touch(1,540,480));pinch.board.interactionActive=true;
pinch.onTouchStart(touch(2,740,480));assert.equal(cancels,1);assert.equal(pinch.touchGestureActive,true);
pinch.onTouchMove(touch(1,440,480));assert.ok(Math.abs(pinch.zoom-1.26)<1e-10);
pinch.onTouchMove(touch(1,300,480));assert.equal(pinch.zoom,1.344,'pinch clamps at 1.6 times the default size');
pinch.onTouchMove(touch(1,301,480));assert.ok(pinch.zoom<1.344,'reversing at the limit responds immediately');
assert.equal(validations,0,'alignment is not recomputed for every pinch move');
pinch.onTouchStart(touch(3,640,480));const prior=pinch.zoom;pinch.onTouchMove(touch(3,700,480));assert.equal(pinch.zoom,prior,'third finger does not replace the pair');
const end=touch(1,301,480);pinch.onTouchEnd(end);assert.equal(end.propagationStopped,true);
pinch.onTouchMove(touch(2,800,480));assert.equal(pinch.zoom,prior,'remaining finger cannot continue the gesture or drag');
pinch.onTouchEnd(touch(2,800,480));assert.equal(pinch.touchGestureActive,true);
pinch.onTouchEnd(touch(3,700,480));assert.equal(pinch.touchGestureActive,false);assert.equal(validations,1);
const before=pinch.zoom;pinch.onTouchStart(touch(4,30,480));pinch.onTouchStart(touch(5,640,480));pinch.onTouchMove(touch(5,700,480));assert.equal(pinch.zoom,before,'HUD touch cannot start a board pinch');pinch.clearTouches();
pinch.node.getChildByName=()=>({children:[{name:'mainMenuButton',activeInHierarchy:true,children:[]}]});
assert.equal(pinch.zoomBlockedByUI(),false,'the always-visible home button is not a modal');
pinch.node.getChildByName=()=>({children:[{name:'mainMenu',activeInHierarchy:true,children:[]}]});
pinch.onTouchStart(touch(6,540,480));pinch.onTouchStart(touch(7,740,480));assert.equal(pinch.touchGestureActive,false,'settings block pinch');pinch.clearTouches();
pinch.node.getChildByName=()=>null;pinch.onTouchStart(touch(8,540,480));pinch.onTouchStart(touch(9,740,480));pinch.clearTouches();assert.equal(pinch.touchGestureActive,false);assert.equal(pinch.touches.size,0,'app hiding cancels stale pointers');
const bench=readGlb(root+'/assets/resources/models/ruins-bench/ruins-bench.glb').gltf;
assert.equal(bench.meshes.length,3);assert.equal(bench.materials.length,3);assert.ok(!bench.animations?.length);
assert.ok(!bench.nodes.some(n=>n.name==='Cube'));
const near=P.projectGroundPoint({x:1,y:0,z:3}),far=P.projectGroundPoint({x:1,y:0,z:-3});
assert.ok(near.x/far.x>1.5,'near tiles must visibly exceed far tiles in perspective');
assert.equal(P.BOARD_CAMERA.pitchDegrees,45);
const report={pass:true,cameraPitch:45,projection:'perspective',verticalFov:50,nearFarScaleRatio:near.x/far.x,zoomRange:[.64,1.344],samples,maxErrorPixels:maxError,listenerLifecycleCycles:20,benchCounts:[1,9,12],pinch:'pair/limits/drag cancellation/third finger/HUD/modal/hide/cleanup'};
console.log('PASS board presentation: '+JSON.stringify(report));
