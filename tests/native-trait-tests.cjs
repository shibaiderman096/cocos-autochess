require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits,isTraitFrontRow} = require('../assets/scripts/battle/Traits.ts');
const battle = require('../assets/resources/config/battle.json');
const units = require('../assets/resources/config/units.json');
const clone = value => JSON.parse(JSON.stringify(value));
const native = battle.traits.find(trait => trait.id === 'native');
assert.deepEqual(native.members,['archer','guardian','duelist','ranger','shaman','mage','sorcerer']);
assert.deepEqual(native.breakpoints.map(tier=>tier.count),[3,5,7]);
for(const id of native.members)assert.ok(units.some(unit=>unit.id===id));
const cfg = new ConfigManager(); cfg.setBattle({...clone(battle),traits:[clone(native)]}); cfg.setUnits(clone(units));
cfg.setSkills(require('../assets/resources/config/skills.json'));
cfg.setEquipment([{id:'test_gear',name:'test',icon:'test',hp:100,maxHpBonus:.2,spellPower:0,attackSpeedBonus:.1,attackSpeedPerAttack:0}]);
const base={id:'dummy',name:'dummy',hp:1000,atk:100,armor:0,mr:0,atkSpeed:.8,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function create(n,side=0,front=true,overrides={}) {
  const y=side===0?(front?2:0):(front?4:6);
  const placements=native.members.slice(0,n).map((id,i)=>({cfg:{...base,id},side,x:i,y,...(i===0?overrides:{})}));
  placements.push({cfg:base,side:1-side,x:0,y:side===0?7:0});
  return new BattleSim(cfg,placements,{seed:1018,maxTicks:60});
}
for(const n of [0,1,2,3,4,5,6,7]) {
  const state=resolveTraits([native],[...native.members.slice(0,n),...native.members.slice(0,n)])[0];
  const tier=n>=7?native.breakpoints[2]:n>=5?native.breakpoints[1]:n>=3?native.breakpoints[0]:null;
  assert.equal(state.count,n); assert.equal(state.active,tier);
  for(const side of [0,1])for(const front of [true,false]) {
    const sim=create(n,side,front),bonus=tier?.formation;
    for(const unit of sim.units.slice(0,n)) {
      assert.equal(unit.cfg.hp,front?Math.round(1000*(1+(bonus?.maxHpBonus??0))):1000);
      assert.equal(unit.hp,unit.cfg.hp,'current HP starts full at increased maximum');
      assert.equal(unit.cfg.damageReduction,front?(bonus?.damageReduction??0):0);
      assert.ok(Math.abs(unit.attackSpeed-(.8+(!front?(bonus?.attackSpeedBonus??0):0)))<1e-9);
      assert.equal(unit.damageAmp,!front?(bonus?.damageAmp??0):0);
      assert.equal(unit.cfg.physicalPower,0);assert.equal(unit.cfg.spellPower,0);
    }
    assert.equal(sim.units[n].cfg.hp,1000,'nonmember/opponent gains nothing');
  }
}
for(const side of [0,1])for(let y=side===0?0:4;y<(side===0?4:8);y++) {
  const expected=side===0?y>=2:y<=5;
  assert.equal(isTraitFrontRow(side,y,8,4),expected,'all eight mirrored home rows classified');
  const sim=create(3,side,true,{y}),unit=sim.units[0];
  assert.equal(unit.cfg.hp,expected?1200:1000);
  assert.equal(unit.damageAmp,expected?0:.1);
  unit.y=expected?(side===0?0:7):(side===0?3:4);
  sim.units[1].alive=false;
  assert.equal(unit.cfg.hp,expected?1200:1000,'movement/death do not switch formation bonus or tier');
}
const copies=new BattleSim(cfg,[0,1,0,1].map((i,x)=>({cfg:{...base,id:native.members[i]},side:0,x,y:2})));
assert.equal(copies.units[0].cfg.hp,1000,'copies of two IDs do not activate three-piece tier');
const split=new BattleSim(cfg,[...native.members.slice(0,2).map((id,x)=>({cfg:{...base,id},side:0,x,y:2})),
  {cfg:{...base,id:native.members[2]},side:1,x:0,y:4}]);
assert.ok(split.units.every(unit=>unit.cfg.hp===1000),'sides cannot combine counts');
const gear=create(3,0,true,{star:2,equipment:['test_gear']});
assert.equal(gear.units[0].cfg.hp,2736,'HP increases after star and equipment maximum HP');
assert.equal(gear.units[0].hp,2736);
const speed=create(7,0,false,{cfg:{...base,id:native.members[0],atkSpeed:4.9},equipment:['test_gear']});
assert.equal(speed.units[0].attackSpeed,5,'attack speed cap still applies');
const reduced=create(7,0,true,{cfg:{...base,id:native.members[0],damageReduction:.95}});
assert.equal(reduced.units[0].cfg.damageReduction,1,'damage reduction caps at 100%');
for(const type of ['physical','magic','true']) {
  const offensive=create(3,0,false),src=offensive.units[0],dst=offensive.units.at(-1);
  offensive.damage(src,dst,100,type); offensive.resolveDamage();
  assert.equal(dst.hp,890,'rear damage amplification follows existing damage pipeline');
  const defensive=create(3,0,true),target=defensive.units[0],attacker=defensive.units.at(-1);
  defensive.damage(attacker,target,100,type); defensive.resolveDamage();
  assert.equal(target.hp,1108,'front damage reduction follows existing damage pipeline');
}
assert.deepEqual(create(7).run(),create(7).run(),'seeded full event streams reproduce');
assert.equal(create(3).units[0].cfg.hp,1200,'new battles do not accumulate bonuses');
assert.equal(base.hp,1000);assert.equal(units.find(unit=>unit.id==='archer').hp,450,'source config remains unchanged');
for(const bad of [{damageReduction:1.1},{maxHpBonus:-.1},{attackSpeedBonus:NaN},{damageAmp:Infinity}]) {
  const invalid=clone(native);Object.assign(invalid.breakpoints[0].formation,bad);
  assert.throws(()=>cfg.setBattle({traits:[invalid]}),/Invalid trait formation/);
}
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const inputs=loadRunInputs(),options={runSeed:1018,...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function session(battleData,save) {
  const config=new ConfigManager();config.setUnits(clone(inputs.units));config.setSkills(inputs.skills);
  config.setBattle(clone(battleData));config.setEquipment(inputs.equipment);
  return new RunSession(config,inputs.run,inputs.waves,{...options,...(save?{save}: {})});
}
const run=session(inputs.battle);
for(const owned of run.owned.all())run.owned.remove(owned.uid);
const carriers=native.members.slice(0,3).map(id=>run.owned.forceAdd(id));
carriers.forEach((unit,x)=>run.owned.move(unit.uid,{location:'board',x,y:2}));
function firstCarrier(s) {const preview=s.createPreview();return preview.sim.units.find(unit=>unit.id===preview.battleIds.get(carriers[0].uid));}
const baseHp=inputs.units.find(unit=>unit.id===native.members[0]).hp;
assert.equal(firstCarrier(run).cfg.hp,Math.round(baseHp*1.2));
run.owned.move(carriers[0].uid,{location:'board',x:0,y:0});
assert.equal(firstCarrier(run).cfg.hp,baseHp,'preparation repositioning switches from front HP to rear attack bonus');
assert.equal(firstCarrier(run).cfg.damageAmp,.1);
run.owned.move(carriers[2].uid,{location:'bench',x:-1,y:8});
assert.equal(firstCarrier(run).cfg.damageAmp,0,'reserve units do not activate the trait');
run.owned.move(carriers[2].uid,{location:'board',x:2,y:2});
const saved=run.snapshot(),restored=session(inputs.battle,saved);
assert.equal(firstCarrier(restored).cfg.damageAmp,.1,'save/load recomputes without stacking');
const changed=clone(inputs.battle);changed.traits.find(trait=>trait.id==='native').breakpoints[0].formation.damageAmp+=.01;
assert.throws(()=>session(changed,saved),/configuration mismatch/,'new mechanics cannot silently alter an existing run');
console.log('PASS native trait: 3/5/7 thresholds, unique members, mirrored rows, fixed bonuses, HP/equipment, capped stats, typed damage and deterministic reset');
