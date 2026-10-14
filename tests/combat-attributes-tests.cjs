require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager,combatAttributes}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const cfg=new ConfigManager();
cfg.setSkills({burst:{id:'burst',power:100,dmgType:'magic',radius:0,targeting:'nearest'}});
const base={id:'test',name:'test',hp:1000,atk:100,armor:0,mr:0,atkSpeed:1,range:8,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0};
const duel=(source={},target={},seed=42)=>new BattleSim(cfg,[{cfg:{...base,...source},side:0,x:3,y:3},{cfg:{...base,...target},side:1,x:3,y:4}],{seed});
let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}}
test('spell power scales skill damage and composes with star scaling',()=>{
  const sim=duel({spellPower:200,skillId:'burst',maxMana:10,startMana:10});sim.step();
  assert.equal(sim.events.find(e=>e.t==='hit'&&e.id===2).dmg,200);
  const starred=new BattleSim(cfg,[{cfg:{...base,spellPower:200,skillId:'burst',maxMana:10,startMana:10},star:2,side:0,x:3,y:3},{cfg:base,side:1,x:3,y:4}]);
  starred.step();assert.equal(starred.events.find(e=>e.t==='hit'&&e.id===2).dmg,360);
});
test('crit, amplification, reduction and armor compose in one rounding step',()=>{
  const sim=duel({critChance:1,damageAmp:.25},{armor:100,damageReduction:.2});sim.step();
  const hit=sim.events.find(e=>e.t==='hit'&&e.id===2);assert.equal(hit.dmg,75);assert.equal(hit.critical,true);
  const spell=duel({critChance:1,skillId:'burst',maxMana:10,startMana:10});spell.step();
  assert.equal(spell.events.find(e=>e.t==='hit'&&e.id===2).dmg,100,'skills do not roll basic attack crit');
});
test('lifesteal uses actual damage, caps healing and emits health state',()=>{
  const sim=duel({atk:1000,lifesteal:.5},{hp:20,atk:0});sim.units[0].hp=50;sim.step();
  assert.equal(sim.units[0].hp,59,'20 damage heals 10 after taking 1 damage');
  assert.deepEqual(sim.events.find(e=>e.t==='heal'),{t:'heal',tick:1,id:1,amount:10,hp:59});
  const capped=duel({lifesteal:1},{atk:0});capped.step();assert.equal(capped.units[0].hp,1000);
});
test('lifesteal cannot resurrect either side after simultaneous lethal attacks',()=>{
  const sim=duel({hp:100,lifesteal:1},{hp:100,lifesteal:1});sim.step();
  assert.equal(sim.winner,-1);assert.ok(sim.units.every(u=>!u.alive));assert.equal(sim.events.filter(e=>e.t==='heal').length,0);
});
test('true damage still obeys amplification and damage reduction',()=>{
  cfg.setSkills({burst:{id:'burst',power:100,dmgType:'true',radius:0,targeting:'nearest'}});
  const sim=duel({skillId:'burst',maxMana:10,startMana:10,damageAmp:.5},{armor:1000,mr:1000,damageReduction:.5});sim.step();
  assert.equal(sim.events.find(e=>e.t==='hit'&&e.id===2).dmg,75);
  const immune=duel({}, {damageReduction:1});immune.step();assert.equal(immune.events.find(e=>e.t==='hit'&&e.id===2).dmg,0);
});
test('crit randomness is reproducible by seed and varies across seeds',()=>{
  const battle=seed=>duel({critChance:.5},{critChance:.5},seed).run();
  assert.deepEqual(battle(11),battle(11));assert.notDeepEqual(battle(11).events,battle(12).events);
});
test('combat attributes sanitize nonfinite inputs and rates',()=>{
  assert.deepEqual(combatAttributes({spellPower:Infinity,critChance:NaN,lifesteal:-1,damageAmp:-1,damageReduction:9}),
    {spellPower:100,critChance:0,lifesteal:0,damageAmp:0,damageReduction:1});
});
console.log(`Combat attributes: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
