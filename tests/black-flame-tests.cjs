require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { CardPool } = require('../assets/scripts/core/CardPool.ts');
const units = require('../assets/resources/config/units.json');
const skills = require('../assets/resources/config/skills.json');
const cfg = new ConfigManager();cfg.setUnits(units);cfg.setSkills(skills);
const card=cfg.getUnit('sasuke');
assert.deepEqual([card.cost,card.role,card.atkSpeed,card.startMana,card.maxMana],[4,'warrior',.8,20,70]);
const pool=new CardPool(units);assert.equal(pool.costOfUnit('sasuke'),4);assert.equal(pool.count('sasuke'),10);
const dummy={...units[0],hp:10000,armor:1000,mr:1000,atk:0,critChance:0,maxMana:0};
function make(star=1, source={}) {
  const sim=new BattleSim(cfg,[{cfg:{...card,critChance:0,...source},star,side:0,x:2,y:2},
    {cfg:dummy,side:1,x:3,y:2},{cfg:dummy,side:1,x:4,y:2}]);
  sim.units[0].mana=sim.units[0].cfg.maxMana;
  for(const u of sim.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}
  return sim;
}
function release(sim) {
  sim.step();const cast=sim.events.find(e=>e.t==='cast');
  assert.equal(cast.duration,.5);assert.equal(cast.target,2);assert.equal(sim.units[0].mana,0);
  for(let i=0;i<9;i++)sim.step();
  assert.equal(sim.events.filter(e=>e.t==='hit').length,0,'no damage or attacks during ten-tick cast');
  sim.step();assert.equal(sim.tick,11);assert.equal(sim.events.find(e=>e.t==='burn').duration,5);
  sim.units[0].atkCd=10000;
}
for(const star of [1,2,3]) {
  const sim=make(star);release(sim);
  const raw=skills.black_flame.starDamage[star-1];
  assert.equal(sim.events.find(e=>e.t==='hit').dmg,Math.max(1,Math.round(raw/11)),'physical hit obeys armor and configured star damage');
  while(sim.tick<131)sim.step();
  const dots=sim.events.filter(e=>e.t==='hit'&&e.dmgType==='true');
  assert.deepEqual(dots.map(e=>e.tick),[31,51,71,91,111],'exactly five one-second pulses after cast completes');
  assert.ok(dots.every(e=>e.id===2&&e.dmg===200&&!e.critical),'2% max HP bypasses armor and cannot crit');
  assert.equal(sim.events.filter(e=>e.t==='hit'&&e.id===3).length,0,'single-target skill');
  assert.equal(sim.units[1].burns.length,0);assert.equal(sim.units[0].mana,0,'burn generates no attack mana');
}
const dead=make();release(dead);dead.units[0].alive=false;dead.units[0].hp=0;
// Keep the battle running with another allied unit after the caster dies.
dead.units[2].side=0;
while(dead.tick<111)dead.step();
assert.equal(dead.events.filter(e=>e.t==='hit'&&e.dmgType==='true').length,5,'burn persists after caster death');
const interrupted=make();interrupted.step();interrupted.units[0].alive=false;interrupted.units[0].hp=0;interrupted.units[2].side=0;
while(interrupted.tick<111)interrupted.step();
assert.equal(interrupted.events.filter(e=>e.t==='burn').length,0,'dead caster cannot complete cast');
const gone=make();gone.step();gone.units[1].alive=false;gone.units[1].hp=0;
for(let i=0;i<10;i++)gone.step();
assert.equal(gone.events.filter(e=>e.t==='burn').length,0,'dead selected target cancels effect');
const refreshed=make();release(refreshed);refreshed.units[0].mana=refreshed.units[0].cfg.maxMana;refreshed.units[0].atkCd=0;
refreshed.step();for(let i=0;i<10;i++)refreshed.step();
assert.equal(refreshed.units[1].burns.length,1,'same caster refreshes rather than stacking');
assert.equal(refreshed.units[1].burns[0].remainingPulses,5);
const bonus=make(1,{physicalPower:100,spellPower:1000});release(bonus);
assert.equal(bonus.events.find(e=>e.t==='hit').dmg,Math.round(skills.black_flame.starDamage[0]*2/11));
while(bonus.tick<31)bonus.step();
assert.equal(bonus.events.find(e=>e.t==='hit'&&e.dmgType==='true').dmg,200,'type bonuses do not change true burn');
assert.deepEqual(make().run(),make().run(),'deterministic seed and placement');
console.log('PASS black flame: four-cost card, ten-tick cast, all star configured values, physical/true damage, five burn pulses, death, refresh and determinism');
