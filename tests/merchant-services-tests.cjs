require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {FORGE_GAINS,forgeCandidates,dicePayout,diceMultiplier}=require('../assets/scripts/core/MerchantServices.ts');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs();
const deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
function session(save,seed=10627){
 const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);
 const s=new RunSession(cfg,input.run,input.waves,{...deps,stageCount:6,runSeed:save?.runSeed??seed,enemyGenerationMode:'budget-v1',...(save?{save}:{})});
 if(s.pendingOpeningEncounter)assert.ok(s.chooseOpeningEncounter('inspiration').ok);return s;
}
function merchant(s){const wave=s.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');assert.ok(s.debugJump(4,wave.round));s.economy.gold=10000;}
{
 const s=session();s.owned.equipmentReserve.push('basic_iron_shield');const before=JSON.stringify(s.snapshot());
 assert.equal(s.enhanceEquipment(0,'basic_iron_shield').ok,false);assert.equal(JSON.stringify(s.snapshot()),before);
 merchant(s);s.owned.equipmentReserve.push('basic_iron_shield','guinsoo');
 const count=s.cfg.allEquipment().length;let id=s.owned.equipmentReserve[0],old=s.cfg.getEquipmentReserve([id])[0];
 for(let level=0;level<12;level++){
  const gold=s.economy.gold,candidates=forgeCandidates(old,level);assert.ok(s.enhanceEquipment(0,id).ok);
  id=s.owned.equipmentReserve[0];const item=s.cfg.getEquipmentReserve([id])[0],key=s.save.merchantServices.forged[id].upgrades[level];
  assert.ok(candidates.includes(key));assert.equal(Math.round((item[key]-(old[key]??0))*1e8)/1e8,FORGE_GAINS[key]);
  assert.equal(s.economy.gold,gold-3);assert.equal(item.quality,Math.min(5,level+2));assert.equal(item.shopPrice,3+3*(level+1));old=item;
 }
 assert.equal(s.cfg.allEquipment().length,count,'forged instances never enter reward or enemy catalogue');
 assert.equal(s.owned.equipmentReserve[1],'basic_iron_shield','same-base copy remains untouched');
 assert.equal(s.cfg.getEquipmentReserve(['basic_iron_shield'])[0].armor,input.equipment.find(e=>e.id==='basic_iron_shield').armor);
 assert.equal(s.canForge('guinsoo'),true);assert.equal(s.enhanceEquipment(99,'guinsoo').ok,false);assert.equal(s.enhanceEquipment(0,'stale').ok,false);
 const target=s.owned.all()[0];assert.ok(s.equipItem(target.uid,0).ok);
 const loaded=session(s.snapshot());assert.equal(loaded.owned.get(target.uid).equipment[0],id);assert.deepEqual(loaded.cfg.getEquipment([id]),s.cfg.getEquipment([id]));
 assert.ok(loaded.unequipItem(target.uid,0).ok);const idx=loaded.owned.equipmentReserve.indexOf(id);
 assert.equal(loaded.equipmentRecycleGold(idx),Math.floor((3+12*3)/2));assert.ok(loaded.recycleEquipment(idx,id).ok);
 const saved=s.snapshot(),record=saved.merchantServices.forged[id];record.upgrades[0]='armor';assert.throws(()=>session(saved),/Invalid forged stat/);
 const poor=session();merchant(poor);poor.owned.equipmentReserve.push('basic_life_heart');poor.economy.gold=2;
 const original=JSON.stringify(poor.snapshot());assert.equal(poor.enhanceEquipment(0,'basic_life_heart').error,'not_enough_gold');assert.equal(JSON.stringify(poor.snapshot()),original);
 poor.economy.gold=3;assert.ok(poor.enhanceEquipment(0,'basic_life_heart').ok);assert.equal(poor.economy.gold,0);
 const repeat=session();merchant(repeat);repeat.owned.equipmentReserve.push('basic_life_heart','basic_life_heart');
 assert.ok(repeat.enhanceEquipment(0,'basic_life_heart').ok);const fork=session(repeat.snapshot()),custom=repeat.owned.equipmentReserve[0];
 assert.ok(repeat.enhanceEquipment(0,custom).ok);assert.ok(fork.enhanceEquipment(0,custom).ok);
 assert.deepEqual(repeat.cfg.getEquipment([custom]),fork.cfg.getEquipment([custom]),'reload does not reroll the next upgrade');
 assert.ok(repeat.enhanceEquipment(1,'basic_life_heart').ok);assert.notEqual(repeat.owned.equipmentReserve[0],repeat.owned.equipmentReserve[1]);
 const bad=repeat.snapshot();bad.equipmentReserve.push(custom);assert.throws(()=>session(bad),/Duplicate forged/);
}
{
 const s=session();merchant(s);s.owned.equipmentReserve.push('basic_iron_shield');
 for(let i=0;i<4;i++)assert.ok(s.enhanceEquipment(0,s.owned.equipmentReserve[0]).ok);

}
{

}
{
 let wins=0,losses=0;const faces=new Set();
 for(let seed=1;seed<=36;seed++){
  const s=session(undefined,seed);merchant(s);const gold=s.economy.gold;
  assert.ok(s.beginDiceBet(5,[1,2,3]).ok);const bet=s.merchantDice;faces.add(bet.face);
  assert.equal(s.economy.gold,gold-5);assert.equal(s.beginDiceBet(1,[4,5,6]).ok,false);
  assert.equal(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'continue'}).error,'dice_rolling');
  const restored=session(s.snapshot());assert.deepEqual(restored.merchantDice,bet);assert.ok(restored.finishDiceBet(bet.id).ok);
  const payout=dicePayout(bet);if(payout)wins++;else losses++;
  assert.equal(restored.economy.gold,gold-5+payout);assert.equal(restored.finishDiceBet(bet.id).ok,false);
  const settled=session(restored.snapshot());assert.equal(settled.economy.gold,restored.economy.gold);assert.ok(settled.merchantDice.settled);
  assert.ok(settled.claimStageReward({type:'stageChoice',rewardId:settled.pendingStageReward.id,choice:'continue'}).ok);
 }
 assert.equal(faces.size,6);assert.ok(wins&&losses);
 const s=session();merchant(s);for(const args of [[3,[1]],[5,[]],[-1,[1]],[5,[1,1]],[5,[1,2,3,4]],[5,[0]],[5,[7]],[5,[1.5]],[5,'invalid']])assert.equal(s.beginDiceBet(...args).ok,false);
 s.economy.gold=0;assert.equal(s.beginDiceBet(1,[4,5,6]).error,'not_enough_gold');
 s.economy.gold=999999;assert.equal(s.beginDiceBet(1,[4,5,6]).error,'attribute_overflow','payout cannot exceed save wallet capacity');
 const invalid=session();merchant(invalid);assert.ok(invalid.beginDiceBet(1,[1,2,3]).ok);const saved=invalid.snapshot();saved.merchantServices.dice.waveId++;
 assert.throws(()=>session(saved),/Invalid pending merchant bet/);
}
{
 for(const picks of [[1],[1,3],[1,3,5]]){
  for(let face=1;face<=6;face++)assert.equal(dicePayout({picks,face,stake:5}),picks.includes(face)?5*(6/picks.length):0);
  const s=session();merchant(s);const gold=s.economy.gold;assert.ok(s.beginDiceBet(5,picks).ok);
  const bet=s.merchantDice;picks[0]=6;assert.notDeepEqual(s.merchantDice.picks,picks,'caller cannot mutate frozen choices');
  bet.picks.push(6);assert.notDeepEqual(s.merchantDice.picks,bet.picks,'observation is detached');
  const restored=session(s.snapshot());const frozen=restored.merchantDice;assert.ok(restored.finishDiceBet(frozen.id).ok);
  assert.equal(restored.economy.gold,gold-5+dicePayout(frozen));
 }

}
console.log('PASS merchant services: independent forged instances, first two new stats, unlimited upgrades, quality/price, equip/reload/recycle, frozen dice outcomes and exactly-once payouts');
