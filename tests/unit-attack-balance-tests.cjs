require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const units=require('../assets/resources/config/units.json');
const rules=require('../tools/balance/unit-attack-baselines.json');
const cfg=new ConfigManager(),attackMultipliers=[1,1.2,1.5];
assert.deepEqual(cfg.battle.starScaling.map(s=>s.atk),attackMultipliers,'default attack multipliers match the authored star rule');
cfg.setBattle(require('../assets/resources/config/battle.json'));
assert.deepEqual(cfg.battle.starScaling.map(s=>s.atk),attackMultipliers,'live battle configuration uses 1/1.2/1.5 attack');
const dummy={...units[0],id:'attack_target',hp:100000,atk:0,armor:0,mr:0,maxMana:0,startMana:0,skillId:undefined,critChance:0};
for(const role of Object.values(rules.roles))for(const values of Object.values(role)) {
  assert.equal(values.length,5);
  values.forEach((value,index)=>{assert.ok(Number.isFinite(value)&&value>0);if(index)assert.ok(value>=values[index-1]);});
}
for(const unit of units) {
  assert.ok(Number.isFinite(unit.atk)&&unit.atk>0,unit.name+' has explicit positive base attack');
  for(const star of [1,2,3]) {
    const source={...unit,skillId:undefined,maxMana:0,startMana:0,critChance:0,physicalPower:0,spellPower:0};
    const sim=new BattleSim(cfg,[{cfg:source,side:0,x:3,y:4,star},{cfg:dummy,side:1,x:3,y:3}],{seed:10417001,maxTicks:20});
    sim.step();const hit=sim.events.find(event=>event.t==='hit'&&event.source===1);
    assert.ok(hit,unit.name+' performs its ordinary attack');
    assert.equal(hit.dmg,Math.round(source.atk*attackMultipliers[star-1]),unit.name+' runtime attack follows the authored star multiplier');
  }
}
assert.ok(rules.roles.caster.magic[2]<rules.roles.marksman.physical[2]);
assert.ok(rules.roles.tank.physical[3]<rules.roles.warrior.physical[3]);
assert.ok(rules.roles.caster.physical[0]<rules.roles.marksman.physical[0]);
console.log(`PASS attack balance: ${units.length} configured base attacks, ${units.length*3} real attack/star checks and role differentiation`);
