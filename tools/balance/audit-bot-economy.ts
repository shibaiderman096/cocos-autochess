import {createReadStream,existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {dirname,resolve,relative,sep} from 'node:path';
import {distribution,mean,wilson} from './statistics';
import type {CompactRun} from './metrics';

/** Streaming public-action economic audit. Missing old diagnostics remain unknown, not zero. */
export async function auditBotEconomy(input:string){
  const stages=new Map<number,any>(),bosses=new Map<number,any>(),modes=new Map<string,any>(),waveKinds=new Map<string,any>(),deaths:any[]=[],exceptions:any[]=[],reasonCounts:Record<string,number>={};
  let runs=0,battles=0,purchases=0,golemWaves=0,golemTank=0;
  const bucket=()=>({goldBefore:[],goldAfter:[],goldAtBattle:[],goldPeak:[],unusedGold:[],level:[],population:[],bench:[],benchProxy:[],reserve:[],spendable:[],
    unitSpend:0,refreshSpend:0,xpSpend:0,interest:0,saleIncome:0,combatConversionGold:0,usefulIgnored:0,missed2Star:0,populationOpportunitySeen:0,populationOpportunityMissed:0,rawAffordableBenchIdle:0,highGoldWaves:0,highGoldTargetsExhausted:0,benchFull:0,waves:0});
  const push=(b:any,w:CompactRun['waves'][number])=>{const d=w.botEconomy;
    b.waves++;b.goldBefore.push(w.goldBefore);b.goldAfter.push(w.goldAfter);b.goldAtBattle.push(w.goldAfterShopping);b.level.push(w.level);b.population.push(w.population);
    b.unitSpend+=w.unitSpending;b.refreshSpend+=w.refreshSpending;b.xpSpend+=w.xpSpending;b.interest+=w.interest;b.saleIncome+=w.saleIncome;
    b.combatConversionGold+=w.unitSpending+w.refreshSpending+w.xpSpending;
    if(d){b.goldPeak.push(d.goldPeak);b.unusedGold.push(d.after.gold);b.bench.push(d.after.bench);b.benchProxy.push(d.after.benchPowerProxy);b.reserve.push(d.after.reserveGold);b.spendable.push(d.after.spendableGold);
      b.usefulIgnored+=d.ignoredUsefulOffers;b.missed2Star+=d.missedImmediate2Star;b.populationOpportunityMissed+=d.populationOpportunityMissed;
      b.rawAffordableBenchIdle+=Number(d.after.populationOpportunity);
      const policy=d.policy as {initial?:{levelUpAllowed?:boolean}}|undefined;
      const final=(d.policy as {final?:{population:{gold:number|null};wantsRoll:boolean;catalogUpgrade:boolean;coreChase:boolean}}|undefined)?.final;
      if(d.after.gold>100){b.highGoldWaves++;if(final&&final.population.gold===null&&!final.wantsRoll&&!final.catalogUpgrade&&!final.coreChase)b.highGoldTargetsExhausted++;}
      b.populationOpportunitySeen+=Number((policy?policy.initial?.levelUpAllowed:d.before.populationOpportunity)||w.xpSpending>0||d.populationOpportunityMissed>0);
      b.benchFull+=d.benchFullEvents;}
  };
  for await(const line of createInterface({input:createReadStream(input),crlfDelay:Infinity})){
    const r=JSON.parse(line) as CompactRun;runs++;
    if(r.error||r.result==='SIMULATION_ERROR')throw Error('Invalid run '+r.seed);
    const entered=new Set<number>();
    for(const w of r.waves){battles++;let b=stages.get(w.stage);if(!b){b={...bucket(),entering:[],leaving:[]};stages.set(w.stage,b);}push(b,w);
      if(!entered.has(w.stage)){b.entering.push(w.goldBefore);entered.add(w.stage);}
      const next=r.waves[r.waves.indexOf(w)+1];if(!next||next.stage!==w.stage)b.leaving.push(w.goldAfter);
      const kindKey=w.stage+':'+w.waveKind;if(!waveKinds.has(kindKey))waveKinds.set(kindKey,bucket());push(waveKinds.get(kindKey),w);
      const d=w.botEconomy;if(d){const key=w.stage+':'+(d.mode??'legacy');if(!modes.has(key))modes.set(key,bucket());push(modes.get(key),w);
        purchases+=d.ironGolemPurchases;golemWaves+=Number(d.after.ironGolemOnBoard);golemTank+=Number(d.after.ironGolemTank);
        for(const reason of d.after.unusedGoldReason)reasonCounts[reason]=(reasonCounts[reason]??0)+1;
        if(w.stage>=4&&w.stage<=8&&d.after.gold>100&&exceptions.length<50)exceptions.push({seed:r.seed,stage:w.stage,round:w.round,gold:d.after.gold,reserve:d.after.reserveGold,
          spendable:d.after.spendableGold,reasons:d.after.unusedGoldReason,policy:d.policy});}
      if(w.waveKind==='boss'){if(!bosses.has(w.stage))bosses.set(w.stage,bucket());push(bosses.get(w.stage),w);}
    }
    if(r.result==='PLAYER_DEAD'){const w=r.waves[r.waves.length-1];deaths.push({seed:r.seed,stage:w.stage,round:w.round,deathGold:w.goldAfterShopping,deathLevel:w.level,
      deathPopulation:w.population,deathBenchPowerProxy:w.botEconomy?.after.benchPowerProxy??null,unusedGoldReason:w.botEconomy?.after.unusedGoldReason??null,
      policy:w.botEconomy?.policy??null});}
  }
  const summarize=(b:any)=>({waves:b.waves,enteringGold:b.entering?distribution(b.entering):undefined,leavingGold:b.leaving?distribution(b.leaving):undefined,
    shoppingEndGold:distribution(b.goldAtBattle),meanShoppingEndGold:mean(b.goldAtBattle),meanGoldBeforePreparation:mean(b.goldBefore),meanGoldAtBattle:mean(b.goldAtBattle),
    goldPeak:distribution(b.goldPeak),unusedGold:distribution(b.unusedGold),meanLevel:mean(b.level),meanPopulation:mean(b.population),meanBench:mean(b.bench),
    meanReserveGold:mean(b.reserve),meanSpendableGold:mean(b.spendable),unitSpending:b.unitSpend,refreshSpending:b.refreshSpend,xpSpending:b.xpSpend,interestIncome:b.interest,
    meanCombatConversionGold:b.combatConversionGold/b.waves,combatConversionGold:b.combatConversionGold,meanXpSpending:b.xpSpend/b.waves,meanRefreshSpending:b.refreshSpend/b.waves,meanUnitSpending:b.unitSpend/b.waves,
    ignoredUsefulOffers:b.usefulIgnored,missedImmediate2Star:b.missed2Star,benchFullEvents:b.benchFull,populationOpportunitySeen:b.populationOpportunitySeen,
    populationOpportunityMissed:b.populationOpportunityMissed,populationOpportunityMissedRate:b.populationOpportunitySeen?b.populationOpportunityMissed/b.populationOpportunitySeen:null,
    rawAffordableBenchIdle:b.rawAffordableBenchIdle,rawAffordableBenchIdleRate:b.rawAffordableBenchIdle/b.waves,
    highGoldWaves:b.highGoldWaves,highGoldTargetsExhausted:b.highGoldTargetsExhausted});
  return {schema:'bot-economy-audit-v2',runs,battles,definitions:{unusedGold:'gold at battle; reserve and spendable are separate',
    populationOpportunity:'per-wave: marginal-value/affordability opportunity or real XP purchase; missed means still worthwhile and affordable at preparation end',
    ignoredOffers:'useful legal public offers discarded at refresh or left at preparation end',benchPowerProxy:'rough public attributes, not calibrated power'},
    stages:Object.fromEntries([...stages].map(([s,b])=>[s,summarize(b)])),bosses:Object.fromEntries([...bosses].map(([s,b])=>[s,summarize(b)])),
    modes:Object.fromEntries([...modes].map(([s,b])=>[s,summarize(b)])),byWaveKind:Object.fromEntries([...waveKinds].map(([s,b])=>[s,summarize(b)])),deaths,deathGold:distribution(deaths.map(d=>d.deathGold)),
    death100Plus:wilson(deaths.filter(d=>d.deathGold>100).length,deaths.length),stage6Deaths:deaths.filter(d=>d.stage===6),
    reasonCounts,highGoldExamples:exceptions,ironGolem:{purchases,boardPresenceWaves:golemWaves,tankRoleWaves:golemTank}};
}
if(require.main===module)(async()=>{
  const args=process.argv.slice(2),opts:Record<string,string>={};for(let n=0;n<args.length;n+=2){if(!['--input','--output'].includes(args[n])||opts[args[n]]||!args[n+1])throw Error('Invalid audit arguments');opts[args[n]]=args[n+1];}
  if(!opts['--input']||!opts['--output'])throw Error('Audit requires --input per-run.jsonl --output new.json');
  const root=process.cwd(),dest=resolve(root,opts['--output']),allowed=[resolve(root,'docs/p4r1-bot-qualification'),resolve(root,'temp')];
  let ancestor=dirname(dest);while(!existsSync(ancestor))ancestor=dirname(ancestor);
  const actual=resolve(realpathSync(ancestor),relative(ancestor,dest));if(!allowed.some(p=>actual.startsWith(p+sep))||existsSync(dest))throw Error('Audit output must be a new qualification/temp artifact');
  const report=await auditBotEconomy(resolve(root,opts['--input']));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:opts['--output'],runs:report.runs,deaths:report.deaths.length,death100Plus:report.death100Plus}));
})().catch(e=>{console.error(e);process.exitCode=1;});
