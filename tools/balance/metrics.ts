import type {RunSimulationReport} from '../../assets/scripts/core/RunSessionTypes';
import {stageRoundCount} from '../../assets/scripts/core/RunSetup';
import type {RunInputs} from '../run-simulation';
import {distribution,mean,quantile,wilson} from './statistics';
import {createHash} from 'node:crypto';
import type {BotEconomyDiagnostics} from './bot-economy-metrics';

export function compactRun(r:RunSimulationReport,i:RunInputs,tiers:Record<string,string>){
  const waves=r.waves.map(w=>{
    const metrics=w.botMetrics!,board=w.playerUnits,all=[...board,...w.benchUnits];
    return {seed:r.runSeed,bot:r.bot,botVersion:r.botVersion,botConfigHash:r.botConfigHash,waveId:w.waveId,stage:w.stage,round:w.round,
      waveKind:w.waveKind!,winner:w.battle.result,hpBefore:w.hpBefore,hpAfter:w.hpAfter,hpLoss:w.battle.damageTaken,duration:w.battle.duration,
      decisionsSha256:createHash('sha256').update(JSON.stringify(w.actions)).digest('hex'),playerRoster:board,enemyRoster:w.enemies,
      ...((w as typeof w&{botEconomy?:BotEconomyDiagnostics}).botEconomy?{botEconomy:(w as typeof w&{botEconomy:BotEconomyDiagnostics}).botEconomy}:{}),
      goldBefore:w.goldBefore,goldAfterShopping:w.goldAtBattle,goldAfter:w.goldAfter,interest:w.reward.breakdown.interest,level:w.levelAtBattle,xp:w.xpAtBattle,population:board.length,
      board1:board.filter(u=>u.star===1).length,board2:board.filter(u=>u.star===2).length,board3:board.filter(u=>u.star===3).length,
      owned2:all.filter(u=>u.star>=2).length,owned3:all.filter(u=>u.star===3).length,inventory:w.playerEquipmentInventory?.length??0,equipped:all.reduce((n,u)=>n+(u.equipment?.length??0),0),
      playerItems:w.playerEquipmentCount??0,enemyItems:w.enemyEquipmentCount??0,requested:w.requestedBudget??null,effective:w.effectiveBudget??null,actual:w.actualBudget??null,
      saturated:w.saturated??false,saturationReason:w.saturationReason??null,enemy2:w.enemies.filter(e=>e.star===2).length,enemy3:w.enemies.filter(e=>e.star===3).length,enemyPopulation:w.enemies.length,
      enemyFormation:w.formationLevel,enemyTemplateUsed:w.templateUsed??false,rewardOffered:w.rewardTriggered??false,rewardChoice:w.rewardChoice??null,
      rewardTier:w.rewardChoice?tiers[w.rewardChoice]:null,rewardCandidates:w.rewardCandidates??[],...metrics};
  });
  const last=r.waves[r.waves.length-1];
  return {seed:r.runSeed,bot:r.bot,botVersion:r.botVersion,botConfigHash:r.botConfigHash,configHash:r.configHash,result:r.result,error:r.error??null,
    stageCount:r.stageCount,endState:r.endState,first2StarWave:waves.find(w=>w.owned2>0)?.waveId??null,first3StarWave:waves.find(w=>w.owned3>0)?.waveId??null,
    mainCarry2StarWave:waves.find(w=>(w.mainCarryStar??0)>=2)?.waveId??null,
    deathContext:r.result==='PLAYER_DEAD'&&last?{waveId:last.waveId,stage:last.stage,round:last.round,hpBefore:last.hpBefore,enemyBudget:last.enemyBudget,
      waveKind:last.waveKind,enemyStars:last.enemies.map(e=>e.star),enemyEquipment:last.enemies.flatMap(e=>e.equipment??[]),enemyUnits:last.enemies.map(e=>e.unitId),
      playerLevel:last.levelAtBattle,playerStars:last.playerUnits.map(u=>u.star),playerEquipment:last.playerUnits.flatMap(u=>u.equipment??[])}:null,waves};
}
export type CompactRun=ReturnType<typeof compactRun>;
export type WaveMetric=CompactRun['waves'][number];
const avg=(rows:WaveMetric[],key:keyof WaveMetric)=>mean(rows.map(w=>w[key]).filter(v=>typeof v==='number'||typeof v==='boolean').map(Number));
export function aggregateRuns(runs:CompactRun[],i:RunInputs){
  const waves=runs.flatMap(r=>r.waves),stages=[],waveRows=[];
  const campaignStages=runs[0]?.stageCount??0;
  for(let stage=1;stage<=campaignStages;stage++){
    const entered=runs.filter(r=>r.waves.some(w=>w.stage===stage)),completed=entered.filter(r=>r.waves.some(w=>w.stage===stage&&w.round===stageRoundCount(stage,i.run)&&w.hpAfter>0));
    const rows=waves.filter(w=>w.stage===stage),entry=rows.filter(w=>w.round===1),boss=rows.filter(w=>w.waveKind==='boss'),elite=rows.filter(w=>w.waveKind==='elite'),normal=rows.filter(w=>w.waveKind==='normal');
    stages.push({stage,entered:entered.length,completed:completed.length,conditionalCompletion:wilson(completed.length,entered.length),cumulativeCompletion:wilson(completed.length,runs.length),
      bossVictory:wilson(boss.filter(w=>w.winner===0).length,boss.length),eliteVictory:wilson(elite.filter(w=>w.winner===0).length,elite.length),normalVictory:wilson(normal.filter(w=>w.winner===0).length,normal.length),
      averageEntryHp:avg(entry,'hpBefore'),averageHp:avg(rows,'hpBefore'),averageGold:avg(rows,'goldAfterShopping'),averageLevel:avg(rows,'level'),averagePopulation:avg(rows,'population'),
      averageBoard1:avg(rows,'board1'),averageBoard2:avg(rows,'board2'),averageBoard3:avg(rows,'board3'),averagePlayerItems:avg(rows,'playerItems'),averageEnemyItems:avg(rows,'enemyItems'),
      rewardsOffered:rows.filter(w=>w.rewardOffered).length,rewardsClaimed:rows.reduce((n,w)=>n+w.rewardsClaimed,0),averageInventory:avg(rows,'inventory'),averageCarryItems:avg(rows,'carryItems'),averageTankItems:avg(rows,'tankItems'),
      refreshSpending:avg(rows,'refreshSpending'),xpSpending:avg(rows,'xpSpending'),unitSpending:avg(rows,'unitSpending'),interest:avg(rows,'interest'),
      mainCarry2PlusRate:rows.length?rows.filter(w=>(w.mainCarryStar??0)>=2).length/rows.length:null,
      mainCarryStars:{one:rows.filter(w=>w.mainCarryStar===1).length,two:rows.filter(w=>w.mainCarryStar===2).length,three:rows.filter(w=>w.mainCarryStar===3).length},
      rewardTiers:Object.fromEntries(['basic','advanced','special'].map(t=>[t,rows.filter(w=>w.rewardTier===t).length])),
      enemy2StarRatio:rows.length?rows.reduce((n,w)=>n+w.enemy2,0)/rows.reduce((n,w)=>n+w.enemyPopulation,0):null,
      formationLevels:Object.fromEntries(['L0','L1','L2','L3'].map(l=>[l,rows.filter(w=>w.enemyFormation===l).length])),templateUsage:avg(rows,'enemyTemplateUsed'),formationChanges:avg(rows,'formationChanges')});
  }
  for(const waveId of [...new Set(waves.map(w=>w.waveId))].sort((a,b)=>a-b)){
    const rows=waves.filter(w=>w.waveId===waveId),first=rows[0],wins=rows.filter(w=>w.winner===0).length;
    waveRows.push({waveId,stage:first.stage,round:first.round,waveKind:first.waveKind,encounters:rows.length,victory:wilson(wins,rows.length),death:wilson(rows.filter(w=>w.hpAfter===0).length,rows.length),
      averageHpLoss:avg(rows,'hpLoss'),medianHpLoss:quantile(rows.map(w=>w.hpLoss),.5),averageHpBefore:avg(rows,'hpBefore'),averageHpAfter:avg(rows,'hpAfter'),duration:avg(rows,'duration'),enemySurvivors:avg(rows,'enemySurvivors'),
      requested:avg(rows,'requested'),effective:avg(rows,'effective'),actual:avg(rows,'actual'),enemyItems:avg(rows,'enemyItems'),enemy2:avg(rows,'enemy2'),enemy3:avg(rows,'enemy3'),
      averagePlayerLevel:avg(rows,'level'),averagePlayerPopulation:avg(rows,'population'),averageBoard2:avg(rows,'board2'),averagePlayerItems:avg(rows,'playerItems')});
  }
  const anomalies=waveRows.map((w,index)=>{const previous=waveRows[index-1],drop=previous&&w.victory.rate!==null&&previous.victory.rate!==null?previous.victory.rate-w.victory.rate:0;
    const damageRatio=previous?.averageHpLoss?Number(w.averageHpLoss)/previous.averageHpLoss:null;
    return {...w,adjacentWinRateDrop:drop,damageRatio,flags:[...(drop>.15?['WIN_RATE_DROP_GT_15PP']:[]),...(damageRatio!==null&&damageRatio>=2&&Number(w.averageHpLoss)>1?['HP_LOSS_DOUBLED']:[]),...(w.death.rate!==null&&w.death.rate>.15?['DEATH_RATE_GT_15PCT']:[])]};}).filter(w=>w.flags.length).sort((a,b)=>b.adjacentWinRateDrop-a.adjacentWinRateDrop||Number(b.averageHpLoss)-Number(a.averageHpLoss));
  const boundaries=[6,8,10].map(stage=>({from:stage-1,to:stage,last:waveRows.filter(w=>w.stage===stage-1).slice(-1)[0]??null,first:waveRows.find(w=>w.stage===stage)??null}));
  const afterReward=runs.flatMap(r=>r.waves.filter((w,index)=>index>0&&r.waves[index-1].rewardOffered)),withoutReward=runs.flatMap(r=>r.waves.filter((w,index)=>index>0&&!r.waves[index-1].rewardOffered));
  return {runs:runs.length,battles:waves.length,errors:runs.filter(r=>r.result==='SIMULATION_ERROR').map(r=>({seed:r.seed,error:r.error})),
    bot:runs[0]?.bot,botVersion:runs[0]?.botVersion,botConfigHash:runs[0]?.botConfigHash,configHash:runs[0]?.configHash,
    seedRange:runs.length?[runs[0].seed,runs[runs.length-1].seed]:[],stages,waves:waveRows,anomalies,boundaries,
    growth:{first2Star:distribution(runs.map(r=>r.first2StarWave)),first3Star:distribution(runs.map(r=>r.first3StarWave)),mainCarry2Star:distribution(runs.map(r=>r.mainCarry2StarWave))},
    rewardAssociation:{note:'Conditional association across different stages, strengths and surviving players; not a causal effect.',nextWaveAfterReward:wilson(afterReward.filter(w=>w.winner===0).length,afterReward.length),nextWaveWithoutReward:wilson(withoutReward.filter(w=>w.winner===0).length,withoutReward.length)},
    failureDistribution:Object.fromEntries([...new Set(runs.map(r=>r.deathContext?.stage).filter((s):s is number=>s!==undefined))].sort((a,b)=>a-b).map(stage=>[stage,runs.filter(r=>r.deathContext?.stage===stage).length])),
    failedActions:waves.reduce((n,w)=>n+w.failedActions,0),ironGolemPlayerEncounters:runs.reduce((n,r)=>n+r.waves.filter(w=>w.mainTankUnitId==='iron_golem'||w.mainCarryUnitId==='iron_golem').length,0)};
}
