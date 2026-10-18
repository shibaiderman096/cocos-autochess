require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits} = require('../assets/scripts/battle/Traits.ts');
const units = require('../assets/resources/config/units.json');
const battle = require('../assets/resources/config/battle.json');
const trait = battle.traits[0];
const clone = value => JSON.parse(JSON.stringify(value));
const synthetic = {...clone(trait), members:[...trait.members,'future_ninja_1','future_ninja_2']};
for (let n=0;n<=10;n++) {
  const ids=synthetic.members.slice(0,n), state=resolveTraits([synthetic],[...ids,...ids])[0];
  assert.equal(state.count,n);
  assert.equal(state.active?.power??0,n>=10?80:n>=7?50:n>=5?30:n>=3?15:0);
  assert.equal(state.next,n<3?3:n<5?5:n<7?7:n<10?10:null);
}
assert.equal(trait.members.length,8);
for(const id of trait.members) assert.ok(units.some(unit=>unit.id===id));
assert.ok(!trait.members.includes('iron_golem'));
const cfg = new ConfigManager();cfg.setUnits(clone(units));cfg.setSkills(require('../assets/resources/config/skills.json'));
cfg.setBattle({...clone(battle),traits:[synthetic]});cfg.setEquipment(require('../assets/resources/config/equipment.json'));
const base = {id:'dummy',name:'dummy',hp:10000,atk:100,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function create(n,side=0) {
  const placements=synthetic.members.slice(0,n).map((id,i)=>({cfg:{...base,id},side,x:i%7,y:4+Math.floor(i/7)}));
  placements.push({cfg:base,side:1-side,x:0,y:0});
  return new BattleSim(cfg,placements,{seed:1017,maxTicks:80});
}
for(const n of [2,3,4,5,6,7,8,10]) {
  const sim=create(n),expected=n>=10?80:n>=7?50:n>=5?30:n>=3?15:0;
  for(const unit of sim.units.slice(0,n)) {assert.equal(unit.cfg.physicalPower,expected);assert.equal(unit.cfg.spellPower,expected);}
  assert.equal(sim.units[n].cfg.physicalPower,0,'nonmember and opposing side receive nothing');
}
assert.equal(create(5,1).units[0].cfg.spellPower,30,'enemy side can activate independently');
const duplicate=new BattleSim(cfg,[0,1,2,3].map((i)=>({cfg:{...base,id:trait.members[i%2]},side:0,x:i,y:5})).concat([{cfg:base,side:1,x:0,y:0}]));
assert.equal(duplicate.units[0].cfg.physicalPower,0,'copies cannot cross activation threshold');
const sustain=create(10),u=sustain.units[0];u.hp=9000;
for(const unit of sustain.units) unit.stunnedUntilTick=10000;
for(let t=0;t<19;t++) sustain.step();assert.equal(u.hp,9000);
sustain.step();assert.equal(u.hp,9200);assert.equal(sustain.events.find(e=>e.t==='heal').amount,200);
u.hp=9990;for(let t=0;t<20;t++)sustain.step();assert.equal(u.hp,10000,'healing caps at max HP');
u.alive=false;u.hp=0;for(let t=0;t<20;t++)sustain.step();assert.equal(u.hp,0,'no revival');
assert.equal(sustain.units[1].traitRegenPerSecond,.02,'death keeps the battle tier fixed');
assert.equal(create(10).units[0].hp,10000,'new battle resets runtime');
assert.deepEqual(create(7).run(),create(7).run(),'same seed produces identical complete events');
const equipped=new BattleSim(cfg,[...synthetic.members.slice(0,3).map((id,i)=>({cfg:{...base,id,physicalPower:10,spellPower:20},side:0,x:i,y:5,equipment:i===0?['guinsoo']:[]})),{cfg:base,side:1,x:0,y:0}]);
assert.equal(equipped.units[0].cfg.physicalPower,25);assert.equal(equipped.units[0].cfg.spellPower,45,'base/equipment/trait power add');
assert.equal(base.physicalPower,undefined);assert.equal(units[0].physicalPower,0,'source config is not mutated');
assert.throws(()=>cfg.setBattle({traits:[{...trait,breakpoints:[{count:3,tier:'gold',power:-1}]}]}),/Invalid trait/);
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const inputs=loadRunInputs(),options={runSeed:1017,...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function session(battleData,save) {const c=new ConfigManager();c.setUnits(inputs.units);c.setSkills(inputs.skills);c.setBattle(battleData);c.setEquipment(inputs.equipment);return new RunSession(c,inputs.run,inputs.waves,{...options,...(save?{save}: {})});}
const s=session(inputs.battle),saved=s.snapshot();assert.ok(session(inputs.battle,saved));
const deployed=trait.members.slice(0,3).map(id=>s.owned.forceAdd(id));
deployed.forEach((unit,index)=>s.owned.move(unit.uid,{location:'board',x:index,y:5}));
assert.equal(s.createPreview().sim.units.filter(unit=>unit.side===0)[0].cfg.spellPower,15);
s.owned.move(deployed[2].uid,{location:'bench',x:-1,y:8});
assert.equal(s.createPreview().sim.units.filter(unit=>unit.side===0)[0].cfg.spellPower,0,'reserves cannot keep the trait activated');
s.owned.move(deployed[2].uid,{location:'board',x:2,y:5});
const restored=session(inputs.battle,s.snapshot());
assert.equal(restored.createPreview().sim.units.filter(unit=>unit.side===0)[0].cfg.spellPower,15,'save/load recomputes the trait without stacking it');
const changed=clone(inputs.battle);changed.traits[0].breakpoints[0].power++;
assert.throws(()=>session(changed,saved),/configuration mismatch/,'mechanical trait changes reject mismatched saves');
console.log('PASS traits: all thresholds, unique deployment, side isolation, nonmembers, additive stats, timed/capped healing, no revival, fixed battle tier, replay/reset and save identity');
