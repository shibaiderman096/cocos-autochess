const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');require('tsx/cjs');
const {ConfigManager}=require(root+'/assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require(root+'/assets/scripts/battle/BattleSim.ts');
const {RunSession}=require(root+'/assets/scripts/core/RunSession.ts');
const {CombatStatistics}=require(root+'/assets/scripts/battle/CombatStatistics.ts');
const {buildSkillStatRows,buildSkillDescription}=require(root+'/assets/scripts/ui/SkillPresentation.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('./run-simulation.ts');
const {assertLegalSession}=require('./bots/legality.ts');
const {restoreRunInventory,readRunSave}=require(root+'/assets/scripts/core/ShopSave.ts');
const {enemyEquipmentFits}=require(root+'/assets/scripts/core/EnemyUpgrades.ts');
const {resolveEnemyRole}=require(root+'/assets/scripts/core/EnemyRoles.ts');
const input=loadRunInputs(root),cfg=new ConfigManager(),policy=loadEquipmentInputs(root).equipmentPolicy,roles=loadFormationInputs(root).enemyRoles;
cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle({...input.battle,traits:[]});cfg.setEquipment(input.equipment);
const unit=cfg.getUnit('star_card_magician'),skill=cfg.getSkill(unit.skillId);
assert.deepEqual([unit.cost,unit.role,unit.damageType,unit.classTraitId,unit.startMana,unit.maxMana],[5,'marksman','physical','swift_marksman',0,120]);
function make(star=1,ids=['helion','saiph','celine']){
 const placements=[{cfg:unit,side:0,x:3,y:6,star},...ids.map((id,i)=>({cfg:{...cfg.getUnit(id),hp:30000,atk:0},side:1,x:i*2,y:1,star:2}))];
 return new BattleSim(cfg,placements,{seed:41});
}
function release(s){const u=s.units[0];u.mana=u.cfg.maxMana;s.step();const cast=s.events.find(e=>e.t==='cast'&&e.id===u.id);assert.ok(cast);const until=s.tick+u.pendingCast.remainingTicks;
 while(s.tick<until-1){s.step();assert.equal(s.events.filter(e=>e.t==='unit_copy').length,0);}
 s.step();assert.equal(s.tick,until);return until;}
for(const star of [1,2,3]){
 const s=make(star),stats=new CombatStatistics();stats.begin(s.units);const tick=release(s),copies=s.units.filter(u=>u.temporaryCopy);
 assert.equal(copies.length,star===3?3:1);assert.equal(s.units[0].mana,0);
 for(const copy of copies){
  const event=s.events.find(e=>e.t==='unit_copy'&&e.id===copy.id),original=s.units.find(u=>u.id===event.original);
  assert.equal(copy.side,0);assert.equal(copy.star,original.star);assert.equal(copy.cfg.skillId,original.cfg.skillId);
  assert.equal(copy.equipment.length,star===3?3:1);assert.equal(new Set(copy.equipment.map(e=>e.id)).size,copy.equipment.length);
  const role=resolveEnemyRole(original.copyBase,input.skills,roles).role;
  for(const item of copy.equipment)assert.ok(enemyEquipmentFits(original.copyBase,role,policy.enemy.itemTags[item.id]),`unsuitable item ${item.id} for ${original.cfg.id}`);
  const full=cfg.equipmentStats(original.copyBase,copy.equipment.map(e=>e.id));
  assert.equal(copy.cfg.hp,Math.round(full.hp*skill.starCardCopy.healthFractions[star-1]));assert.equal(copy.hp,copy.cfg.hp);
  assert.ok(!s.events.some(e=>e.tick===tick&&e.id===copy.id&&['attack','cast','move'].includes(e.t)));
  assert.ok(!copy.copyBase.summonOnly);assert.equal(copy.cfg.atk,original.copyBase.atk);
 }
 assert.equal(new Set(s.units.filter(u=>u.alive).map(u=>`${u.x},${u.y}`)).size,s.units.length);
 stats.consume(s.events);for(const copy of copies)assert.ok(stats.snapshot().some(r=>r.id===copy.id&&r.name.endsWith('幻影')));
 const rows=buildSkillStatRows(cfg,cfg.scaleUnit(unit,star),star,1),body=buildSkillDescription(cfg,unit,star,1);
 assert.equal(rows.find(r=>r.label==='复制数量').current,star===3?'所有':'1');assert.ok(body.includes(`${[40,60,100][star-1]}%`));assert.ok(!body.includes('{'));
 // Fresh copies retain working skills, mana and attacks on subsequent ticks.
 for(const copy of copies)copy.mana=copy.cfg.maxMana;
 const ids=new Set(copies.map(u=>u.id));for(let i=0;i<80&&!s.finished;i++)s.step();
 assert.ok(s.events.some(e=>e.t==='cast'&&ids.has(e.id)),'copy casts its inherited skill');
 assert.ok(s.events.some(e=>e.t==='attack'&&ids.has(e.id)),'copy attacks');
}
console.log('PASS: 1-3 star cast windup, counts, full/starred attributes, scaled max/current HP, 1/1/3 suitable unique items, no same-tick action, inherited skills, independent statistics and panels');
for(const reason of ['stun','fear','death','end']){
 const s=make(),u=s.units[0];u.mana=u.cfg.maxMana;s.step();assert.ok(u.pendingCast);
 if(reason==='stun'||reason==='fear'){s.pendingStuns.push({src:s.units[1],dst:u,seconds:2,...(reason==='fear'?{fearOrigin:s.units[1].pos}:{})});s.resolveStuns();}
 if(reason==='death'){u.hp=0;s.resolveDamage();}
 if(reason==='end')s.end(0);
 assert.equal(u.pendingCast,null,reason);for(let i=0;i<30&&!s.finished;i++)s.step();assert.equal(s.events.filter(e=>e.t==='unit_copy').length,0,reason);
}
{
 const s=make(3);s.units[1].untargetableUntilTick=100;s.units[2].temporaryCopy=true;release(s);
 assert.equal(s.units.filter(u=>u.temporaryCopy&&u.side===0).length,1);
 assert.equal(s.events.find(e=>e.t==='unit_copy').original,s.units[3].id);
}
{
 const p=[{cfg:unit,side:0,x:0,y:0},{cfg:cfg.getUnit('helion'),side:1,x:1,y:0},{cfg:cfg.getUnit('saiph'),side:1,x:0,y:1},{cfg:cfg.getUnit('celine'),side:1,x:1,y:1}],s=new BattleSim(cfg,p,{seed:1,w:2,h:2});
 s.units.forEach(u=>{u.cfg.atk=0;u.hp=100000;});s.units[0].mana=120;for(let i=0;i<15;i++)s.step();assert.equal(s.units.length,4);assert.equal(s.events.filter(e=>e.t==='unit_copy').length,0);
}
{
 const run=()=>{const s=make(3);s.units[0].mana=120;for(let i=0;i<160&&!s.finished;i++)s.step();return JSON.stringify(s.events);};assert.equal(run(),run());
 const bad=structuredClone(input.skills);bad.star_card_show.starCardCopy.healthFractions[0]=1.01;assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid star card/);
}
console.log('PASS: stun/fear/death/end cancellation, untargetable and temporary target exclusion, full-board no overlaps, deterministic replay and invalid configuration rejection');
function session(){return new RunSession(cfg,input.run,input.waves,{runSeed:31,...loadEnemyGenerationInputs(root),...loadFormationInputs(root),...loadEquipmentInputs(root)});}
for(const fullBench of [false,true]){
 const s=session();assert.ok(s.debugJump(2,3));for(const owned of [...s.owned.all()]){s.owned.remove(owned.uid);s.pool.give(owned.unitId);}
 assert.ok(s.pool.take(unit.id));const caster=s.owned.addToBench(unit.id,s.save.benchSlots);assert.ok(s.owned.move(caster.uid,{location:'board',x:3,y:3}));
 if(fullBench)for(const base of cfg.allUnits().filter(u=>u.id!==unit.id&&!u.specialShopUnlock).slice(0,s.save.benchSlots)){assert.ok(s.pool.take(base.id));assert.ok(s.owned.addToBench(base.id,s.save.benchSlots));}
 const sim=s.startBattle();assert.ok(sim);const enemyIds=sim.units.filter(u=>u.side===1&&!u.cfg.summonOnly).map(u=>u.cfg.id);assert.ok(enemyIds.length);
 // Defeat, draw and victory all trigger, including a dead caster.
 sim.units.find(u=>u.side===0).hp=0;sim.end(fullBench?1:0);
 const before=s.owned.all().reduce((n,u)=>n+3**(u.star-1),0)+s.save.stageProgress.unitReserve.length;
 assert.ok(s.settleBattle());assert.equal(s.settleBattle(),null);
 const created=Object.entries(s.save.createdUnitCopies);assert.equal(created.length,1);assert.equal(created[0][1],1);assert.ok(enemyIds.includes(created[0][0]));
 const after=s.owned.all().reduce((n,u)=>n+3**(u.star-1),0)+s.save.stageProgress.unitReserve.length;assert.equal(after,before+1);
 assertLegalSession(s);
 const save=s.snapshot(),reloaded=new RunSession(cfg,input.run,input.waves,{save,...loadEnemyGenerationInputs(root),...loadFormationInputs(root),...loadEquipmentInputs(root)});
 assert.deepEqual(reloaded.save.createdUnitCopies,s.save.createdUnitCopies);assertLegalSession(reloaded);
 assert.equal(reloaded.owned.all().reduce((n,u)=>n+3**(u.star-1),0)+reloaded.save.stageProgress.unitReserve.length,after);
 if(fullBench){const reserveId=s.save.stageProgress.unitReserve[0];assert.ok(reserveId);const remove=s.owned.inBench()[0];s.owned.remove(remove.uid);s.pool.give(remove.unitId);s.snapshot();assert.ok(!s.save.stageProgress.unitReserve.length);assert.ok(s.owned.inBench().some(u=>u.unitId===reserveId));assertLegalSession(s);}
 if(!fullBench){
  const id=created[0][0];for(let i=0;i<2;i++){assert.ok(s.pool.createCopy(id));assert.ok(s.owned.addToBench(id,s.save.benchSlots));}
  assert.equal(s.owned.inBench().filter(u=>u.unitId===id).length,1);assert.equal(s.owned.inBench().find(u=>u.unitId===id).star,2);assertLegalSession(s);
  const mergedSave=s.snapshot(),merged=new RunSession(cfg,input.run,input.waves,{save:mergedSave,...loadEnemyGenerationInputs(root),...loadFormationInputs(root),...loadEquipmentInputs(root)});
  assert.equal(merged.owned.inBench().find(u=>u.unitId===id).star,2);assertLegalSession(merged);
  assert.ok(merged.nextWave());const sold=merged.owned.inBench().find(u=>u.unitId===id),stock=merged.pool.count(id);assert.ok(merged.sellUnit(sold.uid).ok);assert.equal(merged.pool.count(id),stock+3);assertLegalSession(merged);
 }
 const broken=structuredClone(save);broken.createdUnitCopies={[unit.id]:-1};assert.throws(()=>readRunSave(broken),/Invalid current/);
 const overflow=structuredClone(save);overflow.createdUnitCopies={[unit.id]:Number.MAX_SAFE_INTEGER};assert.throws(()=>restoreRunInventory(overflow,input.units,7,4),/Invalid generated/);
}
console.log('PASS: real RunSession passive on win/loss with dead caster, one reward only, full bench reserve/delivery, minted-card conservation and save/reload round trip, malformed mint rejection');
