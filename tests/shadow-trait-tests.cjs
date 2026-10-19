require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits} = require('../assets/scripts/battle/Traits.ts');
const {CombatStatistics} = require('../assets/scripts/battle/CombatStatistics.ts');
const battle = require('../assets/resources/config/battle.json');
const shadow = battle.traits.find(t => t.id === 'shadow');
const clone = value => JSON.parse(JSON.stringify(value));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const base = {id:'target',name:'dummy',hp:100000,atk:100,armor:100,mr:100,atkSpeed:1,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function create(n, side=0, tickMs=50) {
  const trait = {...clone(shadow), members:Array.from({length:10},(_,i)=>`shadow_${i}`),pendingMembers:false};
  const cfg = new ConfigManager(); cfg.setBattle({...clone(battle),tickMs,traits:[trait]});
  const members = trait.members.slice(0,n).map(id=>({...base,id,armor:0,mr:0}));cfg.setUnits(members);
  const placements=members.map((unit,i)=>({cfg:unit,side,x:i%7,y:Math.floor(i/7)+(side===0?0:6)}));
  placements.push({cfg:{...base,id:'friend'},side,x:6,y:side===0?3:4});
  placements.push({cfg:base,side:1-side,x:0,y:side===0?7:0});
  const sim=new BattleSim(cfg,placements,{seed:1018});
  return {sim,src:sim.units[0],friend:sim.units.at(-2),dst:sim.units.at(-1),trait};
}
assert.equal(shadow.pendingMembers,false);assert.equal(shadow.members.length,10);
assert.deepEqual(shadow.breakpoints.map(t=>t.count),[3,5,7,10]);
assert.equal(resolveTraits([shadow],require('../assets/resources/config/units.json').map(u=>u.id))[0].active.count,10,'all ten authored members are registered');
for(let n=1;n<=10;n++) for(const side of [0,1]) {
  const {sim,src,friend,dst,trait}=create(n,side);
  const state=resolveTraits([trait],[...trait.members.slice(0,n),...trait.members.slice(0,n)])[0];
  assert.equal(state.count,n);assert.equal(!!src.shadowAttack,n>=3);
  assert.equal(src.cfg.physicalPower,n>=5?30:0);assert.equal(src.cfg.spellPower,n>=5?30:0);
  assert.equal(friend.shadowAttack,undefined);assert.equal(dst.shadowAttack,undefined);
  assert.equal(friend.cfg.physicalPower,0);assert.equal(dst.cfg.physicalPower,0);
  sim.damage(src,dst,100,'physical',true);sim.resolveDamage();
  assert.equal(!!dst.shadowCorruption,n>=3);
  assert.equal(dst.armor,n>=3?70:100);assert.equal(dst.mr,n>=3?70:100);
}
const mark=create(7);const {sim,src,dst}=mark;
sim.damage(src,dst,100,'magic',false);sim.resolveDamage();assert.equal(dst.shadowCorruption,undefined,'spells do not infect');
sim.pendingDamage.length=0;sim.damage(src,dst,100,'physical',true);sim.resolveDamage();
const firstTick=dst.shadowCorruption.nextTick;
for(let i=0;i<10;i++) {sim.pendingDamage.length=0;sim.damage(src,dst,1,'physical',true);sim.resolveDamage();}
assert.equal(dst.armor,70,'shred is multiplicative once');assert.equal(dst.shadowCorruption.nextTick,firstTick,'hits do not reset decay');
assert.equal(sim.events.filter(e=>e.t==='shadow_mark').length,1);
src.alive=false; // The mark survives its applier.
sim.tick=firstTick-1;sim.updateShadows();near(dst.damageAmp,0);
for(let i=0;i<12;i++) {sim.tick=firstTick+i*20;sim.updateShadows();near(dst.damageAmp,-Math.min(.2,(i+1)*.02));}
dst.cfg.damageAmp=.5;near(dst.damageAmp,.3,'reduces amplification additively');
mark.friend.cfg.mr=0;sim.pendingDamage.length=0;sim.damage(dst,mark.friend,100,'magic');sim.resolveDamage();
assert.equal(sim.events.filter(e=>e.t==='hit').at(-1).dmg,130,'decay affects outgoing spells');
assert.equal(dst.snapshot().shadowCorrupted,true);
for(const type of ['physical','magic','true']) {
  const test=create(3);test.sim.applyShadow(test.src,test.dst);test.sim.damage(test.friend,test.dst,170,type);test.sim.resolveDamage();
  assert.equal(test.sim.events.find(e=>e.t==='hit').dmg,type==='true'?170:100,'all allies benefit, true bypasses shred');
}
const blocked=create(3);blocked.dst.untargetableUntilTick=100;
blocked.sim.damage(blocked.src,blocked.dst,100,'physical',true);blocked.sim.resolveDamage();assert.equal(blocked.dst.shadowCorruption,undefined);
for(const side of [0,1]) for(const tickMs of [50,100]) {
  const {sim,src,friend,dst}=create(10,side,tickMs);sim.start();const interval=1000/tickMs;
  assert.equal(sim.events.filter(e=>e.t==='shadow_board').length,1);
  src.cfg.physicalPower=999;src.cfg.spellPower=999;src.cfg.damageAmp=9;src.cfg.critChance=1;src.cfg.skillCanCrit=true;
  src.traitExecuteThreshold=.99;src.cfg.lifesteal=1;src.hp-=500;src.alive=false;
  dst.cfg.damageReduction=1;dst.guardReduction=1;dst.guardUntilTick=10000;
  sim.tick=interval/2-1;sim.updateShadows();assert.equal(sim.pendingDamage.length,0);
  for(let i=1;i<=24;i++) {
    sim.pendingDamage.length=0;sim.tick=i*interval/2;sim.updateShadows();sim.resolveDamage();
    near(friend.shadowAttackSpeedBonus,Math.min(2,Math.floor(i/2)*.2));near(friend.attackSpeed,1+Math.min(2,Math.floor(i/2)*.2));
    assert.equal(dst.hp,base.hp-i*100,'exact damage independent of source power, amp, crit, execute and target reduction');
  }
  assert.equal(src.hp,base.hp-500,'board damage never lifesteals/revives');
  assert.equal(sim.events.filter(e=>e.t==='hit').some(e=>e.critical||e.executed),false);
  assert.equal(dst.shadowAttackSpeedBonus,0);friend.cfg.atkSpeed=4.9;assert.equal(friend.attackSpeed,5);
  const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);
  assert.equal(stats.snapshot().find(row=>row.id===src.id).damageByType.true,0,'board damage is not credited to a unit');
  const traitRow=stats.snapshot().find(row=>row.sourceKind==='shadowBoard');
  assert.equal(traitRow.name,'暗影羁绊');assert.equal(traitRow.star,4);assert.equal(traitRow.side,side);
  assert.equal(traitRow.damage,2400);assert.equal(traitRow.damageByType.true,2400);
  assert.equal(stats.snapshot().find(row=>row.id===dst.id).taken,2400);
  const snapshot=stats.snapshot();assert.equal(stats.consume(sim.events),false);assert.deepEqual(stats.snapshot(),snapshot);
  stats.begin(sim.units);assert.ok(stats.snapshot().every(row=>!row.sourceKind),'new battle clears trait rows');
  assert.equal(sim.events.filter(e=>e.t==='shadow_pulse'&&e.damage).length,24);
  assert.equal(sim.events.filter(e=>e.t==='shadow_pulse'&&e.attackSpeed).length,12,'speed remains on the one-second clock');
}
const shield=create(10);shield.dst.shield=150;shield.sim.tick=20;shield.sim.updateShadows();shield.sim.resolveDamage();
assert.equal(shield.dst.hp,base.hp);assert.equal(shield.dst.shield,50,'fixed damage still uses shields');
const protect=create(10);protect.dst.hp=50;
protect.dst.equipment=[{id:'save',lowHealthProtection:{threshold:.5,untargetableSeconds:2,shieldMaxHpFraction:.2,healMaxHpFraction:.2,healSeconds:2}}];
protect.sim.tick=20;protect.sim.updateShadows();protect.sim.resolveDamage();assert.equal(protect.dst.hp,1,'lethal-save still applies');
for(const n of [3,5,7,10])assert.deepEqual(create(n).sim.run(),create(n).sim.run(),'seeded complete battle including shadow events is deterministic');
const fresh=create(10);assert.equal(fresh.dst.shadowCorruption,undefined);assert.equal(fresh.src.shadowAttackSpeedBonus,0);
const legacyClock=create(10);delete legacyClock.sim.shadowBoards[0].effect.damageIntervalSeconds;
legacyClock.sim.tick=10;legacyClock.sim.updateShadows();assert.equal(legacyClock.sim.pendingDamage.length,0,'legacy boards default damage to the original interval');
legacyClock.sim.tick=20;legacyClock.sim.updateShadows();assert.equal(legacyClock.sim.pendingDamage.length,1);
for(const value of [0,-.5,NaN]) {
  const invalid=clone(shadow);invalid.breakpoints[3].shadow.board.damageIntervalSeconds=value;
  assert.throws(()=>new ConfigManager().setBattle({traits:[invalid]}),/Invalid shadow board/);
}
const cfg=new ConfigManager();assert.throws(()=>cfg.setBattle({traits:[{...shadow,members:[],pendingMembers:false}]}),/Invalid trait/);
const {combatConfigurationIdentity,sameCombatConfigurationIdentity}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const original={skills:require('../assets/resources/config/skills.json'),battle:{...battle,traits:battle.traits.filter(t=>t.id!=='shadow')}};
const dormant={...original,battle:{...battle,traits:battle.traits.map(t=>t.id==='shadow'?{...t,members:[],pendingMembers:true}:t)}};
assert.equal(combatConfigurationIdentity(original),combatConfigurationIdentity(dormant),'memberless reserved trait keeps existing combat save identity');
const assigned=clone(dormant);assigned.battle.traits.find(t=>t.id==='shadow').members=['scout'];
assert.equal(sameCombatConfigurationIdentity(combatConfigurationIdentity(original),combatConfigurationIdentity(assigned)),false,'assigning a member still rejects older combat rules');
for(const bad of [{resistanceReduction:1.1},{resistanceReduction:NaN},{resistanceReduction:.3,damageAmpLossPerSecond:.02},{resistanceReduction:.3,damageAmpLossCap:-1},{resistanceReduction:.3,board:{intervalSeconds:0,attackSpeedPerPulse:.2,attackSpeedCap:2,fixedDamage:100}}]) {
  const t=clone(shadow);t.breakpoints[0].shadow=bad;assert.throws(()=>new ConfigManager().setBattle({traits:[t]}),/Invalid shadow/);
}
console.log('PASS shadow: pending membership, all thresholds/sides, hit-only nonstacking shred, independent timed capped decay, deterministic replay, full-army capped speed, exact damage/statistics, shields and lethal save');
