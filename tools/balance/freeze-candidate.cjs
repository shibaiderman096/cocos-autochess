const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/p4-balance'),load=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const ranked=load('training/search-v1/ranked-20.json'),confirmation=load('training/confirmation-500/aggregate.json');
assert.equal(ranked.history.length,20);assert.equal(ranked.validationUsed,false);assert.equal(ranked.holdoutUsed,false);
for(const s of Object.values(confirmation)){assert.equal(s.runs,500);assert.equal(s.errors.length,0);assert.equal(s.failedActions,0);}
const candidate=load('training/search-v1/iteration-'+String(ranked.best.iteration).padStart(2,'0')+'-config.json'),strategy=load('baseline/bot-freeze.json');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),sourceHashes={};
for(const [file,digest]of Object.entries(strategy.hashes))assert.equal(sha(file),digest,'Strategy changed: '+file);
function scan(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())scan(file);else if(e.name.endsWith('.ts')||e.name.endsWith('.json'))sourceHashes[file]=sha(file);}}
for(const dir of ['assets/scripts/battle','assets/scripts/core','tools/bots'])scan(dir);
for(const file of ['tools/run-simulation.ts','tools/balance-sim.ts','tools/balance/metrics.ts','tools/balance/statistics.ts'])sourceHashes[file]=sha(file);
candidate.freeze={schema:'p4-candidate-freeze-v1',trial:ranked.best.iteration,balanceVersion:'balance-v1',maxSearchIterations:20,trainingSeeds:[1,500],validationSeeds:[501,1000],holdoutSeeds:[1001,1250],sourceHashes,
 status:'candidate-not-accepted',note:'Finite search exhausted. Stage3 remains outside target; independent evaluation must not be presented as a successful acceptance.'};
const dir=path.join(base,'freeze');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'candidate.json');
fs.writeFileSync(file,JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({candidateSha256:sha('docs/p4-balance/freeze/candidate.json'),balanceVersion:'balance-v1',sourceHashes,validationOpened:false,holdoutOpened:false,trial:ranked.best.iteration},null,2)+'\n',{flag:'wx'});
console.log('Frozen candidate trial '+ranked.best.iteration+'; no production numerical changes.');
