require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs,runSimulation}=require('../tools/run-simulation.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts'),{ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {EnemyGenerator}=require('../assets/scripts/core/EnemyGenerator.ts'),{EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts'),{buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const {validateEquipmentPolicy,equipmentQuota}=require('../assets/scripts/core/EquipmentPolicy.ts');
const {createEquipmentReward}=require('../assets/scripts/core/EquipmentReward.ts');
const {freshSaveV2,migrateSaveV2}=require('../assets/scripts/core/ShopSave.ts');
const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
const i=loadRunInputs(),g=loadEnemyGenerationInputs(),f=loadFormationInputs(),{equipmentPolicy:p}=loadEquipmentInputs(),model=new EnemyPowerModel(g.enemyPower);
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function config(){const cfg=new ConfigManager();cfg.setUnits(i.units);cfg.setSkills(i.skills);cfg.setBattle(i.battle);cfg.setEquipment(i.equipment);return cfg;}
function session(options={}){return new RunSession(config(),i.run,i.waves,{runSeed:12345,stageCount:10,...g,...f,equipmentPolicy:p,...options});}
function strong(options={}){const seed=session(options),save=seed.snapshot();save.level=10;save.exp=0;
 save.owned=['guardian','mage','archer'].map((unitId,index)=>({uid:index+1,unitId,star:3,location:'board',x:1+index*2,y:index?1:3,equipment:[]}));save.nextOwnedUid=4;
 return session({...options,save});}
function victory(s,stage=3,round=6){assert.equal(s.debugJump(stage,round),true);const sim=s.startBattle();assert.ok(sim);assert.equal(sim.run().winner,0,'real BattleSim victory required');assert.ok(s.settleBattle());return s.pendingEquipmentReward;}
const build=(stages=99,policy=p)=>buildRunWaves(stages,i.run,i.waves,i.units,{mode:'budget-v1',runSeed:12345,power:g.enemyPower,difficulty:g.enemyDifficulty,equipmentPolicy:policy,equipmentRoles:f.enemyRoles});
const waves=build(),baseline=require('../docs/p3-equipment/pre-p3-waves.json');

test('P3-0 old model, combat, stats, content, P2 solver and all previous evidence are byte protected',()=>{
 const hashes=require('../docs/p3-equipment/pre-p3-hashes.json'),{changedFiles}=require('./p3-equipment-compatibility.cjs');
 const external=require('../docs/p3-equipment/concurrent-changes.json');
 for(const [file,digest]of Object.entries(hashes))if(!changedFiles.has(file))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file))).digest('hex'),external[file]?.after??digest,file);
 assert.deepEqual(buildRunWaves(99,i.run,i.waves,i.units,{mode:'budget-v1',runSeed:12345,power:g.enemyPower,difficulty:g.enemyDifficulty}),baseline);
});
test('all 968 waves retain targets, population, classification and hard unlocks; normal/intro/stage1-2 have no items',()=>{
 assert.equal(waves.length,968);
 for(let index=0;index<waves.length;index++){const w=waves[index],b=baseline[index];assert.equal(w.enemies.length,b.enemies.length);assert.equal(w.waveKind,b.waveKind);
  if(!w.budget){assert.deepEqual(w,b);continue;}
  for(const k of ['rawBudget','requestedBudget','effectiveBudget','minFeasibleBudget','maxFeasibleBudget'])assert.equal(w.budget[k],b.budget[k]);
  const quota=equipmentQuota(p,w.stage,w.waveKind);assert.ok(w.enemies.filter(e=>e.equipment.length).length<=quota.maxEquippedUnits);
  for(const e of w.enemies){assert.ok(e.equipment.length<=quota.maxItemsPerUnit);assert.ok(e.equipment.length<=3);assert.ok(e.equipment.every(id=>p.enemy.calibratedItems.includes(id)));
   if(w.waveKind==='normal'||w.stage<=2)assert.equal(e.equipment.length,0);
   assert.ok(i.units.find(u=>u.id===e.unitId).cost<=g.enemyDifficulty.costUnlock.filter(q=>q.stage<=w.stage).at(-1).maxCost);
   if(e.star===3)assert.ok(w.stage>=10&&w.waveKind==='boss');}
  assert.ok(w.enemies.filter(e=>e.star===3).length<=1);
 }
 assert.ok(waves.some(w=>w.enemies.some(e=>(e.equipment?.length??0)>=2)));
});
test('final exact team queries pay for every item and preserve <=5% reachable budget protection',()=>{
 for(const w of waves.filter(w=>w.budget)){const requests=w.enemies.map(e=>({...e,cost:i.units.find(u=>u.id===e.unitId).cost}));
  assert.equal(w.budget.actualBudget,model.estimateTeamPower(requests).power);
  const naked=model.estimateTeamPower(requests.map(e=>({...e,equipment:[]}))).power;
  assert.equal(w.budget.equipmentPowerContribution,w.budget.actualBudget-naked);
  assert.equal(w.budget.enemyEquipmentCount,w.enemies.reduce((n,e)=>n+e.equipment.length,0));
  if(w.budget.feasible)assert.ok(w.budget.deviationPct<=5+1e-9);else assert.ok(w.budget.reason);
 }
});
test('same-budget alternatives can exchange unit/star composition; quota conflicts never give free power',()=>{
 const paid=waves.filter(w=>w.budget?.enemyEquipmentCount);assert.ok(paid.length>0);assert.ok(paid.some(w=>hash(w.enemies.map(e=>[e.unitId,e.star]))!==hash(baseline[w.id-1].enemies.map(e=>[e.unitId,e.star]))));
 const generator=new EnemyGenerator(g.enemyDifficulty,g.enemyPower,i.units,new RunRandomContext(1),p),min=generator.bounds(3,'boss',1).min;
 const budget={...waves.find(w=>w.stage===3&&w.waveKind==='boss').budget,effectiveBudget:min};
 const conflict=generator.generate(budget,1,i.run.enemyProgression.cells).diagnostics;
 assert.equal(conflict.enemyEquipmentActual,0);assert.equal(conflict.equipmentPolicyBudgetConflict,true);assert.ok(conflict.deviationPct<=5);
 assert.ok(conflict.equipmentDiagnostics.some(s=>s.includes('EQUIPMENT_POLICY_BUDGET_CONFLICT')));
});
test('candidate beam cap applies per identity across stars; missing calibration never becomes free equipment',()=>{
 const generator=new EnemyGenerator(g.enemyDifficulty,g.enemyPower,i.units,new RunRandomContext(12345),p,f.enemyRoles);
 assert.ok(generator.selectionPool(10,'boss').candidates.some(c=>c.star===3&&c.equipment.length===3));
 for(const stage of [3,6,8,10,99])for(const kind of ['normal','elite','boss']){const pool=generator.selectionPool(stage,kind),byId={};
  for(const c of pool.candidates)if(c.equipment.length){byId[c.unitId]=(byId[c.unitId]??0)+1;assert.notEqual(c.unitId,'iron_golem');assert.equal(c.power,model.estimateUnitPower(c).power);}
  assert.ok(Object.values(byId).every(n=>n<=p.enemy.maxEquipmentCandidatesPerUnit));}
 const bad=clone(p);bad.enemy.calibratedItems.push('abyssal_plate');assert.throws(()=>validateEquipmentPolicy(bad,i.equipment,g.enemyPower));
 const only=clone(p);only.enemy.topKSingle=1;only.enemy.rolePreferences.tank=['totem_of_undying'];only.enemy.rolePreferences.melee_dps=['infinity_edge'];
 const preferred=new EnemyGenerator(g.enemyDifficulty,g.enemyPower,i.units,new RunRandomContext(1),only,f.enemyRoles).selectionPool(8,'elite').candidates.filter(c=>c.unitId==='guardian'&&c.equipment.length);
 assert.ok(preferred.length);assert.ok(preferred.every(c=>c.equipment[0]==='totem_of_undying'),'use P2 explicit tank role, not the old generic frontline label');
});
test('real duplicate-slot rules and explicit tier/pool validation are preserved',()=>{
 const s=session(),u=s.owned.all()[0];s.owned.equipmentReserve=['guinsoo','guinsoo','guinsoo','guinsoo'];
 for(let n=0;n<3;n++)assert.equal(s.equipItem(u.uid,0).ok,true);assert.equal(s.equipItem(u.uid,0).ok,false);assert.equal(s.owned.equipmentReserve.length,1);
 assert.equal(s.unequipItem(u.uid,0).ok,true);assert.equal(s.owned.equipmentReserve.length,2);
 for(const mutate of [c=>c.tiers.guinsoo='bad',c=>c.enemy.quotas.normal[0].targetItems=1,c=>c.enemy.maxEquipmentCandidatesPerUnit=999,c=>c.reward.eliteChance=NaN]){
  const c=clone(p);mutate(c);assert.throws(()=>validateEquipmentPolicy(c,i.equipment,g.enemyPower));}
});
test('only an actual battle victory creates rewards, including last-wave alive loss semantics',()=>{
 const s=session({stageCount:3});s.moveUnit(1,{location:'board',x:3,y:3});s.debugJump(3,6);const sim=s.startBattle();assert.equal(sim.run().winner,1);s.settleBattle();
 assert.equal(s.flow.result,'victory','existing run completion is survival based');assert.equal(s.pendingEquipmentReward,undefined);assert.equal(s.save.lastEquipmentReward.rewardTriggered,false);
 const win=strong({stageCount:3});assert.ok(victory(win));assert.equal(win.flow.phase,'ended');
});
test('pending freezes the distinct two-choice early fallback, blocks all progression and rejects invalid indices',()=>{
 const s=strong(),pending=victory(s);assert.equal(pending.candidates.length,2);assert.equal(new Set(pending.candidates).size,2);assert.ok(pending.diagnostics.some(d=>d.includes('FEWER_CHOICES')));
 assert.equal(s.canAdvanceWave(),false);assert.equal(s.nextWave(),false);assert.equal(s.startBattle(),null);assert.equal(s.debugJump(4,1),false);
 for(const index of [-1,2,NaN,.5])assert.equal(s.claimEquipmentReward(index).ok,false);
 const copy=s.pendingEquipmentReward;copy.candidates[0]='changed';assert.deepEqual(s.pendingEquipmentReward,pending);
});
test('settle x3 grants currency/XP/reward once and claim is idempotent',()=>{
 const s=strong();victory(s);const before=s.snapshot();assert.equal(s.settleBattle(),null);assert.equal(s.settleBattle(),null);assert.deepEqual(s.snapshot(),before);
 assert.equal(s.claimEquipmentReward(1).ok,true);assert.equal(s.owned.equipmentReserve.length,1);assert.equal(s.claimEquipmentReward(0).ok,false);assert.equal(s.owned.equipmentReserve.length,1);assert.equal(s.nextWave(),true);
});
test('pending save/load, choose second, save/load preserves candidates, gold/XP and compact claimed marker',()=>{
 const a=strong(),pending=victory(a),saved=JSON.parse(JSON.stringify(a.snapshot())),b=session({save:saved});
 assert.deepEqual(b.pendingEquipmentReward,pending);assert.equal(b.economy.gold,a.economy.gold);assert.equal(b.level.exp,a.level.exp);assert.equal(b.nextWave(),false);
 assert.equal(b.claimEquipmentReward(1).ok,true);const after=b.snapshot(),c=session({save:JSON.parse(JSON.stringify(after))});
 assert.equal(c.pendingEquipmentReward,undefined);assert.equal(c.claimEquipmentReward(1).ok,false);assert.deepEqual(c.owned.equipmentReserve,[pending.candidates[1]]);
 assert.equal(c.save.equipmentProgress.lastClaimedWaveId,pending.waveId);assert.equal(c.save.equipmentProgress.guaranteeSatisfied[3],true);assert.equal(c.nextWave(),true);
});
test('old P2 saves pin both policies to none, keep player items and reproduce pre-P3 future enemies',()=>{
 const old=session({equipmentPolicy:undefined}),save=old.snapshot();save.equipmentReserve=['forest_sanctuary'];delete save.enemyEquipmentVersion;delete save.equipmentRewardVersion;delete save.equipmentProgress;
 const resumed=session({save});assert.equal(resumed.save.enemyEquipmentVersion,'none');assert.equal(resumed.save.equipmentRewardVersion,'none');assert.deepEqual(resumed.waves,old.waves);assert.deepEqual(resumed.owned.equipmentReserve,['forest_sanctuary']);
 assert.deepEqual(old.waves,baseline.filter(w=>w.stage<=10));
});
test('menu new-game ticket binds P3 before play; saved configuration/model drift is explicitly rejected',()=>{
 const ticket=freshSaveV2(3,12345,'budget-v1',true),s=session({save:ticket});assert.equal(s.save.enemyEquipmentVersion,p.enemyVersion);assert.ok(s.save.equipmentConfigIdentity);
 const save=s.snapshot(),changed=clone(p);changed.reward.eliteChance=.25;assert.throws(()=>session({save,equipmentPolicy:changed}),/configuration mismatch/);
 const roles=clone(f.enemyRoles);roles.units.guardian.role='melee_dps';assert.throws(()=>session({save,enemyRoles:roles}),/equipment configuration mismatch/);
 assert.throws(()=>session({save,equipmentPolicy:undefined}),/require equipment policy/);
 assert.throws(()=>session({save:{...save,enemyEquipmentVersion:'future'}}),/Unsupported/);
 assert.throws(()=>session({save:{...save,powerModelCalibrationHash:'future'}}),/mismatch/);
});
test('malformed saved pending state rejects instead of silently dropping or regenerating loot',()=>{
 const a=strong();victory(a);const save=a.snapshot();
 for(const mutate of [s=>s.equipmentProgress.pending.candidates=['missing'],s=>s.equipmentProgress.pending.rewardId='changed',s=>s.round.phase='prepare',s=>s.equipmentProgress.lastClaimedWaveId=999]){
  const bad=clone(save);mutate(bad);assert.throws(()=>session({save:bad}),/Invalid saved equipment/);}
});
test('guarantee requires eligible victory, is satisfied on claim, and cannot send special gear early',()=>{
 const c=clone(p);c.reward.bossChance=0;c.reward.eliteChance=0;const s=strong({equipmentPolicy:c}),pending=victory(s);assert.equal(pending.source,'guarantee');assert.notEqual(s.save.equipmentProgress.guaranteeSatisfied[3],true);
 s.claimEquipmentReward(0);assert.equal(s.save.equipmentProgress.guaranteeSatisfied[3],true);
 for(const winner of [1,-1]){const progress={lastClaimedWaveId:0,lastEvaluatedWaveId:0,guaranteeSatisfied:{}};
  assert.equal(createEquipmentReward(c,new RunRandomContext(1),{id:14,stage:3,round:6,roundsInStage:6,waveKind:'boss'},winner,progress).rewardTriggered,false);assert.equal(progress.pending,undefined);}
 for(let seed=1;seed<=20;seed++){const progress={lastClaimedWaveId:0,lastEvaluatedWaveId:0,guaranteeSatisfied:{}};
  const e=createEquipmentReward(c,new RunRandomContext(seed),{id:14,stage:3,round:6,roundsInStage:6,waveKind:'boss'},0,progress);assert.ok(e.rewardCandidates.every(id=>p.tiers[id]!=='special'));}
});
test('reward RNG x1000 and enemy/formation x1000 leave all other domains and frozen loot unchanged',()=>{
 const a=new RunRandomContext(12345),b=new RunRandomContext(12345),reward=b.stream('reward',14);for(let n=0;n<1000;n++)reward.next();
 for(const name of ['shop','enemy','formation','battle','bot']){const aa=a.stream(name,14),bb=b.stream(name,14);for(let n=0;n<20;n++)assert.equal(aa.next(),bb.next());}
 const progress=()=>({lastClaimedWaveId:0,lastEvaluatedWaveId:0,guaranteeSatisfied:{}}),w={id:14,stage:3,round:6,roundsInStage:6,waveKind:'boss'};
 const pa=progress(),pb=progress(),ea=createEquipmentReward(p,a,w,0,pa);for(const name of ['enemy','formation']){const stream=b.stream(name,14);for(let n=0;n<1000;n++)stream.next();}
 assert.deepEqual(createEquipmentReward(p,b,w,0,pb),ea);assert.deepEqual(pa.pending,pb.pending);
 const s=strong(),pending=victory(s);for(let n=0;n<30;n++)s.createPreview();assert.deepEqual(s.pendingEquipmentReward,pending);
});
test('reward inventory -> original equip -> original unequip and real BattleSim Guinsuo reset',()=>{
 const s=strong(),pending=victory(s),index=pending.candidates.indexOf('guinsoo');assert.ok(index>=0);assert.equal(s.claimEquipmentReward(index).ok,true);assert.equal(s.nextWave(),true);
 const uid=s.owned.all()[0].uid;assert.equal(s.equipItem(uid,0).ok,true);assert.equal(s.owned.equipmentReserve.length,0);
 const sim=s.startBattle(),unit=sim.units.find(u=>u.side===0&&u.cfg.id===s.owned.get(uid).unitId);assert.ok(unit);assert.equal(unit.equipmentAttackStacks,0);assert.ok(Math.abs(unit.attackSpeed-(s.cfg.getUnit(unit.cfg.id).atkSpeed+.1))<1e-9);
 sim.run();assert.ok(unit.equipmentAttackStacks>0);const fresh=s.createPreview().sim.units.find(u=>u.side===0&&u.cfg.id===unit.cfg.id);assert.equal(fresh.equipmentAttackStacks,0);
 const equipId=unit.equipment[0].id;assert.equal(equipId,'guinsoo');
});
test('all 3/6/99 common generated and played history includes identical shops/enemies/formation/rewards/choices',()=>{
 for(const n of [3,6])assert.deepEqual(build(n),waves.filter(w=>w.stage<=n));
 const reports=[3,6,99].map(stageCount=>runSimulation(i,{runSeed:12345,stageCount}));for(const r of reports)assert.notEqual(r.result,'SIMULATION_ERROR',r.error);
 for(let n=1;n<reports.length;n++)assert.deepEqual(reports[n].waves.slice(0,reports[n-1].waves.length),reports[n-1].waves);
 assert.ok(reports[0].waves.some(w=>w.rewardChoice));assert.ok(reports[1].waves.some(w=>w.playerEquippedItems.length));
 const repeat=runSimulation(i,{runSeed:12345,stageCount:3});assert.equal(hash(repeat),hash(reports[0]));
});
test('P2 same member/equipment/snapshot remains deterministic and minimal bot uses the common claim/equip port',()=>{
 const a=strong(),b=strong();victory(a);victory(b);const bot=new MinimalBaselineBot();assert.ok(bot.claimRewards(a.playerPort())[0].result.ok);assert.ok(bot.claimRewards(b.playerPort())[0].result.ok);
 a.nextWave();b.nextWave();bot.prepare(a.playerPort());bot.prepare(b.playerPort());assert.deepEqual(a.formation,b.formation);assert.deepEqual(a.startBattle().run(),b.startBattle().run());
 assert.ok(a.owned.all().some(u=>u.equipment.length));
});
console.log(`P3 equipment: ${passed} passed, 0 failed`);
