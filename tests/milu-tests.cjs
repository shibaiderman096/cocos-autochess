require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {hexDist,hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const milu=roster.find(u=>u.id==='milu'),skill=skills.milu_star_leap;
const dummy={id:'dummy',name:'target',hp:10000,atk:0,armor:0,mr:0,atkSpeed:.5,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup({side=0,star=1,from={x:3,y:3},target={x:4,y:3},changes={},extra=[]}={}){
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(roster);cfg.setSkills(skills);
 const sim=new BattleSim(cfg,[{cfg:{...milu,atk:0,critChance:0,...changes},star,side,...from},
  {cfg:dummy,side:1-side,...target},...extra],{seed:1022});sim.units.forEach(u=>u.atkCd=u.moveCd=100000);
 return {cfg,sim,u:sim.units[0],enemy:sim.units[1]};
}
function ready(s,u){u.mana=60;u.atkCd=0;s.step();}
assert.equal(milu.cost,1);assert.equal(milu.role,'assassin');assert.equal(milu.damageType,'magic');
assert.equal(milu.startMana,0);assert.equal(milu.maxMana,60);assert.deepEqual(skill.starDamage,[120,180,270]);
const traits=resolveTraits(battle.traits,['milu','milu','star_armor_guard','oris','blackstar_warlock'],roster);
assert.equal(traits.find(s=>s.config.id==='astral').count,4);assert.equal(traits.find(s=>s.config.id==='astral').active.count,3);
assert.ok(traits.find(s=>s.config.id==='assassin').memberIds.includes('milu'));
for(const star of [1,2,3]){
 const {cfg,sim,u,enemy}=setup({star,changes:{spellPower:100,physicalPower:900,atk:999,damageAmp:.5},extra:[{cfg:{...dummy,id:'untouched'},side:1,x:5,y:3}]});
 const before=u.pos;ready(sim,u);
 assert.equal(hexDist(before,u.pos),1);assert.notDeepEqual(u.pos,enemy.pos);assert.equal(u.mana,0);
 const hits=sim.events.filter(e=>e.t==='hit');assert.equal(hits.length,1);assert.equal(hits[0].id,enemy.id);assert.equal(hits[0].dmgType,'magic');
 assert.equal(hits[0].dmg,[360,540,810][star-1]);assert.equal(hits[0].tick,1,'logical teleport and hit are immediate in the same tick');
 assert.equal(sim.units[2].hp,10000,'no area splash');assert.ok(!sim.events.some(e=>['knockup','stun','fear'].includes(e.t)));
 assert.equal(u.skillUntargetable,false);assert.equal(sim.events.filter(e=>e.t==='teleport').length,1);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale,true);assert.equal(Number(rows[0].current),hits[0].dmg);assert.equal(rows[0].stars,'120 / 180 / 270');
 assert.equal(rows[1].current,'1格');assert.doesNotMatch(buildSkillDescription(cfg,u.cfg,star,u.skillScale),/\{|\}/);
 assert.match(buildSkillDescription(cfg,u.cfg,star,u.skillScale,true),/attr_spell_bonus/);
}
for(const side of [0,1])for(const y of [2,3])for(const target of hexNeighbors(3,y)){
 const from={x:3,y},{sim,u,enemy}=setup({side,from,target});ready(sim,u);
 const legal=hexNeighbors(from.x,from.y).filter(p=>p.x>=0&&p.x<7&&p.y>=0&&p.y<8&&(p.x!==target.x||p.y!==target.y))
  .sort((a,b)=>hexDist(a,target)-hexDist(b,target)||a.y-b.y||a.x-b.x);
 assert.deepEqual(u.pos,legal[0]);assert.equal(enemy.hp,9880);
}
{
 const {sim,u,enemy}=setup({from:{x:0,y:0},target:{x:1,y:0}});ready(sim,u);assert.equal(hexDist({x:0,y:0},u.pos),1);assert.ok(u.x>=0&&u.y>=0);
}
{
 const from={x:3,y:3},target={x:4,y:3};
 const extra=hexNeighbors(from.x,from.y).filter(p=>p.x!==target.x||p.y!==target.y).map((p,i)=>({cfg:{...dummy,id:'block'+i},side:0,...p}));
 const {sim,u,enemy}=setup({from,target,extra});ready(sim,u);
 assert.deepEqual(u.pos,from);assert.equal(u.mana,0);assert.equal(enemy.hp,9880);assert.equal(sim.events.filter(e=>e.t==='teleport').length,0);
}
{
 const {sim,u,enemy}=setup();enemy.cfg.mr=100;enemy.shield=30;ready(sim,u);
 assert.equal(enemy.hp,9970);assert.equal(enemy.shield,0);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);assert.equal(stats.snapshot().find(s=>s.id===u.id).damage,30);
}
for(const state of ['untargetable','stunned','cooldown','notFull']){
 const {sim,u,enemy}=setup();u.mana=60;u.atkCd=0;
 if(state==='untargetable')enemy.untargetableUntilTick=100;
 if(state==='stunned')u.stunnedUntilTick=100;
 if(state==='cooldown')u.atkCd=100;
 if(state==='notFull')u.mana=59;
 sim.step();assert.equal(sim.events.some(e=>e.t==='cast'),false,state);
}
{
 const {sim,u}=setup();ready(sim,u);const {sim:b,u:v}=setup();ready(b,v);assert.deepEqual(sim.events,b.events);sim.end(-1);sim.step();assert.equal(sim.tick,1);
}
for(const change of [{starLeap:{distance:2}},{starDamage:[1,2]},{dmgType:'physical'},{starDamage:[1,NaN,3]}]){
 assert.throws(()=>new ConfigManager().setSkills({milu_star_leap:{...skill,...change}}),/Invalid star leap/);
}
console.log('PASS Milu: authored cost/traits/mana/damage, all six directions and sides, one-cell empty landing and tie order, blocked/edge, immediate single magic hit, scaling/shields/resists/statistics/UI, target and cast eligibility, deterministic replay/config validation');
