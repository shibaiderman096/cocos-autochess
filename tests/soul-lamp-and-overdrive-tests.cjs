require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const {loadRunInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs();
function config(traits=[]){const c=new ConfigManager();c.setUnits(structuredClone(input.units));c.setSkills(structuredClone(input.skills));c.setEquipment(structuredClone(input.equipment));c.setBattle({...structuredClone(input.battle),traits});return c;}
const dummy={id:'target',name:'target',hp:100000,atk:0,armor:0,mr:0,atkSpeed:.1,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup(star=1,equipment=[]){const cfg=config(),sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit('nightmare_lamplighter'),critChance:0},side:0,x:3,y:3,star,equipment},{cfg:{...dummy,id:'ally'},side:0,x:0,y:0},{cfg:dummy,side:1,x:3,y:4},{cfg:{...dummy,id:'outside'},side:1,x:6,y:7}],{seed:77});return {cfg,sim,src:sim.units[0],ally:sim.units[1],enemy:sim.units[2]};}
function settle(sim){sim.resolveDamage();sim.resolveStuns();sim.pendingDamage.length=0;sim.pendingStuns.length=0;}
function hit(sim,source,target,raw){sim.damage(source,target,raw,'true');settle(sim);}
for(const star of [1,2,3]){
 const {cfg,sim,src,ally,enemy}=setup(star);const amount=[10,18,30][star-1],hp=src.cfg.hp;
 hit(sim,src,enemy,1);sim.tick=100;hit(sim,ally,enemy,enemy.hp);
 assert.equal(src.permanentHealthGained,amount,'a live contributor within exactly 5 seconds gains growth');assert.equal(src.cfg.hp,hp+amount);assert.equal(src.hp,hp+amount);
 settle(sim);assert.equal(src.permanentHealthGained,amount,'death cannot grant twice');
 assert.equal(src.soulLampHealth,amount);
 const rows=buildSkillStatRows(cfg,src.cfg,star,src.skillScale,true,src.soulLampHealth);
 assert.equal(rows.find(r=>r.label==='被动累计生命').current,String(amount));
 assert.match(rows[0].currentRich,/attr_spell_bonus.*＋.*stat_hp/);
 assert.equal(rows[1].stars,'1% / 1.5% / 2%');
 assert.equal(rows.find(r=>r.label==='参与击杀永久生命').current,String(amount));
 assert.doesNotMatch(buildSkillDescription(cfg,src.cfg,star,src.skillScale,true),/\{[^}]+\}|NaN|undefined|护盾|降低/);
}
for(const mode of ['expired','shieldOnly','dead','noContribution']){
 const {sim,src,ally,enemy}=setup();
 if(mode==='shieldOnly')enemy.shield=100;
 if(mode!=='noContribution')hit(sim,src,enemy,1);
 if(mode==='expired')sim.tick=101;
 if(mode==='dead'){src.hp=0;src.alive=false;}
 hit(sim,ally,enemy,enemy.hp+enemy.shield);
 assert.equal(src.permanentHealthGained,0,mode+' is ineligible');
}
{
 const {sim,src,enemy}=setup(2,['forest_sanctuary','stonegrowth_bulwark']);const hp=src.cfg.hp,armor=src.cfg.armor;
 hit(sim,src,enemy,enemy.hp);assert.equal(src.permanentHealthGained,18);
 assert.equal(src.cfg.hp-hp,Math.round(18*1.2),'health growth receives equipment HP multiplier');
 assert.equal(src.cfg.armor-armor,Math.floor(src.cfg.hp/100)-Math.floor(hp/100),'health resistance tracks new maximum');
 const other=sim.units.find(u=>u.side===1&&u.alive);hit(sim,src,other,other.hp);
 assert.equal(src.cfg.hp-hp,Math.round(36*1.2),'multiple takedowns round the accumulated growth once');
}
{
 const {cfg,sim,src,enemy}=setup();const skill=cfg.getSkill(src.cfg.skillId);
 sim.shadowSkills.activate(src,skill,src.id);
 for(let tick=1;tick<=81;tick++){sim.tick=tick;sim.shadowSkills.update();settle(sim);}
 const hits=sim.events.filter(e=>e.t==='hit'&&e.source===src.id);assert.deepEqual(hits.map(e=>e.tick),[20,40,60,80]);assert.ok(hits.every(e=>e.id===enemy.id));assert.equal(src.shield,0);
 const second=setup();second.sim.shadowSkills.activate(second.src,second.cfg.getSkill(second.src.cfg.skillId));
 second.src.hp=0;second.src.alive=false;second.sim.tick=20;second.sim.shadowSkills.update();settle(second.sim);
 assert.equal(second.sim.events.filter(e=>e.t==='hit').length,0,'dead bearer stops the lamp');
}
{
 const c=config(),item=c.getEquipment(['spell_overdrive_armor'])[0];assert.equal(item.spellPower,20);assert.equal(item.manaPerSecond,1);
 const {sim,src}=setup(1,['spell_overdrive_armor','spell_overdrive_armor']);const base=src.attackSpeed;
 assert.equal(src.cfg.spellPower,40);assert.equal(src.manaPerSecond,2);
 const cast=()=>sim.emitCast({t:'cast',tick:sim.tick,id:src.id,target:src.id,skillId:src.cfg.skillId,duration:0});
 cast();assert.equal(src.attackSpeed,base+3);
 sim.tick=59;src.combatTick=59;assert.equal(src.attackSpeed,base+3);
 cast();sim.tick=60;src.combatTick=60;assert.equal(src.attackSpeed,base+3,'recast refreshes without adding stacks');
 sim.tick=119;src.combatTick=119;assert.equal(src.attackSpeed,base,'expires at refreshed 3-second boundary');
 src.cfg.atkSpeed=4;cast();assert.equal(src.attackSpeed,5,'500% cap');src.alive=false;assert.equal(src.equipmentAttackSpeedBonus,0);
 assert.equal(setup(1,['spell_overdrive_armor']).src.equipmentCastSpeedUntil.size,0,'new battle starts unbuffed');
 assert.throws(()=>c.setEquipment([{...item,castAttackSpeed:{bonus:1.5,seconds:0}}]),/cast attack speed/);
}
{
 const cfg=config(),s=new RunSession(cfg,input.run,input.waves,{runSeed:83,enemyGenerationMode:'legacy'});
 const lamp=s.owned.forceAdd('nightmare_lamplighter');lamp.location='board';lamp.x=3;lamp.y=3;
 const sim=s.startBattle();assert.ok(sim);const src=sim.units.find(u=>u.id===s.activeBattleIds.get(lamp.uid)),enemy=sim.units.find(u=>u.side===1);
 hit(sim,src,enemy,enemy.hp);sim.end(0);assert.ok(s.settleBattle());assert.equal(lamp.permanentMaxHp,10);assert.equal(lamp.soulLampHealth,10);assert.equal(s.settleBattle(),null);assert.equal(lamp.permanentMaxHp,10);
 const restored=new RunSession(cfg,input.run,input.waves,{save:s.snapshot(),enemyGenerationMode:'legacy'});assert.equal(restored.owned.get(lamp.uid).permanentMaxHp,10);assert.equal(restored.owned.get(lamp.uid).soulLampHealth,10);
 assert.equal(restored.createPreview().sim.units.find(u=>u.side===0&&u.cfg.id===lamp.unitId).soulLampHealth,10);
 const merged=new OwnedUnits([1,2,3].map((uid,i)=>({uid,unitId:lamp.unitId,star:1,location:'bench',x:-1,y:i,permanentMaxHp:(i+1)*10+50,soulLampHealth:(i+1)*10})));
 merged.mergeAll();assert.equal(merged.all()[0].permanentMaxHp,210);assert.equal(merged.all()[0].soulLampHealth,60,'survivor growth is excluded from passive record');assert.equal(merged.all()[0].star,2);
}
{
 const cfg=config(input.battle.traits),saiph=cfg.getUnit('saiph'),states=resolveTraits(input.battle.traits,[saiph],cfg.allUnits());
 assert.equal(saiph.damageType,'physical');assert.equal(cfg.getSkill(saiph.skillId).dmgType,'physical');
 assert.equal(states.find(t=>t.config.id==='swift_marksman').count,1);assert.equal(states.find(t=>t.config.id==='sharpshooter').count,0);assert.equal(states.find(t=>t.config.id==='sunlight').count,1);
 const s=new RunSession(cfg,input.run,input.waves,{runSeed:42,enemyGenerationMode:'legacy',equipmentPolicy:loadEquipmentInputs().equipmentPolicy});
 for(const stage of [2,4,8]){const wave=s.waves.find(w=>w.stage===stage&&w.encounterKind==='specialShop');assert.ok(s.debugJump(stage,wave.round));
  const pending=s.pendingStageReward;assert.equal(pending.offers.length,5);assert.ok(pending.offers.every(o=>o.kind==='equipment'||cfg.getUnit(o.id).specialShopUnlock),'special shop never offers ordinary units');
  s.claimStageReward({type:'stageChoice',rewardId:pending.id,choice:'continue'});
 }
}
console.log('PASS soul lamp: star growth, exact assist window, shield/death exclusion, four moving-area ticks, health scaling/resistance, persistence and merge; overdrive duration/recast/stack/cap/reset; Saiph trait-only override and special-only unit offers');
