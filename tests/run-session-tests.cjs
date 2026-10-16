require('tsx/cjs');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { RunSession } = require('../assets/scripts/core/RunSession.ts');
const { RunRandomContext, deriveSeed, RUN_RULES_VERSION } = require('../assets/scripts/core/RunRandomContext.ts');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { freshSaveV2: createSaveV2, migrateSaveV2 } = require('../assets/scripts/core/ShopSave.ts');
// Preserve the P1-A behavioral fixtures explicitly on their original rules.
const freshSaveV2=(stages,seed)=>createSaveV2(stages,seed,'legacy');
const { POOL_STOCK } = require('../assets/scripts/core/ShopConfig.ts');
const { runSimulation: simulate, loadRunInputs } = require('../tools/run-simulation.ts');
const runSimulation=(inputs,options)=>simulate(inputs,{enemyGenerationMode:'legacy',...options});
const { MinimalBaselineBot } = require('../tools/bots/minimal-baseline.ts');
const inputs = loadRunInputs();
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function make(seed = 1, extra = {}) {
  const cfg = new ConfigManager(); cfg.setUnits(inputs.units); cfg.setSkills(inputs.skills);
  cfg.setBattle(inputs.battle); cfg.setEquipment(inputs.equipment);
  return new RunSession(cfg, inputs.run, inputs.waves, { runSeed: seed, enemyGenerationMode:'legacy', ...extra });
}
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = report => JSON.stringify(report, null, 2) + '\n';
const digest = value => createHash('sha256').update(bytes(value)).digest('hex');
function legalAccounting(session) {
  assert.ok(Number.isSafeInteger(session.economy.gold) && session.economy.gold >= 0);
  assert.ok(session.owned.onBoard().length <= session.level.unitCap);
  assert.ok(session.owned.inBench().length <= session.save.benchSlots);
  const cells = new Set();
  for (const u of session.owned.all()) {
    const key = `${u.location}:${u.x}:${u.y}`; assert.ok(!cells.has(key)); cells.add(key);
    if (u.location === 'board') assert.ok(u.x >= 0 && u.x < session.cfg.battle.boardWidth && u.y >= 0 && u.y < session.cfg.battle.ownRows);
    else assert.ok(u.x === -1 && u.y >= 0 && u.y < session.save.benchSlots);
    assert.ok((u.equipment?.length ?? 0) <= 3);
  }
  for (const cfg of session.cfg.allUnits()) {
    const owned = session.owned.all().filter(u => u.unitId === cfg.id).reduce((n, u) => n + 3 ** (u.star - 1), 0);
    const reserved = session.shop.slots.filter(s => s.unitId === cfg.id).length;
    const rewardReserved=session.save.stageProgress?.unitReserve.filter(id=>id===cfg.id).length??0;
    assert.equal(session.pool.count(cfg.id) + owned + reserved + rewardReserved, POOL_STOCK[cfg.cost]);
  }
}

test('new session uses real starter, shop reservations and read-only bot observations', () => {
  const s = make(123); legalAccounting(s); assert.equal(s.economy.gold, 0); assert.equal(s.level.level, 1);
  assert.equal(s.owned.all().length, 1); assert.equal(s.cfg.getUnit(s.owned.all()[0].unitId).cost,1);
  assert.equal(s.owned.all()[0].location, 'bench'); assert.equal(s.state.rulesVersion, RUN_RULES_VERSION);
  const port = s.playerPort(), o = port.observe();
  assert.deepEqual(Object.keys(port).sort(), ['act', 'observe']); assert.equal(o.enemies, undefined); assert.equal(o.random, undefined);
  o.state.gold = 999; o.units[0].star = 3; o.units[0].equipment.push('guinsoo'); o.shop[0].unitId = null;
  assert.equal(s.economy.gold, 0); assert.equal(s.owned.all()[0].star, 1); assert.ok(s.shop.slots.every(slot => slot.unitId));
  assert.equal((s.owned.all()[0].equipment ?? []).length, 0);
});
test('actions reject unpaid purchases, illegal cells, over-cap deployments and phase violations', () => {
  const s = make(); const gold = s.economy.gold, roll = s.save.shopRollIndex;
  assert.equal(s.buyShopSlot(0).error, 'not_enough_gold'); assert.equal(s.refreshShop().ok, false);
  assert.equal(s.buyExp().ok, false); assert.equal(s.economy.gold, gold); assert.equal(s.save.shopRollIndex, roll);
  for (const to of [{location:'board',x:7,y:3},{location:'board',x:1,y:4},{location:'board',x:NaN,y:0},{location:'bench',x:-1,y:9}]) assert.equal(s.moveUnit(1,to).ok, false);
  assert.equal(s.startBattle(), null); assert.equal(s.moveUnit(1,{location:'board',x:3,y:3}).ok,true);
  const sim = s.startBattle(); assert.ok(sim); assert.equal(s.startBattle(), null);
  assert.equal(s.moveUnit(1,{location:'bench',x:-1,y:0}).ok,false); assert.equal(s.sellUnit(1).ok,false);
  assert.equal(s.equipItem(1,0).ok,false); assert.equal(s.settleBattle(),null);
  sim.run(); assert.ok(s.settleBattle()); const after = s.snapshot();
  assert.equal(s.settleBattle(),null); assert.deepEqual(s.snapshot(),after);
  assert.equal(s.buyShopSlot(0).ok,false); assert.equal(s.refreshShop().ok,false); assert.equal(s.buyExp().ok,false);
  assert.equal(s.toggleShopLock().ok,false); legalAccounting(s);
  new MinimalBaselineBot().claimRewards(s.playerPort());
  assert.equal(s.nextWave(),true); assert.equal(s.nextWave(),false); legalAccounting(s);
});
test('shop, combat and preview RNG are isolated from enemy and bot streams (C/D/E)', () => {
  const a = make(12345), b = make(12345);
  const enemy = b.random.stream('enemy',1), bot = b.random.stream('bot',1);
  for (let i=0;i<1000;i++) { enemy.next(); bot.next(); b.createPreview(); }
  const ai = a.random.stream('formation',1); for(let i=0;i<500;i++)ai.next();
  new MinimalBaselineBot().prepare(a.playerPort()); new MinimalBaselineBot().prepare(b.playerPort());
  const shop = a.shop.snapshot(); assert.deepEqual(b.shop.snapshot(),shop); assert.equal(a.battleSeed,b.battleSeed);
  const ra=a.startBattle().run(), rb=b.startBattle().run(); assert.deepEqual(ra,rb);
  a.settleBattle();b.settleBattle();new MinimalBaselineBot().claimRewards(a.playerPort());new MinimalBaselineBot().claimRewards(b.playerPort());a.nextWave();b.nextWave();
  assert.deepEqual(a.shop.snapshot(),b.shop.snapshot()); assert.deepEqual(a.state,b.state);
  const r = new RunRandomContext(12345);
  assert.equal(deriveSeed(12345,'battle',2),r.seed('battle',2));
  assert.equal(new Set(['shop','battle','enemy','formation','reward','bot'].map(k=>r.seed(k,1))).size,6);
  for(const seed of [-1,NaN,Infinity,0x100000000,1.2])assert.throws(()=>new RunRandomContext(seed));
  assert.notEqual(r.seed('battle',1),r.seed('battle',2));
});
test('save/load keeps shop refresh indices, UID allocation and deterministic continuation', () => {
  const a = make(12345); const bot = new MinimalBaselineBot();
  for(let i=0;i<4;i++) {bot.prepare(a.playerPort());a.startBattle().run();a.settleBattle();bot.claimRewards(a.playerPort());a.nextWave();}
  assert.equal(a.refreshShop().ok,true); const saved = a.snapshot();
  const b = make(12345,{save:saved}); assert.deepEqual(b.snapshot(),saved);
  for(let i=0;i<4&&a.flow.phase!=='ended';i++) {
    assert.deepEqual(bot.prepare(a.playerPort()),bot.prepare(b.playerPort()));
    assert.deepEqual(a.startBattle().run(),b.startBattle().run());
    assert.deepEqual(a.settleBattle(),b.settleBattle());
    assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(bot.claimRewards(a.playerPort()),bot.claimRewards(b.playerPort()));a.nextWave();b.nextWave();
  }
  const uidSave = freshSaveV2(3,9); uidSave.shopReserved=true; uidSave.nextOwnedUid=70;
  uidSave.gold=10;uidSave.shop[0]={unitId:'archer'};
  uidSave.owned=[{uid:15,unitId:'warrior',star:1,location:'board',x:3,y:3}];
  const c=make(9,{save:uidSave}); assert.equal(c.owned.all()[0].uid,15); assert.equal(c.owned.nextUnitUid,70);
  assert.equal(c.buyShopSlot(0).uid,70);assert.equal(c.owned.nextUnitUid,71);
  assert.equal(make(9,{save:c.snapshot()}).owned.nextUnitUid,71);
  const snap=c.snapshot();snap.owned[0].star=3;snap.shop[0].unitId='invalid';
  assert.equal(c.owned.all()[0].star,1);assert.notEqual(c.shop.slots[0].unitId,'invalid');
});
test('old saves migrate deterministically without rerolling offers or granting duplicate starter', () => {
  const old={gold:20,level:3,stageCount:4,runRulesVersion:1,shopReserved:true,
    owned:[{uid:31,unitId:'warrior',star:2,location:'board',x:3,y:3}],
    shop:[{unitId:'archer'},{unitId:null},{unitId:'scout'},{unitId:null},{unitId:null}],
    round:{phase:'prepare',waveIndex:18,health:18,result:null,lastSettlement:null}};
  const migrated=migrateSaveV2(old);assert.equal(migrated.runSeed,1);assert.equal(migrated.runSeedSource,'legacy-default');
  const a=make(1,{save:old}),b=make(1,{save:clone(old)});
  assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.shop.snapshot(),old.shop);
  assert.equal(a.owned.all().length,1);assert.equal(a.owned.all()[0].star,2);assert.equal(a.flow.wave.stage,3);assert.equal(a.flow.wave.round,6);
  legalAccounting(a);assert.throws(()=>make(2,{save:old}),/seed/);
  assert.throws(()=>make(1,{save:{...freshSaveV2(),rulesVersion:999}}),/Unsupported/);
  const battleSave=a.snapshot();a.moveUnit(31,{location:'board',x:3,y:3});a.startBattle();
  const interrupted=a.snapshot();const resumed=make(1,{save:interrupted});assert.equal(resumed.flow.phase,'prepare');
  assert.deepEqual(resumed.shop.snapshot(),a.shop.snapshot());assert.equal(resumed.flow.health,battleSave.round.health);
});
test('legal swaps, full bench merge, sale/equipment return and combat shopping share existing rules', () => {
  const saved=freshSaveV2(3,2);saved.gold=20;saved.level=1;saved.benchSlots=2;saved.shopReserved=true;
  saved.owned=[{uid:1,unitId:'warrior',star:1,location:'board',x:3,y:3,equipment:['guinsoo']},
    {uid:2,unitId:'warrior',star:1,location:'bench',x:-1,y:0},{uid:3,unitId:'archer',star:1,location:'bench',x:-1,y:1}];
  saved.shop=[{unitId:'warrior'},...Array.from({length:4},()=>({unitId:null}))];
  const s=make(2,{save:saved});assert.equal(s.buyShopSlot(0).ok,true);assert.equal(s.owned.get(1).star,2);
  assert.equal(s.owned.onBoard().length,1);assert.deepEqual(s.owned.get(1).equipment,['guinsoo']);legalAccounting(s);
  assert.equal(s.moveUnit(3,{location:'board',x:2,y:3}).error,'population_cap');
  assert.equal(s.moveUnit(3,{location:'board',x:3,y:3}).ok,true);assert.equal(s.owned.get(1).location,'bench');
  s.startBattle();assert.equal(s.sellUnit(3).ok,false);assert.equal(s.sellUnit(1).ok,true);
  assert.deepEqual(s.owned.equipmentReserve,['guinsoo']);assert.equal(s.buyExp().ok,true);legalAccounting(s);
});
test('locked shops persist across wave boundaries and paid rolls resume exactly', () => {
  const a=make(99);const bot=new MinimalBaselineBot();bot.prepare(a.playerPort());
  a.toggleShopLock();const shop=a.shop.snapshot();a.startBattle().run();a.settleBattle();bot.claimRewards(a.playerPort());a.nextWave();
  assert.deepEqual(a.shop.snapshot(),shop);const b=make(99,{save:a.snapshot()});
  assert.deepEqual(a.refreshShop(),b.refreshShop());assert.deepEqual(a.snapshot(),b.snapshot());legalAccounting(a);
});
test('same seed full run report is byte-identical, another seed changes shops/actions (A/B)', () => {
  const a=runSimulation(inputs,{runSeed:12345,maxStage:6}),b=runSimulation(inputs,{runSeed:12345,maxStage:6});
  assert.notEqual(a.result,'SIMULATION_ERROR',a.error);assert.ok(a.waves.length>14);
  assert.equal(bytes(a),bytes(b));
  const different=runSimulation(inputs,{runSeed:12346,maxStage:6});assert.notEqual(digest(a),digest(different));
  assert.notDeepEqual(a.waves[0].shop,different.waves[0].shop);
  assert.notEqual(a.waves[0].battle.seed,different.waves[0].battle.seed);
  console.log('  seed12345 SHA256 '+digest(a));
});
test('3/6/99 sampling cutoffs and actual campaign sizes keep full wave prefixes identical', () => {
  const three=runSimulation(inputs,{runSeed:12345,maxStage:3});
  const six=runSimulation(inputs,{runSeed:12345,maxStage:6});
  const ninetyNine=runSimulation(inputs,{runSeed:12345,maxStage:99});
  assert.equal(three.waves.length,14);assert.equal(three.result,'MAX_WAVE_REACHED');
  assert.deepEqual(six.waves.slice(0,14),three.waves);assert.deepEqual(ninetyNine.waves.slice(0,14),three.waves);
  const campaign3=runSimulation(inputs,{runSeed:12345,stageCount:3});
  const campaign6=runSimulation(inputs,{runSeed:12345,stageCount:6});
  assert.deepEqual(campaign3.waves,six.waves.slice(0,14));assert.deepEqual(campaign6.waves,six.waves);
  assert.equal(campaign3.result,'RUN_COMPLETED');
});
test('terminal reasons include elimination, completion, sampling cutoff and simulation errors', () => {
  const dead=runSimulation(inputs,{runSeed:1,maxStage:99});assert.equal(dead.result,'PLAYER_DEAD');assert.equal(dead.endState.playerHp,0);
  const capped=runSimulation(inputs,{runSeed:1,maxWaves:1});assert.equal(capped.result,'MAX_WAVE_REACHED');assert.equal(capped.waves.length,1);
  const invalid=runSimulation({...inputs,battle:{...inputs.battle,maxTicks:NaN}},{runSeed:1});assert.equal(invalid.result,'SIMULATION_ERROR');assert.ok(invalid.error);
  const malformed=runSimulation(inputs,{runSeed:-1});assert.equal(malformed.result,'SIMULATION_ERROR');
});
test('minimal bot keeps legal positions, pool conservation and nonnegative gold across complete runs', () => {
  for(const seed of [1,12345,12346,0,0xffffffff]) {
    const s=make(seed,{stageCount:6}),bot=new MinimalBaselineBot();
    for(let wave=0;s.flow.phase!=='ended'&&wave<50;wave++) {
      if(s.flow.wave.encounterKind!=='specialShop'){
        bot.prepare(s.playerPort());legalAccounting(s);assert.ok(s.startBattle());s.battle.run();s.settleBattle();legalAccounting(s);
      }
      bot.claimRewards(s.playerPort());legalAccounting(s);
      if(s.flow.phase!=='ended')assert.equal(s.nextWave(),true);
    }
    assert.equal(s.flow.phase,'ended');
  }
});
test('P0 archived enemies remain reproducible across 99 stages and simulations do not mutate live inputs', () => {
  const { buildRunWaves }=require('../assets/scripts/core/RunSetup.ts');
  const base=path.resolve(__dirname,'../docs/p0-enemy-difficulty/baseline');
  const archived=JSON.parse(fs.readFileSync(path.join(base,'input-configs.json'),'utf8'));
  // Reproduce the measured P0 fixture from its archived inputs. Current units,
  // skills and stage rules intentionally differ and are exercised above.
  const archivedInputs=archived;
  const waves=buildRunWaves(99,archivedInputs.run,archivedInputs.waves,archivedInputs.units);
  assert.deepEqual(waves,JSON.parse(fs.readFileSync(path.join(base,'waves-before.json'),'utf8')));
  const before=clone(inputs);runSimulation(inputs,{runSeed:1});assert.deepEqual(inputs,before);
});
console.log(`RunSession: ${passed} passed, 0 failed`);
