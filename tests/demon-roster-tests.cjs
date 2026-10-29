require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {hexDist,hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillDescription,buildSkillStatRows}=require('../assets/scripts/ui/SkillPresentation.ts');
const units=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const demon=battle.traits.find(t=>t.id==='demon');
function config(traits=[]){const cfg=new ConfigManager();cfg.setUnits(structuredClone(units));cfg.setSkills(structuredClone(skills));cfg.setEquipment(require('../assets/resources/config/equipment.json'));cfg.setBattle({...structuredClone(battle),traits,roleMana:{casterPerSecond:0,damageTakenFraction:0}});return cfg;}
const dummy={id:'dummy',name:'dummy',hp:100000,atk:0,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function fixture(id,star=1,extra=[],override={}){
 const cfg=config(),sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit(id),critChance:0,...override},star,side:0,x:2,y:3},
 {cfg:dummy,side:1,x:4,y:3},{cfg:{...dummy,id:'spare'},side:1,x:7,y:7},...extra],{seed:88,w:8,h:8});
 sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {cfg,sim,src:sim.units[0],dst:sim.units[1]};
}
const step=(f,n)=>{for(let i=0;i<n;i++)f.sim.step();};
function cast(f){f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;f.sim.step();assert.ok(f.src.pendingCast);return f.sim.tick;}
function settle(f){f.sim.resolveDamage();f.sim.resolveStuns();f.sim.pendingDamage.length=f.sim.pendingStuns.length=0;}
for(const star of [1,2,3]){
 const f=fixture('thornchain_succubus',star,[],{spellPower:50,physicalPower:999}),original=f.dst.pos,tick=cast(f);
 step(f,7);assert.equal(f.dst.hp,100000);assert.deepEqual(f.dst.pos,original);step(f,1);
 assert.equal(100000-f.dst.hp,[240,360,540][star-1]);assert.equal(hexDist(f.src.pos,f.dst.pos),1);assert.notDeepEqual(f.dst.pos,original);
 const pull=f.sim.events.find(e=>e.t==='thorn_pull');assert.equal(pull.tick,tick+8);assert.equal(pull.durationTicks,6);
 assert.equal(f.dst.stunnedUntilTick,pull.tick+21,'all ranks stun for one second');
 assert.equal(new Set(f.sim.units.filter(u=>u.alive).map(u=>`${u.x}:${u.y}`)).size,f.sim.units.length);
 const text=buildSkillDescription(f.cfg,f.src.cfg,star,f.src.skillScale);assert.match(text,/眩晕1秒/);assert.doesNotMatch(text,/\{[^}]+\}|NaN|undefined/);
 assert.deepEqual(buildSkillStatRows(f.cfg,f.src.cfg,star,f.src.skillScale).map(r=>r.label),['鞭击伤害'],'fixed control duration is not repeated in star rows');
}
for(const immunity of ['controlImmune','susanoo']){
 const f=fixture('thornchain_succubus'),original=f.dst.pos;if(immunity==='controlImmune')f.dst.cfg.controlImmune=true;else f.dst.susanooUntilTick=100;
 cast(f);step(f,8);assert.ok(f.dst.hp<100000);assert.deepEqual(f.dst.pos,original);assert.equal(f.dst.stunnedUntilTick,0);
}
{
 const blockers=hexNeighbors(2,3).map((p,i)=>({cfg:{...dummy,id:'block'+i},side:0,...p})),f=fixture('thornchain_succubus',1,blockers),original=f.dst.pos;
 cast(f);step(f,8);assert.equal(f.dst.hp,99840);assert.deepEqual(f.dst.pos,original);assert.ok(f.dst.stunnedUntilTick>f.sim.tick);assert.equal(f.sim.events.some(e=>e.t==='thorn_pull'),false);
}
{
 const f=fixture('thornchain_succubus');f.dst.x=3;const original=f.dst.pos;cast(f);step(f,8);assert.notDeepEqual(f.dst.pos,original,'adjacent victim must move to a different cell');
}
for(const failure of ['range','dead','untargetable','interrupt']){
 const f=fixture('thornchain_succubus');cast(f);
 if(failure==='range')f.dst.x=7;
 if(failure==='dead'){f.dst.hp=0;f.dst.alive=false;}
 if(failure==='untargetable')f.dst.untargetableUntilTick=100;
 if(failure==='interrupt'){f.sim.pendingStuns.push({src:f.dst,dst:f.src,seconds:1});f.sim.resolveStuns();f.sim.pendingStuns.length=0;}
 step(f,8);assert.equal(f.sim.events.some(e=>e.t==='thorn_whip'),false,failure);
}
{
 const f=fixture('thornchain_succubus');f.dst.hp=1;cast(f);step(f,8);assert.equal(f.dst.alive,false);assert.equal(f.sim.events.some(e=>e.t==='thorn_pull'),false,'lethal hits do not drag corpses');
}
{
 const f=fixture('thornchain_succubus');cast(f);step(f,7);
 f.dst.ravenFlight={from:f.dst.pos,to:{x:5,y:3},startTick:0,endTick:100,targetId:f.src.id};
 // Resolve the incoming control directly to test interruption without updating a synthetic raven skill.
 f.sim.pendingStuns.push({src:f.src,dst:f.dst,seconds:1,pullSeconds:.3});f.sim.resolveStuns();f.sim.pendingStuns.length=0;
 assert.equal(f.dst.ravenFlight,null);assert.equal(hexDist(f.src.pos,f.dst.pos),1);
}
// The remaining six skills: exact windups, scaling, per-target healing, drains and temporary ownership.
{
 const f=fixture('redhorn_imp',1,[],{spellPower:100});cast(f);step(f,8);assert.equal(f.src.demonFervor.attackSpeedBonus,.8);assert.equal(f.src.lifesteal,.15);
 const first=f.src.demonFervor.untilTick;cast(f);step(f,8);assert.ok(f.src.demonFervor.untilTick>first);assert.equal(f.src.demonFervor.attackSpeedBonus,.8);
 f.sim.end(0);assert.equal(f.src.demonFervor,null);
}
{
 const f=fixture('hellflame_hound');f.dst.x=3;cast(f);step(f,12);assert.equal(f.dst.hp,99820);assert.equal(f.dst.burns.length,1);
 step(f,20);assert.equal(f.dst.hp,97820,'first burn is 2% maximum health');
 cast(f);step(f,12);assert.equal(f.dst.burns.length,1,'same hound refreshes its burn');
}
{
 const f=fixture('saien');f.dst.x=3;f.dst.hp=1000;f.src.hp=100;cast(f);step(f,14);
 const hits=f.sim.events.filter(e=>e.t==='hit'&&e.source===f.src.id);assert.deepEqual(hits.map(e=>e.dmgType),['physical','true']);assert.equal(hits[1].dmg,24750,'missing health snapshots before the physical hit');
 assert.equal(f.src.hp,300,'skill kill heals once');
}
{
 const f=fixture('infernal_axe_guard',1,[{cfg:{...dummy,id:'rear'},side:1,x:1,y:3}],{spellPower:100});f.dst.x=3;f.src.hp=100;cast(f);step(f,8);assert.ok(f.src.infernalSpin);assert.equal(f.src.manaLocked,true);
 step(f,12);assert.equal(f.src.infernalSpin,null);assert.equal(f.src.hp,380);assert.equal(f.dst.hp,99760);assert.equal(f.sim.units[3].hp,99760);
 assert.equal(f.sim.events.filter(e=>e.t==='hit'&&e.source===1).length,2,'one hit per target per spin');
}
{
 const f=fixture('raven_succubus');f.dst.cfg.spellPower=12;cast(f);step(f,8);assert.ok(f.src.ravenFlight);step(f,8);
 assert.equal(f.src.ravenFlight,null);assert.equal(f.src.cfg.spellPower,12);assert.equal(f.dst.cfg.spellPower,0);assert.equal(f.dst.hp,99740);
 f.sim.end(0);assert.equal(f.src.cfg.spellPower,0);assert.equal(f.dst.cfg.spellPower,12);
}
{
 const f=fixture('crimson_gunslinger',1,[],{atkSpeed:1.6});cast(f);assert.equal(f.src.mana,60);step(f,6);assert.ok(f.src.demonGunfire);step(f,19);assert.equal(f.src.mana,60);step(f,1);
 assert.equal(f.src.mana,40);assert.equal(f.sim.events.find(e=>e.t==='demon_volley').count,6);assert.equal(f.dst.hp,99730);
 f.src.gainMana(100);assert.equal(f.src.mana,40);step(f,40);assert.equal(f.src.mana,0);assert.equal(f.src.demonGunfire,null);assert.equal(f.src.manaLocked,false);
}
assert.equal(demon.members.length,7);assert.ok(demon.members.includes('thornchain_succubus'));
for(const count of [3,5,7,10]){
 const cfg=config([demon]),members=demon.members.slice(0,count).map(id=>cfg.getUnit(id));
 while(members.length<count)members.push({...dummy,id:'emblem'+members.length,grantedTraitIds:['demon']});
 const ranks=members.map((_,i)=>i%3+1),sim=new BattleSim(cfg,[...members.map((cfg,i)=>({cfg,star:ranks[i],side:0,x:i%8,y:Math.floor(i/8)})),{cfg:dummy,side:1,x:7,y:7}],{seed:23,w:8,h:8});
 const summon=sim.units.find(u=>u.cfg.summonOnly),tier=demon.breakpoints.find(t=>t.count===count).demon;
 assert.ok(summon);assert.equal(summon.star,tier.star);assert.equal(summon.cfg.hp,battle.summons[0].starStats.hp[tier.star-1]+ranks.reduce((a,b)=>a+b,0)*tier.healthPerStar);
 assert.equal(resolveTraits([demon],sim.units.filter(u=>u.side===0).map(u=>u.cfg),cfg.allUnits()).find(t=>t.config.id==='demon').count,count,'summon never counts toward its own trait');
 assert.equal(cfg.allUnits().some(u=>u.id==='azaroth'),false);assert.ok(summon.crowdControlImmune);assert.equal(summon.equipment.length,0);
 const initial=summon.cfg.spellPower??0;sim.demon.recordDamage(sim.units[0],sim.units[count],1);sim.demon.recordDamage(sim.units[1],sim.units[count],1);sim.demon.onDeath(sim.units[count]);
 assert.equal(summon.cfg.spellPower,initial+tier.takedownPower,'one gain per enemy, irrespective of participant count');
 sim.demon.begin(summon,cfg.getSkill(summon.cfg.skillId));assert.equal(summon.shield,Math.round(summon.cfg.hp*tier.castShieldFraction));
 if(count===10){sim.tick=20;sim.demon.update();assert.equal(sim.units[0].cfg.spellPower,3);}
 sim.end(0);assert.equal(summon.cfg.spellPower,initial);assert.equal(summon.shield,0);
}
console.log('PASS demon roster: seven skills, windups, fixed stun/pull legality/immunity/interruption/death, damage/AP/burn/heal/mana, trait tiers 3/5/7/10, star HP, summon exclusion, once-per-death growth and cleanup');
