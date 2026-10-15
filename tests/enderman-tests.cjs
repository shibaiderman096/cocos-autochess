require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { dist } = require('../assets/scripts/battle/Pathfinding.ts');
const units = require('../assets/resources/config/units.json');
const skills = require('../assets/resources/config/skills.json');
const cfg = new ConfigManager(); cfg.setUnits(units); cfg.setSkills(skills);
const card = cfg.getUnit('enderman');
assert.deepEqual([card.cost,card.atkSpeed,card.startMana,card.maxMana],[5,.8,0,40]);
const dummy = { ...units[0], hp:100000, atk:0, armor:0, critChance:0, atkSpeed:.001, moveTicks:10000 };
function make(star=1) {
  const sim = new BattleSim(cfg,[{cfg:{...card,critChance:0},star,side:0,x:2,y:2},
    {cfg:dummy,side:1,x:3,y:2},{cfg:dummy,side:1,x:4,y:2},{cfg:dummy,side:1,x:6,y:5}]);
  sim.units[0].mana=40;
  sim.units[1].hp=90000;sim.units[2].hp=80000;sim.units[3].hp=1;
  for(const u of sim.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}
  return sim;
}
for(const star of [1,2,3]) {
  const sim=make(star);sim.step();
  assert.equal(sim.events.find(e=>e.t==='cast').target,3,'absolute HP within three hexes, excludes farther low HP');
  assert.equal(sim.units[0].manaLocked,true);
  assert.ok(Math.abs(sim.units[0].attackSpeed-[1.3,1.8,5][star-1])<1e-8);
  for(let i=0;i<5;i++)sim.step();
  assert.equal(sim.events.filter(e=>e.t==='teleport').length,0);
  assert.equal(sim.events.filter(e=>e.t==='attack').length,0);
  sim.step();const jump=sim.events.find(e=>e.t==='teleport');
  assert.equal(sim.units[0].mana,0);
  assert.equal(jump.tick,7);assert.equal(dist(sim.units[0].pos,sim.units[2].pos),1);
  assert.equal(new Set(sim.units.map(u=>`${u.x},${u.y}`)).size,sim.units.length);
  while(sim.events.filter(e=>e.t==='attack'&&e.id===1).length<3){sim.step();assert.equal(sim.units[0].mana,0,'all three empowered attacks are mana locked');}
  assert.equal(sim.units[0].attackSpeed,star===3 ? 5 : .8);assert.equal(sim.units[0].manaLocked,star===3);
  while(sim.events.filter(e=>e.t==='attack'&&e.id===1).length<4)sim.step();
  assert.equal(sim.units[0].mana,star===3 ? 0 : 10,'only temporary empowerment resumes mana gain');
  const hits=sim.events.filter(e=>e.t==='hit'&&e.id!==1);
  const empoweredDamage=Math.round(sim.units[0].cfg.atk*skills.ender_ambush.attackMultipliers[star-1]);
  assert.deepEqual(hits.slice(0,4).map(e=>e.dmg),[...Array(3).fill(empoweredDamage),star===3 ? empoweredDamage : sim.units[0].cfg.atk]);
  assert.equal(sim.units[0].permanentEmpower,star===3);
  assert.equal(sim.units[0].empoweredAttacks,star===3 ? 3 : 0);
}
const permanent=make(3);
permanent.units[1].hp=permanent.units[2].hp=10000000;
permanent.units[1].cfg.hp=permanent.units[2].cfg.hp=10000000;
while(permanent.events.filter(e=>e.t==='attack'&&e.id===1).length<12)permanent.step();
assert.equal(permanent.units[0].permanentEmpower,true);
assert.equal(permanent.units[0].mana,0);
assert.ok(permanent.events.filter(e=>e.t==='hit'&&e.id!==1).every(e=>e.dmg===Math.round(permanent.units[0].cfg.atk*50)));
assert.equal(permanent.events.filter(e=>e.t==='cast'&&e.id===1).length,1);
assert.equal(make(3).units[0].permanentEmpower,false,'fresh battle resets permanent state');
assert.deepEqual(skills.ender_ambush.attackMultipliers,[1.25,1.5,50]);
assert.equal(cfg.scaleUnit(card,3).hp,8240,'flat 5000 HP is added after three-star scaling');
assert.equal(cfg.scaleUnit(card,2).hp,1800);
assert.equal(cfg.scaleUnit({...card,cost:4},3).hp,3240);
assert.equal(cfg.scaleUnit({...card,id:'another-orange'},3).hp,8240,'all five-cost cards receive the bonus');
assert.equal(card.hp,1000,'shared base config stays unchanged');
const capped=new BattleSim(cfg,[{cfg:{...card,atkSpeed:20,skillId:undefined,maxMana:0,critChance:0},side:0,x:2,y:2},{cfg:dummy,side:1,x:3,y:2}]);
capped.units[1].atkCd=10000;capped.units[1].moveCd=10000;
assert.equal(capped.units[0].attackSpeed,5);
for(let i=0;i<21;i++)capped.step();
assert.deepEqual(capped.events.filter(e=>e.t==='attack'&&e.id===1).map(e=>e.tick),[1,5,9,13,17,21]);
const boosted=make(3);boosted.units[0].cfg.atkSpeed=2;boosted.step();assert.equal(boosted.units[0].attackSpeed,5);
const dead=make();dead.step();dead.units[2].alive=false;dead.units[2].hp=0;
for(let i=0;i<6;i++)dead.step();
assert.equal(dead.units[0].priorityTarget,2,'retarget when original victim dies during cast');
assert.deepEqual(make().run(),make().run(),'same seed and placements reproduce events');
console.log('PASS enderman: config, targeting, six-tick cast, legal teleport, three empowered attacks at all stars, retarget and determinism');
