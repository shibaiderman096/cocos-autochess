require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ConfigManager, hybridSpellDamage} = require('../assets/scripts/core/ConfigManager.ts');
const cfg = new ConfigManager();
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics} = require('../assets/scripts/battle/CombatStatistics.ts');
const equipment = require('../assets/resources/config/equipment.json');
const skills = require('../assets/resources/config/skills.json');
const units = require('../assets/resources/config/units.json');
cfg.setEquipment(equipment); cfg.setSkills(skills); cfg.setUnits(units);
const base = {id:'test',name:'test',hp:100000,atk:100,armor:0,mr:0,atkSpeed:1,range:10,
  moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:.25};
const ids=['jeweled_gauntlet','infinity_edge'];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function make(items=[],source={},enemy={},seed=7,extra=[]) {
  const sim = new BattleSim(cfg,[{cfg:{...base,...source},equipment:items,side:0,x:1,y:2},
    {cfg:{...base,atk:0,critChance:0,...enemy},side:1,x:2,y:2},...extra],{seed,maxTicks:300});
  for(const u of sim.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}
  return sim;
}
const sourceHits=sim=>sim.events.filter(e=>e.t==='hit'&&e.source===1);
for(const id of ids) {
  const sim=make([id]), u=sim.units[0];
  close(u.cfg.critChance,.6); assert.equal(u.cfg.skillCanCrit,true);
  assert.equal(u.cfg.physicalPower,id==='infinity_edge'?20:0);
  assert.equal(u.cfg.spellPower,id==='jeweled_gauntlet'?20:0);
  sim.step(); assert.equal(u.equipmentAttackStacks,0);assert.equal(u.attackSpeed,1);
  for(const type of ['physical','magic','true']) {
    cfg.setSkills({test:{id:'test',power:100,radius:0,dmgType:type,targeting:'nearest'}});
    const cast=make([id],{skillId:'test',maxMana:10,startMana:10,critChance:1});cast.step();
    const hit=sourceHits(cast)[0];assert.equal(hit.critical,true);
    const bonus=(type==='physical'&&id==='infinity_edge')||(type==='magic'&&id==='jeweled_gauntlet');
    assert.equal(hit.dmg,bonus?180:150,`${id} only boosts matching damage type`);
  }
  cfg.setSkills({test:{id:'test',power:100,radius:0,dmgType:'magic',targeting:'nearest'}});
  const noItem=make([],{skillId:'test',maxMana:10,startMana:10,critChance:1});noItem.step();
  assert.equal(sourceHits(noItem)[0].critical,undefined,'100% crit without trait still cannot skill-crit');
  assert.equal(sourceHits(noItem)[0].dmg,100);
}
{
  const pair=make(ids).units[0];close(pair.cfg.critChance,.95);
  assert.equal(pair.cfg.physicalPower,20);assert.equal(pair.cfg.spellPower,20);
  const triple=make([...ids,'infinity_edge']).units[0];assert.equal(triple.cfg.critChance,1);
  assert.equal(triple.cfg.physicalPower,40);assert.equal(triple.cfg.spellPower,20);
  const defaultRate=cfg.equipmentStats({...base,critChance:undefined},ids);close(defaultRate.critChance,.95);
  assert.equal(base.critChance,.25);assert.equal(base.physicalPower,undefined,'shared config never mutated');
  cfg.setSkills({test:{id:'test',power:100,radius:0,dmgType:'magic',targeting:'nearest'}});
  const cast=make(ids,{skillId:'test',maxMana:10,startMana:10,critChance:1});cast.step();
  assert.equal(sourceHits(cast)[0].dmg,180,'two unlocks still apply one crit multiplier');
  const stats=new CombatStatistics();stats.begin(cast.units);stats.consume(cast.events);
  assert.equal(stats.snapshot().find(row=>row.id===1).damageByType.magic,180);
  const basic=make(ids,{critChance:1});basic.step();assert.equal(sourceHits(basic)[0].dmg,180,'basic attack crit also occurs once');
}
{
  cfg.setSkills({test:{id:'test',power:101,radius:2,dmgType:'magic',targeting:'nearest'}});
  const sim=make(['jeweled_gauntlet'],{skillId:'test',maxMana:10,startMana:10,critChance:1,damageAmp:.25},
    {mr:100,damageReduction:.2},7,[{cfg:{...base,atk:0,critChance:0,mr:100,damageReduction:.2},side:1,x:3,y:2}]);
  sim.step();const hits=sourceHits(sim);assert.equal(hits.length,2);
  assert.ok(hits.every(hit=>hit.critical&&hit.dmg===Math.round(101*1.2*1.5*1.25*.8/2)),
    'AoE recipients independently use one final rounding and matching resistance');
}
cfg.setSkills(skills);
for(const id of ids) {
  const card=cfg.getUnit('young_sasuke'), skill=cfg.getSkill(card.skillId);
  const sim=make([id],{...card,critChance:1,startMana:card.maxMana},{mr:100});sim.step();
  const hit=sourceHits(sim)[0];assert.equal(hit.critical,true);
  assert.equal(hit.dmg,Math.round(hybridSpellDamage(sim.units[0].cfg,skill,1)*1.5/2),
    'hybrid components receive their own bonuses, then one shared crit and MR pass');
}
for(const id of ids) {
  const card=cfg.getUnit('sasuke'),skill=cfg.getSkill(card.skillId);
  const sim=make([id],{...card,critChance:1,startMana:card.maxMana});sim.step();
  for(let i=0;i<10;i++)sim.step();sim.units[0].atkCd=10000;
  assert.equal(sourceHits(sim)[0].dmg,Math.round(skill.starDamage[0]*(id==='infinity_edge'?1.2:1)*1.5));
  while(sim.tick<111)sim.step();
  const burns=sourceHits(sim).filter(hit=>hit.dmgType==='true');
  assert.equal(burns.length,5);assert.ok(burns.every(hit=>hit.critical&&hit.dmg===3000),
    'all five true-damage burn pulses can crit without physical/spell bonus');
  assert.equal(sim.units[0].mana,0,'skill crit does not generate attack mana');
}
{
  const card=cfg.getUnit('itachi');
  const sim=make(['infinity_edge'],{...card,critChance:1,startMana:card.maxMana});
  sim.step();for(let i=0;i<9;i++)sim.step();
  assert.equal(sourceHits(sim)[0].critical,true,'delayed magic spell can crit with Infinity Edge');
  assert.ok(sim.events.some(e=>e.t==='stun'),'critical spell preserves its stun');
}
{
  cfg.setSkills({heal:{id:'heal',effect:'healChannel',power:0,radius:0,dmgType:'magic',targeting:'nearest',
    castSeconds:.5,heal:{intervalSeconds:.25,maxHpFractions:[.1,.1,.1]}}});
  const sim=make(ids,{hp:1000,critChance:1,skillId:'heal',maxMana:10,startMana:10});sim.units[0].hp=500;
  for(let i=0;i<11;i++)sim.step();
  const heals=sim.events.filter(e=>e.t==='heal');assert.equal(heals.length,2);
  assert.ok(heals.every(e=>e.amount===100&&!e.critical),'healing cannot crit');
}
cfg.setSkills({test:{id:'test',power:100,radius:0,dmgType:'magic',targeting:'nearest'}});
const replay=seed=>make(['jeweled_gauntlet'],{skillId:'test',maxMana:10,startMana:10,manaPerHit:10},{hp:1000000},seed).run();
assert.deepEqual(replay(12),replay(12));assert.notDeepEqual(replay(12).events,replay(13).events);
const rolls=[];
for(let seed=1;seed<=100;seed++) {
  const sim=make(['jeweled_gauntlet'],{skillId:'test',maxMana:10,startMana:10}, {},seed);sim.step();
  rolls.push(sourceHits(sim)[0].critical===true);
}
assert.ok(rolls.some(Boolean)&&rolls.some(value=>!value),'60% crit produces both ordinary and critical skill hits');
for(const id of ids) {
  const item=equipment.find(item=>item.id===id), asset=path.join(__dirname,'../assets/resources',item.icon.replace('/spriteFrame','.png'));
  assert.ok(fs.existsSync(asset));assert.ok(JSON.parse(fs.readFileSync(asset+'.meta','utf8')).subMetas.f9941);
}
console.log('PASS skill-crit equipment: matching +20% bonus, additive +35% crit, cap, all damage types, AoE, hybrid spell, delayed stun, burn, no healing crit, no double crit, stats, deterministic RNG and icons');
