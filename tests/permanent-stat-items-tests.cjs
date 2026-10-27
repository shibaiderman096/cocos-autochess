require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {RunSession} = require('../assets/scripts/core/RunSession.ts');
const {OwnedUnits} = require('../assets/scripts/core/OwnedUnits.ts');
const {StageProgression,freshStageProgress} = require('../assets/scripts/core/StageProgression.ts');
const {RunRandomContext} = require('../assets/scripts/core/RunRandomContext.ts');
const {CardPool} = require('../assets/scripts/core/CardPool.ts');
const {EconomySystem} = require('../assets/scripts/core/EconomySystem.ts');
const {buildUnitDetailData} = require('../assets/scripts/ui/UnitDetailPresentation.ts');
const {equipmentStatRows,equipmentDescriptionRichText} = require('../assets/scripts/ui/EquipmentPresentation.ts');
const t = require('../tools/run-simulation.ts'), input = t.loadRunInputs();
const deps = {...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const clone = v => JSON.parse(JSON.stringify(v));
const boosts = input.equipment.filter(e => e.consumable?.kind === 'permanentStat');
function config(items = input.equipment) {
  const c = new ConfigManager(); c.setUnits(input.units); c.setSkills(input.skills); c.setBattle(input.battle); c.setEquipment(items); return c;
}
function session(save, items = input.equipment, equipmentPolicy = deps.equipmentPolicy) {
  const s = new RunSession(config(items),input.run,input.waves,{...deps,equipmentPolicy,stageCount:6,runSeed:save?.runSeed??10627,enemyGenerationMode:'budget-v1',...(save?{save}:{})});
  if(s.pendingOpeningEncounter) assert.ok(s.chooseOpeningEncounter('inspiration').ok);
  return s;
}
function use(s, item, target) {s.owned.equipmentReserve.push(item.id); return s.equipItem(target.uid,s.owned.equipmentReserve.length-1);}
assert.equal(boosts.length,12);
for(const item of boosts) {
  assert.equal(item.shopPrice,[2,4,8,12][item.quality-1]);
  assert.equal(item.consumable.amount,(item.consumable.stat==='hp'?[80,160,320,640]:[4,8,16,32])[item.quality-1]);
  assert.ok(item.specialShopOnly&&item.chestDrop);
  assert.equal(deps.equipmentPolicy.enemy.itemTags[item.id].enabled,false);
  assert.equal(equipmentStatRows(item).length,1);
  assert.match(equipmentDescriptionRichText(item),/<img /);
  for(const star of [1,2,3]) {
    const s = session(), u = s.owned.all()[0]; u.star = star;
    u.equipment = ['basic_iron_shield','basic_mystic_cloak','basic_life_heart'];
    const before = s.snapshot(), count = s.owned.all().length;
    assert.ok(use(s,item,u).ok);
    const total = {hp:'permanentMaxHp',physicalPower:'permanentPhysicalPower',spellPower:'permanentSpellPower'}[item.consumable.stat];
    const source = {hp:'itemHealth',physicalPower:'itemPhysicalPower',spellPower:'itemSpellPower'}[item.consumable.stat];
    assert.equal(u[total],item.consumable.amount); assert.equal(u[source],item.consumable.amount);
    assert.equal(u.equipment.length,3); assert.equal(s.owned.all().length,count); assert.equal(s.owned.equipmentReserve.length,0);
    assert.equal(s.economy.gold,before.gold); assert.deepEqual(s.pool.snapshot(),before.pool);
    assert.ok(use(s,item,u).ok); assert.equal(u[total],2*item.consumable.amount);
    const restored = session(s.snapshot()); assert.deepEqual(restored.owned.snapshot(),s.owned.snapshot());
  }
}
// Growth survives a wave change and feeds real battle stats exactly once, independently of other permanent sources.
{
  const s = session(), u = s.owned.all()[0];
  u.permanentMaxHp=33;u.soulLampHealth=11;u.permanentPhysicalPower=7;u.permanentSpellPower=9;
  for(const item of boosts)assert.ok(use(s,item,u).ok);
  assert.deepEqual([u.itemHealth,u.itemPhysicalPower,u.itemSpellPower],[1200,60,60]);
  assert.deepEqual([u.permanentMaxHp,u.permanentPhysicalPower,u.permanentSpellPower],[1233,67,69]);
  assert.ok(s.moveUnit(u.uid,{location:'board',x:3,y:1}).ok);
  assert.ok(s.debugJump(2,1));
  const preview=s.createPreview(), live=preview.sim.units.find(x=>x.id===preview.battleIds.get(u.uid)), base=s.cfg.scaleUnit(s.cfg.getUnit(u.unitId),u.star);
  assert.equal(live.cfg.hp,base.hp+1233);assert.equal(live.hp,live.cfg.hp);
  assert.equal(live.cfg.physicalPower,(base.physicalPower??0)+67);assert.equal(live.cfg.spellPower,(base.spellPower??0)+69);
  const detail=buildUnitDetailData(s.cfg,live.cfg,u.star,{itemGrowth:u});
  for(const [label,value] of [['道具永久生命','+1200'],['道具永久物理','+60%'],['道具永久法术','+60%']])
    assert.equal(detail.skillStats.find(r=>r.label===label).current,value);
  assert.equal(u.soulLampHealth,11,'item health never enters the skill-specific soul lamp counter');
  const saved=session(s.snapshot());assert.deepEqual(saved.owned.snapshot(),s.owned.snapshot());
  s.owned.equipmentReserve.push(boosts[0].id);assert.ok(s.startBattle());const before=s.snapshot();
  assert.equal(s.equipItem(u.uid,0).error,'fighting');assert.deepEqual(s.snapshot(),before);
}
// Both merge levels sum the original instance bonuses; item metadata never multiplies with star scaling.
{
  const owned=new OwnedUnits(Array.from({length:9},(_,n)=>({uid:n+1,unitId:'crimson_riftclaw',star:1,location:'bench',x:-1,y:n,
    permanentMaxHp:80,permanentPhysicalPower:4,permanentSpellPower:8,itemHealth:80,itemPhysicalPower:4,itemSpellPower:8,equipment:[]})));
  owned.tryMerge('crimson_riftclaw');const [u]=owned.all();assert.equal(owned.all().length,1);assert.equal(u.star,3);
  assert.deepEqual([u.permanentMaxHp,u.permanentPhysicalPower,u.permanentSpellPower,u.itemHealth,u.itemPhysicalPower,u.itemSpellPower],[720,36,72,720,36,72]);
}
// Invalid targets/indices and overflow leave the consumable and ownership untouched.
{
  const s=session(),u=s.owned.all()[0];s.owned.equipmentReserve.push(boosts[0].id);let before=s.snapshot();
  assert.equal(s.equipItem(999999,0).error,'not_owned');assert.deepEqual(s.snapshot(),before);
  assert.equal(s.equipItem(u.uid,-1).error,'invalid_equipment');assert.deepEqual(s.snapshot(),before);
  u.permanentMaxHp=Number.MAX_SAFE_INTEGER;before=s.snapshot();assert.equal(s.equipItem(u.uid,0).error,'attribute_overflow');assert.deepEqual(s.snapshot(),before);
  u.permanentMaxHp=80;u.itemHealth=Number.MAX_SAFE_INTEGER;
  const restored=session(s.snapshot());assert.equal(restored.owned.get(u.uid).itemHealth,80,'source counters are bounded by their total on load');
}
for(const effect of [{kind:'permanentStat',stat:'armor',amount:4},{kind:'permanentStat',stat:'hp',amount:-1},
  {kind:'permanentStat',stat:'hp',amount:1.5},{kind:'permanentStat',stat:'hp',amount:NaN},{kind:'other',stat:'hp',amount:80}]){
  const bad=clone(input.equipment);bad.find(e=>e.id===boosts[0].id).consumable=effect;assert.throws(()=>config(bad),/Invalid equipment consumable/);
}
console.log('PASS permanent items: 12 items/all stars, repeated use with full slots, exact growth, real battle stats, cross-wave/save persistence, two-level merge, source UI, atomic invalid/overflow and config validation');
// New catalogue entries migrate old saves, without returning a consumed item or changing their inventory.
{
  const ids=new Set(boosts.map(e=>e.id)),policy=clone(deps.equipmentPolicy),items=input.equipment.filter(e=>!ids.has(e.id));
  for(const id of ids){delete policy.tiers[id];delete policy.enemy.itemTags[id];}policy.reward.excludedIds=policy.reward.excludedIds.filter(id=>!ids.has(id));
  const old=session(undefined,items,policy),save=old.snapshot(),restored=session(save);
  assert.deepEqual(restored.owned.snapshot(),save.owned);assert.equal(restored.economy.gold,save.gold);assert.deepEqual(restored.owned.equipmentReserve,save.equipmentReserve);
}
const chestSeen=new Set(),merchantSeen=new Set(),c=config();
for(let seed=1;seed<=2048&&(chestSeen.size<12||merchantSeen.size<12);seed++){
  if(chestSeen.size<12){
    const p=new StageProgression(input.run.stageEncounters,freshStageProgress(),c,new CardPool(input.units),new OwnedUnits(),new EconomySystem(),new RunRandomContext(seed),9,deps.equipmentPolicy.tiers,()=>10);
    const reward=p.mixedReward(30,1,100);
    const value=reward.units.reduce((n,id)=>n+c.getUnit(id).cost,0)+reward.equipmentIds.reduce((n,id)=>n+c.equipmentPrice(id,input.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[id]]),0)+reward.health*2+reward.gold;
    assert.equal(value,30);for(const id of reward.equipmentIds)if(boosts.some(e=>e.id===id))chestSeen.add(id);
  }
  if(merchantSeen.size<12){
    const s=new RunSession(c,input.run,input.waves,{...deps,runSeed:seed,stageCount:6,enemyGenerationMode:'budget-v1'});
    const w=s.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');assert.ok(s.debugJump(4,w.round));
    s.economy.add(200);
    const restored=session(s.snapshot());assert.deepEqual(restored.pendingStageReward,s.pendingStageReward,'saved merchant offers retain authored prices, including 8-gold boosts');
    for(let index=0;index<s.pendingStageReward.offers.length;index++){
      const offer=s.pendingStageReward.offers[index],item=boosts.find(e=>e.id===offer.id);if(!item)continue;
      merchantSeen.add(item.id);assert.equal(offer.price,item.shopPrice);const gold=s.economy.gold;
      assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'buy',index}).ok);
      assert.equal(s.economy.gold,gold-item.shopPrice);assert.ok(s.owned.equipmentReserve.includes(item.id));
    }
  }
}
assert.equal(chestSeen.size,12);assert.equal(merchantSeen.size,12);
console.log('PASS permanent item acquisition: all 12 in mixed-budget chests and fixed-quality merchant offers, exact reward accounting, paid purchase and catalogue migration');
