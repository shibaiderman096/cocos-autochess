const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs/p3-equipment'),read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const before=read('pre-p3-hashes.json'),external=read('concurrent-changes.json'),{changedFiles}=require('../tests/p3-equipment-compatibility.cjs');
for(const [file,digest]of Object.entries(before))if(!changedFiles.has(file))assert.equal(sha(file),external[file]?.after??digest,file);
const repeat=read('repeat-verification.json');assert.ok(repeat.files.length===14&&repeat.files.every(f=>f.equal));
const runtime=read('runtime-verification.json');
assert.deepEqual(runtime.twoChoice.pending,runtime.reloaded.pending);assert.equal(runtime.twoChoice.gold,runtime.reloaded.gold);assert.equal(runtime.twoChoice.xp,runtime.reloaded.xp);
assert.equal(runtime.pointerClaim.pending,null);assert.equal(runtime.pointerClaim.savedPending,null);assert.equal(runtime.pointerClaim.claimedMarker,14);
assert.deepEqual(runtime.pointerClaim.inventory,['guinsoo']);assert.equal(runtime.threeChoice.cards,3);assert.equal(runtime.midRunPending.phase,'settlement');
assert.equal(runtime.midRunWait.wave,29);assert.ok(runtime.midRunWait.manualRestartBlocked&&runtime.midRunWait.pendingStillPresent);assert.equal(runtime.midRunWait.timer,null);
assert.equal(runtime.afterMidRunClaim.stage,6);assert.equal(runtime.afterMidRunClaim.round,1);assert.equal(runtime.afterMidRunClaim.pending,null);assert.equal(runtime.afterMidRunClaim.claimedMarker,29);
const log=fs.readFileSync(path.join(dir,'npm-test-final-v2.log'),'utf8');assert.match(log,/P3 equipment: 18 passed, 0 failed/);assert.match(log,/Regression: 72 passed, 0 failed/);assert.ok(!/FAIL |TS\d{4}:|AssertionError/.test(log));
const sourceFiles=[...changedFiles].filter(p=>fs.existsSync(path.join(root,p))).concat([
 'assets/scripts/core/EquipmentPolicyTypes.ts','assets/scripts/core/EquipmentPolicy.ts','assets/scripts/core/EnemyEquipmentCandidates.ts','assets/scripts/core/EquipmentReward.ts',
 'assets/resources/config/equipment-policy.json','tools/report-equipment.ts','tools/audit-p3-equipment.cjs','tools/capture-p3-baseline.cjs','tools/finalize-p3-evidence.cjs',
 'tests/p3-equipment-tests.cjs','tests/p3-equipment-compatibility.cjs','tests/historical-inputs.cjs']);
const result={...read('final-v2-seed12345/verification.json'),acceptance:{npmTestExitCode:0,logSha256:sha('docs/p3-equipment/npm-test-final-v2.log'),
  runtimeBrowserValidated:true,runtimeScope:'Unchanged UI/reward/claim/advance flow; final P2-role source and identity binding correction validated by full core/adapter suite and independent reports, not a fresh browser pass.',deviceValidated:false,independentDeterministicFilesMatched:14,sourceHashes:Object.fromEntries(sourceFiles.sort().map(p=>[p,sha(p)])),
  baselineSignatures:read('baseline-signatures.json'),runtimeEvidence:'runtime-verification.json',repeatEvidence:'repeat-verification.json'}};
const file=path.join(dir,'verification-v2.json');if(fs.existsSync(file))throw Error('Final acceptance already exists; choose a new evidence directory for a new revision');
assert.deepEqual(fs.readFileSync(path.join(dir,'verification.json')),fs.readFileSync(path.join(dir,'verification-v1.json')),'preserve the previous root acceptance before replacing its convenience copy');
fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');fs.copyFileSync(file,path.join(dir,'verification.json'));console.log('P3 v2 accepted: old evidence protected, 14 deterministic files matched, browser flow evidence retained, final source full suite verified');
