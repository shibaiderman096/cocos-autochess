const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'temp'), {recursive:true});
const tempRoot = fs.realpathSync(path.join(root, 'temp'));
const output = fs.mkdtempSync(path.join(tempRoot, 'run-session-cli-'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(args) {
  const mode=args.includes('--enemy-mode')?[]:['--enemy-mode','legacy'];
  const p = spawnSync(process.execPath, ['--require', 'tsx/cjs', 'tools/run-sim.ts', ...mode,...args], {cwd:root,encoding:'utf8',timeout:30000});
  if(p.error) throw p.error;
  return p;
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
try {
  test('real CLI writes byte-identical reports for seed 12345 in separate processes', () => {
    const a=path.join(output,'a.json'),b=path.join(output,'b.json');
    for(const file of [a,b]) { const p=run(['--seed','12345','--max-stage','6','--json',file]);assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/Run Seed: 12345/);assert.match(p.stdout,/Income: victory/);assert.doesNotMatch(p.stdout,/Income: base/); }
    assert.equal(hash(a),hash(b));assert.deepEqual(fs.readFileSync(a),fs.readFileSync(b));
    const report=JSON.parse(fs.readFileSync(a,'utf8'));assert.equal(report.waves[0].waveId,1);assert.notEqual(report.result,'SIMULATION_ERROR');
    console.log('  separate-process SHA256 '+hash(a));
  });
  test('CLI config validation writes SIMULATION_ERROR and exits nonzero', () => {
    const file=path.join(output,'error.json'),p=run(['--seed','4294967296','--json',file]);
    assert.equal(p.status,1);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).result,'SIMULATION_ERROR');
    for(const args of [['--unknown'],['--seed'],['--seed','-1'],['--max-stage','0'],['--seed','2','--seed','3']]) {
      const failed=run(args);assert.equal(failed.status,1);assert.match(failed.stderr,/SIMULATION_ERROR|Simulation error/);
    }
  });
  test('CLI distinguishes true completion from a maximum-wave sampling cutoff', () => {
    const a=path.join(output,'completed.json'),b=path.join(output,'capped.json');
    assert.equal(run(['--seed','12345','--stages','3','--json',a]).status,0);
    assert.equal(run(['--seed','12345','--max-waves','1','--json',b]).status,0);
    assert.equal(JSON.parse(fs.readFileSync(a,'utf8')).result,'RUN_COMPLETED');
    assert.equal(JSON.parse(fs.readFileSync(b,'utf8')).result,'MAX_WAVE_REACHED');
  });
  test('CLI cannot overwrite protected P0 baseline evidence', () => {
    const file=path.join(root,'docs/p0-enemy-difficulty/baseline/diagnostics.json'),before=hash(file);
    const p=run(['--max-waves','1','--json',file]);
    assert.equal(p.status,1);assert.match(p.stderr,/P0 evidence is read-only/);assert.equal(hash(file),before);
  });
  test('budget-v1 CLI exposes actual generator budgets, defaults to new rules and rejects unknown modes',()=>{
    const a=path.join(output,'budget-a.json'),b=path.join(output,'budget-b.json');
    for(const file of [a,b])assert.equal(run(['--enemy-mode','budget-v1','--seed','12345','--stages','3','--json',file]).status,0);
    assert.equal(hash(a),hash(b));const report=JSON.parse(fs.readFileSync(a,'utf8'));assert.equal(report.enemyGenerationMode,'budget-v1');
    const monster=report.waves.find(w=>w.stage===2);assert.equal(monster.encounterKind,'monster');assert.equal(monster.enemyBudget,null);
    const wave=report.waves.find(w=>w.stage===2&&w.encounterKind==='normal');assert.equal(wave.actualBudget,wave.enemyBudget.actualBudget);assert.equal(wave.budgetWaveIndex,wave.waveId-3);assert.equal(wave.enemyGenerationMode,'budget-v1');
    assert.equal(run(['--enemy-mode','unknown']).status,1);
    const p=spawnSync(process.execPath,['--require','tsx/cjs','tools/run-sim.ts','--max-waves','1','--json',a],{cwd:root,encoding:'utf8',timeout:30000});
    assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(fs.readFileSync(a,'utf8')).enemyGenerationMode,'budget-v1');
  });
  test('P2 CLI accepts L0/L1/L2/L3, exports snapshot diagnostics and protects P1-C evidence',()=>{
    for(const formation of ['L0','L1','L2','L3']){const file=path.join(output,'formation-'+formation+'.json'),p=run(['--enemy-mode','budget-v1','--formation',formation,'--seed','12345','--stages','3','--json',file]);
      assert.equal(p.status,0,p.stderr);const report=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(report.formationOverride,formation);assert.equal(report.waves[0].formationLevel,'L0');
      const wave=report.waves.find(w=>w.stage===2&&w.encounterKind==='normal');assert.equal(wave.formationLevel,formation);assert.equal(wave.actualBudget,wave.enemyBudget.actualBudget);
      if(formation==='L3')assert.ok(wave.playerSnapshotHash);
    }
    assert.equal(run(['--formation','L4']).status,1);
    const file=path.join(root,'docs/p1-enemy-difficulty/budget-generator/verification.json'),before=hash(file);assert.equal(run(['--max-waves','1','--json',file]).status,1);assert.equal(hash(file),before);
  });
  test('stage rewards repeat across processes, early monsters/shop replace old drops, enemy equipment can pin none and P2 evidence stays protected',()=>{
    const files=['p3-a.json','p3-b.json'].map(p=>path.join(output,p));
    for(const file of files)assert.equal(run(['--enemy-mode','budget-v1','--seed','12345','--stages','3','--json',file]).status,0);
    assert.equal(hash(files[0]),hash(files[1]));const report=JSON.parse(fs.readFileSync(files[0],'utf8'));
    assert.equal(report.enemyEquipmentVersion,'equipment-policy-v1');assert.equal(report.stageRewardVersion,'stage-encounters-v1');
    assert.equal(report.waves.filter(w=>w.unitDrop).length,5);
    assert.equal(report.waves.filter(w=>w.stageReward?.kind==='specialShop').length,1);
    assert.ok(report.waves.every(w=>!w.actions.some(a=>a.action.type==='stageChoice'&&a.action.choice==='claim')),'early monster drops need no claim action');
    assert.ok(report.waves.every(w=>!w.rewardChoice),'legacy equipment drops are replaced by Boss choice from stage4');
    const none=path.join(output,'none.json');assert.equal(run(['--enemy-mode','budget-v1','--equipment-policy','none','--stages','3','--json',none]).status,0);
    assert.equal(JSON.parse(fs.readFileSync(none,'utf8')).equipmentRewardVersion,'none');
    assert.equal(run(['--equipment-policy','future']).status,1);
    const protectedFile=path.join(root,'docs/p2-enemy-formation/verification.json'),before=hash(protectedFile);
    assert.equal(run(['--max-waves','1','--json',protectedFile]).status,1);assert.equal(hash(protectedFile),before);
  });
  console.log(`Run-sim CLI: ${passed} passed, 0 failed`);
} finally {
  const resolved=fs.realpathSync(output);
  if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('run-session-cli-'))throw new Error('Unsafe CLI-test cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true});
}
