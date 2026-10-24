require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {hexDist}=require('../assets/scripts/battle/HexMath.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const weaver=roster.find(u=>u.id==='nebula_weaver');
const dummy={id:'dummy',name:'target',hp:10000,atk:0,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup(star=1,changes={},side=0){
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(roster);cfg.setSkills(skills);
 const sim=new BattleSim(cfg,[{cfg:{...weaver,critChance:0,...changes},star,side,x:1,y:1},
  ...[{x:3,y:3},{x:5,y:3},{x:4,y:4},{x:0,y:7}].map((p,i)=>({cfg:{...dummy,id:'dummy'+i},side:1-side,...p})),
  {cfg:{...dummy,id:'ally'},side,x:6,y:7}],{seed:1024});
 sim.units.forEach(u=>u.atkCd=u.moveCd=100000);const u=sim.units[0];u.mana=u.cfg.maxMana;u.atkCd=0;sim.step();return {cfg,sim,u};
}
function until(sim,t){while(sim.tick<t&&!sim.finished){sim.step();if(sim.tick===7)sim.units[0].atkCd=100000;}}
const hits=sim=>sim.events.filter(e=>e.t==='hit'&&e.source===1);
for(const star of [1,2,3])for(const side of [0,1])for(const changes of [{},{atk:9999,physicalPower:999},{spellPower:50},{damageAmp:.5}]){
 const {cfg,sim,u}=setup(star,changes,side);until(sim,6);assert.equal(sim.events.some(e=>e.t==='nebula'),false);
 until(sim,7);const event=sim.events.find(e=>e.t==='nebula');assert.ok(event);assert.equal(event.durationTicks,60);
 assert.equal(sim.units.filter(e=>e.side!==side&&hexDist(e.pos,event.center)<=1).length,3);
 assert.deepEqual(sim.units.slice(1,4).map(e=>e.attackSpeed),[.8,.8,.8]);assert.equal(sim.units[4].attackSpeed,1);
 until(sim,16);assert.equal(hits(sim).length,0);until(sim,17);assert.equal(hits(sim).length,3);until(sim,67);
 const amount=Math.round([60,90,135][star-1]*(1+(changes.spellPower??0)/100)*(1+(changes.damageAmp??0)));
 assert.equal(hits(sim).length,18);assert.ok(hits(sim).every(e=>e.dmg===amount&&e.dmgType==='magic'));
 assert.deepEqual([...new Set(hits(sim).map(e=>e.tick))],[17,27,37,47,57,67]);
 assert.ok(sim.units.slice(1,4).every(e=>e.hp===10000-6*amount&&e.attackSpeed===1));
 assert.equal(sim.units[4].hp,10000);assert.equal(sim.units[5].hp,10000,'allies receive no damage');
 u.atkCd=100000;until(sim,80);assert.equal(hits(sim).length,18);assert.equal(sim.nebulas.length,0);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale,true);assert.equal(Number(rows[0].current),amount);assert.equal(Number(rows[1].current),amount*6);
 assert.equal(rows[0].stars,'60 / 90 / 135');assert.equal(rows[1].stars,'360 / 540 / 810');assert.equal(rows[2].current,'20%');
 const desc=buildSkillDescription(cfg,u.cfg,star,u.skillScale,true);assert.doesNotMatch(desc,/[{}]/);assert.match(desc,/attr_spell_bonus/);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);assert.equal(stats.snapshot().find(s=>s.id===u.id).damage,18*amount);
}
{
 const {sim}=setup();until(sim,7);const field=sim.nebulas[0],enemy=sim.units[1],original=enemy.pos;
 enemy.x=0;enemy.y=0;sim.step();assert.equal(enemy.attackSpeed,1,'leaving immediately clears slow');
 enemy.x=original.x;enemy.y=original.y;sim.step();assert.equal(enemy.attackSpeed,.8,'entering applies slow');
 enemy.equipment=[{attackSpeedBonus:0,attackSpeedPerAttack:0,crowdControlImmune:true}];assert.equal(enemy.attackSpeed,1,'control immunity');enemy.equipment=[];
 sim.nebulas.push({...field});sim.step();assert.equal(enemy.attackSpeed,.8,'overlap does not stack slow');
 enemy.cfg.mr=100;enemy.shield=10;until(sim,17);assert.equal(enemy.hp,9950,'two independent fields, armor and shield apply per hit');
 sim.end(-1);assert.equal(sim.nebulas.length,0);assert.equal(enemy.attackSpeed,1);
}
{
 const {sim,u}=setup();until(sim,7);u.alive=false;u.hp=0;until(sim,67);assert.equal(hits(sim).length,18,'created field persists for its authored duration after caster death');
}
{
 const {sim,u}=setup();sim.pendingStuns.push({src:sim.units[1],dst:u,seconds:1});sim.resolveStuns();until(sim,30);assert.equal(sim.events.some(e=>e.t==='nebula'),false,'interrupt before creation');
 const a=setup(),b=setup();until(a.sim,67);until(b.sim,67);assert.deepEqual(a.sim.events,b.sim.events);
 const states=resolveTraits(battle.traits,roster.map(u=>u.id),roster);assert.equal(states.find(s=>s.config.id==='astral').count,7);assert.ok(states.find(s=>s.config.id==='spellchanter').memberIds.includes('nebula_weaver'));
 for(const changes of [{nebula:{durationSeconds:3,intervalSeconds:0,attackSpeedPenalty:.2}},{radius:NaN},{starDamage:[1]},{dmgType:'physical'}])
  assert.throws(()=>new ConfigManager().setSkills({nebula_tide:{...skills.nebula_tide,...changes}}),/Invalid nebula/);
}
console.log('PASS Nebula Weaver: densest hex center, 3 seconds/six pulses, ranks/sides/scaling, live entry/exit, immunity/overlap, defense/statistics, interruption/death/end, panel and traits');
