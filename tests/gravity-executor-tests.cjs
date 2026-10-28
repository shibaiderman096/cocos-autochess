require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const executor=roster.find(u=>u.id==='gravity_executor');
const dummy={id:'dummy',name:'target',hp:100000,atk:0,armor:0,mr:0,atkSpeed:1,range:4,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup(star=1,changes={},side=0){
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(roster);cfg.setSkills(skills);
 const sim=new BattleSim(cfg,[{cfg:{...executor,critChance:0,...changes},star,side,x:3,y:3},
  ...[{x:4,y:3},{x:3,y:5},{x:6,y:7}].map((p,i)=>({cfg:{...dummy,id:'enemy'+i},side:1-side,...p})),
  {cfg:{...dummy,id:'bait'},side,x:4,y:4}],{seed:1024});
 sim.units.forEach(u=>u.atkCd=u.moveCd=100000);const u=sim.units[0];u.mana=u.cfg.maxMana;u.atkCd=0;sim.step();return {cfg,sim,u,enemy:sim.units[1]};
}
function until(sim,t){while(sim.tick<t&&!sim.finished){sim.step();if(sim.tick===7)sim.units[0].atkCd=100000;}}
const hits=sim=>sim.events.filter(e=>e.t==='hit'&&e.source===1);
for(const star of [1,2,3])for(const side of [0,1])for(const changes of [{},{atk:9999,physicalPower:999},{spellPower:50},{damageAmp:.5}]){
 const {cfg,sim,u}=setup(star,changes,side);until(sim,6);assert.equal(u.gravityResistanceBonus,0);until(sim,7);
 const event=sim.events.find(e=>e.t==='gravity_field');assert.equal(event.radius,2);assert.equal(event.durationTicks,80);
 const resist=[10,15,40][star-1];assert.equal(u.armor,55+2*resist);assert.equal(u.mr,55+2*resist);
 assert.deepEqual(sim.units.slice(1,4).map(e=>e.tauntSourceId),[1,1,null]);assert.equal(sim.units[4].tauntSourceId,null);
 until(sim,16);assert.equal(hits(sim).length,0);until(sim,87);
 const amount=Math.round([80,120,400][star-1]*(1+(changes.spellPower??0)/100)*(1+(changes.damageAmp??0)));
 assert.equal(hits(sim).length,16);assert.ok(hits(sim).every(e=>e.dmg===amount&&e.dmgType==='magic'));
 assert.deepEqual([...new Set(hits(sim).map(e=>e.tick))],[17,27,37,47,57,67,77,87]);
 assert.equal(u.armor,55);assert.ok(sim.units.every(e=>e.tauntSourceId===null));until(sim,90);assert.equal(sim.gravityFields.length,0);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale,true);assert.equal(Number(rows[0].current),amount);assert.equal(Number(rows[1].current),amount*8);assert.equal(Number(rows[2].current),resist);
 const description=buildSkillDescription(cfg,u.cfg,star,u.skillScale,true);assert.doesNotMatch(description,/[{}]/);assert.match(description,/attr_spell_bonus/);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);assert.equal(stats.snapshot().find(s=>s.id===u.id).damage,amount*16);
}
{
 const {sim,u,enemy}=setup();until(sim,7);enemy.priorityTarget=5;enemy.atkCd=0;sim.step();
 assert.equal(sim.events.find(e=>e.t==='attack'&&e.id===enemy.id).target,1,'taunt overrides nearer priority target');
 enemy.x=0;enemy.y=0;sim.step();assert.equal(enemy.tauntSourceId,null);assert.equal(u.gravityResistanceBonus,10);
 enemy.x=4;enemy.y=3;sim.step();assert.equal(enemy.tauntSourceId,1);assert.equal(u.gravityResistanceBonus,20);
 enemy.untargetableUntilTick=sim.tick+2;sim.step();assert.equal(enemy.tauntSourceId,null);assert.equal(u.gravityResistanceBonus,20,'every living enemy in the field counts even when untargetable');enemy.untargetableUntilTick=0;
 enemy.equipment=[{attackSpeedBonus:0,attackSpeedPerAttack:0,crowdControlImmune:true}];sim.step();assert.equal(enemy.tauntSourceId,null);assert.equal(u.gravityResistanceBonus,20,'immune enemy still contributes defenses');
 u.x=0;u.y=1;sim.step();assert.equal(u.gravityResistanceBonus,0);assert.ok(sim.units.every(e=>e.tauntSourceId===null),'field follows caster movement');
}
for(const id of ['moon_triple_arrow','rail_execution','eclipse_execution','dawn_feather_arrows']){
 const {sim,enemy}=setup();until(sim,7);enemy.cfg.skillId=id;enemy.cfg.maxMana=50;enemy.mana=50;enemy.atkCd=0;enemy.cfg.range=4;sim.step();
 const cast=sim.events.filter(e=>e.t==='cast'&&e.id===enemy.id).at(-1);assert.ok(cast,id);assert.equal(cast.target,1,id+' must select taunter');
}
{
 const {sim,u,enemy}=setup();until(sim,7);enemy.cfg.armor=100;
 const hp=u.hp;sim.damage(enemy,u,175,'physical');sim.resolveDamage();sim.pendingDamage.length=0;assert.equal(u.hp,hp-100,'temporary resistance participates in mitigation');
 u.alive=false;u.hp=0;sim.step();assert.equal(u.gravityResistanceBonus,0);assert.equal(enemy.tauntSourceId,null);assert.equal(sim.gravityFields.length,0);
}
{
 const {sim}=setup();until(sim,7);sim.end(-1);assert.equal(sim.gravityFields.length,0);assert.ok(sim.units.every(e=>e.gravityResistanceBonus===0&&e.tauntSourceId===null));
 const interrupted=setup();interrupted.sim.pendingStuns.push({src:interrupted.enemy,dst:interrupted.u,seconds:1});interrupted.sim.resolveStuns();until(interrupted.sim,25);assert.equal(interrupted.sim.events.some(e=>e.t==='gravity_field'),false);
 const a=setup(),b=setup();until(a.sim,87);until(b.sim,87);assert.deepEqual(a.sim.events,b.sim.events);
 const states=resolveTraits(battle.traits,roster.map(u=>u.id),roster);assert.equal(states.find(s=>s.config.id==='astral').active.count,7);assert.ok(states.find(s=>s.config.id==='brawler').memberIds.includes('gravity_executor'));
 for(const changes of [{gravity:{durationSeconds:4,intervalSeconds:0,resistancePerEnemy:[10,15,40]}},{radius:1},{starDamage:[1]},{dmgType:'physical'}])
  assert.throws(()=>new ConfigManager().setSkills({gravity_collapse:{...skills.gravity_collapse,...changes}}),/Invalid gravity/);
}
console.log('PASS Gravity Executor: radius 2/eight pulses, ranks/sides, dynamic dual resistance, movement/entry/exit/immunity, forced basic/skill targets, mitigation/death/end, panel/statistics and seven Astral');
{
 const {RunSession}=require('../assets/scripts/core/RunSession.ts');
 const {loadRunInputs}=require('../tools/run-simulation.ts');const input=loadRunInputs();
 const cfg=new ConfigManager();cfg.setBattle(input.battle);cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setEquipment(input.equipment);
 const s=new RunSession(cfg,input.run,input.waves,{runSeed:1024,stageCount:3,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
 s.level.level=10;s.economy.add(100000);const wave=s.waves.find(w=>w.stage===2&&w.encounterKind==='normal');assert.ok(s.debugJump(2,wave.round));
 const wanted=new Set(['xiya','nebula_weaver','gravity_executor']);
 for(let n=0;n<300&&wanted.size;n++){
  s.shop.slots.forEach((slot,i)=>{if(wanted.has(slot.unitId)){const id=slot.unitId;assert.ok(s.buyShopSlot(i).ok);assert.ok(s.owned.all().some(u=>u.unitId===id));wanted.delete(id);}});
  if(wanted.size)assert.ok(s.refreshShop().ok);
 }
 assert.equal(wanted.size,0,'all three characters enter ordinary shop rolls and can actually be bought');
 const restored=new RunSession(cfg,input.run,input.waves,{runSeed:1024,stageCount:3,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs(),save:s.snapshot()});
 assert.ok(['xiya','nebula_weaver','gravity_executor'].every(id=>restored.owned.all().some(u=>u.unitId===id)),'purchases survive save and restore');
 console.log('PASS all three new Astral characters: actual ordinary shop rolls, paid purchases and save restoration');
}
