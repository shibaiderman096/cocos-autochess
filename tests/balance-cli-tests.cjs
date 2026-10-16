const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=path.join(root,'temp');fs.mkdirSync(temp,{recursive:true});const dir=fs.mkdtempSync(path.join(temp,'balance-cli-'));
const run=args=>{const p=spawnSync(process.execPath,['--require','tsx/cjs','tools/balance-sim.ts',...args],{cwd:root,encoding:'utf8',timeout:60000});if(p.error)throw p.error;return p;};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');let passed=0;
try{
 const one=path.join(dir,'single'),many=path.join(dir,'parallel');
 for(const [output,workers]of [[one,'1'],[many,'2']]){const p=run(['--bot','all','--seed-start','1','--seed-count','2','--stages','3','--workers',workers,'--output',output]);assert.equal(p.status,0,p.stderr);}
 for(const file of ['aggregate.json','weak/per-run.jsonl','weak/per-wave.csv','weak/per-stage.csv','medium/per-run.jsonl','strong/per-run.jsonl'])assert.equal(hash(path.join(one,file)),hash(path.join(many,file)),file);
 console.log('PASS balance CLI single/multiple worker process logical output is identical');passed++;
 for(const args of [['--seed-start','501','--seed-count','1','--output',path.join(dir,'bad-seed')],['--seed-start','0','--seed-count','1','--output',path.join(dir,'zero-seed')],['--partition','validation','--seed-start','501','--seed-count','1','--output',path.join(dir,'bad-validation')],['--bot','cheat','--output',path.join(dir,'bad-bot')],['--seed-count','0','--output',path.join(dir,'zero')]])assert.notEqual(run(args).status,0);
 assert.notEqual(run(['--seed-count','1','--output',one]).status,0);
 const poisoned=path.join(dir,'changed-runtime.json');fs.writeFileSync(poisoned,JSON.stringify({freeze:{sourceHashes:{'tools/run-simulation.ts':'0'.repeat(64)}}}));
 assert.notEqual(run(['--bot','medium','--seed-count','1','--stages','3','--config',poisoned,'--output',path.join(dir,'changed-runtime')]).status,0);
 if(fs.existsSync(path.join(root,'docs/p4-balance/holdout-once.json'))){
  const output=path.join(dir,'holdout-reuse');
  assert.notEqual(run(['--bot','all','--partition','holdout','--seed-start','1001','--seed-count','250','--stages','99','--config','docs/p4-balance/freeze/candidate.json','--output',output]).status,0);
  assert.equal(fs.existsSync(output),false,'holdout reuse must fail before any worker or report directory is created');
 }
 const file=path.join(root,'docs/p3-equipment/verification.json'),before=hash(file);assert.notEqual(run(['--seed-count','1','--output','docs/p3-equipment/new-balance-report']).status,0);assert.equal(hash(file),before);
 console.log('PASS balance CLI seed partitions, invalid options, immutable outputs and historical evidence protection');passed++;
 console.log(`Balance CLI: ${passed} passed, 0 failed`);
}finally{
 const actual=fs.realpathSync(dir),base=fs.realpathSync(temp);if(path.dirname(actual)!==base||!path.basename(actual).startsWith('balance-cli-'))throw Error('Unsafe test cleanup path');
 fs.rmSync(actual,{recursive:true,force:true});
}
