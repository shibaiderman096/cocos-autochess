require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts'),{ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadEquipmentInputs,loadFormationInputs,runSimulation}=require('../tools/run-simulation.ts');
const {createBot,loadBotConfigs}=require('../tools/bots/factory.ts'),{formationCells}=require('../tools/bots/formation-policy.ts');
const {bankReserve}=require('../tools/bots/economy-policy.ts'),{wilson,distribution}=require('../tools/balance/statistics.ts');
const i=loadRunInputs(),g=loadEnemyGenerationInputs(),f=loadFormationInputs(),e=loadEquipmentInputs(),configs=loadBotConfigs();let passed=0;
const clone=v=>JSON.parse(JSON.stringify(v)),sha=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function session(){const cfg=new ConfigManager();cfg.setUnits(i.units);cfg.setSkills(i.skills);cfg.setBattle(i.battle);cfg.setEquipment(i.equipment);return new RunSession(cfg,i.run,i.waves,{runSeed:17,stageCount:3,...g,...f,...e});}
test('P4 observation is current public information, detached/frozen and has no future/RNG/model or privileged core references',()=>{
 const s=session(),p=s.botPort(),o=p.observe();for(const key of ['pool','waves','save','random','battleSeed','enemyPower','enemyBudget'])assert.equal(o[key],undefined);
 assert.deepEqual(Object.keys(p).sort(),['act','observe']);assert.ok(o.currentEnemyPreview.length);assert.equal(o.catalog.economy.interestRate,.1);
 const hp=s.cfg.allUnits()[0].hp;o.catalog.units[0].hp=999999;assert.equal(s.cfg.allUnits()[0].hp,hp);assert.ok(Object.isFrozen(o.catalog.units[0]));assert.ok(Object.isFrozen(o.currentEnemyPreview));
 o.state.gold=99999;assert.notEqual(p.observe().state.gold,99999);Object.defineProperty(s.waves[1],'enemies',{get(){throw Error('future leak');}});createBot('strong').prepare(p);
});
test('formal policy modules cannot import battle simulation, calibrated model, orchestration or privileged mutation APIs',()=>{
 for(const name of ['evaluation','economy-policy','shop-policy','roster-policy','formation-policy','equipment-policy','heuristic-bot']){
  const text=fs.readFileSync(path.join(__dirname,'../tools/bots',name+'.ts'),'utf8');assert.ok(!/from\s+['"][^'"]*(EnemyPowerModel|BattleSim|RunSession)['"]/.test(text),name);
  assert.ok(!/Math\.random|Date\.now|debugJump|\.economy\.|\.owned\.|\.random\.stream/.test(text),name);
 }
});
test('all three bots run real public actions, conserve cards/equipment/gold, and repeat complete decisions and battles',()=>{
 for(const bot of ['weak','medium','strong']){const a=runSimulation(i,{runSeed:17,stageCount:6,bot}),b=runSimulation(i,{runSeed:17,stageCount:6,bot});
  assert.notEqual(a.result,'SIMULATION_ERROR',a.error);assert.deepEqual(a,b);assert.equal(a.botVersion,bot==='medium'?'medium-v2r1b':bot+'-v1');assert.match(a.botConfigHash,/^[a-f0-9]{64}$/);
  for(const w of a.waves){assert.ok(w.playerUnits.length>0&&w.playerUnits.length<=w.levelAtBattle);assert.ok(w.goldAtBattle>=0);assert.equal(w.botMetrics.failedActions,0);assert.ok(w.actions.length<500);
   for(const u of [...w.playerUnits,...w.benchUnits])assert.ok((u.equipment?.length??0)<=3);}
  // Automatic monster rewards need no choice; natural runs may end before their first Boss.
  assert.ok(a.waves.some(w=>w.encounterKind==='monster'||w.stage===1));
 }
});
test('all bot purchase/reward/formation/equipment histories preserve 3/6/99 common prefixes',()=>{
 for(const bot of ['weak','medium','strong']){const small=runSimulation(i,{runSeed:19,stageCount:3,bot}),middle=runSimulation(i,{runSeed:19,stageCount:6,bot}),large=runSimulation(i,{runSeed:19,stageCount:99,bot,maxWaves:38});
  for(const r of [small,middle,large])assert.notEqual(r.result,'SIMULATION_ERROR',r.error);
  assert.deepEqual(small.waves,middle.waves.slice(0,small.waves.length));assert.deepEqual(middle.waves,large.waves.slice(0,middle.waves.length));
 }
});
test('all three bots claim a real Boss victory through the public port and equip its reward next wave',()=>{
 for(const bot of ['weak','medium','strong']){
  const initial=session().snapshot();initial.stageCount=6;initial.level=3;initial.exp=0;
  initial.owned=['enderman','iron_golem','guardian'].map((unitId,n)=>({uid:n+1,unitId,star:3,location:'board',x:2+n,y:3,equipment:[]}));initial.nextOwnedUid=4;
  const cfg=new ConfigManager();cfg.setUnits(i.units);cfg.setSkills(i.skills);cfg.setBattle(i.battle);cfg.setEquipment(i.equipment);
  const s=new RunSession(cfg,i.run,i.waves,{save:initial,...g,...f,...e});
  const boss=s.waves.find(w=>w.stage===4&&w.encounterKind==='boss');assert.ok(s.debugJump(4,boss.round));
  const battle=s.startBattle();assert.equal(battle.run().winner,0,'controlled three-star formation must actually win');s.settleBattle();
  const policy=createBot(bot),actions=policy.claimRewards(s.botPort());assert.ok(actions.length>=2);assert.ok(actions.every(a=>a.result.ok));
  assert.equal(s.pendingStageReward,undefined);assert.equal(s.owned.equipmentReserve.length,1);assert.ok(s.nextWave());policy.prepare(s.botPort());
  assert.ok(s.owned.all().some(u=>u.equipment.length));assertLegalSession(s);
 }
});
test('economy policies use true interest rules and spend reserves under low HP without changing game rules',()=>{
 const o=session().botPort().observe();o.state.stage=8;o.state.gold=57;o.state.playerHp=o.catalog.initialHealth;
 const safe=bankReserve(o,configs.medium);assert.equal(safe,50);o.state.playerHp=1;assert.equal(bankReserve(o,configs.medium),0);
 assert.equal(o.catalog.xpPurchase.gold,4);assert.equal(o.catalog.refreshCost,2);assert.equal(o.catalog.maxEquipment,3);
});
test('Strong responds to current visible enemy flank, while basic rows do not read future information',()=>{
 const o=session().botPort().observe();o.unitCap=3;o.units=[{uid:1,unitId:'guardian',cost:1,star:2,location:'board',x:3,y:3,equipment:[]},
  {uid:2,unitId:'mage',cost:3,star:2,location:'board',x:0,y:0,equipment:[]},{uid:3,unitId:'archer',cost:1,star:2,location:'board',x:6,y:0,equipment:[]}];
 const enemy=x=>[{unitId:'enderman',star:2,x,y:4,statMultiplier:1,equipment:[]}];o.currentEnemyPreview=enemy(0);const left=formationCells(o,configs.strong);o.currentEnemyPreview=enemy(6);assert.notDeepEqual(formationCells(o,configs.strong),left);
 o.currentEnemyPreview=enemy(0);const basic=formationCells(o,configs.weak);o.currentEnemyPreview=enemy(6);assert.deepEqual(formationCells(o,configs.weak),basic);
});
test('metrics have Wilson 95% intervals, explicit zero denominators and censored star timing coverage',()=>{
 const x=wilson(50,100);assert.equal(x.rate,.5);assert.ok(x.low<.5&&x.high>.5);assert.equal(wilson(0,0).rate,null);assert.equal(wilson(0,0).low,null);
 assert.deepEqual(distribution([2,4,null]),{observed:2,total:3,unobserved:1,p25:2.5,median:3,p75:3.5});
});
test('formal bot tools retain original experiment evidence and corrected prices',()=>{
 require('./high-cost-pricing-compatibility.cjs').assertPricingCorrection();
 require('./archive-evidence.cjs').assertArchivedEvidence(require('../docs/p4-balance/baseline/frozen.json').hashes);
});
console.log(`Formal bots: ${passed} passed, 0 failed`);
