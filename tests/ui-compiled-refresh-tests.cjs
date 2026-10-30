// Exercise Creator's actual emitted UID/Map iteration with the same component regressions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve('build/web-desktop');
const main=path.join(root,'assets/main');
const code=fs.readFileSync(path.join(main,fs.readdirSync(main).find(n=>/^index.*\.js$/.test(n))),'utf8');
const ast=ts.createSourceFile('build.js',code,ts.ScriptTarget.ES2020,true,ts.ScriptKind.JS);
const helpers={},chunks=path.join(root,'src/chunks');
new Function('System',fs.readFileSync(path.join(chunks,fs.readdirSync(chunks).find(n=>/^bundle.*\.js$/.test(n))),'utf8'))({register(...args){const definition=args.at(-1)((name,value)=>typeof name==='object'?Object.assign(helpers,name):helpers[name]=value,{});definition.execute();}});
const h=require('./helpers/ui-harness.cjs');
const original=h.load;
let patched=false;
h.load=function(file){const out=original(file);if(path.basename(file)==='BattleStage.ts'&&!patched){patched=true;
 const deps={Node:h.cc.Node,UITransform:h.cc.UITransform,BoardView:original(path.resolve('assets/scripts/view/BoardView.ts')).BoardView,_extends:helpers.extends,_createForOfIteratorHelperLoose:helpers.createForOfIteratorHelperLoose};
 for(const name of ['createViews','createBenchViews']){
  let compiled;function visit(node){if(ts.isBinaryExpression(node)&&ts.isPropertyAccessExpression(node.left)&&node.left.name.text===name&&ts.isFunctionExpression(node.right))compiled=node.right.getText(ast);ts.forEachChild(node,visit);}visit(ast);
  assert.ok(compiled);assert.doesNotMatch(compiled,/\.concat\([\w.]+\.(values|keys)\(\)/);
  out.BattleStage.prototype[name]=new Function(...Object.keys(deps),'return ('+compiled+');')(...Object.values(deps));
 }
 }return out;};
require('./ui-incremental-refresh-tests.cjs');
assert.ok(patched);console.log('PASS Creator-compiled createViews/createBenchViews: actual emitted Map/Set iteration, UID reuse, purchase/merge/remap, combat reserve');
