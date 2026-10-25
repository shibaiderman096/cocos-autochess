require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts'),{BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {hexDist,hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
function config(traits=[]){const cfg=new ConfigManager();cfg.setUnits(structuredClone(roster));cfg.setSkills(structuredClone(skills));cfg.setBattle({...structuredClone(battle),traits,roleMana:{casterPerSecond:0,damageTakenFraction:0}});return cfg;}
const dummy={id:'helion',name:'dummy',hp:1000,atk:0,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:1,startMana:0,maxMana:0,manaPerHit:0,critChance:0};
function fixture(star=1,side=0,power=0){const cfg=config(),unit={...cfg.getUnit('scarlet_enchantress'),critChance:0,spellPower:power},sim=new BattleSim(cfg,[{cfg:unit,star,side,x:0,y:1},{cfg:dummy,side,x:5,y:4},{cfg:{...dummy,id:'second',hp:100},side,x:0,y:0},{cfg:{...dummy,id:'enemy',hp:100000},side:1-side,x:6,y:4}],{seed:101});const [src,ally,other,enemy]=sim.units;ally.hp=100;other.hp=50;sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {cfg,sim,src,ally,other,enemy,skill:cfg.getSkill(unit.skillId)};}
function settle(sim){sim.resolveDamage();sim.resolveStuns();sim.pendingDamage.length=sim.pendingStuns.length=0;}
function clock(f,t){f.sim.tick=t;for(const u of f.sim.units)u.combatTick=t;f.sim.bloodAid.update();}
const unit=roster.find(u=>u.id==='scarlet_enchantress');assert.deepEqual([unit.cost,unit.role,unit.damageType,unit.classTraitId],[3,'marksman','magic','swift_marksman']);
const states=resolveTraits(battle.traits,[unit.id],roster);for(const id of ['bloodfiend','swift_marksman'])assert.equal(states.find(t=>t.config.id===id).count,1);
for(const side of [0,1])for(const star of [1,2,3]){
 const f=fixture(star,side,50),{sim,src,ally,other,enemy,skill}=f,origin=src.pos;
 src.mana=src.cfg.maxMana;sim.cast(src,skill,enemy);assert.equal(src.mana,0);assert.equal(src.bloodAidUntilTick,80);assert.equal(src.manaLocked,true);assert.equal(hexDist(src.pos,ally.pos),1);
 assert.equal(ally.hp,100+[300,450,675][star-1]);assert.equal(other.hp,50,'lowest percentage rather than lowest absolute HP');
 assert.equal(ally.armor,[30,45,65][star-1]);assert.equal(ally.mr,ally.armor);assert.equal(ally.cfg.armor,0,'authored base is never modified');
 const arrived=src.pos;src.atkCd=0;sim.updateUnit(src);settle(sim);assert.deepEqual(src.pos,arrived);assert.equal(src.mana,0);
 const magic=sim.events.filter(e=>e.t==='hit'&&e.source===src.id&&e.dmgType==='magic');assert.equal(magic.at(-1).dmg,Math.round([30,45,70][star-1]*1.5));
 assert.ok(sim.events.some(e=>e.t==='attack'&&e.id===src.id));
 const rows=buildSkillStatRows(f.cfg,src.cfg,star,src.skillScale,true);assert.equal(rows.length,5);assert.equal(rows.find(r=>r.label==='普攻附伤').current,String(magic.at(-1).dmg));assert.doesNotMatch(buildSkillDescription(f.cfg,src.cfg,star,src.skillScale,true),/\{[^}]+\}|NaN|undefined/);
 clock(f,79);assert.equal(src.bloodAidUntilTick,80);clock(f,80);assert.deepEqual(src.pos,origin);assert.equal(src.bloodAidUntilTick,0);assert.equal(src.manaLocked,false);assert.equal(ally.armor,0);
 const count=magic.length;src.x=5;src.y=3;src.atkCd=0;sim.updateUnit(src);settle(sim);assert.equal(sim.events.filter(e=>e.t==='hit'&&e.source===src.id&&e.dmgType==='magic').length,count,'return removes on-hit enhancement');
}
// Actual AI casts globally, before an enemy enters attack range; full mana is retained without a recipient.
{
 const f=fixture();f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;f.sim.step();assert.equal(f.src.bloodAidUntilTick,81);assert.equal(f.sim.events.find(e=>e.t==='blood_aid').target,f.ally.id);
 const g=fixture();g.other.alive=g.ally.alive=false;g.src.mana=g.src.cfg.maxMana;g.src.atkCd=0;g.sim.updateUnit(g.src);assert.equal(g.src.mana,g.src.cfg.maxMana);assert.equal(g.sim.events.some(e=>e.t==='cast'),false);
}
// The resistance gift reduces actual physical AND magic damage, while true damage is untouched.
for(const type of ['physical','magic','true']){
 const f=fixture();f.sim.cast(f.src,f.skill,f.enemy);const hp=f.ally.hp;f.sim.damage(f.enemy,f.ally,130,type);settle(f.sim);assert.equal(hp-f.ally.hp,type==='true'?130:100,type+' actual mitigation');
}
for(const mode of ['stun','fear','recipientDeath','casterDeath','end','occupiedOrigin']){
 const f=fixture(),origin=f.src.pos;f.sim.cast(f.src,f.skill,f.enemy);clock(f,10);
 if(mode==='stun'||mode==='fear'){f.sim.pendingStuns.push({src:f.enemy,dst:f.src,seconds:1,...(mode==='fear'?{fearOrigin:f.enemy.pos}:{})});f.sim.resolveStuns();}
 if(mode==='recipientDeath'){f.sim.damage(f.enemy,f.ally,f.ally.hp,'true');settle(f.sim);}
 if(mode==='casterDeath'){f.sim.damage(f.enemy,f.src,f.src.hp,'true');settle(f.sim);}
 if(mode==='end')f.sim.end(0);
 if(mode==='occupiedOrigin'){f.other.x=origin.x;f.other.y=origin.y;clock(f,80);assert.notDeepEqual(f.src.pos,origin);assert.equal(hexDist(f.src.pos,origin),1);}
 assert.equal(f.src.bloodAidUntilTick,0,mode);assert.equal(f.src.manaLocked,false,mode);
 if(['stun','fear','recipientDeath','end'].includes(mode))assert.deepEqual(f.src.pos,origin,mode+' returns alive caster');
 if(['stun','fear','casterDeath'].includes(mode)){assert.equal(f.ally.armor,30,'gift survives interruption/caster death');clock(f,80);assert.equal(f.ally.armor,0);}
}
{
 const f=fixture();f.src.hp=1;f.other.hp=10;f.ally.hp=100;assert.equal(f.sim.bloodAid.target(f.src).id,f.ally.id,'ties use stable unit ID and exclude caster');
 f.ally.untargetableUntilTick=100;assert.equal(f.sim.bloodAid.target(f.src).id,f.other.id);
}
{
 const f=fixture();for(const p of hexNeighbors(f.ally.x,f.ally.y)){const cfg={...dummy,id:'block'};const {Unit}=require('../assets/scripts/battle/Unit.ts');f.sim.units.push(new Unit(f.sim.units.length+1,1,cfg,p.x,p.y));}
 f.src.mana=f.src.cfg.maxMana;f.sim.cast(f.src,f.skill,f.enemy);assert.equal(f.src.mana,f.src.cfg.maxMana,'blocked recipient does not consume mana');
}
{
 const f=fixture();f.sim.cast(f.src,f.skill,f.enemy);const resistance=f.ally.armor;f.sim.bloodAid.activate(f.src,f.ally,f.skill);assert.equal(f.ally.armor,resistance,'busy caster cannot stack duplicate gifts');
 const g=fixture();g.ally.bloodfiend={overhealShieldRatio:1};g.ally.hp=990;g.other.hp=g.other.cfg.hp;g.sim.cast(g.src,g.skill,g.enemy);assert.equal(g.ally.hp,1000);assert.equal(g.ally.shield,190,'healing uses shared bloodfiend overflow settlement');
 const stats=new CombatStatistics();stats.begin(g.sim.units);stats.consume(g.sim.events);assert.equal(stats.snapshot().find(r=>r.id===g.src.id).healing,10);assert.equal(stats.snapshot().find(r=>r.id===g.src.id).shielding,190);
}
// Distinct casters keep independent gifts and expiry clocks, including after either caster dies.
{
 const f=fixture(),{Unit}=require('../assets/scripts/battle/Unit.ts');
 const second=new Unit(5,f.src.side,{...f.src.cfg},1,1);f.sim.units.push(second);
 f.sim.bloodAid.activate(f.src,f.ally,f.skill);clock(f,20);f.sim.bloodAid.activate(second,f.ally,f.skill);
 assert.equal(f.ally.armor,60);assert.equal(f.ally.bloodAidResistances.size,2);
 f.sim.damage(f.enemy,f.src,f.src.hp,'true');settle(f.sim);assert.equal(f.ally.armor,60);
 clock(f,80);assert.equal(f.ally.armor,30);assert.equal(second.bloodAidUntilTick,100);
 clock(f,100);assert.equal(f.ally.armor,0);assert.equal(second.bloodAidUntilTick,0);
}
for(const key of ['healAmounts','resistanceBonuses','attackBonusDamage','staySeconds','resistanceSeconds']){const cfg=config(),bad=structuredClone(skills);bad.scarlet_aid_dance.bloodAid[key]=key.endsWith('Seconds')?0:[1,-1,3];assert.throws(()=>cfg.setSkills(bad),/Invalid blood aid/);}
const a=fixture(),b=fixture();for(const f of [a,b]){f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;for(let i=0;i<100;i++)f.sim.step();}assert.deepEqual(a.sim.events,b.sim.events);
console.log('PASS scarlet enchantress: both sides/all stars, percentage target, arrival heal/resistance, real on-hit/mitigation, global AI, no recipient/blocked cells, four-second stay/return/expiry, control/death/occupied origin, overflow/statistics, validation and determinism');
