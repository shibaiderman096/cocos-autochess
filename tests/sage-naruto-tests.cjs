require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { resolveEnemyRole } = require('../assets/scripts/core/EnemyRoles.ts');
const cfg = new ConfigManager();
cfg.setUnits(require('../assets/resources/config/units.json'));
cfg.setSkills(require('../assets/resources/config/skills.json'));
const card = cfg.getUnit('champion');
assert.deepEqual([card.name,card.cost,card.role,card.startMana,card.maxMana,card.range,card.atkSpeed,card.manaPerHit],
  ['仙人鸣人',3,'marksman',0,50,3,.9,10]);
assert.equal(resolveEnemyRole(card,{},require('../assets/resources/config/enemy-roles.json')).role,'ranged_dps');
assert.equal(resolveEnemyRole(card,{}, {units:{}}).role,'ranged_dps');
function make(star=1,power=0,armor=0,reverse=false) {
  const enemy={...cfg.getUnit('guardian'),hp:100000,armor,critChance:0};
  const placements=[{cfg:{...card,physicalPower:power,spellPower:999,critChance:0},star,side:0,x:0,y:3},
    {cfg:enemy,side:1,x:3,y:3},{cfg:enemy,side:1,x:4,y:3}];
  const sim=new BattleSim(cfg,reverse?placements.reverse():placements);
  const src=sim.units.find(u=>u.side===0);
  for(const u of sim.units.filter(u=>u.side===1)) {u.atkCd=10000;u.moveCd=10000;}
  return {sim,src};
}
for(const star of [1,2,3])for(const power of [0,50])for(const armor of [0,100])for(const reverse of [false,true]) {
  const {sim,src}=make(star,power,armor,reverse);src.mana=50;
  sim.step();assert.equal(src.mana,0);assert.equal(sim.events.find(e=>e.t==='cast').duration,.1);
  sim.step();assert.equal(sim.events.filter(e=>e.t==='hit').length,0);
  sim.step();const hits=sim.events.filter(e=>e.t==='hit');assert.equal(hits.length,1);
  assert.equal(hits[0].dmgType,'physical');
  assert.equal(hits[0].dmg,Math.round([280,420,700][star-1]*(1+power/100)*100/(100+armor)));
  assert.equal(sim.events.find(e=>e.t==='skill_impact').tick,3);
  assert.equal(sim.units.length,3,'clone is a transient effect, not a board unit');
  assert.deepEqual(src.pos,{x:0,y:3});
}
for(const invalid of ['dead','untargetable']) {
  const {sim,src}=make();src.mana=50;sim.step();
  const target=sim.units.find(u=>u.id===src.pendingCast.targetId);
  if(invalid==='dead') {target.alive=false;target.hp=0;} else target.untargetableUntilTick=100;
  sim.step();sim.step();assert.equal(sim.events.filter(e=>e.t==='hit'||e.t==='skill_impact').length,0);
}
const natural=make();while(!natural.src.pendingCast&&natural.sim.tick<200)natural.sim.step();
assert.ok(natural.src.pendingCast);assert.equal(natural.sim.events.filter(e=>e.t==='attack'&&e.id===natural.src.id).length,5);
assert.deepEqual(make().sim.run(),make().sim.run());
console.log('PASS Sage Naruto: config, all-star physical damage/scaling/armor, exact delay, single target, no clone occupancy, invalid target, mana and determinism');
