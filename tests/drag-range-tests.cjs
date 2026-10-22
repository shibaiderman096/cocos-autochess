require('tsx/cjs');
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {BoardGeometry}=require('../assets/scripts/view/BoardGeometry.ts');
const {projectBoardPoint}=require('../assets/scripts/view/BoardPresentation.ts');
const {hexDist}=require('../assets/scripts/battle/HexMath.ts');
const file='assets/scripts/view/BoardView.ts',src=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.ES2020,true);
const cls=src.statements.find(ts.isClassDeclaration),method=cls.members.find(n=>n.name?.getText(src)==='highlightTarget').getText(src);
class Color{constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
const Board=new Function('Color','hexDist','projectBoardPoint',ts.transpileModule('class Board{'+method+'};return Board;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)(Color,hexDist,projectBoardPoint);
const board=new Board();board.geometry=new BoardGeometry(7,8,48);
board.highlight={fills:[],clear(){this.fills=[];},moveTo(x,y){this.first={x,y};},lineTo(){},close(){},fill(){this.fills.push({point:this.first,color:this.fillColor});},stroke(){}};
for(const center of [{x:3,y:2},{x:3,y:3},{x:0,y:0},{x:6,y:7}])for(const range of [1,2,4]){
 board.highlightTarget(center,true,range);
 const expected=board.geometry.cells.filter(c=>hexDist(center,c)>0&&hexDist(center,c)<=range);
 assert.equal(board.highlight.fills.length,expected.length+1);
 const actual=board.highlight.fills.slice(0,-1).map(f=>f.point);
 assert.deepEqual(actual,expected.map(c=>projectBoardPoint(c.polygon[0])));
 assert.ok(board.highlight.fills.slice(0,-1).every(f=>f.color.a===70),'range cells are pale');
}
board.highlightTarget({x:3,y:3},false,4);assert.equal(board.highlight.fills.length,1,'invalid drop only shows red target');
board.highlightTarget(null);assert.equal(board.highlight.fills.length,0,'drop/cancel clears range');
console.log('PASS drag attack range: odd/even rows, melee/ranged, board edges, invalid targets and cleanup');
