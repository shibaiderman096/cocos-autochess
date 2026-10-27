require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {SHOP_RATES}=require('../assets/scripts/core/ShopConfig.ts');
const {RoundFlow}=require('../assets/scripts/core/RoundFlow.ts');
const t=require('../tools/run-simulation.ts'),i=t.loadRunInputs(),deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const clone=x=>JSON.parse(JSON.stringify(x));
function cfg(items=i.equipment){const c=new ConfigManager();c.setUnits(i.units);c.setSkills(i.skills);c.setBattle(i.battle);c.setEquipment(items);return c;}
function make(options={}){return new RunSession(cfg(),i.run,i.waves,{...deps,runSeed:217,...options});}
assert.deepEqual([...new Set(i.equipment.map(e=>e.quality))].sort(),[1,2,3,4,5]);
for(const level of [1,3,5,7,10]){
 const counts=[0,0,0,0,0];
 for(let seed=1;seed<=300;seed++){
  const c=cfg(),state=freshStageProgress(),p=new StageProgression(i.run.stageEncounters,state,c,new CardPool(i.units),new OwnedUnits(),new EconomySystem(),new RunRandomContext(seed),9,deps.equipmentPolicy.tiers,()=>level);
  p.enter({id:17,stage:4,round:3,encounterKind:'specialShop'});
  for(const offer of state.pending.offers){const item=offer.kind==='unit'?c.getUnit(offer.id):c.getEquipment([offer.id])[0],quality=offer.kind==='unit'?item.cost:item.quality;counts[quality-1]++;assert.ok(i.run.stageEncounters.shop.qualityRates[quality-1]>0);assert.equal(offer.price,offer.kind==='unit'?item.cost:c.equipmentPrice(offer.id,i.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[offer.id]]));}
  const restoredState=clone(state),restored=new StageProgression(i.run.stageEncounters,restoredState,c,new CardPool(i.units),new OwnedUnits(),new EconomySystem(),new RunRandomContext(seed),9,deps.equipmentPolicy.tiers,()=>level);restored.enter({id:17,stage:4,round:3,encounterKind:'specialShop'});assert.deepEqual(restoredState.pending,state.pending);
 }
 const total=counts.reduce((a,b)=>a+b,0);for(let n=0;n<5;n++)if(i.run.stageEncounters.shop.qualityRates[n]>0)assert.ok(counts[n]>0,`level ${level} quality ${n+1}`);
 assert.ok(counts.every((count,n)=>Math.abs(count/total*100-i.run.stageEncounters.shop.qualityRates[n])<12),'observed mixed merchant offers follow fixed quality odds with unavailable tier redistribution');
}
for(const gold of [0,9,10,49,50,100])for(const streak of [0,1,2,3,5,6,9])for(const win of [false,true]){
 const e=new EconomySystem(undefined,{gold,winStreak:win?streak:0,loseStreak:win?0:streak}),before=e.snapshot(),p=e.preview(4,2);
 assert.deepEqual(e.snapshot(),before);assert.deepEqual(p.win,new EconomySystem(undefined,before).settleBattle(4,{winner:0,extraIncome:2}));assert.deepEqual(p.loss,new EconomySystem(undefined,before).settleBattle(4,{winner:1}));
 assert.equal(p.win.floorIncome,0);assert.equal(p.streakBonus,Math.min(3,Math.floor(streak/2)));assert.equal(p.progress,Math.min(6,streak));
}
console.log('PASS quality and economy: five authored tiers, fixed weighted draws at all levels, no unavailable quality, fixed prices, frozen reload, real-settlement projections, interest/streak caps and zero preview mutation');
function endBoundary(s,stage,winner,health=100){
 const w=s.waves.filter(w=>w.stage===stage).at(-1);assert.ok(s.debugJump(stage,w.round));s.flow.state.health=health;
 if(!s.owned.onBoard().length)assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
 const sim=s.startBattle();assert.ok(sim);sim.end(winner);assert.ok(s.settleBattle());
}
for(const stage of [3,6,10,11,99])for(const winner of [0,1]){
 const s=make({stageCount:stage});endBoundary(s,stage,winner);assert.ok(s.flow.health>0);assert.equal(s.flow.phase,'settlement');assert.equal(s.flow.result,null);assert.equal(s.flow.lastSettlement.runResult,null);
 const p=s.pendingStageReward;if(p)assert.ok(s.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'claim'}).ok);
 if(stage===10){assert.ok(s.portalAvailable);assert.equal(s.nextWave(),false);assert.ok(s.enterPortal());}else{assert.equal(s.portalAvailable,false);assert.ok(s.nextWave());}
 assert.equal(s.flow.wave.stage,stage+1);assert.equal(s.flow.wave.round,1);const restored=make({save:s.snapshot()});assert.equal(restored.flow.wave.stage,stage+1);assert.equal(restored.flow.result,null);
}
const dead=make();endBoundary(dead,10,1,1);assert.equal(dead.flow.health,0);assert.equal(dead.flow.phase,'ended');assert.equal(dead.flow.result,'defeat');assert.equal(dead.portalAvailable,false);assert.equal(dead.nextWave(),false);
const flow=new RoundFlow([{id:1,name:'test',enemies:[]}],{initialHealth:100,lossPerEnemy:1,continueAtBoundary:true});flow.startBattle();flow.settle(1,0);assert.equal(flow.phase,'settlement');assert.equal(flow.nextWave(),false,'a finite buffer cannot advance out of bounds before the session extends it');
const oldItems=i.equipment.map(({quality,...rest})=>rest),oldRun=clone(i.run);delete oldRun.stageEncounters.shop.qualityRates;delete oldRun.stageEncounters.shop.refreshQuality;oldRun.stageEncounters.shop.equipmentQualityOdds="shop-level";
const old=new RunSession(cfg(oldItems),oldRun,i.waves,{...deps,runSeed:217}),save=old.snapshot(),restored=make({save});assert.equal(restored.economy.gold,save.gold);assert.deepEqual(restored.owned.snapshot(),save.owned);
console.log('PASS health-only game end: survived wins/losses at stages 3/6/10/11/99, stage-10 portal, stage 100 reload, lethal loss and catalogue/quality rule migration');
const report=t.runSimulation({...i,battle:{...i.battle,maxTicks:1,lossPerEnemy:0}},{runSeed:217,stageCount:11,maxStage:11,enemyGenerationMode:'legacy'});
assert.equal(report.result,'MAX_WAVE_REACHED',report.error);assert.ok(report.waves.some(w=>w.stage===11));assert.equal(report.gameResult,null);
console.log('PASS campaign simulation follows the stage-10 portal without inventing a victory ending');
