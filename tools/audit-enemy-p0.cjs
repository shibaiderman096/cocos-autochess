/** P0 evidence only: calls existing game logic; never changes game configuration. */
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { CombatStatistics } = require('../assets/scripts/battle/CombatStatistics.ts');
const { RoundFlow } = require('../assets/scripts/core/RoundFlow.ts');
const { buildRunWaves, buildMonsterUnits } = require('../assets/scripts/core/RunSetup.ts');
const { hexDist } = require('../assets/scripts/battle/HexMath.ts');

const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'docs/p0-enemy-difficulty/baseline');
if (!out.startsWith(root + path.sep)) throw new Error('Output must be below the project directory');
const outputNames = ['manifest.json', 'input-configs.json', 'diagnostics.json', 'waves-before.json', 'waves-before.csv', 'encounters-before.csv'];
for (const name of outputNames) if (fs.existsSync(path.join(out, name))) throw new Error(`Refusing to overwrite ${name}; choose a fresh output directory`);
fs.mkdirSync(out, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const write = (name, value) => fs.writeFileSync(path.join(out, name), value, 'utf8');
const csv = rows => rows.map(row => row.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
const inputs = Object.fromEntries(['units', 'skills', 'battle', 'run', 'waves', 'equipment'].map(name =>
  [name, JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config', name + '.json'), 'utf8'))]));
const { units, skills, battle, run, waves: templates, equipment } = inputs;
const cfg = new ConfigManager();
cfg.setUnits(units); cfg.setSkills(skills); cfg.setBattle(battle); cfg.setEquipment(equipment);
cfg.setEnemyUnits(buildMonsterUnits(run, units));
const generated = buildRunWaves(99, run, templates, units);
assert.deepEqual(buildRunWaves(3, run, templates, units), generated.filter(w => w.stage <= 3));
assert.deepEqual(buildRunWaves(6, run, templates, units), generated.filter(w => w.stage <= 6));
assert.deepEqual(buildRunWaves(99, run, templates, units), generated);
for (const w of generated) {
  assert.ok(w.enemies.length > 0 && w.enemies.length <= 10);
  assert.equal(new Set(w.enemies.map(e => `${e.x},${e.y}`)).size, w.enemies.length);
  for (const e of w.enemies) {
    cfg.getUnit(e.unitId);
    assert.ok(Number.isInteger(e.x) && e.x >= 0 && e.x < battle.boardWidth);
    assert.ok(Number.isInteger(e.y) && e.y >= battle.ownRows && e.y < battle.boardHeight);
  }
}

function simulate(placements, seed) {
  const sim = new BattleSim(cfg, placements, { seed, w: battle.boardWidth, h: battle.boardHeight, maxTicks: battle.maxTicks });
  const result = sim.run();
  return { sim, result };
}
function wilson(wins, n) {
  const z = 1.959963984540054, p = wins / n, d = 1 + z * z / n;
  const m = (p + z * z / (2 * n)) / d;
  const r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [m - r, m + r];
}
const p = (unitId, side, x, y, star = 1) => ({ cfg: cfg.getUnit(unitId), side, x, y, star });
// Exact fixture from tools/batch-sim.ts, without introducing shop/progression assumptions.
const batchFixture = [p('warrior',0,3,3),p('archer',0,4,1),p('mage',0,2,0),
  p('warrior',1,3,6),p('archer',1,4,4),p('mage',1,2,7)];
function batchProbe() {
  const counts = { own: 0, enemy: 0, draw: 0 }, digest = crypto.createHash('sha256');
  let ticks = 0, events = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const { result } = simulate(batchFixture, seed);
    counts[result.winner === 0 ? 'own' : result.winner === 1 ? 'enemy' : 'draw']++;
    ticks += result.ticks; events += result.events.length;
    digest.update(JSON.stringify(result) + '\n');
  }
  return { n: 1000, seeds: [1,1000], ...counts, meanSeconds: ticks / 1000 * battle.tickMs / 1000,
    meanEvents: events / 1000, ownWinWilson95: wilson(counts.own,1000), resultAndEventSha256: digest.digest('hex') };
}
const batchFirst = batchProbe(), batchRepeat = batchProbe();
assert.deepEqual(batchFirst, batchRepeat);
console.log('PASS exact batch fixture: 1000 seeds repeated with identical complete event hashes');

const mirrors = [];
for (const u of units) for (const order of ['own-first', 'enemy-first']) {
  const counts = { own: 0, enemy: 0, draw: 0 };
  for (let seed = 1; seed <= 100; seed++) {
    const places = [p(u.id,0,3,3),p(u.id,1,3,4)];
    if (order === 'enemy-first') places.reverse();
    const { result } = simulate(places, seed);
    counts[result.winner === 0 ? 'own' : result.winner === 1 ? 'enemy' : 'draw']++;
  }
  mirrors.push({ unitId:u.id, cost:u.cost, star:1, equipment:[], order, n:100, ...counts });
}
// Symmetric no-crit basic fighters must resolve mutual lethal damage fairly in both ID orders.
for (const order of [false,true]) {
  const places = [p('warrior',0,3,3),p('warrior',1,3,4)].map(v => ({...v,cfg:{...v.cfg,critChance:0}}));
  if (order) places.reverse();
  const { result, sim } = simulate(places,42);
  assert.equal(result.winner,-1); assert.equal(sim.units.filter(u=>u.alive).length,0);
}
console.log('PASS mirror baseline: 15 real units x 100 seeds x both ID orders; no-crit mutual death in both orders');

const waveRows = generated.map(w => ({ wave:w.id, stage:w.stage, round:w.round, roundsInStage:w.roundsInStage,
  population:w.enemies.length, unitIds:[...new Set(w.enemies.map(e=>e.unitId))],
  costs:[...new Set(w.enemies.map(e=>cfg.getUnit(e.unitId).cost ?? null))],
  stars:[...new Set(w.enemies.map(e=>e.star))], damageAmp:w.enemies[0].damageAmp ?? 0,
  damageReduction:w.enemies[0].damageReduction ?? 0,
  equipmentCount:w.enemies.reduce((n,e)=>n+(e.equipment?.length??0),0),
  totalHp:w.enemies.reduce((n,e)=>n+cfg.scaleUnit(cfg.getUnit(e.unitId),e.star,e.statMultiplier).hp,0),
  totalAttack:w.enemies.reduce((n,e)=>n+cfg.scaleUnit(cfg.getUnit(e.unitId),e.star,e.statMultiplier).atk,0) }));

// Each encounter starts afresh. This is NOT an economy bot, campaign or player-strength estimate.
const fixedFixture = [p('warrior',0,3,3,2),p('guardian',0,2,3,2),p('ranger',0,4,1,2),
  p('mage',0,2,0,2),p('sakura',0,4,3,2)];
const encounters = [];
for (const wave of generated.filter(w=>w.stage<=10)) {
  let own=0, enemy=0, draw=0, ticks=0, healthLost=0, ownRemainingHp=0, enemyRemainingHp=0, ownDamage=0, enemyDamage=0;
  const digest = crypto.createHash('sha256');
  for (let seed=1;seed<=100;seed++) {
    // Enemy-first order agrees with BattleStage.createSim.
    const places = [...wave.enemies.map(e=>({cfg:cfg.getUnit(e.unitId),side:1,...e})),...fixedFixture];
    const { result, sim } = simulate(places,seed);
    if(result.winner===0) own++; else if(result.winner===1) enemy++; else draw++;
    ticks+=result.ticks;
    const flow=new RoundFlow([wave],battle); flow.startBattle();
    healthLost+=flow.settle(result.winner,sim.units.filter(u=>u.side===1&&u.alive).length).healthLost;
    ownRemainingHp+=sim.units.filter(u=>u.side===0&&u.alive).reduce((n,u)=>n+u.hp,0);
    enemyRemainingHp+=sim.units.filter(u=>u.side===1&&u.alive).reduce((n,u)=>n+u.hp,0);
    const stats=new CombatStatistics(); stats.begin(sim.units); stats.consume(result.events);
    ownDamage+=stats.snapshot().filter(r=>r.side===0).reduce((n,r)=>n+r.damage,0);
    enemyDamage+=stats.snapshot().filter(r=>r.side===1).reduce((n,r)=>n+r.damage,0);
    digest.update(JSON.stringify(result)+'\n');
  }
  encounters.push({ wave:wave.id,stage:wave.stage,round:wave.round,n:100,own,enemy,draw,
    ownWinRate:own/100,ownWinWilson95:wilson(own,100),meanHealthLost:healthLost/100,
    meanSeconds:ticks/100*battle.tickMs/1000,meanOwnRemainingHp:ownRemainingHp/100,meanEnemyRemainingHp:enemyRemainingHp/100,
    meanOwnDamage:ownDamage/100,meanEnemyDamage:enemyDamage/100,resultAndEventSha256:digest.digest('hex') });
}
console.log(`PASS static diagnostic fixture: ${encounters.length} encounters x 100 seeds; not campaign completion rates`);

const invalidProbes=[];
for(const [name,cell] of [['out-of-board',{x:7,y:4}],['in-player-half',{x:3,y:0}]]) {
  const modified=structuredClone(run); modified.enemyProgression.cells[0]=cell;
  let generationAccepted=false, battleAccepted=false, error=null;
  try {
    const w=buildRunWaves(3,modified,templates,units).find(w=>w.stage===2); generationAccepted=true;
    new BattleSim(cfg,w.enemies.map(e=>({cfg:cfg.getUnit(e.unitId),side:1,...e}))); battleAccepted=true;
  } catch(e) { error=e.message; }
  invalidProbes.push({name,cell,generationAccepted,battleAccepted,error});
}
// Demonstrate that changing handwritten enemy layouts has no effect on generated run enemies.
const changedTemplates=structuredClone(templates);
changedTemplates.forEach(t=>t.enemies=[]);
assert.deepEqual(buildRunWaves(3,run,changedTemplates,units),buildRunWaves(3,run,templates,units));
const starExamples=['warrior','enderman'].map(id=>({unitId:id,baseHp:cfg.getUnit(id).hp,
  stars:[1,2,3].map(star=>({star,hp:cfg.scaleUnit(cfg.getUnit(id),star).hp,atk:cfg.scaleUnit(cfg.getUnit(id),star).atk}))}));
const summary={schemaVersion:1,scope:'P0 pre-change evidence, no difficulty tuning',
  exclusions:['No run-sim exists','No weak/medium/strong strategy bots','No player star timing estimate','No campaign completion rate','No cost/equipment calibration','No editor/browser/device visual verification'],
  configuration:{purchasableUnits:units.length,unitsByCost:[1,2,3,4,5].map(cost=>({cost,count:units.filter(u=>u.cost===cost).length})),
    equipmentIds:equipment.map(e=>e.id),generatedWaves:generated.length,roundsFor3Stages:generated.filter(w=>w.stage<=3).length,
    roundsFor6Stages:generated.filter(w=>w.stage<=6).length,enemyFullPopulationWave:waveRows.find(w=>w.population===10).wave,
    waveTypeFieldPresent:generated.some(w=>w.type!==undefined||w.kind!==undefined)},
  batch:{first:batchFirst,repeat:batchRepeat,identical:true,fixture:batchFixture.map(({cfg,...p})=>({unitId:cfg.id,...p}))},
  mirrors,starExamples,invalidProbes,handwrittenTemplateEnemiesIgnored:true,
  hexExample:{a:{x:3,y:3},b:{x:4,y:4},hexDistance:hexDist({x:3,y:3},{x:4,y:4}),manhattanDistance:2},
  staticEncounterProbe:{label:'five fixed two-star units without economy; every wave resets health and roster',
    fixture:fixedFixture.map(({cfg,...p})=>({unitId:cfg.id,...p})),seeds:[1,100],encounters},
  checks:{all99StageCellsLegal:true,populationAtMost10:true,uniqueCells:true,stageCountPrefixStable:true,batchFullEventsRepeat:true,noCritMirrorMutualDeath:true}};
const sourceFiles=execFileSync('git',['ls-files','assets/scripts','assets/resources/config','tools','tests','package.json','package-lock.json','tsconfig.json'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const manifest={schemaVersion:1,createdAt:new Date().toISOString(),gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  initialStatus:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean),
  node:process.version,tsx:require('tsx/package.json').version,typescript:require('typescript/package.json').version,
  command:'node tools/audit-enemy-p0.cjs docs/p0-enemy-difficulty/baseline',
  sourceSha256:Object.fromEntries(sourceFiles.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))])),
  auditScriptSha256:hash(fs.readFileSync(__filename)),deterministicOutputs:['input-configs.json','diagnostics.json','waves-before.json','waves-before.csv','encounters-before.csv']};
write('manifest.json',json(manifest)); write('input-configs.json',json(inputs)); write('diagnostics.json',json(summary));
write('waves-before.json',json(generated));
const waveHeaders=Object.keys(waveRows[0]);
write('waves-before.csv',csv([waveHeaders,...waveRows.map(r=>waveHeaders.map(k=>Array.isArray(r[k])?r[k].join('|'):r[k]))]));
const encounterHeaders=Object.keys(encounters[0]);
write('encounters-before.csv',csv([encounterHeaders,...encounters.map(r=>encounterHeaders.map(k=>Array.isArray(r[k])?r[k].join('|'):r[k]))]));
console.log(JSON.stringify({batch:batchFirst,configuration:summary.configuration,checks:summary.checks,invalidProbes,output:out},null,2));
