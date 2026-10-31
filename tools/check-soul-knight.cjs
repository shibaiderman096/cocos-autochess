const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.env.COCOS_PROJECT||path.resolve(__dirname,'..');
require('node:module').createRequire(root+'/package.json')('tsx/cjs');
const {ConfigManager}=require(root+'/assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require(root+'/assets/scripts/battle/BattleSim.ts');
const {Unit}=require(root+'/assets/scripts/battle/Unit.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require(root+'/tools/run-simulation.ts');
const {RunSession}=require(root+'/assets/scripts/core/RunSession.ts');
const {buildSkillStatRows,buildSkillDescription}=require(root+'/assets/scripts/ui/SkillPresentation.ts');
const inputs=loadRunInputs(root),cfg=new ConfigManager();
cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle({...inputs.battle,traits:[]});cfg.setEquipment(inputs.equipment);
const base=cfg.getUnit('blueflame_soul_knight'),skill=cfg.getSkill(base.skillId),spec=skill.soulRealm;
assert.equal(base.specialShopUnlock,true);assert.equal(base.cost,7);assert.equal(base.damageType,'magic');assert.equal(base.classTraitId,'spellblade');
const dummy={...base,id:'soul_dummy',skillId:undefined,classTraitId:undefined,specialShopUnlock:undefined,hp:100000,atk:0,critChance:0,armor:0,mr:0,maxMana:0,physicalPower:12,spellPower:15};
const place=(c,side,x,y,star=1)=>({cfg:c,side,x,y,star});
const make=(star=1)=>new BattleSim(cfg,[place(base,0,3,4,star),place(dummy,1,3,3),place(dummy,1,0,0),place(dummy,0,0,7)],{seed:19});
for(const star of [1,2,3]){
 const s=make(star),u=s.units[0];assert.equal(u.mana,0);assert.equal(u.cfg.maxMana,150);assert.equal(u.manaPerSecond,0);
 u.gainMana(1000);assert.equal(u.mana,0);
 s.damage(s.units[1],u,50,'true');s.resolveDamage();assert.equal(u.mana,0,'damage taken mana blocked');
 const dead=s.units[3];dead.hp=0;s.resolveDamage();assert.equal(u.mana,15);assert.equal(u.cfg.spellPower,spec.spellPowerPerDeath[star-1]);
 s.resolveDamage();assert.equal(u.mana,15,'no duplicate death');
 s.events.length=0;u.atkCd=0;s.start();
 s.tick=u.basicAttackReadyTick-1;s.updateUnit(u);assert.ok(!s.events.some(e=>e.t==='attack'&&e.id===u.id),'full opening cycle');
 s.tick++;s.updateUnit(u);s.resolveDamage();
 assert.ok(s.events.some(e=>e.t==='attack'&&e.id===u.id));
 assert.ok(s.events.some(e=>e.t==='hit'&&e.source===u.id&&e.dmgType==='magic'));
 const rows=buildSkillStatRows(cfg,u.cfg,star,1);assert.equal(rows.length,6);assert.ok(!/\{/.test(buildSkillDescription(cfg,u.cfg,star,1)));
}
console.log('PASS: 1-3 star growth, magic basic damage, death-only mana, nonduplicated death, live skill rows');
{
 const placements=[place(base,0,3,4)];
 for(let i=0;i<12;i++)placements.push(place({...dummy,id:'victim_'+i,summonOnly:i===0},i%2, i%7,Math.floor(i/7)));
 const s=new BattleSim(cfg,placements,{seed:12}),u=s.units[0];
 for(const v of s.units.slice(1,11))v.hp=0;s.resolveDamage();
 assert.equal(u.mana,150);assert.equal(u.cfg.spellPower,80);assert.equal(s.events.filter(e=>e.t==='soul_gain').length,10);
 u.atkCd=0;s.updateUnit(u);s.resolveStuns();assert.equal(u.cfg.maxMana,30);assert.equal(u.mana,0);assert.equal(s.events.filter(e=>e.t==='soul_realm').length,1);
 for(const e of s.units.filter(v=>v.alive&&v.side===1)){assert.equal(e.soulMoveSlow,.25);assert.equal(e.attackSpeed,.5);assert.equal(e.fearUntilTick,37);}
 assert.equal(s.units.at(-2).soulMoveSlow,0,'ally unaffected');
 const added=new Unit(100,1,{...dummy},5,3);added.cfg.controlImmune=true;s.units.push(added);s.soulRealm.refresh();assert.equal(added.soulMoveSlow,.25);assert.equal(added.attackSpeed,.75,'control immunity');
 u.hp=0;s.resolveDamage();assert.equal(u.mana,0);assert.equal(s.events.filter(e=>e.t==='soul_gain'&&e.id===u.id).length,10,'dead caster gains nothing');
 s.soulRealm.refresh();assert.equal(added.soulMoveSlow,.25,'domain survives caster death');
 u.reviveAt({x:3,y:4},1);u.gainMana(1000);assert.equal(u.mana,0);assert.equal(u.cfg.maxMana,30,'revive keeps opened realm');
 s.end(-1);assert.equal(added.soulMoveSlow,0);assert.equal(u.cfg.maxMana,150);assert.equal(u.cfg.spellPower,0,'battle-end growth cleanup');
}
console.log('PASS: ten allied/enemy/summon deaths, 150->30 once, AP fear, field persistence, late units, immunity, revive/end cleanup');
for(const star of [1,2,3]){
 const s=make(star),u=s.units[0],enemies=s.units.filter(v=>v.side===1),ally=s.units[3];
 s.soulRealm.cast(u,skill);s.resolveStuns();u.hp=1;u.cfg.hp=1000000;u.cfg.spellPower=100;
 const hp=u.hp,original=enemies.map(v=>({...v.cfg}));
 s.soulRealm.cast(u,skill);
 assert.equal(u.hp-hp,Math.round(spec.healPerEnemy[star-1]*2)*enemies.length);
 assert.equal(ally.cfg.physicalPower,12);assert.equal(ally.cfg.spellPower,15);
 for(let i=0;i<enemies.length;i++){
  assert.equal(enemies[i].cfg.physicalPower,Math.max(0,original[i].physicalPower-spec.stealPower[star-1]));
  assert.equal(enemies[i].cfg.spellPower,Math.max(0,original[i].spellPower-spec.stealPower[star-1]));
 }
 assert.equal(u.cfg.physicalPower,enemies.length*Math.min(12,spec.stealPower[star-1]));
 assert.equal(u.cfg.spellPower,100+enemies.length*Math.min(15,spec.stealPower[star-1]));
 assert.equal(u.cfg.maxMana,30);assert.equal(enemies[0].soulMoveSlow,.25);
 const mana=u.mana;u.gainMana(100);assert.equal(u.mana,mana);
 for(let i=0;i<6;i++)s.soulRealm.cast(u,skill);
 assert.ok(enemies.every(v=>v.cfg.physicalPower===0&&v.cfg.spellPower===0));
 s.end(-1);assert.equal(u.cfg.physicalPower,0);assert.equal(u.cfg.spellPower,100);assert.ok(enemies.every(v=>v.cfg.physicalPower===12&&v.cfg.spellPower===15));
}
console.log('PASS: all-enemy drain, AP healing snapshot, conservative dual-power theft, zero floors, ally exclusion, 1-3 star cleanup');
{
 const s=make(),u=s.units[0];s.soulRealm.cast(u,skill);u.cfg.spellPower=1000;s.soulRealm.cast(u,skill);
 const other=new Unit(100,0,{...base},5,5);other.deathManaOnly=true;s.units.push(other);s.soulRealm.cast(other,skill);
 assert.equal(s.units[1].soulMoveSlow,.25);assert.equal(s.units[1].attackSpeed,.5,'overlapping domains do not stack');
 s.units[1].x=0;s.units[1].y=0;s.units[1].moveCd=0;s.units[1].fearUntilTick=0;s.units[1].soulFearUntilTick=0;s.updateUnit(s.units[1]);
 const move=s.events.findLast(e=>e.t==='move'&&e.id===s.units[1].id);assert.ok(move);assert.equal(move.durationTicks,Math.round(Math.round(1000/50/inputs.battle.movementCellsPerSecond)/.75));
 u.hp=0;s.units[3].hp=0;s.resolveDamage();assert.equal(u.mana,0,'simultaneously lethal caster excluded');
}
console.log('PASS: fixed AP-independent slow, nonstacking domains, slower natural moves, simultaneous lethal exclusion');
{
 const s=make(),u=s.units[0],target=s.units[1],{dist}=require(root+'/assets/scripts/battle/Pathfinding.ts');
 s.soulRealm.cast(u,skill);s.resolveStuns();assert.ok(target.soulFearUntilTick>0);
 const before=dist(target.pos,u.pos),count=s.events.length;target.atkCd=0;target.moveCd=0;s.updateUnit(target);
 assert.ok(dist(target.pos,u.pos)>before,'fear moves away on legal cells');assert.ok(!s.events.slice(count).some(e=>e.t==='attack'||e.t==='cast'),'fear disarms');
 target.reviveAt(target.pos,1);assert.equal(target.soulFearUntilTick,0);
 const immune=s.units[2];immune.cfg.controlImmune=true;immune.soulFearUntilTick=0;immune.fearUntilTick=0;s.soulRealm.clear();s.soulRealm.cast(u,skill);s.resolveStuns();assert.equal(immune.soulFearUntilTick,0);
}
console.log('PASS: actual realm fear prevents attacks/casts, flees, clears on revive and respects immunity');
{
 const run=()=>{const s=make();for(let i=0;i<600&&!s.finished;i++)s.step();return JSON.stringify(s.events);};assert.equal(run(),run());
 const opts={runSeed:77,...loadEnemyGenerationInputs(root),...loadFormationInputs(root),...loadEquipmentInputs(root)};
 const runSession=new RunSession(cfg,inputs.run,inputs.waves,opts);
 if(runSession.pendingOpeningEncounter)assert.ok(runSession.chooseOpeningEncounter(runSession.openingEncounterOptions[0].id??runSession.openingEncounterOptions[0]).ok);
 const owned=runSession.owned.addToBench(base.id,runSession.save.benchSlots);assert.ok(owned);
 const snap=runSession.snapshot(),loaded=new RunSession(cfg,inputs.run,inputs.waves,{...opts,save:snap});assert.equal(loaded.owned.get(owned.uid).unitId,base.id);
 assert.equal(runSession.pool.canDraw(base.id),false,'locked out of ordinary shop initially');
 const merchant=runSession.stageProgression,wave={...runSession.flow.wave,encounterKind:'specialShop',stage:8};let offer;
 for(let i=0;i<200&&!offer;i++){const rolled=merchant.rollShop(wave,i);if(rolled.offers.some(o=>o.id===base.id))offer=rolled;}
 assert.ok(offer,'new knight appears in travel-shop catalogue');const index=offer.offers.findIndex(o=>o.id===base.id);assert.equal(offer.offers[index].price,7);
 merchant.state.pending=offer;runSession.economy.add(100);const before=runSession.economy.gold,count=runSession.owned.all().length;
 assert.ok(merchant.act({rewardId:offer.id,choice:'buy',index},wave).ok);assert.equal(runSession.economy.gold,before-7);assert.equal(runSession.owned.all().length,count+1);assert.ok(runSession.pool.canDraw(base.id));
 assert.equal(merchant.act({rewardId:offer.id,choice:'buy',index},wave).ok,false,'duplicate purchase rejected');delete merchant.state.pending;
 const unlocked=new RunSession(cfg,inputs.run,inputs.waves,{...opts,save:runSession.snapshot()});assert.ok(unlocked.pool.canDraw(base.id),'merchant unlock persists');
 const bad=JSON.parse(JSON.stringify(inputs.skills));bad.soul_realm.soulRealm.moveSlow=1;assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid soul realm/);
 assert.equal(base.spellPower,0);assert.equal(base.maxMana,150);assert.throws(()=>cfg.getUnit(dummy.id),/not found/);
}
console.log('PASS: deterministic fixed-tick combat, 7-gold travel-shop roll/purchase/unlock/save, duplicate guard, owned/save round-trip, invalid config rejection, source-config isolation');
{
 const run=()=>{
  const p=[place(base,0,3,4)];for(let i=0;i<18;i++)p.push(place({...dummy,id:'weak_'+i,hp:1,atk:0,physicalPower:20,spellPower:20},1,i%7,Math.floor(i/7)));
  const s=new BattleSim(cfg,p,{seed:22});for(let i=0;i<1800&&!s.finished;i++)s.step();
  assert.equal(s.events.filter(e=>e.t==='soul_realm').length,1);assert.ok(s.events.some(e=>e.t==='soul_drain'));assert.ok(s.events.some(e=>e.t==='soul_gain'));
  return JSON.stringify(s.events);
 };assert.equal(run(),run());
}
console.log('PASS: unforced full battle naturally opens realm after ten kills and drains after two more, deterministic replay');
