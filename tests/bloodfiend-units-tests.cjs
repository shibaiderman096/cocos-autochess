require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs();
assert.deepEqual([input.units.find(u=>u.id==='bloodline_earl').startMana,input.units.find(u=>u.id==='bloodline_earl').maxMana],[20,50]);
function config(){const c=new ConfigManager();c.setUnits(structuredClone(input.units));c.setSkills(structuredClone(input.skills));c.setEquipment(structuredClone(input.equipment));c.setBattle({...structuredClone(input.battle),traits:input.battle.traits.filter(t=>t.id==='bloodfiend')});return c;}
const dummy={id:'target',name:'target',hp:100000,atk:0,armor:0,mr:0,atkSpeed:.1,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup(id='bloodline_earl',star=1,side=0,options={}){const cfg=config(),sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit(id),critChance:0},side,x:3,y:3,star,...options},{cfg:{...dummy,id:'ally'},side,x:0,y:0},{cfg:dummy,side:1-side,x:3,y:4},{cfg:{...dummy,id:'neighbor'},side:1-side,x:4,y:3}],{seed:77});return {cfg,sim,src:sim.units[0],ally:sim.units[1],enemy:sim.units[2],neighbor:sim.units[3]};}
function settle(sim){sim.resolveDamage();sim.resolveStuns();sim.pendingDamage.length=0;sim.pendingStuns.length=0;}
function hit(sim,src,dst,raw){sim.damage(src,dst,raw,'true');settle(sim);}
for(const distance of [2,3]){
 const {sim,src,enemy,neighbor}=setup();neighbor.alive=false;neighbor.hp=0;
 enemy.x=3;enemy.y=3+distance;src.mana=src.cfg.maxMana;src.moveCd=10000;sim.step();
 assert.equal(sim.events.some(e=>e.t==='cast'&&e.id===src.id),distance===2,'actual AI casts within two hexes only');
}
for(const side of [0,1])for(const star of [1,2,3]){
 const {cfg,sim,src,enemy,neighbor}=setup('crimson_riftclaw',star,side);const skill=cfg.getSkill(src.cfg.skillId),hp=enemy.hp;
 assert.equal(src.lifesteal,.1);assert.equal(src.cfg.range,1);
 sim.cast(src,skill,enemy);assert.equal(src.pendingCast.remainingTicks,16);
 for(let t=1;t<=15;t++){sim.tick=t;sim.updateUnit(src);settle(sim);assert.equal(enemy.hp,hp);}
 sim.tick=16;sim.updateUnit(src);settle(sim);
 assert.equal(hp-enemy.hp,[120,180,270][star-1]);assert.equal(neighbor.hp,neighbor.cfg.hp,'single locked target only');
 const knockup=sim.events.find(e=>e.t==='knockup');assert.equal(knockup.id,enemy.id);assert.equal(knockup.duration,[1,1.25,1.5][star-1]);assert.equal(src.pendingCast,null);
 const rows=buildSkillStatRows(cfg,src.cfg,star,src.skillScale,true);
 assert.equal(rows.find(r=>r.label==='击飞时间').current,`${knockup.duration}秒`);
 assert.doesNotMatch(buildSkillDescription(cfg,src.cfg,star,src.skillScale,true),/\{[^}]+\}|NaN|undefined|扇形/);
}
for(const mode of ['interrupt','deadCaster','deadTarget','untargetable','outOfRange','immune','battleEnd']){
 const {cfg,sim,src,enemy,neighbor}=setup('crimson_riftclaw');const hp=enemy.hp;sim.cast(src,cfg.getSkill(src.cfg.skillId),enemy);
 if(mode==='interrupt'){sim.pendingStuns.push({src:enemy,dst:src,seconds:1});sim.resolveStuns();}
 if(mode==='deadCaster')hit(sim,enemy,src,src.hp);
 if(mode==='deadTarget')hit(sim,src,enemy,enemy.hp);
 if(mode==='untargetable')enemy.untargetableUntilTick=100;
 if(mode==='outOfRange'){enemy.x=6;enemy.y=7;}
 if(mode==='immune')enemy.equipment.push({crowdControlImmune:true});
 if(mode==='battleEnd')sim.end(0);
 for(let t=1;t<=16;t++){sim.tick=t;if(src.alive&&!sim.finished)sim.updateUnit(src);settle(sim);}
 assert.equal(neighbor.hp,neighbor.cfg.hp,'never retargets');
 assert.equal(sim.events.filter(e=>e.t==='knockup').length,0,mode);
 if(['interrupt','deadCaster','battleEnd'].includes(mode))assert.equal(src.pendingCast,null,mode);
 if(mode==='immune')assert.equal(enemy.hp,hp-120,'immunity prevents control only');
 else if(mode!=='deadTarget')assert.equal(enemy.hp,hp,mode);
}
for(const side of [0,1])for(const star of [1,2,3]){
 const {cfg,sim,src,enemy,ally}=setup('bloodline_earl',star,side),skill=cfg.getSkill(src.cfg.skillId),gain=[2,3,5][star-1];
 assert.equal(src.cfg.range,2);assert.equal(src.lifesteal,.1);src.hp=100;
 sim.cast(src,skill,enemy);settle(sim);
 assert.equal(enemy.cfg.hp-enemy.hp,[160,240,360][star-1]);
 assert.equal(src.hp,100+[100,150,225][star-1]+[16,24,36][star-1],'active heal plus innate omnivamp');
 assert.equal(src.permanentSpellPower,0);
 hit(sim,ally,enemy,enemy.hp);assert.equal(src.permanentSpellPower,0,'assists do not grant growth');
 const target=sim.units[3];hit(sim,src,target,target.hp);
 assert.equal(src.permanentSpellPower,gain);assert.equal(src.cfg.spellPower,gain);
 settle(sim);assert.equal(src.permanentSpellPower,gain,'one reward per death');
 const rows=buildSkillStatRows(cfg,src.cfg,star,src.skillScale,true,0,src.permanentSpellPower);
 assert.equal(rows.find(r=>r.label==='击杀法术加成').stars,'2 / 3 / 5');
 assert.equal(rows.find(r=>r.label==='本局累计法术加成').current,String(gain));
 assert.doesNotMatch(buildSkillDescription(cfg,src.cfg,star,src.skillScale,true),/\{[^}]+\}|NaN|undefined/);
}
{
 const {cfg,sim,src,enemy}=setup('bloodline_earl',1,0,{permanentSpellPower:50});
 src.hp=100;enemy.hp=100;sim.cast(src,cfg.getSkill(src.cfg.skillId),enemy);settle(sim);
 assert.equal(src.hp,260,'healing uses pre-kill power, plus effective-damage vamp');
 assert.equal(src.cfg.spellPower,52);assert.equal(src.permanentSpellPowerGained,2);
}
for(const flag of ['shadowBoardSide','sunlightJudgmentSide','astralMeteorSide']){
 const {sim,src,enemy}=setup();
 sim.pendingDamage.push({src,dst:enemy,raw:enemy.hp,damageAmp:0,resistance:0,reduction:0,type:'true',critical:false,targeted:true,...(flag==='astralMeteorSide'?{}:{fixed:true}),[flag]:0});settle(sim);
 assert.equal(src.permanentSpellPower,0,'independent faction damage is not a personal kill');
}
{
 const cfg=config(),item=input.equipment.find(e=>e.spellPowerDamageAmp),effect=item.spellPowerDamageAmp;
 const initial=effect.step*3-1-(item.spellPower??0),{sim,src,enemy}=setup('bloodline_earl',1,0,{permanentSpellPower:initial,equipment:[item.id]});
 const before=src.cfg.damageAmp;hit(sim,src,enemy,enemy.hp);assert.ok(src.cfg.damageAmp>before,'growth updates equipment power thresholds');
 const next=setup('bloodline_earl',1,0,{permanentSpellPower:effect.step*2,equipment:[item.id]}).src;
 assert.equal(next.cfg.damageAmp,cfg.equipmentStats({...cfg.scaleUnit(cfg.getUnit('bloodline_earl')),spellPower:effect.step*2},[item.id]).damageAmp,'battle entry includes saved power before equipment');
}
{
 const cfg=config(),session=new RunSession(cfg,input.run,input.waves,{runSeed:83,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
 const owned=session.owned.forceAdd('bloodline_earl');owned.location='board';owned.x=3;owned.y=3;owned.permanentSpellPower=7;
 const sim=session.startBattle(),src=sim.units.find(u=>u.id===session.activeBattleIds.get(owned.uid)),enemy=sim.units.find(u=>u.side===1);
 assert.equal(src.cfg.spellPower,7);hit(sim,src,enemy,enemy.hp);hit(sim,enemy,src,src.hp);sim.end(1);
 assert.ok(session.settleBattle());assert.equal(owned.permanentSpellPower,9,'growth survives defeat and death');
 assert.equal(session.settleBattle(),null);assert.equal(owned.permanentSpellPower,9,'settlement is idempotent');
 const restored=new RunSession(cfg,input.run,input.waves,{save:session.snapshot(),...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
 assert.equal(restored.owned.get(owned.uid).permanentSpellPower,9);
 assert.equal(restored.createPreview().sim.units.find(u=>u.side===0&&u.cfg.id===owned.unitId).cfg.spellPower,9,'next round preview restores growth');
 const merged=new OwnedUnits([1,2,3].map((uid,i)=>({uid,unitId:owned.unitId,star:1,location:'bench',x:-1,y:i,permanentSpellPower:i+2})));
 merged.mergeAll();assert.equal(merged.all()[0].permanentSpellPower,9);assert.equal(merged.all()[0].star,2);
}
assert.deepEqual(setup().sim.run(),setup().sim.run());
console.log('PASS bloodfiend units: both sides/three stars, single locked knockup/charge interruption, damage/healing, 2/3/5 personal-kill power, range 2, equipment thresholds, save/defeat/next-round/merge and determinism');
