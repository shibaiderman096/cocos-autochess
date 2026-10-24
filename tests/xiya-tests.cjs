require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const xiya=roster.find(u=>u.id==='xiya');
const dummy={id:'dummy',name:'target',hp:10000,atk:0,armor:0,mr:0,atkSpeed:.5,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup(star=1,changes={},side=0){
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(roster);cfg.setSkills(skills);
 const sim=new BattleSim(cfg,[{cfg:{...xiya,critChance:0,...changes},star,side,x:2,y:3},
  {cfg:{...dummy},side:1-side,x:4,y:3},{cfg:{...dummy,id:'spare'},side:1-side,x:5,y:3}],{seed:1024});
 sim.units.forEach(u=>u.atkCd=u.moveCd=100000);const u=sim.units[0];u.mana=u.cfg.maxMana;u.atkCd=0;sim.step();
 return {cfg,sim,u,enemy:sim.units[1]};
}
const hits=sim=>sim.events.filter(e=>e.t==='hit'&&e.source===1);
function until(sim,t){while(sim.tick<t&&!sim.finished)sim.step();}
for(const star of [1,2,3])for(const side of [0,1])for(const changes of [{},{atk:9999},{physicalPower:50,spellPower:999},{spellPower:999},{damageAmp:.5}]){
 const {cfg,sim,u,enemy}=setup(star,changes,side);assert.equal(u.mana,0);assert.equal(hits(sim).length,0);
 until(sim,4);assert.equal(hits(sim).length,0);until(sim,5);assert.equal(hits(sim).length,1);
 until(sim,7);assert.equal(hits(sim).length,1);until(sim,8);assert.equal(hits(sim).length,2);until(sim,11);
 const amount=Math.round([80,120,180][star-1]*(1+(changes.physicalPower??0)/100)*(1+(changes.damageAmp??0)));
 assert.deepEqual(hits(sim).map(e=>[e.tick,e.dmg,e.dmgType,e.id]),[5,8,11].map(t=>[t,amount,'physical',2]));
 assert.equal(enemy.hp,10000-amount*3);assert.equal(u.pendingCast,null);assert.equal(u.mana,0);
 assert.equal(sim.events.filter(e=>e.t==='cast').length,1);assert.equal(sim.events.filter(e=>e.t==='attack').length,0);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale,true);assert.equal(Number(rows[0].current),amount);assert.equal(Number(rows[1].current),amount*3);
 assert.equal(rows[0].stars,'80 / 120 / 180');assert.equal(rows[1].stars,'240 / 360 / 540');
 const desc=buildSkillDescription(cfg,u.cfg,star,u.skillScale,true);assert.doesNotMatch(desc,/[{}]/);assert.match(desc,/attr_phys_bonus/);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);assert.equal(stats.snapshot().find(s=>s.id===u.id).damage,amount*3);
}
for(const cause of ['deadTarget','hiddenTarget','stun','deadCaster','end']){
 const {sim,u,enemy}=setup();until(sim,5);
 if(cause==='deadTarget'){enemy.hp=0;enemy.alive=false;}
 if(cause==='hiddenTarget')enemy.untargetableUntilTick=100;
 if(cause==='stun'){sim.pendingStuns.push({src:enemy,dst:u,seconds:1});sim.resolveStuns();assert.equal(u.pendingCast,null);}
 if(cause==='deadCaster'){u.hp=0;u.alive=false;}
 if(cause==='end'){sim.end(-1);assert.equal(u.pendingCast,null);}
 until(sim,15);assert.equal(hits(sim).length,1,cause);assert.equal(sim.units[2].hp,10000,'never redirect to spare target');
}
{
 const {sim,enemy}=setup();enemy.cfg.armor=100;enemy.shield=30;until(sim,11);
 assert.equal(enemy.hp,9910);assert.equal(enemy.shield,0);assert.equal(hits(sim).reduce((n,e)=>n+e.dmg,0),120);
}
{
 const a=setup(),b=setup();until(a.sim,11);until(b.sim,11);assert.deepEqual(a.sim.events,b.sim.events);
 const states=resolveTraits(battle.traits,['milu','star_armor_guard','oris','blackstar_warlock','xiya','xiya','saiph'],roster);
 assert.equal(states.find(s=>s.config.id==='astral').count,5);assert.equal(states.find(s=>s.config.id==='astral').active.count,5);
 assert.equal(states.find(s=>s.config.id==='swift_marksman').active.count,2);assert.ok(!states.find(s=>s.config.id==='conqueror')?.memberIds.includes('xiya'));
 for(const changes of [{arrowVolley:{count:2,intervalSeconds:.15}},{arrowVolley:{count:3,intervalSeconds:0}},{starDamage:[1,2]},{castSeconds:NaN},{dmgType:'magic'}]){
  assert.throws(()=>new ConfigManager().setSkills({moon_triple_arrow:{...skills.moon_triple_arrow,...changes}}),/Invalid arrow volley/);
 }
}
console.log('PASS Xiya: three timed physical arrows, ranks/sides/power isolation, locked target, interruption/death/end, armor/shield/statistics, panel and five Astral/two Swift Marksmen');
