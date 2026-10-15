require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const card=cfg.getUnit('sakura');
assert.deepEqual([card.cost,card.role,card.startMana,card.maxMana],[2,'tank',20,50]);
function make(star=1){
  const sim=new BattleSim(cfg,[{cfg:card,star,side:0,x:2,y:2},{cfg:{...cfg.getUnit('warrior'),hp:100000},side:1,x:6,y:5}]);
  sim.units[0].mana=50;sim.units[0].hp=100;sim.units[1].atkCd=10000;sim.units[1].moveCd=10000;return sim;
}
for(const star of [1,2,3]){
  const sim=make(star);sim.step();
  assert.equal(sim.events.find(e=>e.t==='cast').duration,1.5);assert.equal(sim.units[0].mana,0);
  for(let i=0;i<30;i++)sim.step();
  const heals=sim.events.filter(e=>e.t==='heal');
  assert.deepEqual(heals.map(e=>e.tick),[11,21,31]);
  assert.ok(heals.every(e=>e.amount===Math.round(sim.units[0].cfg.hp*[.02,.025,.04][star-1])));
  assert.equal(sim.events.filter(e=>e.t==='attack'||e.t==='move').length,0,'no attack or movement during channel');
  assert.equal(sim.units[0].pendingCast,null);assert.equal(sim.units[0].mana,0);
}
const cap=make();cap.units[0].hp=card.hp-1;for(let i=0;i<31;i++)cap.step();
assert.equal(cap.units[0].hp,card.hp);assert.equal(cap.events.filter(e=>e.t==='heal').length,1);assert.equal(cap.events.find(e=>e.t==='heal').amount,1);
const dead=make();dead.step();for(let i=0;i<10;i++)dead.step();dead.units[0].alive=false;dead.units[0].hp=0;
dead.step();assert.equal(dead.events.filter(e=>e.t==='heal').length,1,'death interrupts channel');assert.equal(dead.units[0].hp,0);
assert.equal(new BattleSim(cfg,[{cfg:card,side:0,x:2,y:2},{cfg:card,side:1,x:3,y:2}]).units[0].mana,20);
assert.deepEqual(make().run(),make().run());
console.log('PASS healing channel: roster, 20/50 mana, all stars, three half-second heals, capped HP, stationary channel, death and determinism');
