require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {freshExplorerProgress,settleExplorerProgress,isExplorerBattle}=require('../assets/scripts/core/ExplorerProgress.ts');
const {COST_PRICE,validCost}=require('../assets/scripts/core/ShopConfig.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
const clone=x=>JSON.parse(JSON.stringify(x));
const members=inputs.units.filter(u=>!u.specialShopUnlock).slice(0,9).map(u=>u.id);
function make(count=3,save,mode='budget-v1',seed=71,run=inputs.run){
 const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setEquipment(inputs.equipment);
 const battle=clone(inputs.battle),trait=battle.traits.find(t=>t.id==='explorer');trait.members=members;trait.pendingMembers=false;cfg.setBattle(battle);
 const s=new RunSession(cfg,run,inputs.waves,{...deps,stageCount:6,runSeed:seed,enemyGenerationMode:mode,...(save?{save}:{})});
 if(!save){
  for(const u of s.owned.all().slice()){s.owned.remove(u.uid);s.pool.give(u.unitId);}
  s.level.level=9;
  members.slice(0,count).forEach((id,n)=>{assert.ok(s.pool.take(id));const u=s.owned.forceAdd(id);Object.assign(u,{location:'board',x:n%7,y:Math.floor(n/7)});});
  const wave=s.waves.find((w,n)=>w.stage===4&&w.encounterKind==='normal'&&s.waves[n+1]?.encounterKind!=='specialShop');
  assert.ok(s.debugJump(wave.stage,wave.round));
 }
 return s;
}
const price=(s,id)=>s.cfg.equipmentPrice(id,inputs.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[id]]);
const value=(s,g)=>g.units.reduce((sum,id)=>sum+COST_PRICE[validCost(s.cfg.getUnit(id).cost)],0)+g.equipmentIds.reduce((sum,id)=>sum+price(s,id),0)+g.health*2+g.gold;
for(const [count,base,kill,multiplier]of [[3,10,2,2],[5,25,2,2],[7,50,3,2],[9,80,5,3]]){
 const s=make(count),trait=resolveTraits(s.cfg.battle.traits,s.owned.onBoard().map(u=>u.unitId),s.cfg.allUnits()).find(t=>t.config.id==='explorer');
 assert.equal(trait.active.count,count);assert.deepEqual(trait.active.explorer,{pointsPerBattle:base,pointsPerKill:kill,lossMultiplier:multiplier,rewardValuePerPoint:.1});
 for(const winner of [0,1,-1]){const p=freshExplorerProgress();assert.equal(settleExplorerProgress(p,trait.active.explorer,4,winner,1),(base+4*kill)*(winner===0?1:multiplier));assert.equal(settleExplorerProgress(p,trait.active.explorer,4,winner,1),0);}
 const sim=s.startBattle();assert.ok(sim);assert.equal(s.explorerChestVisible,true);assert.equal(s.explorerChestOpenable,false);
 assert.equal(s.act({type:'openExplorerChest'}).ok,false);
 for(const u of sim.units){u.cfg.skillId=undefined;u.cfg.maxMana=0;u.cfg.critChance=0;if(u.side===0){u.hp=100000;u.cfg.hp=100000;u.cfg.atk=100000;}else{u.hp=1;u.cfg.atk=0;}}
 const result=sim.run();assert.equal(result.winner,0);assert.ok(sim.alliedKillCounts[0]>0);
 assert.ok(s.settleBattle());const expected=base+sim.alliedKillCounts[0]*kill;assert.equal(s.explorerPoints,expected);
 assert.equal(s.settleBattle(),null);assert.equal(s.explorerPoints,expected);
 if(s.pendingStageReward)assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'claim'}).ok);
 assert.ok(s.nextWave());assert.equal(s.explorerPoints,expected);assert.equal(s.explorerChestVisible,true);
 const save=s.snapshot(),restored=make(count,save);assert.equal(restored.explorerPoints,expected);
 const grant=s.act({type:'openExplorerChest'}),same=restored.act({type:'openExplorerChest'});
 assert.ok(grant.ok);assert.deepEqual(grant,same,'reload cannot reroll the optional chest');
 assert.equal(value(s,grant.stageReward),Math.ceil(expected*.1));assert.equal(s.explorerPoints,0);
 assert.equal(s.explorerChestVisible,true);assert.equal(s.explorerChestOpenable,false);assert.equal(s.act({type:'openExplorerChest'}).ok,false);
 assert.equal(make(count,s.snapshot()).act({type:'openExplorerChest'}).ok,false);
}
console.log('PASS explorer: all four tiers, real credited kills, win/loss/draw multipliers, once-only settlement, cross-wave bank, deterministic claim and exact reward value');
const inactive=make(2);assert.equal(inactive.explorerChestVisible,false);assert.equal(inactive.explorerPoints,0);
const noEffect=freshExplorerProgress();settleExplorerProgress(noEffect,undefined,10,1,1);assert.equal(noEffect.points,0);
const held=make(3);held.save.explorerProgress.points=32;held.save.stageProgress.unitCredit=2;held.save.stageProgress.equipmentCredit=1;
assert.equal(held.explorerChestValue,4);assert.equal(held.stageProgression.grantExplorerReward(held.explorerChestValue,held.flow.wave.id,0).value,4);
assert.equal(held.save.stageProgress.unitCredit,2);assert.equal(held.save.stageProgress.equipmentCredit,1,'explorer cannot consume unrelated stage credit');
const failed=make(3);failed.save.explorerProgress.points=81;const fight=failed.startBattle();fight.end(1);failed.settleBattle();assert.equal(failed.explorerPoints,101);
const full=make(3);full.save.explorerProgress.points=100;
for(const u of full.cfg.allUnits())while(full.pool.take(u.id)){}
const reward=full.openExplorerChest().stageReward;assert.deepEqual(reward.units,[]);assert.equal(reward.health,0);assert.equal(value(full,reward),10);
const old=make(3).snapshot();delete old.explorerProgress;assert.equal(make(3,old).explorerPoints,0);
const corrupt=clone(old);corrupt.explorerProgress={points:-1,lastSettledWaveId:0,lastOpenedWaveId:0};assert.throws(()=>make(3,corrupt),/explorer progress/);
// Reserving an unassigned trait does not invalidate existing budget-generation saves.
const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setEquipment(inputs.equipment);const oldBattle=clone(inputs.battle);oldBattle.traits=oldBattle.traits.filter(t=>t.id!=='explorer');cfg.setBattle(oldBattle);
const legacy=new RunSession(cfg,inputs.run,inputs.waves,{...deps,runSeed:71,stageCount:6,enemyGenerationMode:'budget-v1'});cfg.setBattle({...inputs.battle,traits:inputs.battle.traits.map(t=>t.id==='explorer'?{...t,members:[],pendingMembers:true}:t)});
assert.equal(new RunSession(cfg,inputs.run,inputs.waves,{...deps,save:legacy.snapshot(),enemyGenerationMode:'budget-v1'}).explorerPoints,0);
console.log('PASS explorer safety: inactive tiers, upward rounding, unrelated-credit isolation, defeat banking, exhausted inventory, old-save adoption and invalid-save rejection');
for(const kind of ['monster','elite','boss','normal']){
 const s=make(3),w=s.waves.find(w=>w.stage===4&&w.encounterKind===kind);assert.ok(s.debugJump(w.stage,w.round));
 const sim=s.startBattle();assert.ok(sim);sim.end(1);s.settleBattle();assert.equal(s.explorerPoints,kind==='monster'?0:20);
}
const shop=make(3),sw=shop.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');assert.ok(shop.debugJump(sw.stage,sw.round));
assert.equal(shop.startBattle(),null);shop.save.explorerProgress.points=32;assert.equal(shop.explorerChestVisible,true);assert.equal(shop.explorerChestOpenable,true);
const merchantReward=clone(shop.pendingStageReward);assert.ok(shop.openExplorerChest().ok);assert.deepEqual(shop.pendingStageReward,merchantReward,'opening explorer chest preserves the merchant offers');
shop.claimStageReward({type:'stageChoice',rewardId:shop.pendingStageReward.id,choice:'continue'});assert.equal(shop.explorerPoints,0);
assert.equal(isExplorerBattle({encounterKind:'normal',enemies:[{unitId:'unlisted_monster'}]},inputs.units),false);
assert.equal(isExplorerBattle({encounterKind:'normal',enemies:[]},inputs.units),false);
console.log('PASS explorer encounter filter: monsters/shops excluded, chess normal/elite/boss included, non-roster enemies excluded');
const wild=make(9);assert.ok(wild.debugJump(1,1));wild.save.explorerProgress.points=32;
const wildSim=wild.startBattle();for(const u of wildSim.units){u.cfg.skillId=undefined;u.cfg.maxMana=0;u.cfg.critChance=0;if(u.side===0){u.hp=100000;u.cfg.hp=100000;u.cfg.atk=100000;}else{u.hp=1;u.cfg.atk=0;}}
assert.equal(wildSim.run().winner,0);assert.ok(wildSim.alliedKillCounts[0]>0);wild.settleBattle();assert.equal(wild.explorerPoints,32,'wild kills and victory add no points and preserve the existing bank');
const twice=make(3);twice.save.explorerProgress.points=32;assert.ok(twice.openExplorerChest().ok);
const secondFight=twice.startBattle();secondFight.end(1);twice.settleBattle();
assert.equal(twice.explorerChestVisible,true);assert.equal(twice.explorerChestOpenable,true);assert.ok(twice.openExplorerChest().ok,'newly earned layers can be opened in settlement without advancing a room');
assert.equal(twice.openExplorerChest().ok,false,'zeroing the bank prevents duplicate grants');

// Gold participates in the full random budget above 30, rather than replacing a fixed excess.
const legacyRun=clone(inputs.run);delete legacyRun.stageEncounters.chestReward.explorerGoldThreshold;
for(const budget of [1,4,29,30]){
 const a=make(3,undefined,'budget-v1',83),b=make(3,undefined,'budget-v1',83,legacyRun);
 const grant=a.stageProgression.grantExplorerReward(budget,a.flow.wave.id,10);
 assert.deepEqual(grant,b.stageProgression.grantExplorerReward(budget,b.flow.wave.id,10),'30 and below retain the exact reward roll');
}
const goldDraws=[];
for(let seed=1;seed<=24;seed++){
 const initial=make(3,undefined,'budget-v1',seed);initial.save.explorerProgress.points=450;
 const saved=initial.snapshot();saved.round.health=90;
 const s=make(3,saved,'budget-v1',seed),restored=make(3,saved,'budget-v1',seed),before=s.economy.gold;
 const grant=s.openExplorerChest().stageReward;
 assert.deepEqual(grant,restored.openExplorerChest().stageReward,'mixed gold cannot be rerolled by reloading');
 assert.equal(value(s,grant),45);assert.equal(s.economy.gold-before,grant.gold);
 assert.equal(s.flow.health,90+grant.health);assert.equal(s.explorerPoints,0);assert.equal(s.openExplorerChest().ok,false);
 assert.ok(grant.units.length+grant.equipmentIds.length+grant.health>0,'gold is mixed with existing rewards');
 goldDraws.push(grant.gold);
}
assert.ok(goldDraws.some(gold=>gold>1),'gold is an intentional draw, not just an unaffordable remainder');
assert.ok(goldDraws.some(gold=>gold>0&&gold<15),'non-gold rewards can exceed 30; gold is not fixed to the excess');
assert.ok(new Set(goldDraws).size>1,'gold quantity varies with the seeded reward roll');
const edge=make(3);edge.save.explorerProgress.points=301;const edgeGrant=edge.openExplorerChest().stageReward;assert.equal(value(edge,edgeGrant),31);
for(const invalid of [-1,.5,NaN]){const run=clone(inputs.run);run.stageEncounters.chestReward.explorerGoldThreshold=invalid;assert.throws(()=>make(3,undefined,'budget-v1',71,run),/mixed chest rules/);}
console.log('PASS explorer gold: exact threshold/rounding, full-budget random mixing, deterministic reload, immediate wallet credit, total value, health cap and once-only opening');
