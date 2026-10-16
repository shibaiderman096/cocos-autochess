import { existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync } from 'node:fs';
import { dirname,relative,resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs } from './run-simulation';
import { buildRunWaves } from '../assets/scripts/core/RunSetup';
import { ConfigManager } from '../assets/scripts/core/ConfigManager';
import { EnemyPowerModel } from '../assets/scripts/core/EnemyPowerModel';
import { EnemyFormation } from '../assets/scripts/core/EnemyFormation';
import { formationSettings } from '../assets/scripts/core/FormationPolicy';
import { extractFormationTemplates } from '../assets/scripts/core/FormationTemplates';
import { resolveEnemyRole } from '../assets/scripts/core/EnemyRoles';
import { BattleSim } from '../assets/scripts/battle/BattleSim';
import { RunRandomContext,isRunSeed } from '../assets/scripts/core/RunRandomContext';
import type { EnemyFormationContext,EnemyFormationResult,FormationLevel,PlayerFormationSnapshot } from '../assets/scripts/core/EnemyFormationTypes';
import type { WaveConfig } from '../assets/scripts/core/RoundFlow';

const root=resolve(__dirname,'..'),sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
let seed=12345,output='docs/p2-enemy-formation/final-seed12345',battleSeeds=50;
const seen=new Set<string>();
for(let p=2;p<process.argv.length;p++){
  const key=process.argv[p],value=process.argv[++p];if(seen.has(key)||!['--seed','--output','--battle-seeds'].includes(key)||!value)throw new Error('Expected --seed, --output, --battle-seeds');seen.add(key);
  if(key==='--output')output=value;else if(key==='--seed'){if(!/^\d+$/.test(value)||!isRunSeed(Number(value)))throw new Error('Invalid seed');seed=Number(value);}
  else {battleSeeds=Number(value);if(!Number.isInteger(battleSeeds)||battleSeeds<1||battleSeeds>500)throw new Error('battle-seeds must be 1..500');}
}
const destination=resolve(root,output);let ancestor=destination;while(!existsSync(ancestor))ancestor=dirname(ancestor);
const actual=resolve(realpathSync(ancestor),relative(ancestor,destination));
for(const dir of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty']){const p=resolve(root,dir).toLowerCase();if(actual.toLowerCase()===p||actual.toLowerCase().startsWith(p+sep))throw new Error('Previous phase evidence is protected');}
if(existsSync(destination))throw new Error('Use a new output directory');
const inputs=loadRunInputs(root),generation=loadEnemyGenerationInputs(root),bundle=loadFormationInputs(root);
const model=new EnemyPowerModel(generation.enemyPower),solver=new EnemyFormation(bundle.formationConfig,bundle.enemyRoles,inputs.units,inputs.skills,model,inputs.run.enemyProgression.cells);
const waves=buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:seed,difficulty:generation.enemyDifficulty,power:generation.enemyPower});
const templates=extractFormationTemplates(inputs.waves),levels:FormationLevel[]=['L0','L1','L2'];
const makeContext=(wave:WaveConfig,level:FormationLevel):EnemyFormationContext=>({runSeed:seed,globalWaveId:wave.id,stage:wave.stage!,round:wave.round!,roundsInStage:wave.roundsInStage!,waveKind:wave.waveKind!,
 settings:formationSettings(bundle.formationConfig,wave.stage!,wave.round!,wave.roundsInStage!,wave.waveKind!,level),enemies:wave.enemies,template:templates[Math.min(wave.stage!-2,templates.length-1)]});
const times:Array<{waveId:number;level:string;milliseconds:number;iterations:number}>=[];
const measured=(context:EnemyFormationContext)=>{const start=performance.now(),result=solver.solve(context);times.push({waveId:context.globalWaveId,level:context.settings.level,milliseconds:performance.now()-start,iterations:result.diagnostics.iterations});return result;};
const members=(enemies:WaveConfig['enemies'])=>enemies.map(({x,y,...unit})=>unit);
const records:Array<{waveId:number;stage:number;round:number;requestedLevel:string;result:EnemyFormationResult}>=[];
const lookup=new Map<string,EnemyFormationResult>();
for(const wave of waves)for(const level of levels){const result=measured(makeContext(wave,level));
 if(JSON.stringify(members(result.placements))!==JSON.stringify(members(wave.enemies)))throw new Error('Formation mutated members');
 if(level==='L0'&&JSON.stringify(result.placements)!==JSON.stringify(wave.enemies))throw new Error('L0 baseline drift');
 records.push({waveId:wave.id,stage:wave.stage!,round:wave.round!,requestedLevel:level,result});lookup.set(wave.id+':'+level,result);
}
const stageExamples=records.filter(r=>[2,4,6,8,10].includes(r.stage)&&r.round===1);
const roles=inputs.units.slice().sort((a,b)=>a.cost!-b.cost!||(a.id<b.id?-1:1)).map(unit=>({unitId:unit.id,cost:unit.cost,range:unit.range,...resolveEnemyRole(unit,inputs.skills,bundle.enemyRoles)}));
function playerSnapshot(rows:Array<[string,number,number]>):PlayerFormationSnapshot {
 return {units:rows.map(([unitId,x,y])=>{const unit=inputs.units.find(u=>u.id===unitId)!,role=resolveEnemyRole(unit,inputs.skills,bundle.enemyRoles);
  return {unitId,star:2,equipment:[],x,y,role:role.role,range:unit.range,tags:role.tags};})};
}
const snapshots=[
 {name:'backline-mage-left',value:playerSnapshot([['mage',0,0],['archer',1,0],['guardian',3,3],['sakura',4,3],['ranger',4,1]])},
 {name:'ranged-cluster-right',value:playerSnapshot([['mage',6,0],['archer',5,0],['ranger',6,1],['scout',5,1],['guardian',3,3]])},
 {name:'spread',value:playerSnapshot([['mage',0,0],['archer',6,0],['ranger',1,3],['guardian',5,3],['sakura',3,2]])}
];
const selectedWaves:WaveConfig[]=[];
for(const stage of [2,4,6,8,10]){const rows=waves.filter(w=>w.stage===stage);for(const index of [0,Math.floor(rows.length/2),rows.length-2,rows.length-1])if(!selectedWaves.some(w=>w.id===rows[index].id))selectedWaves.push(rows[index]);}
const l3Examples:Array<{name:string;waveId:number;stage:number;round:number;result:EnemyFormationResult;player:PlayerFormationSnapshot}>=[];
for(const stage of [2,4,6,8,10]){
 const wave=waves.filter(w=>w.stage===stage).slice(-1)[0];for(const snapshot of snapshots){const result=measured({...makeContext(wave,'L3'),playerSnapshot:snapshot.value});
 l3Examples.push({name:snapshot.name,waveId:wave.id,stage,round:wave.round!,result,player:snapshot.value});}
}
const fixture:WaveConfig={id:10001,name:'explicit tactical probe, not a generated wave',stage:10,round:1,roundsInStage:10,waveKind:'normal',
 enemies:['guardian','mage','itachi','ranger','enderman'].map((unitId,index)=>({unitId,star:2,equipment:[],...inputs.run.enemyProgression.cells[index],statMultiplier:1,damageAmp:0,damageReduction:0}))};
const tacticalExamples=snapshots.map(snapshot=>({name:snapshot.name,player:snapshot.value,result:measured({...makeContext(fixture,'L3'),playerSnapshot:snapshot.value})}));
const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setEquipment(inputs.equipment);cfg.setBattle(inputs.battle);
let actualBattleSimCalls=0;
function battleDiagnostic(wave:WaveConfig,enemies:EnemyFormationResult['placements'],player:PlayerFormationSnapshot,label:string){
 let wins=0,losses=0,draws=0,remaining=0,ticks=0;const outcomes=[];
 for(let probe=1;probe<=battleSeeds;probe++){
  const sim=new BattleSim(cfg,[...enemies.map(e=>({cfg:cfg.getUnit(e.unitId),side:1 as const,x:e.x,y:e.y,star:e.star,equipment:e.equipment,statMultiplier:e.statMultiplier,damageAmp:e.damageAmp,damageReduction:e.damageReduction})),
   ...player.units.map(p=>({cfg:cfg.getUnit(p.unitId),side:0 as const,x:p.x,y:p.y,star:p.star,equipment:p.equipment}))],
   {seed:new RunRandomContext(probe).seed('battle',wave.id),w:7,h:8,maxTicks:cfg.battle.maxTicks});
  const result=sim.run();actualBattleSimCalls++;if(result.winner===1)wins++;else if(result.winner===0)losses++;else draws++;
  const alive=sim.units.filter(u=>u.side===1&&u.alive).length;remaining+=alive;ticks+=result.ticks;outcomes.push({seed:probe,winner:result.winner,ticks:result.ticks,remaining:alive});
 }
 return {waveId:wave.id,stage:wave.stage,round:wave.round,label,samples:battleSeeds,enemyWins:wins,enemyLosses:losses,draws,enemyWinRate:wins/battleSeeds,
  averageEnemyRemaining:remaining/battleSeeds,averageSeconds:ticks/battleSeeds*cfg.battle.tickMs/1000,outcomesSha256:sha(JSON.stringify(outcomes))};
}
const fixedPlayer=playerSnapshot([['guardian',3,3],['duelist',2,3],['ranger',4,1],['mage',2,0],['sakura',4,3]]);
const battles=[];for(const wave of selectedWaves)for(const level of levels)battles.push(battleDiagnostic(wave,lookup.get(wave.id+':'+level)!.placements,fixedPlayer,level));
const l3Battles=tacticalExamples.map(example=>battleDiagnostic(fixture,example.result.placements,example.player,'L3:'+example.name));
const summary=levels.map(level=>{const rows=records.filter(r=>r.requestedLevel===level&&r.stage>1);
 const coverEligible=rows.filter(r=>r.result.diagnostics.roleCounts.tank&&bundle.formationConfig.keyRoles.some(role=>r.result.diagnostics.roleCounts[role]));
 return {level,waves:rows.length,diagnosticsComputed:level!=='L0',
  spacingViolations:level==='L0'?null:rows.reduce((n,r)=>n+r.result.diagnostics.spacingViolations,0),wavesWithSpacingViolations:level==='L0'?null:rows.filter(r=>r.result.diagnostics.spacingViolations>0).length,
  roleDepthViolationWaves:level==='L0'?null:rows.filter(r=>r.result.diagnostics.roleDepthViolations>0).length,fallbackWaves:rows.filter(r=>r.result.diagnostics.fallbackSteps.length>0).length,
  templateUsedWaves:rows.filter(r=>r.result.diagnostics.templateUsed).length,coverEligibleWaves:coverEligible.length,
  meanCoverScoreEligible:coverEligible.length?coverEligible.reduce((n,r)=>n+r.result.diagnostics.score.cover,0)/coverEligible.length:null};});
const autoPolicy=waves.map(w=>({waveId:w.id,stage:w.stage,round:w.round,kind:w.waveKind,...formationSettings(bundle.formationConfig,w.stage!,w.round!,w.roundsInStage!,w.waveKind!)}));
const signatures={seed,waves:waves.length,memberSignature:sha(JSON.stringify(waves.map(w=>({id:w.id,enemies:members(w.enemies)})))),
 budgetSignature:sha(JSON.stringify(waves.map(w=>({id:w.id,budget:w.budget??null})))),positionSignature:sha(JSON.stringify(waves.map(w=>({id:w.id,positions:w.enemies.map(e=>({x:e.x,y:e.y}))}))))};
const files=['assets/scripts/core/EnemyFormation.ts','assets/scripts/core/EnemyFormationTypes.ts','assets/scripts/core/EnemyRoles.ts','assets/scripts/core/FormationPolicy.ts','assets/scripts/core/FormationTemplates.ts',
 'assets/scripts/core/RunSession.ts','assets/scripts/core/RunSessionTypes.ts','assets/scripts/core/ShopSave.ts','assets/scripts/view/BattleStage.ts','tools/run-simulation.ts','tools/run-sim.ts','tools/report-enemy-formation.ts',
 'assets/resources/config/enemy-formation.json','assets/resources/config/enemy-roles.json','assets/resources/config/enemy-power.json','assets/resources/config/enemy-difficulty.json'].sort();
mkdirSync(destination,{recursive:true});const hashes:Record<string,string>={};
const write=(name:string,text:string)=>{writeFileSync(resolve(destination,name),text);hashes[name]=sha(text);},json=(name:string,data:unknown)=>write(name,JSON.stringify(data,null,2)+'\n');
json('formations.json',records);json('summary.json',{summary,signatures,autoPolicy,actualBattleSimCalls,representativeCompositions:selectedWaves.length,battleSeeds,roleCoverage:roles.length});
json('stage-examples.json',stageExamples);json('l3-examples.json',{generatedBosses:l3Examples,explicitTacticalFixture:fixture,tacticalExamples});
json('template-report.json',{templates,policy:'coordinates only, role-compatible slot preferences; partial templates fill remaining units with ordinary scoring',
 results:records.filter(r=>r.requestedLevel==='L2'&&r.result.diagnostics.templateId).map(r=>({waveId:r.waveId,stage:r.stage,round:r.round,...r.result.diagnostics}))});
json('battle-diagnostics.json',{interpretation:'Formation impact only; fixed members, fixed legal player, matched battle seeds. Not player progression or final balance.',fixedPlayer,battles,l3Battles});
json('provenance.json',{seed,formationVersion:bundle.formationConfig.version,powerModelVersion:generation.enemyPower.version,calibrationHash:generation.enemyPower.calibrationHash,
 sourceHashes:Object.fromEntries(files.map(p=>[p,sha(readFileSync(resolve(root,p)))])),signatures});
const csv=(rows:unknown[][])=>rows.map(row=>row.map(v=>{const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n')+'\n';
write('role-table.csv',csv([['unitId','cost','range','role','tags','source','confidence','reason'],...roles.map(r=>[r.unitId,r.cost,r.range,r.role,r.tags.join('+'),r.source,r.confidence,r.reason])]));
write('formation-table.csv',csv([['waveId','stage','round','level','strength','slot','unitId','star','role','x','y','spacingViolations','fallbackSteps','templateId','templateUsed','score'],
 ...records.flatMap(r=>r.result.placements.map((p,index)=>[r.waveId,r.stage,r.round,r.result.level,r.result.strength,index,p.unitId,p.star,r.result.diagnostics.roles[index]?.role??'',p.x,p.y,
  r.result.level==='L0'?'':r.result.diagnostics.spacingViolations,r.result.diagnostics.fallbackSteps.join(';'),r.result.diagnostics.templateId??'',r.result.diagnostics.templateUsed,r.result.diagnostics.score.total]))]));
let report='# P2 实际阵型示例\n\n同一批P1-C成员，只有坐标发生变化。Stage1保持原样。下列是各阶段首波；全部波次见formation-table.csv。\n\n';
for(const stage of [2,4,6,8,10]){report+='## Stage '+stage+'\n\n';for(const record of stageExamples.filter(r=>r.stage===stage)){
 report+='### '+record.requestedLevel+'\n\n';report+='坐标：'+record.result.placements.map((e,index)=>index+':'+e.unitId+'★'+e.star+'@('+e.x+','+e.y+')').join('；')+'\n\n```text\n';
 for(let y=7;y>=4;y--){report+='y'+y+(y%2?'  ':' ');for(let x=0;x<7;x++){const at=record.result.placements.findIndex(e=>e.x===x&&e.y===y);report+=(at<0?'.':at.toString(16))+' ';}report+='\n';}report+='```\n\n';}}
report+='## L3固定战术夹具\n\n只使用现有guardian/mage/itachi/ranger/enderman，均2★，不代表某一实际生成波。\n\n';
for(const e of tacticalExamples)report+='- '+e.name+'：'+e.result.placements.map(u=>u.unitId+'@('+u.x+','+u.y+')').join('；')+'；snapshotHash='+e.result.diagnostics.playerSnapshotHash+'\n';
report+='\n## BattleSim诊断\n\n'+selectedWaves.length+'组实际生成敌军 × L0/L1/L2 × '+battleSeeds+'种子，另3组L3玩家快照 × '+battleSeeds+'种子。实际共'+actualBattleSimCalls+'场。均为固定成员、固定合法玩家、相同对战种子对照；未据此调参或推断最终通关率。详细胜率、存活数、时长见battle-diagnostics.json。\n';
write('REPORT.md',report);writeFileSync(resolve(destination,'output-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
const distributions=['L0','L1','L2','L3'].map(level=>{const rows=times.filter(t=>t.level===level),ms=rows.map(t=>t.milliseconds).sort((a,b)=>a-b);return {level,samples:ms.length,
  meanMilliseconds:ms.reduce((n,t)=>n+t,0)/ms.length,p95Milliseconds:ms[Math.floor(ms.length*.95)],maxMilliseconds:ms[ms.length-1],maxIterations:Math.max(...rows.map(r=>r.iterations))};});
writeFileSync(resolve(destination,'performance.json'),JSON.stringify({distributions,wallClockExcludedFromDeterministicHashes:true,actualBattleSimCalls,rows:times},null,2)+'\n');
console.log(JSON.stringify({destination,summary,actualBattleSimCalls,deterministicFiles:Object.keys(hashes).length,formationsSha256:hashes['formations.json'],performance:distributions},null,2));
