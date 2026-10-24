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
function ready(s,u){u.mana=u.cfg.maxMana;u.atkCd=0;s.step();}
function land(s,u){const end=u.starLeap?.endTick??s.tick;u.atkCd=100000;while(s.tick<end&&!s.finished)s.step();}
assert.equal(milu.cost,1);assert.equal(milu.role,'assassin');assert.equal(milu.damageType,'magic');
assert.equal(milu.name,'流星灵狐');assert.equal(roster.find(u=>u.id==='xiya').name,'银月猎手');
assert.equal(roster.find(u=>u.id==='rail_hunter_07').name,'磁轨猎手');assert.equal(roster.find(u=>u.id==='bao_zero').name,'铆钉壁垒');
assert.equal(milu.startMana,0);assert.equal(milu.maxMana,30);assert.deepEqual(skill.starDamage,[120,180,270]);
const traits=resolveTraits(battle.traits,['milu','milu','star_armor_guard','oris','blackstar_warlock'],roster);
assert.equal(traits.find(s=>s.config.id==='astral').count,4);assert.equal(traits.find(s=>s.config.id==='astral').active.count,3);
assert.ok(traits.find(s=>s.config.id==='assassin').memberIds.includes('milu'));
for(const star of [1,2,3]){
 const {cfg,sim,u,enemy}=setup({star,changes:{spellPower:100,physicalPower:900,atk:999,damageAmp:.5},extra:[{cfg:{...dummy,id:'untouched'},side:1,x:5,y:3}]});
 const before=u.pos;ready(sim,u);
 assert.deepEqual(u.pos,before,'cast starts at the origin instead of teleporting');
 const dash=sim.events.find(e=>e.t==='dash');assert.equal(dash.durationTicks,4);assert.ok(u.starLeap);
 assert.equal(sim.occupied(u.starLeap.to.x,u.starLeap.to.y),true,'landing cell is reserved while travelling');
 assert.equal(sim.events.filter(e=>e.t==='hit').length,0);
 for(let i=0;i<3;i++){sim.step();assert.equal(sim.events.filter(e=>e.t==='hit').length,0,'no damage before arrival');}
 land(sim,u);
 assert.equal(hexDist(before,u.pos),1);assert.notDeepEqual(u.pos,enemy.pos);assert.equal(u.mana,0);
 const hits=sim.events.filter(e=>e.t==='hit');assert.equal(hits.length,1);assert.equal(hits[0].id,enemy.id);assert.equal(hits[0].dmgType,'magic');
 assert.equal(hits[0].dmg,[360,540,810][star-1]);assert.equal(hits[0].tick,5,'single hit resolves at arrival');
 assert.equal(sim.units[2].hp,10000,'no area splash');assert.ok(!sim.events.some(e=>['knockup','stun','fear'].includes(e.t)));
 assert.equal(u.skillUntargetable,false);assert.equal(sim.events.filter(e=>e.t==='teleport').length,0);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale,true);assert.equal(Number(rows[0].current),hits[0].dmg);assert.equal(rows[0].stars,'120 / 180 / 270');
 assert.equal(rows[1].current,'1格');assert.doesNotMatch(buildSkillDescription(cfg,u.cfg,star,u.skillScale),/\{|\}/);
 assert.match(buildSkillDescription(cfg,u.cfg,star,u.skillScale,true),/attr_spell_bonus/);
}
for(const side of [0,1])for(const y of [2,3])for(const target of hexNeighbors(3,y)){
 const from={x:3,y},{sim,u,enemy}=setup({side,from,target});ready(sim,u);
 const legal=hexNeighbors(from.x,from.y).filter(p=>p.x>=0&&p.x<7&&p.y>=0&&p.y<8&&(p.x!==target.x||p.y!==target.y))
  .sort((a,b)=>hexDist(a,target)-hexDist(b,target)||a.y-b.y||a.x-b.x);
 assert.deepEqual(u.starLeap.to,legal[0]);land(sim,u);assert.deepEqual(u.pos,legal[0]);assert.equal(enemy.hp,9880);
}
{
 const {sim,u,enemy}=setup({from:{x:0,y:0},target:{x:1,y:0}});ready(sim,u);land(sim,u);assert.equal(hexDist({x:0,y:0},u.pos),1);assert.ok(u.x>=0&&u.y>=0);
}
{
 const from={x:3,y:3},target={x:4,y:3};
 const extra=hexNeighbors(from.x,from.y).filter(p=>p.x!==target.x||p.y!==target.y).map((p,i)=>({cfg:{...dummy,id:'block'+i},side:0,...p}));
 const {sim,u,enemy}=setup({from,target,extra});ready(sim,u);
 assert.deepEqual(u.pos,from);assert.equal(u.mana,0);assert.equal(enemy.hp,9880);assert.equal(sim.events.filter(e=>e.t==='teleport').length,0);
}
{
 const {sim,u,enemy}=setup();enemy.cfg.mr=100;enemy.shield=30;ready(sim,u);land(sim,u);
 assert.equal(enemy.hp,9970);assert.equal(enemy.shield,0);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);assert.equal(stats.snapshot().find(s=>s.id===u.id).damage,30);
}
for(const state of ['untargetable','stunned','cooldown','notFull']){
 const {sim,u,enemy}=setup();u.mana=30;u.atkCd=0;
 if(state==='untargetable')enemy.untargetableUntilTick=100;
 if(state==='stunned')u.stunnedUntilTick=100;
 if(state==='cooldown')u.atkCd=100;
 if(state==='notFull')u.mana=29;
 sim.step();assert.equal(sim.events.some(e=>e.t==='cast'),false,state);
}
{
 const {sim,u}=setup();ready(sim,u);const {sim:b,u:v}=setup();ready(b,v);assert.deepEqual(sim.events,b.events);sim.end(-1);sim.step();assert.equal(sim.tick,1);
}
for(const state of ['stun','fear','death','end','targetGone','targetHidden']){
 const {sim,u,enemy}=setup({extra:[{cfg:{...dummy,id:'spare'},side:1,x:6,y:7}]});ready(sim,u);
 const end=u.starLeap.endTick;
 if(state==='stun'){sim.pendingStuns.push({src:enemy,dst:u,seconds:1});sim.resolveStuns();}
 if(state==='fear')u.fearUntilTick=100;
 if(state==='death'){sim.damage(enemy,u,100000,'true');sim.resolveDamage();}
 if(state==='end')sim.end(-1);
 if(state==='targetGone'){enemy.alive=false;enemy.hp=0;}
 if(state==='targetHidden')enemy.untargetableUntilTick=100;
 while(sim.tick<end+1&&!sim.finished)sim.step();
 assert.equal(u.starLeap,null,state);assert.equal(sim.events.filter(e=>e.t==='hit'&&e.source===u.id).length,0,state);
 assert.equal(sim.events.filter(e=>e.t==='teleport').length,0,state);
}
{
 const {sim,u,enemy}=setup();ready(sim,u);enemy.x=6;enemy.y=7;land(sim,u);assert.equal(enemy.hp,9880,'landing hits the locked target even after it moves');
}
for(const change of [{starLeap:{distance:2,durationSeconds:.2}},{starLeap:{distance:1,durationSeconds:0}},{starLeap:{distance:1,durationSeconds:NaN}},{starDamage:[1,2]},{dmgType:'physical'},{starDamage:[1,NaN,3]}]){
 assert.throws(()=>new ConfigManager().setSkills({milu_star_leap:{...skill,...change}}),/Invalid star leap/);
}
console.log('PASS Milu: 0/30 mana, four prefix-only names, timed one-hex dash and reserved landing, all directions/sides, arrival-only magic hit, scaling/shields/UI, blocked/edge, control/death/end/invalid-target cancellation and deterministic replay');
