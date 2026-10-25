require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
function fixture(star=1,side=0,changes={}){
 const cfg=new ConfigManager();cfg.setUnits(structuredClone(roster));cfg.setSkills(structuredClone(skills));cfg.setEquipment(require('../assets/resources/config/equipment.json'));cfg.setBattle({...structuredClone(battle),traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:.1}});
 const dummy={...cfg.getUnit('helion'),hp:1000000,atk:0,armor:0,mr:0,critChance:0,skillId:undefined,maxMana:0,startMana:0};
 const sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit('crimson_demon_knight'),critChance:0,...changes},side,star,x:1,y:3},
  ...[[2,3],[3,3],[4,3],[1,2],[0,3]].map(([x,y])=>({cfg:dummy,side:1-side,x,y}))],{seed:88});
 sim.units.forEach(u=>u.atkCd=u.moveCd=100000);
 return {cfg,sim,src:sim.units[0],enemy:sim.units[1],skill:cfg.getSkill('blood_sovereignty')};
}
function settle(sim){sim.resolveDamage();sim.resolveStuns();sim.pendingDamage.length=sim.pendingStuns.length=0;}
function clock(f,t){f.sim.tick=t;for(const u of f.sim.units)u.combatTick=t;f.sim.bloodReign.update();}
const authored=roster.find(u=>u.id==='crimson_demon_knight');assert.deepEqual([authored.name,authored.cost,authored.role,authored.damageType,authored.startMana,authored.maxMana],['蚀血魔君',5,'warrior','physical',0,30]);
assert.equal(resolveTraits(battle.traits,[authored.id],roster).find(t=>t.config.id==='bloodfiend').count,1);
for(const side of [0,1])for(const star of [1,2,3])for(const atk of [40,800]){
 const f=fixture(star,side,{physicalPower:50,spellPower:900,atk,damageAmp:.25}),{sim,src,enemy,skill}=f;
 const originalMax=src.cfg.hp;src.hp=originalMax-100;src.mana=30;sim.cast(src,skill,enemy);
 const gain=[300,450,9000][star-1];assert.equal(src.cfg.hp,originalMax+gain);assert.equal(src.hp,originalMax-100+gain);assert.equal(src.bloodCleaveReady,true);assert.equal(src.mana,0);
 assert.equal(sim.events.filter(e=>e.t==='heal').length,0,'growth is not healing');assert.equal(sim.events.filter(e=>e.t==='hit').length,0);
 src.mana=30;sim.cast(src,skill,enemy);assert.equal(src.cfg.hp,originalMax+gain,'pending cleave cannot be stacked');
 src.atkCd=0;sim.updateUnit(src);settle(sim);assert.equal(sim.events.filter(e=>e.t==='attack').length,0);
 clock(f,9);sim.updateUnit(src);settle(sim);assert.equal(sim.events.filter(e=>e.t==='attack').length,0,'0.5s windup must finish before the basic');
 clock(f,10);sim.updateUnit(src);settle(sim);
 const expected=Math.round([250,375,7500][star-1]*1.5*1.25),hits=sim.events.filter(e=>e.t==='hit'&&e.source===src.id);
 assert.equal(hits.length,3,'one primary basic plus two full extra hits');assert.equal(hits[0].dmg,Math.round(src.cfg.atk*1.5*1.25));
 assert.deepEqual(hits.slice(1).map(e=>[e.id,e.dmg]),[[2,expected],[3,expected]]);assert.ok(hits.every(e=>e.dmgType==='physical'));
 assert.equal(src.bloodCleaveReady,false);assert.equal(sim.events.filter(e=>e.t==='blood_cleave').length,1);
 src.atkCd=0;src.mana=0;sim.updateUnit(src);settle(sim);assert.equal(sim.events.filter(e=>e.t==='blood_cleave').length,1,'one empowered basic only');
 sim.cast(src,skill,enemy);assert.equal(src.cfg.hp,originalMax+2*gain,'separate casts stack within battle');
 const rows=buildSkillStatRows(f.cfg,src.cfg,star,src.skillScale,true);assert.equal(rows.length,6);assert.equal(Number(rows.find(r=>r.label==='强化伤害').current),expected);
 assert.doesNotMatch(buildSkillDescription(f.cfg,src.cfg,star,src.skillScale,true),/\{[^}]+\}|NaN|undefined/);
 sim.end(0);assert.equal(src.cfg.hp,originalMax);assert.equal(src.bloodReignHealth,0);assert.equal(src.bloodCleaveReady,false);assert.equal(roster.find(u=>u.id===authored.id).hp,1200);
}
// Strict threshold and exact cumulative recovery at 30 ticks; no action or mana while hidden.
for(const star of [1,2,3])for(const side of [0,1]){
 const f=fixture(star,side,{physicalPower:900,spellPower:900}),{sim,src,enemy}=f,max=src.cfg.hp;
 src.hp=max*.1+1;sim.damage(enemy,src,1,'true');settle(sim);assert.equal(src.bloodRebirth,null,'exact 10% does not trigger');
 sim.damage(enemy,src,1,'true');settle(sim);const start=src.hp,origin=src.pos;assert.ok(src.bloodRebirth);assert.equal(src.bloodRebirth.total,max);assert.equal(src.snapshot(0).untargetable,true);assert.equal(sim.targetable(src),false);
 src.mana=30;src.atkCd=src.moveCd=0;sim.updateUnit(src);src.gainMana(30);assert.deepEqual(src.pos,origin);assert.equal(sim.events.filter(e=>e.t==='attack'||e.t==='cast').length,0);
 for(let t=1;t<30;t++){clock(f,t);assert.ok(src.bloodRebirth);assert.equal(src.hp,Math.min(max,start+Math.floor(max*t/30)));}
 clock(f,30);assert.equal(src.hp,max);assert.equal(src.bloodRebirth,null);assert.equal(src.manaLocked,false);assert.equal(sim.targetable(src),true);
 sim.damage(enemy,src,max*.95,'true');settle(sim);assert.equal(src.bloodRebirth,null,'once per battle');
 assert.equal(sim.events.filter(e=>e.t==='blood_rebirth').length,1);
}
// First lethal hit is intercepted, later queued targeted hits miss; no kill/revel is awarded.
{
 const f=fixture(),{sim,src,enemy}=f;src.hp=10;
 sim.damage(enemy,src,999999,'true');sim.damage(enemy,src,999999,'true');settle(sim);
 assert.equal(src.hp,1);assert.equal(src.alive,true);assert.equal(sim.events.filter(e=>e.t==='death').length,0);assert.equal(sim.events.filter(e=>e.t==='hit'&&e.id===src.id).length,1);
 assert.equal(sim.events.find(e=>e.t==='hit').actualDamage,9);assert.equal(src.mana,0);
 src.bloodfiend={overhealShieldRatio:1};clock(f,30);assert.equal(src.hp,src.cfg.hp);assert.equal(src.shield,1);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);const row=stats.snapshot().find(r=>r.id===src.id);assert.equal(row.healing,src.cfg.hp-1);assert.equal(row.shielding,1);
 src.shield=0;sim.damage(enemy,src,999999,'true');settle(sim);assert.equal(src.alive,false);assert.equal(src.bloodRebirth,null);
}
// Untargetability is not extra immunity to explicitly non-targeted damage, and death stops recovery.
{
 const f=fixture();f.src.hp=10;f.sim.damage(f.enemy,f.src,999999,'true');settle(f.sim);
 f.sim.damage(f.enemy,f.src,10,'true',false,false,false);settle(f.sim);assert.equal(f.src.alive,false);clock(f,30);assert.equal(f.src.hp,0);
}
// Existing low-health equipment stays available while the intrinsic skill handles the first crisis.
{
 const f=fixture();f.src.equipment=[...f.cfg.allEquipment().filter(e=>e.lowHealthProtection)];f.src.hp=1;f.sim.damage(f.enemy,f.src,10,'true');settle(f.sim);
 assert.equal(f.src.lowHealthProtectionUsed,false);clock(f,1);f.sim.updateEquipment();assert.equal(f.src.lowHealthProtectionUsed,false);
 clock(f,30);f.src.hp=1;f.sim.damage(f.enemy,f.src,10,'true');settle(f.sim);assert.equal(f.src.lowHealthProtectionUsed,true);assert.equal(f.src.hp,1);
}
// Health-based equipment updates on growth and rolls back precisely, including reduction cap.
{
 const f=fixture(),src=f.src,base={hp:src.cfg.hp,armor:src.cfg.armor,mr:src.cfg.mr};
 src.cfg.damageReduction=.98;src.equipment=[{maxHpResistance:{step:100,bonus:1}},{armorDamageReduction:{threshold:61,bonus:.1}}];
 f.sim.cast(src,f.skill,f.enemy);assert.equal(src.cfg.armor,base.armor+3);assert.equal(src.cfg.damageReduction,1);
 f.sim.end(0);assert.equal(src.cfg.hp,base.hp);assert.equal(src.cfg.armor,base.armor);assert.equal(src.cfg.mr,base.mr);assert.equal(src.cfg.damageReduction,.98);
}
// Recovery preserves a prepared cleave; control cannot select/interfere with the hidden unit.
{
 const f=fixture();f.sim.cast(f.src,f.skill,f.enemy);const max=f.src.cfg.hp;f.src.hp=1;f.sim.damage(f.enemy,f.src,1,'true');settle(f.sim);
 assert.equal(f.src.bloodRebirth.total,max);assert.equal(f.src.bloodCleaveReady,true);
 f.sim.pendingStuns.push({src:f.enemy,dst:f.src,seconds:10});f.sim.resolveStuns();f.sim.pendingStuns.length=0;assert.equal(f.src.stunnedUntilTick,0);
 clock(f,30);f.src.mana=0;f.src.atkCd=0;f.sim.updateUnit(f.src);settle(f.sim);assert.equal(f.src.bloodCleaveReady,true);
 clock(f,40);f.sim.updateUnit(f.src);settle(f.sim);assert.equal(f.src.bloodCleaveReady,false,JSON.stringify({windup:f.src.bloodCleaveWindup,cd:f.src.atkCd,stun:f.src.stunnedUntilTick,rebirth:f.src.bloodRebirth,events:f.sim.events.slice(-3)}));
}
for(const key of ['healthGains','attackWindupSeconds','length','width','rebirthThreshold','rebirthSeconds','rebirthHealMaxHpFraction']){
 const f=fixture(),bad=structuredClone(skills);bad.blood_sovereignty.bloodReign[key]=key==='healthGains'?[1,-1,3]:0;assert.throws(()=>f.cfg.setSkills(bad),/Invalid blood reign/);
}
// Hard control resets preparation without consuming the empowered attack; fear still permits it.
{
 const f=fixture();f.sim.cast(f.src,f.skill,f.enemy);f.src.atkCd=0;f.sim.updateUnit(f.src);
 const target=f.src.bloodCleaveWindup.targetId;clock(f,3);f.src.stunnedUntilTick=8;f.sim.updateUnit(f.src);
 assert.equal(f.src.bloodCleaveWindup,null);assert.equal(f.src.bloodCleaveReady,true);
 clock(f,8);f.src.fearUntilTick=100;f.sim.updateUnit(f.src);assert.equal(f.src.bloodCleaveWindup.endTick,18);
 for(let t=9;t<18;t++){clock(f,t);f.sim.updateUnit(f.src);assert.equal(f.src.bloodCleaveReady,true);}
 clock(f,18);f.sim.updateUnit(f.src);settle(f.sim);assert.equal(f.src.bloodCleaveReady,false,'fear does not block basics');
 assert.equal(f.sim.events.filter(e=>e.t==='attack').length,1);assert.ok(target>0);
}
// A lost target starts a fresh full windup; rebirth/end clear its preparation state.
{
 const f=fixture();f.sim.cast(f.src,f.skill,f.enemy);f.src.atkCd=0;f.sim.updateUnit(f.src);
 const target=f.sim.units.find(u=>u.id===f.src.bloodCleaveWindup.targetId);target.alive=false;target.hp=0;
 clock(f,4);f.sim.updateUnit(f.src);assert.notEqual(f.src.bloodCleaveWindup.targetId,target.id);assert.equal(f.src.bloodCleaveWindup.endTick,14);
 f.src.hp=1;f.sim.damage(f.enemy,f.src,1,'true');settle(f.sim);assert.equal(f.src.bloodCleaveWindup,null);assert.equal(f.src.bloodCleaveReady,true);
 f.sim.end(0);assert.equal(f.src.bloodCleaveWindup,null);assert.equal(f.src.bloodCleaveReady,false);
}
const a=fixture(),b=fixture();for(const f of [a,b]){f.src.mana=30;f.src.atkCd=0;for(let i=0;i<120;i++)f.sim.step();}assert.deepEqual(a.sim.events,b.sim.events);
console.log('PASS blood reign: both sides/all stars, health stacking/cleanup, isolated physical cleave/line boundaries, strict and lethal threshold, exact 1.5s recovery, action/mana lock, once-only, same-tick targeting, overflow/statistics, equipment priority/scaling/cap rollback, control, death and determinism');
