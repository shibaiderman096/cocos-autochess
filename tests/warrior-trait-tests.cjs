require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { resolveTraits } = require('../assets/scripts/battle/Traits.ts');
const { CombatStatistics } = require('../assets/scripts/battle/CombatStatistics.ts');
const battle = require('../assets/resources/config/battle.json');
const roster = require('../assets/resources/config/units.json');
const clone = value => JSON.parse(JSON.stringify(value));
const traits = battle.traits.filter(t => ['conqueror', 'spellblade'].includes(t.id));
const base = { id:'dummy',name:'dummy',hp:1000,atk:100,armor:0,mr:0,atkSpeed:.8,range:20,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0 };
function create(id, count=2, side=0, options={}) {
  const cfg = new ConfigManager(), trait = clone(traits.find(t=>t.id===id));
  cfg.setBattle({...clone(battle),traits:[trait]});
  cfg.setSkills({test_spell:{id:'test_spell',name:'test',dmgType:'magic',starDamage:[10,10,10],radius:0,...options.skill}});
  const members = Array.from({length:count},(_,i)=>({...base,id:`member_${i}`,role:'warrior',damageType:trait.selector.damageType,...(i===0?options.unit:{})}));
  cfg.setUnits(members);
  const sim = new BattleSim(cfg,[...members.map((unit,i)=>({cfg:unit,side,x:i%7,y:(side===0?2:4)+Math.floor(i/7),...(i===0?options.placement:{})})),
    {cfg:{...base,id:'enemy',hp:100000,...options.enemy},side:1-side,x:6,y:side===0?7:0}],{seed:1019});
  return sim;
}
function strike(sim, src, dst, amount, type='true', basic=false) {
  sim.damage(src,dst,amount,type,basic);sim.resolveDamage();sim.pendingDamage.length=0;
}
const all = resolveTraits(traits,roster.map(u=>u.id),roster);
assert.deepEqual(all.find(t=>t.config.id==='conqueror').memberIds,['crimson_demon_knight','seraphiel','turbo_fist_tiger']);
assert.deepEqual(all.find(t=>t.config.id==='spellblade').memberIds,['bloodline_earl','furnace_executioner','ghostflame_blade','phinia']);
for (const trait of traits) for(let n=1;n<=8;n++) for(const side of [0,1]) {
  const sim=create(trait.id,n,side),tier=trait.breakpoints.filter(t=>t.count<=n).at(-1),u=sim.units[0];
  assert.equal(u.damageAmp,tier?.conqueror?.damageAmp??0);
  assert.equal(u.lifesteal,tier?.conqueror?.lifesteal??0);
  assert.equal(u.cfg.spellPower,tier?.spellblade?.spellPower??0);
  assert.equal(u.attackSpeed,.8,'spellblade speed is inactive before cast');
  assert.equal(u.damageReductionAt(0),0);
  assert.equal(sim.units.at(-1).damageAmp,0,'opposing nonmember gains nothing');
  const ids=sim.units.slice(0,n).map(u=>u.cfg.id);
  assert.equal(resolveTraits([trait],[...ids,...ids],sim.units.map(u=>u.cfg))[0].count,n);
}
for (const count of [2,4,6,8]) {
  const sim=create('conqueror',count);
  const u=sim.units[0],amp=u.conqueror.damageAmp;
  u.cfg.damageAmp=.3;u.overtimeDamageAmp=.2;
  u.shadowCorruption={damageAmpLoss:.1};
  u.hp=500;assert.ok(Math.abs(u.damageAmp-(.4+amp))<1e-9,'50% is not doubled');
  u.hp=499;assert.ok(Math.abs(u.damageAmp-(.4+2*amp))<1e-9,'only trait portion doubles');
  assert.equal(u.lifesteal,u.conqueror.lifesteal,'lifesteal never doubles');
  u.hp=700;assert.ok(Math.abs(u.damageAmp-(.4+amp))<1e-9,'healing switches amplification back');
}
// Queued attacks use health at actual hit time, even when another hit crosses 50% in this tick.
{
  const sim=create('conqueror'),u=sim.units[0],enemy=sim.units.at(-1);u.hp=510;
  sim.damage(enemy,u,20,'true');sim.damage(u,enemy,100,'physical');sim.resolveDamage();
  assert.equal(sim.events.filter(e=>e.t==='hit').at(-1).dmg,116);
}
for(const type of ['physical','magic','true']) {
  const sim=create('conqueror'),u=sim.units[0],enemy=sim.units.at(-1);u.hp=600;
  const stats=new CombatStatistics();stats.begin(sim.units);
  strike(sim,u,enemy,100,type,type==='physical');
  assert.equal(enemy.hp,99892);assert.equal(u.hp,609,'all personal damage types lifesteal');
  stats.consume(sim.events);assert.equal(stats.snapshot().find(r=>r.id===u.id).damage,108);
  assert.equal(stats.snapshot().find(r=>r.id===u.id).healing,9);
}
{
  const sim=create('conqueror'),u=sim.units[0],enemy=sim.units.at(-1);u.hp=600;enemy.hp=20;
  strike(sim,u,enemy,100);assert.equal(u.hp,602,'overkill excluded from lifesteal');
}
{
  const sim=create('conqueror'),u=sim.units[0],enemy=sim.units.at(-1);u.hp=600;enemy.shield=1000;
  strike(sim,u,enemy,100);assert.equal(u.hp,600,'shield absorption excluded from lifesteal');
}
for(const side of [0,1]) {
  const sim=create('conqueror',8,side),u=sim.units[0],enemy=sim.units.at(-1);
  u.hp=310;strike(sim,enemy,u,10);assert.equal(u.hp,300);assert.equal(u.conquerorProtectionUsed,false,'30% is strict');
  strike(sim,enemy,u,1);assert.equal(u.hp,449);assert.equal(u.conquerorProtectionUsed,true);
  assert.equal(u.damageReductionAt(99),.2);assert.equal(u.damageReductionAt(100),0,'5 seconds expires at exact tick');
  strike(sim,enemy,u,100);assert.equal(u.hp,369,'protection reduces following hit, not triggering hit');
  u.hp=200;strike(sim,enemy,u,1);assert.equal(u.hp,199,'once per member per battle');
  assert.equal(sim.events.filter(e=>e.t==='heal').length,1);
  const fresh=create('conqueror',8,side);assert.equal(fresh.units[0].conquerorProtectionUsed,false,'new battle resets state');
}
{
  const sim=create('conqueror',8),u=sim.units[0],enemy=sim.units.at(-1);u.hp=100;
  strike(sim,enemy,u,100);assert.equal(u.alive,false);assert.equal(u.conquerorProtectionUsed,false,'lethal damage cannot trigger heal');
  assert.equal(sim.events.filter(e=>e.t==='heal').length,0);
}
for(const count of [2,4,6,8]) {
  const sim=create('spellblade',count),u=sim.units[0],enemy=sim.units.at(-1),e=u.spellblade;
  sim.cast(u,sim.configs.getSkill('test_spell'),enemy);sim.pendingDamage.length=0;
  assert.ok(Math.abs(u.attackSpeed-(.8+e.attackSpeedBonus))<1e-9);
  assert.equal(u.damageReductionAt(79),e.damageReduction);assert.equal(u.damageReductionAt(80),0);
  u.combatTick=80;assert.equal(u.attackSpeed,.8,'speed and reduction expire together');
  sim.tick=40;u.combatTick=40;sim.cast(u,sim.configs.getSkill('test_spell'),enemy);sim.pendingDamage.length=0;
  assert.equal(u.spellbladeUntilTick,120,'recast refreshes, never adds durations');
  assert.ok(Math.abs(u.attackSpeed-(.8+e.attackSpeedBonus))<1e-9,'recast never stacks speed');
  assert.equal(u.spellbladeAttacks,count===8?3:0);
  if(count===8){u.spellbladeAttacks=1;sim.cast(u,sim.configs.getSkill('test_spell'),enemy);assert.equal(u.spellbladeAttacks,3);}
}
// Real full-mana casts use each current magic warrior's authored skill and activation path.
for(const id of ['bloodline_earl','furnace_executioner','ghostflame_blade','phinia']) {
  const unit=roster.find(u=>u.id===id),sim=create('spellblade',2,0,{unit:{...unit,startMana:unit.maxMana}});
  sim.configs.setSkills(require('../assets/resources/config/skills.json'));if(id==='furnace_executioner'){sim.units.at(-1).x=0;sim.units.at(-1).y=5;}if(id==='bloodline_earl'){sim.units.at(-1).x=0;sim.units.at(-1).y=3;}sim.step();
  const u=sim.units[0];assert.ok(sim.events.some(e=>e.t==='cast'&&e.id===u.id));
  assert.equal(u.spellbladeUntilTick,81);assert.ok(Math.abs(u.attackSpeed-(unit.atkSpeed+.15+u.skillAttackSpeedBonus))<1e-9,'trait stacks with the personal skill');
}
// Use the real basic-attack path; secondary damage cannot consume extra charges or add extra mana/stacks.
{
  const sim=create('spellblade',8,0,{unit:{maxMana:100,manaPerHit:10,physicalPower:900,critChance:1},enemy:{mr:100}}),u=sim.units[0],enemy=sim.units.at(-1);
  sim.cast(u,sim.configs.getSkill('test_spell'),enemy);sim.pendingDamage.length=0;sim.events.length=0;
  for(let i=0;i<4;i++){u.atkCd=0;sim.updateUnit(u);sim.resolveDamage();sim.pendingDamage.length=0;}
  const hits=sim.events.filter(e=>e.t==='hit'&&e.dmgType==='magic');
  assert.equal(hits.length,3);assert.ok(hits.every(e=>e.dmg===95&&e.critical),'70 * 1.8 spell power * 1.5 shared crit / 2 MR');
  assert.equal(u.spellbladeAttacks,0);assert.equal(u.mana,40,'one mana gain per attack');
  assert.equal(sim.events.filter(e=>e.t==='attack').length,4);
}
{
  const sim=create('spellblade',8),u=sim.units[0],enemy=sim.units.at(-1);sim.cast(u,sim.configs.getSkill('test_spell'),enemy);
  sim.pendingDamage.length=0;u.combatTick=100;sim.tick=100;u.atkCd=0;sim.updateUnit(u);sim.resolveDamage();
  assert.equal(u.spellbladeAttacks,2,'three next attacks are not limited by the separate 4-second buff');
}
for(const id of ['conqueror','spellblade']) {
  const sim=create(id,8),trait=traits.find(t=>t.id===id);
  assert.deepEqual(sim.run(),create(id,8).run(),'seeded complete replay is deterministic');
  const future={...base,id:'future',role:'warrior',damageType:trait.selector.damageType};
  assert.equal(resolveTraits([trait],['future','future'],[future])[0].count,1);
  assert.equal(resolveTraits([trait],['future'],[{...future,damageType:trait.selector.damageType==='physical'?'magic':'physical'}])[0].count,0);
  for(const value of [-1,NaN,Infinity]) {
    const invalid=clone(trait);invalid.breakpoints[0][id][id==='conqueror'?'lifesteal':'attackSpeedBonus']=value;
    assert.throws(()=>new ConfigManager().setBattle({traits:[invalid]}),new RegExp(`Invalid ${id} trait`));
  }
}
{
  const sim=create('conqueror',8,0,{placement:{star:3}}),u=sim.units[0],other=sim.units[1],enemy=sim.units.at(-1);
  assert.equal(u.cfg.hp,3240);u.hp=972;strike(sim,enemy,u,1);
  assert.equal(u.hp,1457,'15% healing uses final star-scaled maximum HP');
  other.hp=300;strike(sim,enemy,other,1);assert.equal(other.hp,449,'each member has an independent first trigger');
  const hits=sim.events.filter(e=>e.t==='hit');assert.equal(hits[0].actualDamage,1,'instant healing never subtracts from damage statistics');
}
{
  const sim=create('spellblade',8,0,{unit:{atkSpeed:4.9,damageReduction:.1}}),u=sim.units[0],enemy=sim.units.at(-1);
  sim.cast(u,sim.configs.getSkill('test_spell'),enemy);sim.pendingDamage.length=0;
  u.guardReduction=.2;u.guardUntilTick=80;
  assert.equal(u.attackSpeed,5);assert.ok(Math.abs(u.damageReductionAt(0)-.55)<1e-9);
  strike(sim,enemy,u,100);assert.equal(u.hp,955,'spellblade reduction stacks with other independent reductions');
}
// Real run previews exclude reserves, recompute after load, and preserve mechanical save identity.
{
  const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
  const {RunSession}=require('../assets/scripts/core/RunSession.ts');
  const inputs=loadRunInputs(),options={runSeed:1019,...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
  const session=(data,save)=>{const c=new ConfigManager();c.setUnits(clone(inputs.units));c.setSkills(inputs.skills);c.setBattle(clone(data));c.setEquipment(inputs.equipment);return new RunSession(c,inputs.run,inputs.waves,{...options,...(save?{save}:{})});};
  for(const id of ['conqueror','spellblade']) {
    const run=session(inputs.battle);for(const unit of run.owned.all())run.owned.remove(unit.uid);
    const members=all.find(s=>s.config.id===id).memberIds.map(id=>run.owned.forceAdd(id));
    if(members.length===1){const converted=run.owned.forceAdd('helion');converted.equipment=[`trait_emblem__${id}`];members.push(converted);} // Conversion supplies the missing second member after roster removal.
    members.forEach((u,x)=>run.owned.move(u.uid,{location:'board',x,y:2}));
    const preview=s=>{const p=s.createPreview();return p.sim.units.find(u=>u.id===p.battleIds.get(members[0].uid));};
    const first=preview(run),restored=preview(session(inputs.battle,run.snapshot()));
    assert.equal(first[id]!==undefined,true);assert.equal(restored.damageAmp,first.damageAmp);assert.equal(restored.cfg.spellPower,first.cfg.spellPower);
    members.slice(1).forEach((member,i)=>run.owned.move(member.uid,{location:'bench',x:-1,y:8-i}));assert.equal(preview(run)[id],undefined,'bench cannot activate trait');
    const changed=clone(inputs.battle);changed.traits.find(t=>t.id===id).breakpoints[0][id][id==='conqueror'?'damageAmp':'spellPower']+=.01;
    assert.throws(()=>session(changed,run.snapshot()),/configuration mismatch/);
  }
}
console.log('PASS warrior traits: exact tiers on both sides, role selectors, HP boundaries, per-member heal/protection, lifesteal, real casts, refresh/expiry, three empowered basics, crit/scaling, and determinism');
