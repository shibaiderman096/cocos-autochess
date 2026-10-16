const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const root=path.resolve(__dirname,'../..'),input=path.join(root,'docs/p4-balance/validation/runs-500/medium/per-run.jsonl'),output=path.join(root,'docs/p4-balance/analysis/medium-economy-validation.json');
async function main(){const stream=readline.createInterface({input:fs.createReadStream(input),crlfDelay:Infinity}),deaths=[];let runs=0;
 for await(const line of stream){const r=JSON.parse(line);runs++;if(r.deathContext?.stage!==6)continue;const w=r.waves.at(-1);
  deaths.push({seed:r.seed,waveId:w.waveId,stage:w.stage,round:w.round,goldAtBattle:w.goldAfterShopping,level:w.level,population:w.population,hpBefore:w.hpBefore,hpLoss:w.hpLoss,refreshSpending:w.refreshSpending,xpSpending:w.xpSpending});}
 const avg=key=>deaths.length?deaths.reduce((n,r)=>n+r[key],0)/deaths.length:null,result={partition:'validation',bot:'medium-v1',runs,stage6Deaths:deaths.length,
  deathsWith50PlusGold:deaths.filter(r=>r.goldAtBattle>=50).length,deathsWith100PlusGold:deaths.filter(r=>r.goldAtBattle>=100).length,averageDeathGold:avg('goldAtBattle'),averageDeathLevel:avg('level'),
  note:'Observational diagnosis of the frozen bot. Excess bank and fixed target level can understate player strength. No strategy or difficulty was changed after freeze.',deaths};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...result,deaths:undefined}));}
main().catch(e=>{console.error(e);process.exitCode=1;});
