const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/p4-balance'),load=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
function hash(file){const digest=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return digest.digest('hex');}
const single=load('determinism/single-50/manifest.json').hashes,parallel=load('determinism/parallel-50/manifest.json').hashes,actual={};
for(const file of Object.keys(single).filter(p=>p!=='provenance.json')){
 const a=hash(path.join(base,'determinism/single-50',file)),b=hash(path.join(base,'determinism/parallel-50',file));assert.equal(a,single[file]);assert.equal(b,parallel[file]);assert.equal(a,b);actual[file]=a;
}
const frozen=load('baseline/frozen.json');let protectedFiles=0;
for(const [file,digest]of Object.entries(frozen.hashes))if(file.startsWith('docs/')||file.startsWith('assets/resources/config/')){assert.equal(hash(path.join(root,file)),digest,file);protectedFiles++;}
const manifest=load('freeze/manifest.json');assert.equal(hash(path.join(base,'freeze/candidate.json')),manifest.candidateSha256);
for(const [file,digest]of Object.entries(manifest.sourceHashes))assert.equal(hash(path.join(root,file)),digest,file);
const readme=fs.readFileSync(path.join(base,'README.md'),'utf8'),sections=[...readme.matchAll(/^## (\d+)\./gm)].map(m=>Number(m[1]));assert.deepEqual(sections,Array.from({length:19},(_,i)=>i+1));assert.ok(!/undefined|NaN/.test(readme));
assert.equal(load('final-test-result.json').exitCode,0);assert.equal(load('accepted/decision.json').status,'rejected');assert.deepEqual(load('accepted/decision.json').productionNumericalChanges,[]);
const result={verified:true,protectedHistoricalAndConfigFiles:protectedFiles,frozenRuntimeFiles:Object.keys(manifest.sourceHashes).length,logicalFilesIndependentlyHashed:Object.keys(actual).length,logicalHashes:actual,
 reportSha256:hash(path.join(base,'README.md')),decisionSha256:hash(path.join(base,'accepted/decision.json')),candidateSha256:manifest.candidateSha256,sections,finalRegressionExitCode:0};
fs.writeFileSync(path.join(base,'accepted/verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({verified:true,protectedFiles,logicalFiles:Object.keys(actual).length,sections:sections.length}));
