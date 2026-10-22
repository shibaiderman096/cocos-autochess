require('tsx/cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {BoardProjectionAdapter}=require('../assets/scripts/view/BoardProjectionAdapter.ts');
const battle=require('../assets/resources/config/battle.json');
const a=new BoardProjectionAdapter(battle.boardWidth,battle.boardHeight,48);
const source=JSON.parse(fs.readFileSync('art-source/floating-ruins-p0/board-layout.json','utf8'));
assert.deepEqual(a.manifest(),source,'source manifest must use current production geometry');
const b=fs.readFileSync(require('./board-model-path.cjs')('floating-ruins-p0'));
assert.equal(b.toString('ascii',0,4),'glTF'); assert.equal(b.readUInt32LE(4),2); assert.equal(b.readUInt32LE(8),b.length);
const length=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+length)),bin=b.subarray(28+length);
assert.equal(g.meshes.length,68);assert.equal(g.materials.length,4);
assert.equal(g.animations?.length??0,0);assert.equal(g.skins?.length??0,0);
assert.equal(g.nodes.filter(n=>/^SM_Hex_R\d{2}_C\d{2}$/.test(n.name)).length,56);
function positions(index) {
 const acc=g.accessors[index],view=g.bufferViews[acc.bufferView];
 assert.equal(acc.componentType,5126); assert.equal(acc.type,'VEC3');
 const start=(view.byteOffset??0)+(acc.byteOffset??0),stride=view.byteStride??12;
 return Array.from({length:acc.count},(_,i)=>[0,1,2].map(k=>bin.readFloatLE(start+i*stride+k*4)));
}
let maxError=0,samples=0;
for(const cell of source.cells) {
 const n=g.nodes.find(n=>n.name===cell.name); assert.ok(n);
 assert.ok(!n.rotation&&!n.matrix&&!n.scale,'unapplied transforms must not be hidden in GLB');
 const [x,y,z]=n.translation??[0,0,0];
 const center=a.toBoard({x,y,z});
 maxError=Math.max(maxError,Math.hypot(center.x-cell.center.x,center.y-cell.center.y));samples++;
 const vertices=g.meshes[n.mesh].primitives.flatMap(p=>positions(p.attributes.POSITION).map(v=>({x:v[0]+x,y:v[1]+y,z:v[2]+z})));
 for(let i=0;i<6;i++) {
  const expected=cell.groundPolygon[i],v=vertices.reduce((best,v)=>Math.hypot(v.x-expected.x,v.y-expected.y,v.z-expected.z)<Math.hypot(best.x-expected.x,best.y-expected.y,best.z-expected.z)?v:best);
  const p=a.toBoard(v),q=cell.polygon[i];maxError=Math.max(maxError,Math.hypot(p.x-q.x,p.y-q.y));samples++;
 }
 assert.deepEqual(a.geometry.cellAt(center.x,center.y)?.center,cell.center);
 for(const corner of cell.polygon) {
  const inside={x:corner.x*.999+cell.center.x*.001,y:corner.y*.999+cell.center.y*.001};
  const hit=a.geometry.cellAt(inside.x,inside.y);assert.equal(hit.x,cell.x);assert.equal(hit.y,cell.y);
 }
}
assert.ok(maxError<.001);assert.equal(samples,392);
const file='assets/scripts/view/BoardView.ts',text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.ES2020,true);
const cls=ast.statements.find(ts.isClassDeclaration),method=cls.members.find(m=>m.name?.getText(ast)==='setVisualMode').getText(ast);
const Board=new Function(ts.transpileModule('class Board{'+method+'};return Board;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)();
const nodes=Object.fromEntries(['arenaArt','boardGrid','dragHighlight','units','fx'].map(k=>[k,{active:true}]));
const board=new Board();board.node={getChildByName:name=>nodes[name]};
for(let i=0;i<10;i++)for(const mode of ['3d','2d']) {
 board.setVisualMode(mode);
 for(const k of ['arenaArt','boardGrid'])assert.equal(nodes[k].active,false,'retired backgrounds stay hidden even for legacy callers');
 for(const k of ['dragHighlight','units','fx'])assert.equal(nodes[k].active,true);
}
const qa=JSON.parse(fs.readFileSync('docs/evidence/floating-ruins-p0/model-qa.json'));
assert.equal(qa.pass,true);assert.deepEqual(qa.errors,[]);
const result={pass:true,cells:56,samples,maxGlbProjectionErrorPixels:maxError,modeSwitchCycles:10,
 meshCount:g.meshes.length,materials:g.materials.length,tris:Object.values(qa.objects).reduce((n,v)=>n+v.tris,0)};
const output=process.env.FLOATING_RUINS_REPORT;
if(output){fs.mkdirSync(require('path').dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));}
console.log('PASS floating ruins: '+JSON.stringify(result));
