require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { sellPrice } = require('../assets/scripts/core/ShopConfig.ts');
const cfg = new ConfigManager();
cfg.setBattle(require('../assets/resources/config/battle.json'));
const unit = { id:'duel', name:'duel', hp:100, atk:100, armor:0, mr:0, atkSpeed:1, range:8,
  moveTicks:6, maxMana:0, startMana:0, manaPerHit:0 };
for (const reversed of [false, true]) {
  const placements = [{cfg:unit,side:0,x:2,y:3}, {cfg:unit,side:1,x:2,y:4}];
  const sim = new BattleSim(cfg, reversed ? placements.reverse() : placements);
  const result = sim.run();
  assert.equal(result.winner, -1, 'equal lethal attacks must produce mutual death');
  assert.equal(result.ticks, 1);
  assert.equal(result.events.filter(e => e.t === 'attack').length, 2);
  assert.equal(result.events.filter(e => e.t === 'death').length, 2);
  assert.ok(result.events.findIndex(e => e.t === 'death') > result.events.map(e => e.t).lastIndexOf('attack'));
}
cfg.setSkills({ burst: {id:'burst',power:100,dmgType:'magic',radius:1,targeting:'nearest'} });
const caster = {...unit, atk:1, skillId:'burst', maxMana:10, startMana:10};
const duel = new BattleSim(cfg, [{cfg:caster,side:0,x:2,y:3},{cfg:caster,side:1,x:2,y:4}]).run();
assert.equal(duel.winner, -1); assert.equal(duel.events.filter(e=>e.t==='cast').length, 2);
cfg.setBattle({starScaling:[{hp:1,atk:1,skill:1},{hp:2,atk:3,skill:4},{hp:5,atk:6,skill:7}]});
const scaled = new BattleSim(cfg, [{cfg:caster,star:2,statMultiplier:1.5,side:0,x:2,y:3},
  {cfg:{...unit,hp:10000},side:1,x:2,y:4}]);
assert.equal(scaled.units[0].cfg.hp, 300); assert.equal(scaled.units[0].cfg.atk, 5);
assert.equal(scaled.units[0].skillScale, 6); scaled.step();
assert.ok(scaled.events.some(e=>e.t==='hit' && e.id===2 && e.dmg===600));
for (const cost of [1,2,3,4,5]) for (const star of [1,2,3]) {
  const price = {1:1,2:2,3:3,4:5,5:8}[cost];
  assert.equal(sellPrice(cost,star), price * 3 ** (star-1) - (cost>1 && star>1 ? 1 : 0));
}
console.log('Fairness, configurable star scaling, and all sell tiers passed');
