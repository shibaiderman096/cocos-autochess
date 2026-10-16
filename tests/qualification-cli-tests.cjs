const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(root,'temp/qualification-cli-'));
const base=['--experiment','bot-qualification-v2','--bot','medium','--stages','12','--seed-start','2001','--seed-count','1','--partition','development','--output',path.join(temp,'out')];
function replace(key,value){const args=base.slice();args[args.indexOf(key)+1]=value;return args;}
function reject(args){const r=spawnSync(process.execPath,['--require','tsx/cjs','tools/balance-sim.ts',...args],{cwd:root,encoding:'utf8',timeout:30000});assert.ifError(r.error);assert.notEqual(r.status,0,r.stdout);assert.equal(fs.existsSync(path.join(temp,'out')),false);}
for(const args of [replace('--seed-start','501'),replace('--seed-start','3001'),replace('--stages','99'),replace('--partition','qualification'),
 [...base,'--audit','false'],[...base,'--formation','L0'],[...base,'--config','docs/p4-balance/freeze/candidate.json'],replace('--output','docs/p4-balance/r1-must-never-write')])reject(args);
assert.equal(fs.existsSync(path.join(root,'docs/p4-balance/r1-must-never-write')),false);
const revised=base.slice();revised[revised.indexOf('--experiment')+1]='bot-qualification-v2r1b';revised[revised.indexOf('--seed-start')+1]='5601';
for(const seed of ['2201','3001','4001','5001','6001']){const args=revised.slice();args[args.indexOf('--seed-start')+1]=seed;reject(args);}
const partial=revised.slice();partial[partial.indexOf('--partition')+1]='qualification';partial[partial.indexOf('--seed-start')+1]='6001';reject(partial);
console.log('PASS qualification CLI rejects old/reserved seeds, partial qualification, wrong campaign, disabled legality, formation/difficulty overrides and historical output');
