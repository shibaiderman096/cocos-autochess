const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const revised=process.argv[2]==='--revision-b';
const root=path.resolve(__dirname,'../..'),originalDir=path.join(root,'docs/p4r1-bot-qualification'),dir=revised?path.join(originalDir,'revision-b'):originalDir,out=path.join(dir,'freeze/bots-v2.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(fs.existsSync(out))throw Error('Bots already frozen; never overwrite a qualification identity');
for(const file of ['freeze/game-before.json','freeze/historical-before.json']){const data=JSON.parse(fs.readFileSync(path.join(originalDir,file),'utf8'));for(const [f,h]of Object.entries(data.hashes??data))if(sha(path.join(root,f))!==h)throw Error('Protected input changed: '+f);}
if(revised)for(const [f,h]of Object.entries(JSON.parse(fs.readFileSync(path.join(dir,'freeze/rejected-r1-before.json'),'utf8'))))if(sha(path.join(root,f))!==h)throw Error('Rejected R1 evidence changed: '+f);
const smoke=JSON.parse(fs.readFileSync(path.join(dir,revised?'smoke-50/medium/summary.json':'smoke-50-r2/medium/summary.json'),'utf8')),dev=JSON.parse(fs.readFileSync(path.join(dir,'development-200/medium/summary.json'),'utf8'));
const econ=JSON.parse(fs.readFileSync(path.join(dir,'development-200/economy.json'),'utf8'));
if(smoke.runs!==50||dev.runs!==200||smoke.failedActions||dev.failedActions||smoke.errors.length||dev.errors.length)throw Error('Smoke/development gate failed');
for(const s of [4,5,6,7,8]){
 const e=econ.stages[s],explained=revised&&e.highGoldWaves===e.highGoldTargetsExhausted;
 if(e.shoppingEndGold.median>=150&&!explained||e.populationOpportunityMissedRate>.1)throw Error('Economic development gate failed at '+s);
}
const bots=JSON.parse(fs.readFileSync(path.join(root,'tools/bots/bot-configs.json'),'utf8')),sourceHashes={};
const files=['tools/run-simulation.ts','tools/balance-sim.ts','tools/balance/metrics.ts','tools/balance/bot-economy-metrics.ts','tools/balance/statistics.ts'];
for(const name of fs.readdirSync(path.join(root,'tools/bots')).sort())files.push('tools/bots/'+name);
for(const f of files)sourceHashes[f]=sha(path.join(root,f));
for(const [f,h]of Object.entries(require('../../docs/p4r1-bot-qualification/freeze/game-before.json').hashes))sourceHashes[f]=h;
const configHashes={};
// Canonical recursive config hashes are the factory hashes used in actual reports.
require('tsx/cjs');const {createBot}=require('../bots/factory.ts');for(const id of Object.keys(bots))configHashes[id]=createBot(id,bots[id]).configHash;
fs.writeFileSync(out,JSON.stringify({schema:revised?'p4r1-bots-frozen-v2r1b':'p4r1-bots-frozen-v2',bots,botConfigHashes:configHashes,freeze:{sourceHashes},
  qualification:{seedRange:revised?[6001,6500]:[2201,2700],stages:12,bots:['weak','medium','strong'],runsPerBot:500},longTail:{seedRange:revised?[6501,6550]:[2701,2750],stages:99,bot:'medium'},
  reservedNextBalance:require('../../docs/p4r1-bot-qualification/freeze/seed-partitions.json').partitions.reservedR2,
  gates:{smokeRuns:50,developmentRuns:200,gameBalanceChanges:0},notes:'Only bot strategies were changed. Prices include the separately authorized correction before this phase. No difficulty candidate is loaded.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:path.relative(root,out),sha256:sha(out),sourceFiles:Object.keys(sourceHashes).length,botConfigHashes:configHashes}));
