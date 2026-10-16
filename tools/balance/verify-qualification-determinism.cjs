const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const revised=process.argv[2]==='--revision-b';
const phase='docs/p4r1-bot-qualification'+(revised?'/revision-b':'');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,phase,'determinism');
if(fs.existsSync(dir))throw Error('Determinism evidence already exists');fs.mkdirSync(dir,{recursive:true});
for(const [name,workers]of [['one',1],['four',4]]){
 const r=spawnSync(process.execPath,['--require','tsx/cjs','tools/balance-sim.ts','--experiment',revised?'bot-qualification-v2r1b':'bot-qualification-v2','--bot','all','--seed-start',revised?'5799':'2199','--seed-count','2','--stages','12','--workers',String(workers),
  '--partition','development','--config',phase+'/freeze/bots-v2.json','--output',path.join(dir,name)],{cwd:root,encoding:'utf8',timeout:180000});
 fs.writeFileSync(path.join(dir,name+'.log'),r.stdout+'\n'+r.stderr,{flag:'wx'});if(r.error||r.status!==0)throw Error(r.error??r.stderr);
}
const one=JSON.parse(fs.readFileSync(path.join(dir,'one/manifest.json'),'utf8')),four=JSON.parse(fs.readFileSync(path.join(dir,'four/manifest.json'),'utf8'));
assert.deepEqual(one.hashes,four.hashes);
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({identical:true,seeds:revised?[5799,5800]:[2199,2200],campaignStages:12,bots:['weak','medium','strong'],
  actualWorkers:['one','four'].map(name=>JSON.parse(fs.readFileSync(path.join(dir,name,'performance.json'),'utf8')).workers),
  hashes:one.hashes,excluded:'wall-clock performance and worker scheduling parts'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({identical:true,files:Object.keys(one.hashes).length,hashes:one.hashes}));
