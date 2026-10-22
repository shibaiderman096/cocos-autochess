require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const clone=v=>JSON.parse(JSON.stringify(v)),trait=battle.traits.find(t=>t.id==='spellchanter');
const base={id:'dummy',name:'dummy',hp:1000,atk:10,armor:0,mr:0,atkSpeed:.8,range:20,moveTicks:1,maxMana:100,startMana:0,manaPerHit:0,critChance:0};
function create(n=2,side=0,extra=[]) {
  const c=new ConfigManager();c.setBattle({...clone(battle),roleMana:{casterPerSecond:0,damageTakenFraction:0},traits:[clone(trait)]});
  c.setSkills({test:{id:'test',name:'test',dmgType:'magic',starDamage:[100,100,100],radius:0}});
  const members=Array.from({length:n},(_,i)=>({...base,id:`mage_${i}`,role:'caster',damageType:'magic',skillId:'test'}));
  c.setUnits(members);
  return new BattleSim(c,[...members.map((cfg,i)=>({cfg,side,x:i%7,y:2+Math.floor(i/7)})),
    ...[{...base,id:'enemy',hp:100000,maxMana:0},...extra].map((cfg,i)=>({cfg,side:1-side,x:i,y:7}))],{seed:1019});
}
function hit(s,a,b,n=10,type='true'){s.damage(a,b,n,type);s.resolveDamage();s.pendingDamage.length=0;}
const current=resolveTraits([trait],roster.map(u=>u.id),roster)[0];
assert.deepEqual(current.memberIds,['arc_repairer','blackstar_warlock','celine','nether_lantern_witch','oris']);
assert.equal(current.count,5);
for(const side of [0,1])for(let n=1;n<=8;n++) {
  const s=create(n,side),e=trait.breakpoints.filter(t=>t.count<=n).at(-1)?.spellchanter;
  assert.equal(s.units[0].cfg.spellPower,e?.spellPower??0);assert.equal(s.units.at(-1).cfg.spellPower,0);
  const victim=s.units.at(-1);victim.hp=20;
  hit(s,s.units[0],victim,10);hit(s,s.units[0],victim,10);
  assert.equal(s.units[0].mana,e?.manaOnTakedown??0);
  assert.equal(s.units[1]?.mana??0,0,'nonparticipants receive nothing');
}
// Assist is based on actual personal HP damage, inclusive at exactly five seconds.
for(const elapsed of [99,100,101]) {
  const s=create(),[a,b,v]=s.units;v.hp=20;hit(s,a,v,10);s.tick=elapsed;hit(s,b,v,10);
  assert.equal(a.mana,elapsed<=100?8:0);assert.equal(b.mana,8);
  s.resolveDamage();assert.equal(b.mana,8,'death cannot reward twice');
}
for(const type of ['physical','magic','true']) {
  const s=create(),[a,b,v]=s.units;v.hp=20;hit(s,a,v,1,type);hit(s,b,v,100);
  assert.equal(a.mana,8,'personal skills, attacks and damage over time qualify regardless of damage type');
}
{
  const s=create(),[a,b,v]=s.units;v.shield=100;v.hp=10;hit(s,a,v,100);hit(s,b,v,10);
  assert.equal(a.mana,0,'shield-only damage grants no participation');assert.equal(b.mana,8);
}
{
  const s=create(),[a,b,v]=s.units;v.hp=20;
  s.pendingDamage.push({src:a,dst:v,raw:10,damageAmp:0,resistance:0,reduction:0,type:'true',critical:false,targeted:false,fixed:true,shadowBoardSide:0});
  s.resolveDamage();s.pendingDamage.length=0;hit(s,b,v,10);assert.equal(a.mana,0,'faction representative is not an assist');
}
// Death order cannot let a simultaneously killed contributor gain or retain deferred mana.
for(const reverse of [false,true]) {
  const s=create(),[a,b,v]=s.units;v.hp=10;a.hp=10;a.spellchanterPendingMana=8;
  const attacks=reverse?[[v,a],[a,v]]:[[a,v],[v,a]];
  for(const [src,dst] of attacks)s.damage(src,dst,10,'true');s.resolveDamage();
  assert.equal(a.mana,0);assert.equal(a.spellchanterPendingMana,0);assert.equal(b.mana,0);
}
// Multiple victims while casting accumulate once each and flush when the real windup completes.
{
  const s=create(2,0,[{...base,id:'second_victim',maxMana:0},{...base,id:'survivor',hp:100000,maxMana:0}]),[a,b,v,w]=s.units;
  a.pendingCast={skillId:'test',remainingTicks:2,targetId:v.id};v.hp=10;w.hp=10;
  hit(s,a,v,10);hit(s,a,w,10);assert.equal(a.mana,0);assert.equal(a.spellchanterPendingMana,16);
  s.step();assert.equal(a.mana,0);s.step();assert.equal(a.pendingCast,null);assert.equal(a.mana,16);
  assert.equal(a.spellchanterPendingMana,0);assert.equal(s.events.filter(e=>e.t==='trait_mana'&&e.id===a.id).at(-1).amount,16);
}
{
  const s=create(),[a,b,v]=s.units;a.manaLocked=true;v.hp=10;hit(s,a,v,10);
  assert.equal(a.spellchanterPendingMana,8);a.mana=96;a.manaLocked=false;
  s.flushSpellchanterMana(a);assert.equal(a.mana,100);assert.equal(a.spellchanterPendingMana,0);
  assert.equal(s.events.filter(e=>e.t==='trait_mana').at(-1).amount,4,'feedback shows actual capped gain');
  a.mana=0;s.flushSpellchanterMana(a);assert.equal(a.mana,0,'overflow is discarded, never retained for another cast');
}
// Existing fractional regeneration is unaffected by trait refund and ordinary lock suppression.
{
  const s=create(),[a,b,v]=s.units;a.pendingCast={skillId:'test',remainingTicks:10};a.manaLocked=true;v.hp=10;hit(s,a,v,10);
  s.pendingStuns.push({src:v,dst:a,seconds:1});s.resolveStuns();
  assert.equal(a.pendingCast,null);assert.equal(a.manaLocked,false);assert.equal(a.mana,8,'interrupting windup refunds as soon as the mana lock ends');
}
{
  const s=create(),[a,b,v]=s.units;a.gainMana(.4);v.hp=10;hit(s,a,v,10);a.gainMana(.6);assert.equal(a.mana,9);
  a.manaLocked=true;a.gainMana(50);assert.equal(a.mana,9);assert.equal(a.spellchanterPendingMana,0);
}
{
  const c=new ConfigManager();c.setBattle({...clone(battle),traits:[clone(trait)]});
  const a={...base,id:'same',role:'caster',damageType:'magic',spellPower:25},b={...a,id:'other'};
  c.setUnits([a,b]);const s=new BattleSim(c,[a,a,b].map((cfg,i)=>({cfg,side:0,x:i,y:2})));
  assert.ok(s.units.every(u=>u.cfg.spellPower===40),'same ID counts once but every copy benefits; additive spell power');
  assert.equal(a.spellPower,25,'configuration is immutable');
  for(const unit of [{...a,role:'warrior'},{...a,damageType:'physical'}])assert.equal(resolveTraits([trait],[unit.id],[unit])[0].count,0);
}
for(const field of ['spellPower','manaOnTakedown'])for(const value of [-1,NaN,Infinity]) {
  const invalid=clone(trait);invalid.breakpoints[0].spellchanter[field]=value;
  assert.throws(()=>new ConfigManager().setBattle({traits:[invalid]}),/Invalid spellchanter trait/);
}
for(const n of [2,4,6,8])assert.deepEqual(create(n).run(),create(n).run(),'entire fixed-seed battle stays deterministic');
{
  const s=create(),a=s.units[0],v=s.units.at(-1);s.cast(a,s.configs.getSkill('test'),v);s.resolveDamage();
  assert.equal(s.events.find(e=>e.t==='hit').dmg,115,'15 percentage points apply through the existing spell damage pipeline');
}
// Authored caster skills all receive the automatic trait without editing unit memberships.
for(const unit of roster.filter(u=>current.memberIds.includes(u.id))) {
  const s=create();s.configs.setSkills({...require('../assets/resources/config/skills.json'),test:{id:'test',name:'test',dmgType:'magic',starDamage:[100,100,100],radius:0}});
  const u=s.units[0];u.cfg.skillId=unit.skillId;u.cfg.maxMana=unit.maxMana;u.mana=unit.maxMana;if(unit.id==='arc_repairer')u.hp-=200;
  s.step();assert.ok(s.events.some(e=>e.t==='cast'&&e.id===u.id),unit.id);
}
{
  const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
  const {RunSession}=require('../assets/scripts/core/RunSession.ts');
  const input=loadRunInputs(),options={runSeed:1019,...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
  const session=(data,save)=>{const c=new ConfigManager();c.setUnits(clone(input.units));c.setSkills(input.skills);c.setBattle(clone(data));c.setEquipment(input.equipment);return new RunSession(c,input.run,input.waves,{...options,...(save?{save}:{})});};
  const run=session(input.battle);for(const u of run.owned.all())run.owned.remove(u.uid);
  const members=current.memberIds.slice(0,2).map(id=>run.owned.forceAdd(id));members.forEach((u,x)=>run.owned.move(u.uid,{location:'board',x,y:2}));
  const preview=s=>{const p=s.createPreview();return p.sim.units.find(u=>u.id===p.battleIds.get(members[0].uid));};
  const before=preview(run),restored=preview(session(input.battle,run.snapshot()));
  assert.equal(before.spellchanter.manaOnTakedown,8);assert.equal(restored.cfg.spellPower,before.cfg.spellPower);
  assert.equal(restored.spellchanterPendingMana,0,'battle-only mana cannot leak through saves');
  run.owned.move(members[1].uid,{location:'bench',x:-1,y:8});assert.equal(preview(run).spellchanter,undefined,'reserves cannot activate trait');
  const changed=clone(input.battle);changed.traits.find(t=>t.id==='spellchanter').breakpoints[0].spellchanter.manaOnTakedown++;
  assert.throws(()=>session(changed,run.snapshot()),/configuration mismatch/);
}
console.log('PASS spellchanter: exact tiers, caster membership, 5-second assist boundary, simultaneous death, shields/faction exclusion, deferred mana, cap, additive power and deterministic authored casts');
