// Exercise the actual Creator-compiled methods, including its iterable transform.
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const buildRoot=path.join(__dirname,'../build/web-desktop');
const mainRoot=path.join(buildRoot,'assets/main');
const file=fs.readdirSync(mainRoot).find(name=>/^index.*\.js$/.test(name));
const code=fs.readFileSync(path.join(mainRoot,file),'utf8');
const ts=require('typescript');
const source=ts.createSourceFile(file,code,ts.ScriptTarget.ES2020,true,ts.ScriptKind.JS);
const helpers={};
const chunksRoot=path.join(buildRoot,'src/chunks');
const chunksFile=fs.readdirSync(chunksRoot).find(name=>/^bundle.*\.js$/.test(name));
new Function('System',fs.readFileSync(path.join(chunksRoot,chunksFile),'utf8'))({register:(...args)=>{
  const factory=args[args.length-1],definition=factory((name,value)=>typeof name==='object'?Object.assign(helpers,name):helpers[name]=value,{});
  definition.execute();
}});
function method(name,dependencies) {
  dependencies={_createForOfIteratorHelperLoose:helpers.createForOfIteratorHelperLoose,...dependencies};
  let compiled;
  function visit(node){
    if(ts.isBinaryExpression(node)&&ts.isPropertyAccessExpression(node.left)&&node.left.name.text===name&&ts.isFunctionExpression(node.right))compiled=node.right.getText(source);
    ts.forEachChild(node,visit);
  }
  visit(source);assert.ok(compiled,'compiled method '+name+' exists');
  return new Function(...Object.keys(dependencies),'return ('+compiled+');')(...Object.values(dependencies));
}
const run=require('../assets/resources/config/run.json');
const art=Object.fromEntries(run.monsters.map(m=>[m.artId,'art/test/'+m.artId]));
const calls=[];
const menu={isValid:true,status:{string:''},ready:false,runConfig:{monsters:[...run.monsters,run.monsters[0]]}};
method('loadMonsterArt',{UNIT_ART:art,resources:{load:(name,type,cb)=>{
  assert.equal(typeof name,'string','Creator output must enumerate individual SpriteFrame paths');calls.push(name);cb(null);
}},SpriteFrame:class{}}).call(menu);
assert.equal(menu.ready,true);assert.equal(calls.length,4);assert.equal(new Set(calls).size,4);
const {shopCostRates}=require('../assets/scripts/core/ShopConfig.ts');
const unitConfigs=new Map([['one',{cost:1}],['two',{cost:2}]]);
const shop={unitConfigs,getLevel:()=>3,rng:{next:()=>.9},pool:{count:()=>10,costOfUnit:id=>unitConfigs.get(id)?.cost}};
assert.deepEqual(method('costRates',{shopCostRates}).call(shop),[75,25,0,0,0]);
assert.equal(method('rollCost',{shopCostRates}).call(shop,3),2);
const progress={preparationBar:{active:false},preparationLabel:{string:''},phaseLabel:{string:''},preparationFill:{clear(){},rect(x,y,width){this.width=width;},fill(){}}};
const countdown=method('setCombatCountdown',{TEAL:{},GOLD:{},Color:class{}});
countdown.call(progress,.5);assert.equal(progress.preparationBar.active,true);assert.equal(progress.preparationFill.width,140);
assert.equal(progress.phaseLabel.string,'准备 0.5s');
countdown.call(progress,0);assert.equal(progress.preparationBar.active,false);
assert.ok(code.includes('spellPower')&&code.includes('unitStats')&&/法强|\\u6cd5\\u5f3a/i.test(code),'compiled detail contains new attributes');
const html=fs.readFileSync(path.join(buildRoot,'index.html'),'utf8');
const cssFile=html.match(/href="\.\/([^"\s]+\.css)"/)[1];
const css=fs.readFileSync(path.join(buildRoot,cssFile),'utf8');
assert.match(css,/width:\s*100vw\s*!important/);assert.match(css,/height:\s*100vh\s*!important/);
console.log('PASS actual web build: monster loading, deduplication, shop iterator conversion, attributes and fullscreen container');
