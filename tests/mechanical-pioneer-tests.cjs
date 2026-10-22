require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits} = require('../assets/scripts/battle/Traits.ts');
const {CombatStatistics} = require('../assets/scripts/battle/CombatStatistics.ts');
const {combatConfigurationIdentity} = require('../assets/scripts/core/EnemyGenerationTypes.ts');
const battle = require('../assets/resources/config/battle.json');
const roster = require('../assets/resources/config/units.json');
const original = battle.traits.find(t=>t.id==='mechanical_pioneer');
const clone = v=>JSON.parse(JSON.stringify(v));
function create(n=3,side=0) {
 const trait=clone(original);
 const base={name:'test',hp:10000,atk:0,armor:0,mr:0,atkSpeed:.8,range:20,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
 const units=Array.from({length:n},(_,i)=>({...base,id:`mechanical_${i}`}));
 trait.members=units.map(u=>u.id);trait.pendingMembers=false;
 const cfg=new ConfigManager();cfg.setBattle({...clone(battle),traits:[trait]});cfg.setUnits(units);
 const sim=new BattleSim(cfg,[...units.map((cfg,i)=>({cfg,side,x:i%7,y:side===0?2:5})),
  {cfg:{...base,id:'nonmember'},side,x:6,y:side===0?0:7},
  {cfg:{...base,id:'enemy'},side:1-side,x:3,y:side===0?7:0}],{seed:1019});
 sim.units.forEach(u=>u.atkCd=1000000);
 return sim;
}
function until(sim,tick){while(sim.tick<tick&&!sim.finished)sim.step();assert.equal(sim.tick,tick);}
function hit(sim,u,amount){sim.pendingDamage.length=0;sim.damage(sim.units.at(-1),u,amount,'true');sim.resolveDamage();sim.pendingDamage.length=0;}
assert.equal(original.pendingMembers,false);
assert.deepEqual(original.members,['bao_zero','turbo_fist_tiger','arc_repairer','rail_hunter_07','ripsaw_spider','furnace_executioner','atlas']);
assert.equal(resolveTraits([original],roster.map(u=>u.id),roster)[0].active.count,7,'five distinct mechanical members activate the real five tier');
for(const side of [0,1]) for(const n of [2,3,4,5,6,7]) {
 const sim=create(n,side),u=sim.units[0],tier=original.breakpoints.filter(t=>n>=t.count).at(-1)?.mechanicalPioneer;
 assert.deepEqual(u.mechanicalPioneer,tier);assert.equal(u.attackSpeed,.8);
 assert.equal(sim.units.at(-2).mechanicalPioneer,undefined);assert.equal(sim.units.at(-1).mechanicalPioneer,undefined);
 const ids=sim.units.slice(0,n).map(u=>u.cfg.id),trait={...original,members:ids};
 assert.equal(resolveTraits([trait],[...ids,...ids])[0].count,n);
 if(!tier)continue;
 const first=tier.cooldownSeconds*20,expiry=first+120,next=expiry+tier.cooldownSeconds*20;
 until(sim,first-1);assert.equal(u.attackSpeed,.8);until(sim,first);
 assert.ok(Math.abs(u.attackSpeed-(.8+tier.attackSpeedBonus))<1e-9);
 // Stay above half health, leaving room to observe every healing pulse.
 u.hp=5100;const stats=new CombatStatistics();stats.begin(sim.units);sim.events.length=0;
 until(sim,first+19);assert.equal(u.hp,5100);
 until(sim,first+20);assert.equal(u.hp,5100+Math.round(10000*tier.regenPerSecond));
 until(sim,expiry);assert.equal(u.attackSpeed,.8,'speed expires at exact boundary');
 assert.equal(u.hp,5100+6*Math.round(10000*tier.regenPerSecond),'six complete healing seconds');
 stats.consume(sim.events);assert.equal(stats.snapshot().find(r=>r.id===u.id).healing,6*Math.round(10000*tier.regenPerSecond));
 const hp=u.hp;until(sim,next-1);assert.equal(u.hp,hp);assert.equal(u.attackSpeed,.8);
 until(sim,next);assert.equal(u.overclockUntilTick,next+120);
 u.attackSpeedBonus=10;assert.equal(u.attackSpeed,5,'shared speed cap');
}
for(const n of [5,7]) {
 const sim=create(n),u=sim.units[0];
 hit(sim,u,5000);assert.equal(u.overclockEmergencyUsed,false,'exact 50% does not trigger');
 hit(sim,u,1);assert.equal(u.overclockEmergencyUsed,true);assert.equal(u.overclockUntilTick,120);
 assert.equal(sim.units[1].overclockUntilTick,0,'emergency affects only the damaged member');
 assert.equal(u.hp,4999,'no immediate heal');
 until(sim,20);assert.equal(u.hp,4999+Math.round(10000*u.mechanicalPioneer.regenPerSecond));
 const expiry=u.overclockUntilTick;u.hp=9000;hit(sim,u,5000);assert.equal(u.overclockUntilTick,expiry,'one emergency per battle');
 const fresh=create(n);assert.equal(fresh.units[0].overclockEmergencyUsed,false);
}
{
 const sim=create(5),u=sim.units[0];until(sim,150);const healTick=u.overclockHealTick;
 hit(sim,u,5001);assert.equal(u.overclockUntilTick,270);assert.equal(u.overclockNextTick,390);
 assert.equal(u.overclockHealTick,healTick,'refresh preserves healing clock');
 assert.equal(u.attackSpeed,1.4,'refresh does not stack');
 until(sim,160);assert.equal(u.hp,5299);
 until(sim,270);assert.equal(u.attackSpeed,.8);until(sim,389);assert.equal(u.attackSpeed,.8);until(sim,390);assert.equal(u.attackSpeed,1.4);
}
{
 const sim=create(3),u=sim.units[0];hit(sim,u,6000);assert.equal(u.overclockUntilTick,0,'3 tier has no emergency');
 until(sim,120);hit(sim,u,10000);assert.equal(u.alive,false);assert.equal(u.overclockUntilTick,0);assert.equal(u.overclockHealTick,0);
 const heals=sim.events.filter(e=>e.t==='heal'&&e.id===u.id).length;until(sim,180);
 assert.equal(sim.events.filter(e=>e.t==='heal'&&e.id===u.id).length,heals);
}
{
 const sim=create(5),u=sim.units[0];hit(sim,u,10000);assert.equal(u.alive,false);assert.equal(u.overclockEmergencyUsed,false,'lethal cannot trigger');
}
{
 const sim=create(7);until(sim,180);assert.equal(sim.events.filter(e=>e.t==='heal').length,0,'full health excluded from statistics');
}
for(const key of ['attackSpeedBonus','regenPerSecond','durationSeconds','cooldownSeconds','lowHealthThreshold']) for(const value of [-1,NaN,Infinity]) {
 const trait=clone(original);trait.breakpoints[1].mechanicalPioneer[key]=value;
 assert.throws(()=>new ConfigManager().setBattle({traits:[trait]}),/Invalid mechanical pioneer/);
}
for(const n of [3,5,7])assert.deepEqual(create(n).run(),create(n).run(),'deterministic replay');
{
 const sim=create(5),u=sim.units[0];until(sim,120);assert.equal(u.attackSpeed,1.4);
 hit(sim,sim.units.at(-1),100000);sim.step();assert.equal(sim.finished,true);
 assert.equal(u.overclockUntilTick,0);assert.equal(u.overclockHealTick,0);assert.equal(u.attackSpeed,.8);
}
{
 const sim=create(3),u=sim.units[0];u.cfg.hp=18000;u.hp=10000;
 until(sim,140);assert.equal(u.hp,10360,'regen uses final maximum HP, not a base-health copy');
 const before=clone(battle),after=clone(battle);
 for(const config of [before,after]){const trait=config.traits.find(t=>t.id===original.id);trait.pendingMembers=true;trait.members=[];}
 after.traits.find(t=>t.id===original.id).breakpoints[0].mechanicalPioneer.regenPerSecond=.025;
 assert.equal(combatConfigurationIdentity({skills:{},battle:before}),combatConfigurationIdentity({skills:{},battle:after}),'reserved empty trait preserves saves');
 for(const config of [before,after]) {
  const trait=config.traits.find(t=>t.id===original.id);trait.pendingMembers=false;trait.members=['future_mechanical'];
 }
 assert.notEqual(combatConfigurationIdentity({skills:{},battle:before}),combatConfigurationIdentity({skills:{},battle:after}),'active mechanics changes invalidate combat identity');
}
console.log('PASS mechanical pioneer: tiers/sides, member isolation, exact wait/duration boundaries, six heal pulses, final max HP/statistics, half-health once/refresh, no stacking, cap, death/reset, config validation and deterministic replay');
