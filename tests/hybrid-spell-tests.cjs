require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager,hybridSpellDamage}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const card=cfg.getUnit('young_sasuke'),skill=cfg.getSkill(card.skillId);
assert.deepEqual([card.cost,card.range,card.startMana,card.maxMana,card.atkSpeed],[2,4,0,50,1]);
function make(star=1,bonus={},enemy={}) {
 const sim=new BattleSim(cfg,[{cfg:{...card,critChance:1,...bonus},side:0,star,x:1,y:2},
 {cfg:{...cfg.getUnit('warrior'),hp:100000,armor:999,mr:100,...enemy},side:1,x:5,y:2},
 {cfg:{...cfg.getUnit('warrior'),hp:100000},side:1,x:6,y:2}]);
 sim.units[0].mana=sim.units[0].cfg.maxMana;for(const u of sim.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}return sim;
}
for(const star of [1,2,3]){
 const sim=make(star);sim.step();const hit=sim.events.find(e=>e.t==='hit');
 assert.equal(hit.dmgType,'magic');assert.equal(hit.id,2);assert.equal(hit.critical,undefined);
 assert.equal(hit.dmg,Math.round([120,180,300][star-1]/2));
 assert.equal(sim.events.filter(e=>e.t==='hit').length,1);assert.equal(sim.units[0].mana,0);
}
const physical=make(1,{physicalPower:100});physical.step();assert.equal(physical.events.find(e=>e.t==='hit').dmg,Math.round((20*2+100)/2));
const magical=make(1,{spellPower:200});magical.step();assert.equal(magical.events.find(e=>e.t==='hit').dmg,Math.round((20+300)/2));
const both=make(2,{physicalPower:100,spellPower:200,damageAmp:.5},{damageReduction:.2});both.step();
assert.equal(both.events.find(e=>e.t==='hit').dmg,Math.round(hybridSpellDamage(both.units[0].cfg,skill,2)*1.5*.8/2));
const range=make();range.units[1].x=6;range.step();assert.equal(range.events.filter(e=>e.t==='cast').length,0);
const cycle=make();cycle.units[0].mana=0;for(let i=0;i<101;i++)cycle.step();
assert.equal(cycle.events.filter(e=>e.t==='attack'&&e.id===1).length,5);assert.equal(cycle.events.find(e=>e.t==='cast').tick,101);
console.log('PASS hybrid magic: config, all-star fixed components, distinct type bonuses, single magic resistance pass, range, mana and attack speed');
