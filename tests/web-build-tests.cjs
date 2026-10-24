// Exercise the actual Creator-compiled methods, including its iterable transform.
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const buildRoot=path.join(__dirname,'../build/web-desktop');
const mainRoot=path.join(buildRoot,'assets/main');
const file=fs.readdirSync(mainRoot).find(name=>/^index.*\.js$/.test(name));
const code=fs.readFileSync(path.join(mainRoot,file),'utf8');
assert.doesNotMatch(code,/\.concat\(new Set\(/,'Creator cannot compile Set spread as array concatenation');
assert.doesNotMatch(code,/\.concat\((?:new Map\(|[\w.]+\.(?:values|keys)\(\))/,'Creator must convert Map iterators with Array.from');
const ts=require('typescript');
const source=ts.createSourceFile(file,code,ts.ScriptTarget.ES2020,true,ts.ScriptKind.JS);
let traitResolver;
function findTraitResolver(node) {
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='resolveTraits') traitResolver=node.getText(source);
  ts.forEachChild(node,findTraitResolver);
}
findTraitResolver(source);assert.ok(traitResolver,'compiled trait resolver exists');
const compiledResolve=new Function('return ('+traitResolver+')')();
// The live roster removed ninjas; test the authored mechanical thresholds through real compiled code.
const trait=require('../assets/resources/config/battle.json').traits.find(t=>t.id==='mechanical_pioneer');
assert.ok(trait);assert.deepEqual(trait.breakpoints.map(b=>b.count),[3,5,7]);
for(const breakpoint of trait.breakpoints)assert.deepEqual(compiledResolve([trait],trait.members.slice(0,breakpoint.count))[0].active,breakpoint,'compiled game selects the exact authored tier for unique mechanical units');
assert.equal(compiledResolve([trait],[trait.members[0],trait.members[0],trait.members[1]])[0].active,null,'compiled game ignores duplicate copies');
const helpers={};
const chunksRoot=path.join(buildRoot,'src/chunks');
const chunksFile=fs.readdirSync(chunksRoot).find(name=>/^bundle.*\.js$/.test(name));
new Function('System',fs.readFileSync(path.join(chunksRoot,chunksFile),'utf8'))({register:(...args)=>{
  const factory=args[args.length-1],definition=factory((name,value)=>typeof name==='object'?Object.assign(helpers,name):helpers[name]=value,{});
  definition.execute();
}});
function method(name,dependencies,fragment='') {
  dependencies={_createForOfIteratorHelperLoose:helpers.createForOfIteratorHelperLoose,_extends:helpers.extends,...dependencies};
  let compiled;
  function visit(node){
    if(ts.isBinaryExpression(node)&&ts.isPropertyAccessExpression(node.left)&&node.left.name.text===name&&ts.isFunctionExpression(node.right)&&node.right.getText(source).includes(fragment))compiled=node.right.getText(source);
    ts.forEachChild(node,visit);
  }
  visit(source);assert.ok(compiled,'compiled method '+name+' exists');
  return new Function(...Object.keys(dependencies),'return ('+compiled+');')(...Object.values(dependencies));
}
const run=require('../assets/resources/config/run.json');
const art=Object.fromEntries(run.monsters.map(m=>[m.artId,'art/test/'+m.artId]));
const calls=[];
const menu={isValid:true,status:{string:''},ready:false,runConfig:{monsters:[...run.monsters,run.monsters[0]]},loadFinishes:0,
  loadScreen:{setMessage(value){menu.loadingMessage=value;},finish(){menu.loadFinishes++;}},finishPreparation:method('finishPreparation',{})};
method('loadMonsterArt',{UNIT_ART:art,resources:{load:(name,type,cb)=>{
  assert.equal(typeof name,'string','Creator output must enumerate individual SpriteFrame paths');calls.push(name);cb(null);
}},SpriteFrame:class{}}).call(menu);
const expectedMonsterArt=new Set(run.monsters.map(m=>art[m.artId]));
assert.equal(menu.ready,true);assert.equal(calls.length,expectedMonsterArt.size);assert.deepEqual(new Set(calls),expectedMonsterArt,'compiled loader must load every configured monster once');
assert.equal(menu.loadFinishes,1);assert.equal(menu.loadScreen,null,'compiled preparation closes the resource-gated loading overlay');
const {shopCostRates,rollShopCost}=require('../assets/scripts/core/ShopConfig.ts');
const unitConfigs=new Map([['one',{cost:1}],['two',{cost:2}]]);
const shop={unitConfigs,getLevel:()=>3,rng:{next:()=>.9},pool:{canDraw:()=>true,count:()=>10,costOfUnit:id=>unitConfigs.get(id)?.cost}};
shop.costRates=method('costRates',{shopCostRates});
assert.deepEqual(method('costRates',{shopCostRates}).call(shop),[75,25,0,0,0]);
assert.equal(method('rollCost',{rollShopCost}).call(shop,3),2);
shop.pool.canDraw=id=>id!=='two';
assert.deepEqual(shop.costRates(),[100,0,0,0,0],'compiled ordinary shop excludes locked cards');
shop.pool.canDraw=()=>true;
shop.pool.count=id=>id==='one'?0:10;
assert.deepEqual(shop.costRates(),[0,100,0,0,0]);
assert.equal(method('rollCost',{rollShopCost}).call(shop,3),2);
const timerNode=()=>({active:true,setPosition(){},getComponent:()=>({setContentSize(){}})});
const progress={combatActive:true,battleTimer:timerNode(),floorLabel:{node:timerNode()},
  preparationBar:{active:false},preparationLabel:{string:''},phaseLabel:{string:'',node:timerNode()},
  preparationFill:{clear(){},rect(x,y,width){this.width=width;},fill(){}},
  battleTimerFill:{clear(){},rect(x,y,width){this.width=width;},fill(){}}};
progress.clearBattleTimer=method('clearBattleTimer',{UITransform:class{}});
const countdown=method('setCombatCountdown',{TEAL:{},GOLD:{},Color:class{}});
countdown.call(progress,.5);assert.equal(progress.preparationBar.active,true);assert.equal(progress.preparationFill.width,140);
assert.equal(progress.phaseLabel.string,'准备 0.5s');
countdown.call(progress,0);assert.equal(progress.preparationBar.active,false);
const battleTimer=method('setBattleTimer',{UITransform:class{},Color:class{}});
battleTimer.call(progress,{phase:'combat',remainingSeconds:30,durationSeconds:30,overtimeProgress:0});
assert.equal(progress.phaseLabel.string,'战斗 30s');assert.equal(progress.battleTimerFill.width,310);
assert.equal(progress.floorLabel.node.active,false);
battleTimer.call(progress,{phase:'overtime',remainingSeconds:7.5,durationSeconds:15,overtimeProgress:.5});
assert.equal(progress.phaseLabel.string,'加时 8s');assert.equal(progress.battleTimerFill.width,155);
progress.clearBattleTimer();assert.equal(progress.battleTimer.active,false);assert.equal(progress.floorLabel.node.active,true);
assert.ok(code.includes('spellPower')&&code.includes('unitStats')&&code.includes('physicalPower')&&code.includes('detailStat'),'compiled detail contains new attributes');
assert.ok(code.includes('backpackEquipmentIndices'),'compiled backpack maps display slots to reserve indices');
let bagNodeName='button';
const bagNode={};Object.defineProperty(bagNode,'name',{get:()=>bagNodeName,set:value=>{if(!value.includes('/'))bagNodeName=value;}});
const bag={backpackPage:0,backpackCaption:{},backpackSlots:[{node:bagNode,icon:{isValid:true,node:{active:false}},text:{},index:-1,iconPath:''}]};
const bagIcon='art/equipment/guinsoo/spriteFrame';
method('refreshBackpack',{loadArtSprite:(name,callback)=>callback(null,{name})}).call(bag,[{id:'guinsoo',kind:'equipment',icon:bagIcon}],true);
assert.equal(bag.backpackSlots[0].icon.spriteFrame.name,bagIcon,'compiled backpack works when node names reject resource paths');
assert.equal(bag.backpackSlots[0].icon.node.active,true);
assert.equal(bagNodeName,'button');
const {skillParagraphs,skillBodyHeight}=require('../assets/scripts/ui/SkillPresentation.ts');
const mockNode=()=>({setPosition(){},getComponent:()=>({setContentSize(){},setAnchorPoint(){}})});
const popup={currentDetail:{skillName:'火球',skillDescription:'造成100点魔法伤害',atkSpeed:.75,attackSpeedCap:5},detailPopupMode:'attackSpeed',
 detailPopupTitle:{node:mockNode()},unitDetail:{node:mockNode()},detailPopup:mockNode(),detailPopupIcon:{node:{parent:mockNode()}},
 detailPopupClose:mockNode(),detailPopupRules:{clear(){},moveTo(){},lineTo(){},stroke(){}},detailPopupRows:mockNode(),detailPopupStatLabels:[]};
popup.renderDetailPopup=method('renderDetailPopup',{colorDamageText:text=>text,skillParagraphs,skillBodyHeight,
 UITransform:class{},Graphics:class{},Color:class{},GOLD:{},paintPanel(){},setUISkin(){}});
popup.renderDetailPopup();assert.match(popup.unitDetail.string,/\+5%.*\+0\.05/);assert.equal(popup.detailPopup.active,true);
popup.detailPopupMode=null;
const togglePopup=method('toggleDetailPopup',{});
togglePopup.call(popup,'skill');assert.equal(popup.detailPopup.active,true);
assert.equal(popup.detailPopupTitle.string,'火球');
assert.match(popup.unitDetail.string,/造成100点魔法伤害/);
assert.doesNotMatch(popup.unitDetail.string,/火球/,'skill title is not repeated in its body');
togglePopup.call(popup,'skill');assert.equal(popup.detailPopup.active,false);
const html=fs.readFileSync(path.join(buildRoot,'index.html'),'utf8');
const cssFile=html.match(/href="\.\/([^"\s]+\.css)"/)[1];
const css=fs.readFileSync(path.join(buildRoot,cssFile),'utf8');
assert.match(css,/width:\s*100vw\s*!important/);assert.match(css,/height:\s*100vh\s*!important/);
assert.match(css,/#GameDiv\s*\{[^}]*z-index:\s*0\s*;/, 'video underlay needs a stacking context above the page background');
console.log('PASS actual web build: monster loading, deduplication, shop iterator conversion, attributes and fullscreen container');

// Run real Creator-compiled Set/Map consumers, not just the TypeScript source.
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {hexDist}=require('../assets/scripts/battle/HexMath.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json');
function combat(id){
 const cfg=new ConfigManager();cfg.setUnits(roster);cfg.setSkills(skills);cfg.setBattle({...require('../assets/resources/config/battle.json'),traits:[]});cfg.setEquipment(require('../assets/resources/config/equipment.json'));
 const sim=new BattleSim(cfg,[{cfg:cfg.getUnit(id),side:0,x:0,y:0},{cfg:cfg.getUnit('abyss_iron_guard'),side:1,x:1,y:0},{cfg:cfg.getUnit('abyss_iron_guard'),side:1,x:2,y:0}],{seed:123});
 return {sim,cfg,source:sim.units[0],ability:sim.shadowSkills,skill:cfg.getSkill(cfg.getUnit(id).skillId)};
}
function piercing(compiled){const f=combat('blackfeather_hunter');if(compiled)f.ability.activate=method('activate',{hexDist},"case 'piercing'");f.ability.activate(f.source,f.skill,f.sim.units[1].id);f.sim.resolveDamage();return f.sim.events;}
const compiledPiercing=piercing(true);assert.deepEqual(compiledPiercing,piercing(false),'compiled piercing retains the complete source damage/event trace');
assert.deepEqual(compiledPiercing.find(e=>e.t==='skill_pulse'&&e.effect==='piercing').center,{x:6,y:0},'compiled Set conversion emits the board-edge endpoint');
function marks(compiled){const f=combat('voidscar_reaver');if(compiled)f.ability.finishChannel=method('finishChannel',{},"'voidMark'");f.ability.finishChannel({source:f.source,skill:f.skill,targetId:-1,remaining:0,next:0,lastTarget:null,marked:new Set([f.sim.units[2].id,f.sim.units[1].id,f.sim.units[2].id])});f.sim.resolveDamage();return f.sim.events;}
const compiledMarks=marks(true);assert.deepEqual(compiledMarks,marks(false),'compiled marks retain unique sorted targets and complete source trace');
assert.equal(compiledMarks.filter(e=>e.t==='skill_pulse'&&e.effect==='voidMark').length,2,'compiled void pays every distinct marked target exactly once');
const {EnemyFormation}=require('../assets/scripts/core/EnemyFormation.ts'),{EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts');
const {formationSettings}=require('../assets/scripts/core/FormationPolicy.ts'),{snapshotIdentity}=require('../assets/scripts/core/EnemyRoles.ts');
const {compatibilityFormation}=require('../assets/scripts/core/EnemyFormation.ts');
const formationConfig=require('../assets/resources/config/enemy-formation.json'),roles=require('../assets/resources/config/enemy-roles.json');
const solver=new EnemyFormation(formationConfig,roles,roster,skills,new EnemyPowerModel(require('../assets/resources/config/enemy-power.json')),run.enemyProgression.cells);
const formationContext={runSeed:12345,globalWaveId:40,stage:7,round:2,roundsInStage:10,waveKind:'normal',settings:formationSettings(formationConfig,7,2,10,'normal','L2'),enemies:['abyss_iron_guard','blackfeather_hunter','helion'].map((unitId,index)=>({unitId,star:1,equipment:[],statMultiplier:1,damageAmp:0,damageReduction:0,...run.enemyProgression.cells[index]}))};
const expectedFormation=solver.solve(formationContext);
const compiledFormation=method('solve',{compatibilityFormation,snapshotIdentity},'templateSlotsMatched').call(solver,formationContext);
assert.deepEqual(compiledFormation,expectedFormation,'compiled formation enumerates Map assignments and preserves exact placements/diagnostics');
console.log('PASS actual web build: piercing endpoint, unique void marks, and formation Map diagnostics match source execution');
