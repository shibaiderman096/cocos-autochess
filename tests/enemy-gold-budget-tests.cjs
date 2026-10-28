require('tsx/cjs');
const assert=require('node:assert/strict');
const {loadRunInputs,loadEnemyGenerationInputs,loadEquipmentInputs,loadFormationInputs}=require('../tools/run-simulation.ts');
const {buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const {generateGoldArmy,tidyEnemyRows,enemyUnitGold,validateEnemyGoldRules}=require('../assets/scripts/core/EnemyGoldArmy.ts');
const {SHOP_RATES}=require('../assets/scripts/core/ShopConfig.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const i=loadRunInputs(),g=loadEnemyGenerationInputs(),e=loadEquipmentInputs(),f=loadFormationInputs(),rules=i.run.enemyGoldBudget;
const clone=x=>JSON.parse(JSON.stringify(x)),roster=new Map(i.units.map(u=>[u.id,u]));
const build=(stages=99,seed=17)=>buildRunWaves(stages,i.run,i.waves,i.units,{mode:'budget-v1',runSeed:seed,earlyEncounterLayout:'random-rounds-v1',
 difficulty:g.enemyDifficulty,power:g.enemyPower,equipmentPolicy:e.equipmentPolicy,equipmentRoles:f.enemyRoles,traits:i.battle.traits});
const waves=build();
const missingGoldRules=clone(i.run);delete missingGoldRules.enemyGoldBudget;
assert.throws(()=>buildRunWaves(3,missingGoldRules,i.waves,i.units,{mode:'budget-v1',runSeed:17}),/requires enemyGoldBudget/,'retired power-budget generation cannot be selected implicitly');
// An investment pattern can support only one distinct member of every faction
// (e.g. ten 3-cost 3-stars). Check the best feasible matching, not an impossible two-member floor.
function feasibleThemeMembers(w,theme){
 const slots=w.enemies.map(e=>enemyUnitGold(roster.get(e.unitId),e.star)),matches=new Map();
 const eligible=i.units.filter(u=>theme.members.includes(u.id)&&w.goldBudget.shopRates[u.cost-1]>0);
 function assign(slot,seen){
  for(const u of eligible){if(seen.has(u.id)||![1,2,3].some(star=>enemyUnitGold(u,star)===slots[slot]))continue;
   seen.add(u.id);if(!matches.has(u.id)||assign(matches.get(u.id),seen)){matches.set(u.id,slot);return true;}}
  return false;
 }
 return slots.reduce((count,_gold,slot)=>count+Number(assign(slot,new Set())),0);
}
for(let seed=17;seed<23;seed++){
 const current=seed===17?waves:build(12,seed);let completed=0;
 for(const w of current.filter(w=>w.stage>=2)){
  const base=3+(w.stage<4?Math.floor(completed/2):completed)+3*(w.stage-2);if(w.encounterKind!=='specialShop')completed++;
  if(w.encounterKind==='monster'||w.encounterKind==='specialShop'){assert.equal(w.goldBudget,undefined);assert.equal(w.enemyUpgrade,undefined);continue;}
  const d=w.goldBudget,bonus=w.encounterKind==='elite'?w.stage:w.encounterKind==='boss'?2*w.stage:0;
  assert.equal(d.baseGold,base);assert.equal(d.bonusGold,bonus);assert.equal(d.totalGold,base+bonus);assert.equal(d.version,'gold-v1');
  assert.equal(d.spentGold,w.enemies.reduce((sum,u)=>sum+enemyUnitGold(roster.get(u.unitId),u.star),0));
  assert.equal(d.remainingGold,d.totalGold-d.spentGold);assert.ok(d.remainingGold>=0);assert.equal(d.population,w.enemies.length);
  assert.deepEqual(d.shopRates,[...SHOP_RATES[w.enemies.length-1]],'enemy population uses the exact player-level shop rates');
  assert.equal(d.shopLevel,w.enemies.length);assert.equal(w.budget,undefined,'gold selection does not query the obsolete power budget');
  assert.equal(new Set(w.enemies.map(u=>u.x+','+u.y)).size,w.enemies.length);
  for(const u of w.enemies){assert.ok(u.x>=0&&u.x<7&&u.y>=4&&u.y<8);assert.ok(u.star>=1&&u.star<=3);assert.ok(d.shopRates[roster.get(u.unitId).cost-1]>0);}
  for(const a of w.enemies)for(const b of w.enemies)if(roster.get(a.unitId).range<roster.get(b.unitId).range)assert.ok(a.y<=b.y,'shorter-range units stay in front of longer-range units');
  assert.ok(d.distinctUnits>=Math.min(w.enemies.length,5),'composition avoids repeat-heavy armies');
  const theme=i.battle.traits.find(t=>t.id===d.themeTrait);assert.ok(theme);assert.equal(d.themeMembers,new Set(w.enemies.filter(u=>theme.members.includes(u.unitId)).map(u=>u.unitId)).size);
  assert.ok(d.themeMembers>=Math.min(2,feasibleThemeMembers(w,theme)),`an army leans toward its feasible faction: seed ${seed}, ${w.stage}-${w.round}, ${d.themeTrait}, ${d.themeMembers} members, ${d.totalGold} gold`);
  const eq=w.enemyUpgrade;assert.equal(eq.goldBudget,6*(w.stage-1)+bonus);assert.equal(eq.goldBudget,eq.goldSpent+eq.goldRemaining);
  assert.equal(eq.goldSpent,eq.equipmentIds.reduce((n,id)=>n+(e.equipmentPolicy.enemy.itemTags[id].goldCost??6),0));
  assert.ok(w.enemies.every(u=>u.equipment.length<=3));
 }
}
const authored=waves.filter(w=>w.goldBudget),find=(s,r)=>authored.find(w=>w.stage===s&&w.round===r);
assert.equal(find(2,1).goldBudget.baseGold,3);assert.equal(find(3,1).goldBudget.baseGold,8);
assert.equal(generateGoldArmy(rules,2,1,50,'normal',3,i.units,i.battle.traits,new RunRandomContext(1)).diagnostics.baseGold,3);
assert.equal(generateGoldArmy(rules,2,2,51,'normal',3,i.units,i.battle.traits,new RunRandomContext(1)).diagnostics.baseGold,4);
const direct=generateGoldArmy(rules,2,4,8,'normal',4,i.units,i.battle.traits,new RunRandomContext(1));assert.equal(direct.diagnostics.totalGold,5);
assert.ok(waves.find(w=>w.stage===99&&w.encounterKind==='boss').goldBudget.totalGold>1000,'unit gold has no budget cap');
assert.equal(waves.find(w=>w.stage===99&&w.encounterKind==='elite').enemyUpgrade.goldBudget,687);
assert.equal(waves.find(w=>w.stage===99&&w.encounterKind==='boss').enemyUpgrade.goldBudget,786);
assert.ok(waves.find(w=>w.stage===99&&w.encounterKind==='boss').enemyUpgrade.goldRemaining>0,'full equipment slots report unspent gold explicitly');
for(const stage of [3,6,12])assert.deepEqual(build(stage),waves.filter(w=>w.stage<=stage),'campaign extensions preserve the entire prefix');
assert.deepEqual(build(6),build(6),'same seed gives identical units, ranks, rows, theme and equipment');
// A synthetic complete faction demonstrates that theme and uniqueness are real purchasing preferences.
const oneCost=Array.from({length:8},(_,n)=>({...i.units[0],id:'theme_'+n,cost:1,range:n%2?4:1}));
const theme={id:'fixture',name:'fixture',glyph:'F',description:'',members:oneCost.map(u=>u.id),breakpoints:[{count:3,tier:'bronze'}]};
const themed=generateGoldArmy({...rules,themeTraits:['fixture']},2,3,7,'normal',3,oneCost,[theme],new RunRandomContext(3));
assert.equal(themed.diagnostics.distinctUnits,3);assert.equal(themed.diagnostics.themeMembers,3);
// An independent exhaustive oracle checks actual gold per unit, rather than comparing star counts.
const balancedRoster=[1,2,3].flatMap(cost=>Array.from({length:5},(_,n)=>({...i.units[0],id:`balanced_${cost}_${n}`,cost})));
const balancedTheme={...theme,members:balancedRoster.map(u=>u.id)};
const values=[1,2,3,6,9,18,27],oracle=new Map();
function enumerate(count,start,sum,squares){
 if(!count){oracle.set(sum,Math.min(oracle.get(sum)??Infinity,squares));return;}
 for(let n=start;n<values.length;n++)enumerate(count-1,n,sum+values[n],squares+values[n]**2);
}
enumerate(4,0,0,0);
for(let budget=4;budget<=60;budget++){
 const result=generateGoldArmy({...rules,initialGold:budget,themeTraits:['fixture']},2,0,budget,'normal',4,balancedRoster,[balancedTheme],new RunRandomContext(17));
 const invested=result.enemies.map(u=>enemyUnitGold(balancedRoster.find(v=>v.id===u.unitId),u.star));
 const expectedSpend=Math.max(...[...oracle.keys()].filter(n=>n<=budget));
 assert.equal(result.diagnostics.spentGold,expectedSpend);
 assert.equal(invested.reduce((n,gold)=>n+gold**2,0),oracle.get(expectedSpend),'same-budget armies minimize per-unit investment variance');
 assert.equal(result.diagnostics.distinctUnits,4);assert.equal(result.diagnostics.themeMembers,4);
}
const interchangeable=[1,3].flatMap(cost=>Array.from({length:6},(_,n)=>({...i.units[0],id:`equal_gold_${cost}_${n}`,cost})));
const uniqueEven=generateGoldArmy({...rules,initialGold:72,themeTraits:['fixture']},2,0,900,'normal',8,
 interchangeable,[{...theme,members:interchangeable.map(u=>u.id)}],new RunRandomContext(17));
assert.equal(uniqueEven.diagnostics.distinctUnits,8,'equal-investment fee/rank alternatives avoid unnecessary repeated units');
assert.ok(uniqueEven.enemies.every(u=>enemyUnitGold(interchangeable.find(v=>v.id===u.unitId),u.star)===9));
const placements=tidyEnemyRows(Array.from({length:10},(_,n)=>({unitId:oneCost[n%8].id,star:1,x:0,y:4,statMultiplier:1})),oneCost);
assert.equal(new Set(placements.map(u=>u.x+','+u.y)).size,10);
for(const bad of [{...rules,initialGold:-1},{...rules,maxShopRolls:0},{...rules,goldPerStage:NaN}])assert.throws(()=>validateEnemyGoldRules(bad),/Invalid enemy gold/);
function make(save){const c=new ConfigManager();c.setUnits(i.units);c.setSkills(i.skills);c.setEquipment(i.equipment);c.setBattle(i.battle);
 return new RunSession(c,i.run,i.waves,{...g,...e,...f,runSeed:17,stageCount:12,...(save?{save}:{})});}
const s=make();
const ordinary=s.waves.find(w=>w.stage===4&&w.encounterKind==='normal');assert.ok(s.debugJump(4,ordinary.round));
assert.deepEqual(s.formation.placements,s.flow.wave.enemies,'old formation solver cannot overwrite range-based rows');
for(let n=0;n<10;n++)s.createPreview();const restored=make(s.snapshot());assert.deepEqual(restored.waves,s.waves);assert.deepEqual(restored.formation,s.formation);
if(!s.owned.onBoard().length)s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3});
assert.deepEqual(s.startBattle().units.filter(u=>u.side===1).map(u=>[u.cfg.id,u.star,u.x,u.y]),s.flow.wave.enemies.map(u=>[u.unitId,u.star,u.x,u.y]));
console.log('PASS gold enemy generation: exact per-round/stage/kind gold, real 1/3/9-copy costs, player shop tables, themed diverse armies, tidy range rows, uncapped normal/elite/boss equipment, 99-stage saturation accounting, deterministic prefixes/save/preview and actual battle placement');
