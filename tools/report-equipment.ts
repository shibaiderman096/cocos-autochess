import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as assert from 'node:assert/strict';
import {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs,runSimulation} from './run-simulation';
import {buildRunWaves} from '../assets/scripts/core/RunSetup';
import {EnemyGenerator} from '../assets/scripts/core/EnemyGenerator';
import {EnemyPowerModel} from '../assets/scripts/core/EnemyPowerModel';
import {RunRandomContext} from '../assets/scripts/core/RunRandomContext';
import {equipmentQuota,validateEquipmentPolicy} from '../assets/scripts/core/EquipmentPolicy';
import {ConfigManager} from '../assets/scripts/core/ConfigManager';
import {BattleSim} from '../assets/scripts/battle/BattleSim';
import type {Placement} from '../assets/scripts/battle/BattleSim';
import {RunSession} from '../assets/scripts/core/RunSession';
import {createEquipmentReward} from '../assets/scripts/core/EquipmentReward';
import type {WaveConfig} from '../assets/scripts/core/RoundFlow';

const root=resolve(__dirname,'..'),sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
let output='docs/p3-equipment/final-seed12345';
if(process.argv.length>2){if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('Expected --output new-directory');output=process.argv[3];}
const dest=resolve(root,output);let parent=dest;while(!existsSync(parent))parent=dirname(parent);
const actual=resolve(realpathSync(parent),relative(parent,dest));
if(!actual.toLowerCase().startsWith((root+sep).toLowerCase()))throw Error('Output must remain in this project');
for(const dir of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty','docs/p2-enemy-formation']){
  const protectedRoot=resolve(root,dir).toLowerCase();if(actual.toLowerCase()===protectedRoot||actual.toLowerCase().startsWith(protectedRoot+sep))throw Error('Previous evidence is read-only');
}
if(existsSync(dest))throw Error('Choose a new output directory; reports cannot overwrite previous results');
const inputs=loadRunInputs(root),g=loadEnemyGenerationInputs(root),f=loadFormationInputs(root),{equipmentPolicy:p}=loadEquipmentInputs(root),model=new EnemyPowerModel(g.enemyPower),seed=12345;
validateEquipmentPolicy(p,inputs.equipment,g.enemyPower);
const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
const naked=buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:seed,difficulty:g.enemyDifficulty,power:g.enemyPower});
assert.deepEqual(naked,JSON.parse(readFileSync(resolve(root,'docs/p3-equipment/pre-p3-waves.json'),'utf8')));
const starts=new Map<number,number>(),timings:Array<{waveId:number;milliseconds:number}>=[];
const waves=buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:seed,difficulty:g.enemyDifficulty,power:g.enemyPower,equipmentPolicy:p,equipmentRoles:f.enemyRoles,
  onWave:(id,phase)=>{if(phase==='start')starts.set(id,performance.now());else timings.push({waveId:id,milliseconds:performance.now()-starts.get(id)!});}});
const budgets=waves.filter(w=>w.budget);
for(let index=0;index<waves.length;index++){const w=waves[index],before=naked[index];assert.equal(w.enemies.length,before.enemies.length);assert.equal(w.waveKind,before.waveKind);
  if(w.budget){for(const k of ['rawBudget','requestedBudget','effectiveBudget'] as const)assert.equal(w.budget[k],before.budget![k]);
    const units=w.enemies.map(e=>({...e,cost:cfg.getUnit(e.unitId).cost}));assert.equal(model.estimateTeamPower(units).power,w.budget.actualBudget);
    assert.ok(!w.budget.feasible||w.budget.deviationPct<=5+1e-9);}
}
const run3=runSimulation(inputs,{runSeed:seed,stageCount:3}),run6=runSimulation(inputs,{runSeed:seed,stageCount:6}),run99=runSimulation(inputs,{runSeed:seed,stageCount:99});
for(const run of [run3,run6,run99])assert.notEqual(run.result,'SIMULATION_ERROR',run.error);
assert.deepEqual(run3.waves,run6.waves.slice(0,run3.waves.length));assert.deepEqual(run6.waves,run99.waves.slice(0,run6.waves.length));
const prefixes=[3,6].map(stages=>{const small=buildRunWaves(stages,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:seed,difficulty:g.enemyDifficulty,power:g.enemyPower,equipmentPolicy:p,equipmentRoles:f.enemyRoles});
  assert.deepEqual(small,waves.filter(w=>w.stage!<=stages));return {stages,generatedWaves:small.length,hash:sha(JSON.stringify(small))};});
const stageRows=[];
for(let stage=2;stage<=10;stage++)for(const kind of ['normal','elite','boss'] as const){
  const rows=waves.filter(w=>w.stage===stage&&w.waveKind===kind),played=run99.waves.filter(w=>w.stage===stage&&w.waveKind===kind);
  const latest=run99.waves.filter(w=>w.stage===stage).slice(-1)[0],candidates=played.flatMap(w=>w.rewardCandidates??[]),quota=equipmentQuota(p,stage,kind);
  stageRows.push({stage,waveKind:kind,waves:rows.length,enemyItems:rows.reduce((n,w)=>n+(w.budget?.enemyEquipmentCount??0),0),
    equippedEnemies:rows.reduce((n,w)=>n+(w.budget?.equippedEnemyCount??0),0),targetItemsPerWave:quota.targetItems,
    playedWaves:played.length,rewardOpportunities:kind==='normal'?0:rows.length,playedRewardOpportunities:kind==='normal'?0:played.length,
    actualRewardsCreated:played.filter(w=>w.rewardTriggered).length,actualVictories:played.filter(w=>w.battle.result===0).length,
    guaranteeSatisfied:latest?.guaranteeState?.[stage]??false,guaranteeObserved:!!latest,
    candidateBasic:candidates.filter(id=>p.tiers[id]==='basic').length,candidateAdvanced:candidates.filter(id=>p.tiers[id]==='advanced').length,candidateSpecial:candidates.filter(id=>p.tiers[id]==='special').length,
    playerItemsAtLastPlayed:latest?.playerEquipmentCount??null});
}
const rewards=run99.waves.filter(w=>w.waveKind==='elite'||w.waveKind==='boss').map(w=>({waveId:w.waveId,stage:w.stage,round:w.round,waveKind:w.waveKind,
  winner:w.battle.result,triggered:w.rewardTriggered,id:w.rewardId??null,candidates:w.rewardCandidates??[],choice:w.rewardChoice??null,
  guaranteeSatisfied:w.guaranteeState?.[w.stage]??false,diagnostics:w.equipmentReward?.diagnostics??[]}));
const exampleWaves=['elite','boss'].map(kind=>waves.find(w=>w.waveKind===kind&&w.stage!>=4&&w.stage!<=10&&w.budget?.enemyEquipmentCount
  &&JSON.stringify(w.enemies.map(e=>[e.unitId,e.star]))!==JSON.stringify(naked[w.id-1].enemies.map(e=>[e.unitId,e.star])))!);
assert.ok(exampleWaves.every(Boolean));
const samples=exampleWaves.map(w=>{
  const opponent=[{unitId:'guardian',x:3,y:3},{unitId:'warrior',x:2,y:3},{unitId:'sakura',x:4,y:3},{unitId:'mage',x:1,y:0},{unitId:'archer',x:5,y:0}];
  const outcomes=(enemies:WaveConfig['enemies'])=>{let wins=0,draws=0,ticks=0,damage=0;
    for(let battleSeed=1;battleSeed<=50;battleSeed++)for(const flip of [false,true])for(const reverse of [false,true]){
      const enemySide=flip?0:1,playerSide=flip?1:0;
      const placements:Placement[]=[...enemies.map(e=>({cfg:cfg.getUnit(e.unitId),side:enemySide as 0|1,star:e.star,equipment:e.equipment,x:e.x,y:flip?7-e.y:e.y})),
        ...opponent.map(e=>({cfg:cfg.getUnit(e.unitId),side:playerSide as 0|1,star:2,equipment:[],x:e.x,y:flip?7-e.y:e.y}))];
      const sim=new BattleSim(cfg,reverse?placements.reverse():placements,{seed:battleSeed,w:7,h:8,maxTicks:cfg.battle.maxTicks}),result=sim.run();
      wins+=Number(result.winner===enemySide);draws+=Number(result.winner===-1);ticks+=result.ticks;
      const ids=new Set(sim.units.filter(u=>u.side===enemySide).map(u=>u.id));
      damage+=sim.events.reduce((n,e)=>n+(e.t==='hit'&&ids.has(e.source)?e.actualDamage:0),0);
    }
    return {battles:200,enemyWins:wins,draws,enemyWinRate:wins/200,meanTicks:ticks/200,meanEnemyDamage:damage/200};};
  const before=naked[w.id-1];return {waveId:w.id,stage:w.stage,round:w.round,waveKind:w.waveKind,effectiveBudget:w.budget!.effectiveBudget,
    naked:{enemies:before.enemies,actualBudget:before.budget!.actualBudget,deviationPct:before.budget!.deviationPct,combat:outcomes(before.enemies)},
    equipped:{enemies:w.enemies,actualBudget:w.budget!.actualBudget,deviationPct:w.budget!.deviationPct,equipmentPowerContribution:w.budget!.equipmentPowerContribution,combat:outcomes(w.enemies)},
    note:'Fixed legal five-unit 2-star fixture, 50 seeds x swapped sides x reversed allocation; L0 cells control position. Sanity check only, not final balance.'};
});
// Full reward -> inventory -> existing equipment -> real BattleSim path, using a legal strong test fixture.
const boot=new RunSession(cfg,inputs.run,inputs.waves,{runSeed:seed,stageCount:10,...g,...f,equipmentPolicy:p}),save=boot.snapshot();save.level=10;
save.owned=['guardian','mage','archer'].map((unitId,index)=>({uid:index+1,unitId,star:3,location:'board' as const,x:1+index*2,y:index?1:3,equipment:[]}));
const s=new RunSession(cfg,inputs.run,inputs.waves,{save,...g,...f,equipmentPolicy:p});s.debugJump(3,6);const win=s.startBattle()!.run();assert.equal(win.winner,0);s.settleBattle();
const frozen=s.pendingEquipmentReward!,pendingSave=s.snapshot(),choice=frozen.candidates.indexOf('guinsoo');assert.ok(choice>=0);assert.ok(s.claimEquipmentReward(choice).ok);
const claimedSave=s.snapshot();assert.ok(s.nextWave());assert.ok(s.equipItem(1,0).ok);const battle=s.startBattle()!,unit=battle.units.find(u=>u.side===0&&u.cfg.id==='guardian')!;
const initial={attackSpeed:unit.attackSpeed,spellPower:unit.cfg.spellPower,stacks:unit.equipmentAttackStacks};battle.run();
const fresh=s.createPreview().sim.units.find(u=>u.side===0&&u.cfg.id==='guardian')!;
const actualEffects={waveVictory:win.winner,rewardId:frozen.rewardId,choice:'guinsoo',initial,afterBattleStacks:unit.equipmentAttackStacks,nextBattleStacks:fresh.equipmentAttackStacks,
  nextBattleAttackSpeed:fresh.attackSpeed,originalAttackSpeed:cfg.getUnit('guardian').atkSpeed};assert.equal(fresh.equipmentAttackStacks,0);assert.ok(unit.equipmentAttackStacks>0);
const generator=new EnemyGenerator(g.enemyDifficulty,g.enemyPower,inputs.units,new RunRandomContext(seed),p,f.enemyRoles);
const candidateCounts=[];for(let stage=2;stage<=99;stage++)for(const kind of ['normal','elite','boss'] as const)candidateCounts.push({stage,kind,naked:generator.pool(stage,kind).candidates.length,equipped:generator.selectionPool(stage,kind).candidates.length});
const sorted=timings.map(t=>t.milliseconds).sort((a,b)=>a-b),stats={mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted[sorted.length-1]};
const rewardTimes:number[]=[];
for(let n=1;n<=2000;n++){const start=performance.now();createEquipmentReward(p,new RunRandomContext(seed),{id:n,stage:8,round:10,roundsInStage:10,waveKind:'boss'},0,{lastClaimedWaveId:0,lastEvaluatedWaveId:0,guaranteeSatisfied:{}});rewardTimes.push(performance.now()-start);}
rewardTimes.sort((a,b)=>a-b);const rewardTiming={samples:rewardTimes.length,mean:rewardTimes.reduce((a,b)=>a+b,0)/rewardTimes.length,p95:rewardTimes[Math.ceil(rewardTimes.length*.95)-1],max:rewardTimes[rewardTimes.length-1],note:'Isolated candidate-generation microbenchmark; never included in actual victory/reward statistics.'};
const progressBefore={...pendingSave.equipmentProgress},restored=new RunSession(cfg,inputs.run,inputs.waves,{save:pendingSave,...g,...f,equipmentPolicy:p});
assert.deepEqual(restored.pendingEquipmentReward,frozen);assert.equal(restored.nextWave(),false);restored.claimEquipmentReward(1);
const reload=new RunSession(cfg,inputs.run,inputs.waves,{save:restored.snapshot(),...g,...f,equipmentPolicy:p});assert.equal(reload.pendingEquipmentReward,undefined);assert.equal(reload.claimEquipmentReward(0).ok,false);
const baselineHashes=JSON.parse(readFileSync(resolve(root,'docs/p3-equipment/pre-p3-hashes.json'),'utf8')) as Record<string,string>;
const changed=Object.entries(baselineHashes).filter(([file,h])=>sha(readFileSync(resolve(root,file)))!==h).map(([file])=>file);
const oldEvidence=Object.entries(baselineHashes).filter(([file])=>/^docs\/p[012]/.test(file));for(const [file,h]of oldEvidence)assert.equal(sha(readFileSync(resolve(root,file))),h,file);
mkdirSync(dest,{recursive:true});const hashes:Record<string,string>={};
const write=(file:string,text:string)=>{writeFileSync(resolve(dest,file),text);hashes[file]=sha(text);};
const json=(file:string,v:unknown)=>write(file,JSON.stringify(v,null,2)+'\n');
const csv=(file:string,rows:Record<string,unknown>[])=>{const keys=Object.keys(rows[0]??{}),quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';write(file,[keys.map(quote).join(','),...rows.map(row=>keys.map(k=>quote(typeof row[k]==='object'?JSON.stringify(row[k]):row[k])).join(','))].join('\n')+'\n');};
json('waves.json',waves);json('run-3.json',run3);json('run-6.json',run6);json('run-99.json',run99);json('reward-report.json',rewards);json('budget-examples.json',samples);json('actual-effects.json',actualEffects);
json('pending-save.json',pendingSave);json('claimed-save.json',claimedSave);json('candidate-counts.json',candidateCounts);csv('enemy-equipment-by-stage.csv',stageRows);csv('reward-table.csv',rewards);
const audit=JSON.parse(readFileSync(resolve(root,'docs/p3-equipment/equipment-audit.json'),'utf8'));
csv('equipment-table.csv',audit.items.flatMap((item:any)=>item.unitDifferences.flatMap((unit:any)=>unit.stars.map((star:any)=>({equipmentId:item.equipmentId,name:item.name,tier:item.tier,enemyEligible:item.enemyEligible,unitId:unit.unitId,...star,diagnostics:star.diagnostics.join(';')})))));
const verification={seed,enemyEquipmentVersion:p.enemyVersion,equipmentRewardVersion:p.rewardVersion,powerModelVersion:g.enemyPower.version,calibrationHash:g.enemyPower.calibrationHash,
  modelSha256:sha(readFileSync(resolve(root,'assets/resources/config/enemy-power.json'))),waveCount:waves.length,nonIntroWaves:budgets.length,
  maxDeviationPct:Math.max(...budgets.map(w=>w.budget!.deviationPct)),infeasible:budgets.filter(w=>!w.budget!.feasible).map(w=>w.id),normalItems:budgets.filter(w=>w.waveKind==='normal').reduce((n,w)=>n+w.budget!.enemyEquipmentCount!,0),
  targetAndPopulationUnchanged:true,prefixes,playedPrefixWaveCounts:[run3.waves.length,run6.waves.length,run99.waves.length],runResults:[run3.result,run6.result,run99.result],
  rewardReportSha256:hashes['reward-report.json'],compactProgressBefore:progressBefore,saveRecovery:{candidatesIdentical:true,nextWaveBlocked:true,secondChoiceClaimed:true,repeatClaimRejected:true},
  sourceChangedSinceP3Baseline:changed,protectedOldEvidenceCount:oldEvidence.length,stageRows,
  caveats:['No basic item additions or model file changes. Early pool falls back to two configured advanced items.',
    'Six pre-existing advanced/special items have no P1-B estimates: excluded from enemies, allowed in player rewards. iron_golem cost fallback remains low confidence.',
    'Only real victories in played MinimalBaselineBot history create reward statistics. Unplayed opportunities are not synthetic victories.',
    'P4 strategies, final win-rate targets, Stage7/8 soft-star conflict, late saturation, final equipment balance are not resolved.']};
json('verification.json',verification);
json('performance.json',{unit:'milliseconds',generation:stats,reward:rewardTiming,waves:timings.length,maxCandidateCountBefore:Math.max(...candidateCounts.map(v=>v.naked)),maxCandidateCountAfter:Math.max(...candidateCounts.map(v=>v.equipped)),maxEquipmentCandidatesPerUnit:p.enemy.maxEquipmentCandidatesPerUnit,timings});
json('manifest.json',{hashes});console.log(JSON.stringify({output:relative(root,dest),waveCount:waves.length,maxDeviationPct:verification.maxDeviationPct,rewardSha256:verification.rewardReportSha256,generation:stats,candidates:[Math.max(...candidateCounts.map(v=>v.naked)),Math.max(...candidateCounts.map(v=>v.equipped))]},null,2));
