require('tsx/cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const {applyHealing}=require('../assets/scripts/battle/Healing.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),clone=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function config(){const c=new ConfigManager();c.setUnits(inputs.units);c.setSkills(inputs.skills);c.setEquipment(inputs.equipment);c.setBattle({...inputs.battle,traits:[]});return c;}
const cfg=config(),fox=cfg.getUnit('startrail_fox'),guide=cfg.getUnit('starlamp_guide');
const dummy={...fox,id:'dummy',name:'dummy',hp:100000,atk:0,armor:0,mr:0,role:'marksman',maxMana:0,skillId:undefined,critChance:0};
function sim(placements){const s=new BattleSim(config(),placements,{seed:71});for(const u of s.units){u.atkCd=10000;u.moveCd=10000;u.cfg.critChance=0;}return s;}
function cast(s,u){u.mana=60;u.atkCd=0;s.step();return s.events.filter(e=>e.t==='inspiration'&&e.id===u.id).at(-1);}
const place=(cfg,side,x,y,star=1)=>({cfg,side,x,y,star});
assert.deepEqual([fox.cost,fox.role,fox.damageType,fox.range,fox.startMana,fox.maxMana],[1,'caster','magic',1,0,60]);
assert.deepEqual([guide.cost,guide.role,guide.damageType,guide.range,guide.startMana,guide.maxMana],[2,'tank','physical',1,0,0]);
const members=resolveTraits(inputs.battle.traits,[fox.id,guide.id],inputs.units).find(t=>t.config.id==='explorer').memberIds;
assert.ok(members.includes(fox.id)&&members.includes(guide.id));
for(const side of [0,1])for(const star of [1,2,3])for(const sp of [0,100]){
 const center={x:3,y:3},neighbors=hexNeighbors(3,3);
 const s=sim([place(fox,side,3,3,star),...neighbors.map(p=>place(dummy,side,p.x,p.y)),place(dummy,side,0,0),place(dummy,1-side,6,7)]);
 const u=s.units[0];u.cfg.spellPower=sp;const e=cast(s,u),bonus=[.35,.5,.75][star-1]*(1+sp/100);
 assert.equal(e.durationTicks,80);near(e.bonus,bonus);assert.deepEqual(e.targets,s.units.slice(0,7).map(u=>u.id));assert.equal(u.mana,0);
 for(const ally of s.units.slice(0,7))near(ally.inspirationAttackSpeedBonus,bonus);
 near(s.units[7].inspirationAttackSpeedBonus,0);near(s.units[8].inspirationAttackSpeedBonus,0);
 for(const ally of s.units)ally.atkCd=10000;
 s.units[1].x=0;s.units[1].y=7; // The applied buff survives leaving its original hex radius.
 while(s.tick<e.tick+40)s.step();near(s.units[1].inspirationAttackSpeedBonus,bonus/2);
 while(s.tick<e.tick+80)s.step();assert.equal(s.units[1].inspirations.size,0);near(s.units[1].inspirationAttackSpeedBonus,0);
}
const stacked=sim([place(fox,0,2,2),place(fox,0,3,2),place(dummy,0,2,3),place(dummy,1,6,7)]),[f1,f2,ally]=stacked.units;
cast(stacked,f1);const second=cast(stacked,f2);near(ally.inspirationAttackSpeedBonus,.35*79/80+.35);assert.equal(ally.inspirations.size,2);
const refresh=cast(stacked,f1);assert.equal(ally.inspirations.size,2);near(ally.inspirationAttackSpeedBonus,.35+.35*79/80);
// Death removes effects from the recipient, not gifts already granted by a fallen caster.
stacked.damage(stacked.units[3],f1,100000,'true');stacked.resolveDamage();stacked.step();
assert.equal(f1.inspirations.size,0);assert.equal(ally.inspirations.size,2);
ally.cfg.atkSpeed=5;near(ally.attackSpeed,5);stacked.end(1);assert.ok(stacked.units.every(u=>u.inspirations.size===0));
console.log('PASS inspiration: both sides and every star/AP rank, six hex neighbors and self, exclusion, snapshot radius, linear decay/expiry, independent refresh/stack, caster/recipient death, cap and cleanup');
for(const star of [1,2,3])for(const sp of [0,100])for(const fraction of [1,.5,.1]){
 const s=sim([place(guide,0,2,2,star),place(dummy,1,3,2)]),[u,enemy]=s.units;
 u.cfg.spellPower=sp;u.hp=u.cfg.hp*fraction;
 const armor=u.cfg.armor+[80,120,180][star-1]*(1+sp/100)*(1-fraction);
 near(u.armor,armor);near(u.attackSpeed,u.cfg.atkSpeed-.3*(1-fraction));near(u.physicalPower,armor*[.5,.75,1][star-1]);
 // Exercise the real physical damage queue in both directions.
 const before=u.hp;s.damage(enemy,u,100,'physical');s.resolveDamage();near(before-u.hp,Math.round(10000/(100+armor)));
 s.pendingDamage.length=0;u.hp=u.cfg.hp*fraction;
 const power=u.physicalPower,beforeEnemy=enemy.hp;s.damage(u,enemy,100,'physical');s.resolveDamage();near(beforeEnemy-enemy.hp,Math.round(100*(1+power/100)));
 applyHealing(u,u,u.cfg.hp,s.tick,s.events);near(u.armor,u.cfg.armor);near(u.attackSpeed,u.cfg.atkSpeed);near(u.physicalPower,u.cfg.armor*[.5,.75,1][star-1]);
 u.atkCd=0;s.step();assert.ok(!s.events.some(e=>e.t==='cast'&&e.id===u.id));assert.equal(u.mana,0);
}
const guarded=sim([place(guide,0,2,2),place(dummy,1,3,2)]),[g,enemy]=guarded.units;
g.cfg.armor+=40;g.cfg.physicalPower=20;g.cfg.spellPower=100;g.hp=g.cfg.hp/2;g.skillArmorBonus=30;
g.shadowCorruption={resistanceReduction:.25};g.equipment.push({crowdControlImmune:true,attackSpeedBonus:0,attackSpeedPerAttack:0});
near(g.armor,(45+40+80+30)*.75);near(g.physicalPower,20+g.armor*.5);near(g.attackSpeed,.45);
guarded.pendingDamage.length=0;const before=g.hp;guarded.damage(enemy,g,100,'physical');guarded.resolveDamage();near(before-g.hp,Math.round(10000/(100+(45+40+80+30)*.75)));
console.log('PASS lantern guard: all stars, AP, health ratios, real damage mitigation/output, healing reversal, zero-mana passive, gear/temporary armor, resistance reduction and innate slowdown under control immunity');
const {load}=require('./helpers/ui-harness.cjs'),{buildUnitDetailData}=load(path.resolve('assets/scripts/ui/UnitDetailPresentation.ts'));
cfg.setBattle(inputs.battle);
for(const star of [1,2,3]){
 const f=buildUnitDetailData(cfg,{...cfg.scaleUnit(fox,star),spellPower:100},star);
 assert.equal(f.skillName,'星罗鼓舞');assert.equal(f.skillStats[0].current,`+${[70,100,150][star-1]}%`);assert.match(f.skillDescription,/4.*秒/);assert.equal(f.maxMana,60);
 const base=cfg.scaleUnit(guide,star),half=buildUnitDetailData(cfg,base,star,{hp:base.hp/2});
 assert.equal(half.skillName,'孤灯坚守');assert.equal(half.maxMana,0);near(half.armor,base.armor+[80,120,180][star-1]/2);near(half.physicalPower,half.armor*[.5,.75,1][star-1]);
 const live=buildUnitDetailData(cfg,{...base,armor:123,physicalPower:90,atkSpeed:.4},star,{hp:base.hp/2,runtimeStats:true});
 assert.deepEqual([live.armor,live.physicalPower,live.atkSpeed],[123,90,.4],'live stats must not apply the passive twice');
 assert.ok(half.traits.includes('探险家'));assert.ok(!half.skillStats.some(r=>/伤害/.test(r.label)));
}
for(const [id,key,bad]of [['startrail_inspiration','inspiration',{attackSpeedBonuses:[.35],durationSeconds:4}],['lone_lantern_guard','lanternGuard',{maxAttackSpeedPenalty:NaN,maxArmorBonuses:[80,120,180],physicalPowerPerArmor:[.5,.75,1]}]]){
 const skills=clone(inputs.skills);skills[id][key]=bad;assert.throws(()=>new ConfigManager().setSkills(skills));
}
console.log('PASS explorer presentation/config: exact role/range/mana/trait membership, icon stats, AP-scaled skill ranks, passive preview and live inspector without double counting, invalid config rejection');
const hunt=cfg.getUnit('windlance_huntress'),{RunSession}=require('../assets/scripts/core/RunSession.ts'),{OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts'),{readRunSave}=require('../assets/scripts/core/ShopSave.ts');
assert.deepEqual([hunt.cost,hunt.range,hunt.startMana,hunt.maxMana,hunt.classTraitId],[3,4,0,60,'swift_marksman']);
function huntBattle(star=1,side=0){return sim([place(hunt,side,2,2,star),place(dummy,1-side,3,2),place(dummy,side,4,2),place(dummy,1-side,5,2),place(dummy,1-side,6,2)]);}
function beginHunt(s,u){u.mana=60;u.atkCd=0;s.step();assert.ok(u.pendingCast);assert.equal(u.windHuntActive,false);const start=s.tick;
 for(let n=0;n<7;n++){s.step();assert.equal(u.windHuntActive,false);assert.ok(u.pendingCast);}
 s.step();assert.equal(s.tick-start,8);assert.equal(u.pendingCast,null);assert.equal(u.windHuntActive,true);return s.tick;}
function hit(s,a,b,n=1000000){s.pendingDamage.length=0;s.damage(a,b,n,'true');s.resolveDamage();}
for(const side of [0,1])for(const star of [1,2,3]){
 const s=huntBattle(star,side),[u,enemy,ally,other,last]=s.units,begin=beginHunt(s,u),gain=[1,2,3][star-1];
 near(u.attackSpeed,u.cfg.atkSpeed+[.6,.9,1.35][star-1]);assert.equal(u.windHuntUntilTick-begin,120);
 assert.equal(s.events.filter(e=>e.t==='attack'&&e.id===u.id).length,0,'windup suppresses ordinary attacks');
 u.manaPerSecond=200;u.gainMana(100);assert.equal(u.mana,0);u.atkCd=0;s.step();assert.ok(s.events.some(e=>e.t==='attack'&&e.id===u.id));assert.equal(u.mana,0,'ordinary attack and regen mana stay locked');
 hit(s,ally,enemy);assert.equal(u.permanentPhysicalPower,0,'ally kills do not grant personal growth');
 hit(s,u,other);assert.equal(u.permanentPhysicalPower,gain);assert.equal(u.cfg.physicalPower,gain);
 hit(s,u,other);assert.equal(u.permanentPhysicalPower,gain,'zero-HP repeated hits cannot award growth twice');
 u.atkCd=10000;while(s.tick<u.windHuntUntilTick)s.step();assert.equal(u.windHuntActive,false);near(u.attackSpeed,u.cfg.atkSpeed);
 u.gainMana(10);assert.ok(u.mana>=10,'mana resumes at expiry');hit(s,u,last);assert.equal(u.permanentPhysicalPower,gain,'kills outside the interval do not grant growth');
 const detail=buildUnitDetailData(cfg,u.cfg,star,{passivePhysicalPower:u.permanentPhysicalPower});
 assert.equal(detail.skillName,'逐风猎势');assert.equal(detail.skillStats.find(r=>r.label==='击杀物理成长').current,`${gain}%`);
 assert.equal(detail.skillStats.find(r=>r.label==='累计物理成长').current,`${gain}%`);assert.match(detail.skillDescription,/0.4.*秒/);
 assert.doesNotMatch(detail.skillDescription,/\{[^}]+\}|NaN|undefined/);s.end(0);assert.equal(u.windHuntUntilTick,0);
}
for(const mode of ['stun','fear','death','end']){
 const s=huntBattle(),[u,enemy]=s.units;u.mana=60;u.atkCd=0;s.step();
 if(mode==='death')hit(s,enemy,u);
 else if(mode==='end')s.end(1);
 else{s.pendingStuns.push({src:enemy,dst:u,seconds:1,...(mode==='fear'?{fearOrigin:enemy.pos}:{})});s.resolveStuns();}
 for(let n=0;n<10;n++)s.step();assert.equal(u.pendingCast,null);assert.equal(u.windHuntUntilTick,0);assert.ok(!s.events.some(e=>e.t==='wind_hunt'));
}
for(const flag of ['shadowBoardSide','sunlightJudgmentSide','astralMeteorSide']){
 const s=huntBattle(),[u,enemy]=s.units;beginHunt(s,u);
 s.pendingDamage.push({src:u,dst:enemy,raw:enemy.hp,damageAmp:0,resistance:0,reduction:0,type:'true',critical:false,targeted:true,[flag]:u.side});s.resolveDamage();assert.equal(u.permanentPhysicalPower,0);
}
{
 const sessionCfg=config(),session=new RunSession(sessionCfg,inputs.run,inputs.waves,{runSeed:83,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
 const owned=session.owned.forceAdd(hunt.id);Object.assign(owned,{location:'board',x:3,y:3,permanentPhysicalPower:7});
 const s=session.startBattle(),u=s.units.find(u=>u.id===session.activeBattleIds.get(owned.uid)),enemy=s.units.find(u=>u.side===1);
 assert.equal(u.cfg.physicalPower,7);u.combatTick=s.tick;u.windHuntUntilTick=s.tick+120;hit(s,u,enemy);hit(s,enemy,u);s.end(1);
 assert.ok(session.settleBattle());assert.equal(owned.permanentPhysicalPower,8);assert.equal(session.settleBattle(),null);assert.equal(owned.permanentPhysicalPower,8);
 const migrated=readRunSave(session.snapshot());assert.equal(migrated.owned.find(u=>u.uid===owned.uid).permanentPhysicalPower,8);
 const restored=new RunSession(sessionCfg,inputs.run,inputs.waves,{save:migrated,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
 assert.equal(restored.owned.get(owned.uid).permanentPhysicalPower,8);assert.equal(restored.createPreview().sim.units.find(u=>u.side===0&&u.cfg.id===hunt.id).cfg.physicalPower,8);
 const merged=new OwnedUnits([1,2,3].map((uid,n)=>({uid,unitId:hunt.id,star:1,location:'bench',x:-1,y:n,permanentPhysicalPower:n+1})));merged.mergeAll();assert.equal(merged.all()[0].star,2);assert.equal(merged.all()[0].permanentPhysicalPower,6);
}
assert.deepEqual(huntBattle().run(),huntBattle().run());
console.log('PASS wind hunt: both sides/all stars, 0.4s interruptible windup, full 6s buff, attack/regen mana lock and recovery, 1/2/3 personal-kill growth, once per kill, exclusions, expiry, death/defeat/save/next-round/merge persistence, exact UI and determinism');
const alchemist=cfg.getUnit('wayward_alchemist');
assert.deepEqual([alchemist.cost,alchemist.role,alchemist.damageType,alchemist.range,alchemist.startMana,alchemist.maxMana],[3,'caster','magic',3,0,30]);
function dose(s,u){u.mana=50;u.atkCd=0;s.step();assert.ok(u.pendingCast);const target=u.pendingCast.targetId;
 for(let n=0;n<8;n++)s.step();u.atkCd=10000;assert.equal(u.pendingCast,null);return s.units.find(u=>u.id===target);}
for(const side of [0,1])for(const star of [1,2,3]){
 const s=sim([place(alchemist,side,0,0,star),place(dummy,1-side,1,0),place(dummy,1-side,6,7),place(dummy,1-side,6,6)]),[u,nearby,far,other]=s.units;
 u.cfg.spellPower=100;assert.equal(dose(s,u),nearby);const first=nearby.burns[0],firstDue=first.nextTick;
 assert.equal(first.remainingPulses,6);assert.equal(first.intervalTicks,20);assert.equal(nearby.hp,nearby.cfg.hp,'application has no extra instant damage');
 assert.equal(dose(s,u),other,'global unselected priority overrides basic attack range');
 assert.equal(dose(s,u),far);assert.equal(u.corrosionTargets.size,3);
 assert.equal(dose(s,u),nearby,'all selected allows nearest repeat');assert.equal(nearby.burns.length,2);assert.equal(nearby.burns[0],first);
 assert.equal(first.nextTick,firstDue+20,'new layers do not postpone old damage ticks');
 const second=nearby.burns[1],secondEnd=second.nextTick+100,firstEnd=firstDue+100;
 assert.ok(secondEnd>firstEnd);while(s.tick<firstEnd)s.step();assert.equal(nearby.burns.length,1,'older layer expires independently');
 while(s.tick<secondEnd)s.step();assert.equal(nearby.burns.length,0);
 assert.equal(nearby.cfg.hp-nearby.hp,[50,75,115][star-1]*2*12,'two independently complete six-pulse AP-scaled layers');
 const detail=buildUnitDetailData(cfg,u.cfg,star);assert.equal(detail.skillStats[0].current,String([100,150,230][star-1]));assert.match(detail.skillDescription,/叠加.*分别计时/);
 assert.doesNotMatch(detail.skillDescription,/\{[^}]+\}|NaN|undefined/);
}
for(const mode of ['interrupt','targetDeath','untargetable','casterDeath','end']){
 const s=sim([place(alchemist,0,1,1),place(dummy,1,2,1),place(dummy,1,6,7)]),[u,enemy]=s.units;
 u.mana=50;u.atkCd=0;s.step();
 if(mode==='interrupt'){s.pendingStuns.push({src:enemy,dst:u,seconds:1});s.resolveStuns();}
 if(mode==='targetDeath')hit(s,u,enemy);
 if(mode==='untargetable')enemy.untargetableUntilTick=100;
 if(mode==='casterDeath')hit(s,enemy,u);
 if(mode==='end')s.end(1);
 for(let n=0;n<8;n++)s.step();assert.equal(enemy.burns.length,0,mode);assert.equal(u.corrosionTargets.size,0,mode);
}
{
 const s=sim([place(alchemist,0,1,1),place(alchemist,0,1,2),place(dummy,1,2,1),place(dummy,1,6,7)]),[a,b,enemy]=s.units;
 dose(s,a);dose(s,b);assert.equal(enemy.burns.length,2);assert.notEqual(enemy.burns[0].sourceId,enemy.burns[1].sourceId);
 const health=enemy.hp,next=enemy.burns[0].nextTick;hit(s,enemy,a);while(s.tick<next)s.step();assert.ok(enemy.hp<health,'applied layers survive caster death');
 s.end(1);assert.equal(a.corrosionTargets.size,0);
}
console.log('PASS corrosion: both sides/all stars, global unselected priority, nearest repeat, independent same/different-source stacks, no delayed old pulses, per-layer expiry/AP damage, interrupted/invalid targets and caster-death persistence');
