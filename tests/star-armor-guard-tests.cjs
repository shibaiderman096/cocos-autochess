require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager,configuredShieldAmount}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {stellarChargeRay}=require('../assets/scripts/battle/StellarCharge.ts');
const {astralCells}=require('../assets/scripts/battle/Astral.ts');
const {hexDist,hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {ShopSystem}=require('../assets/scripts/core/ShopSystem.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {Rng}=require('../assets/scripts/core/Rng.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const guard=roster.find(u=>u.id==='star_armor_guard'),skill=skills.stellar_bulwark;
const dummy={id:'dummy',name:'靶子',hp:10000,atk:0,armor:0,mr:0,atkSpeed:.5,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup({star=1,side=0,from={x:2,y:3},target={x:3,y:3},changes={},extra=[]}={}) {
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(roster);cfg.setSkills(skills);
 const sim=new BattleSim(cfg,[{cfg:{...guard,atk:0,critChance:0,...changes},star,side,...from},
 {cfg:{...dummy},side:1-side,...target},...extra],{seed:1022});
 sim.units.forEach(u=>{u.atkCd=100000;u.moveCd=100000;});return {cfg,sim,u:sim.units[0],enemy:sim.units[1]};
}
function until(s,t){while(s.tick<t&&!s.finished)s.step();assert.equal(s.tick,t);}
function ready(s,u){u.atkCd=0;u.mana=u.cfg.maxMana;s.step();}
function hit(s,a,b,n){s.damage(a,b,n,'true');s.resolveDamage();s.pendingDamage.length=0;}
assert.equal(guard.cost,1);assert.equal(guard.role,'tank');assert.equal(guard.damageType,'physical');
assert.deepEqual(['hp','atk','armor','mr','atkSpeed','range','startMana','maxMana'].map(k=>guard[k]),[700,30,40,40,.55,1,40,100]);
const traits=resolveTraits(battle.traits,['oris','blackstar_warlock',guard.id,guard.id],roster);
assert.equal(traits.find(t=>t.config.id==='astral').active.count,3);
assert.ok(traits.find(t=>t.config.id==='armored_tank').memberIds.includes(guard.id));
{
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:battle.traits.filter(t=>t.id==='astral')});cfg.setUnits(roster);cfg.setSkills(skills);
 const cell=astralCells(1022,0,7,8,4,7)[0];
 const other=Array.from({length:28},(_,i)=>({x:i%7,y:Math.floor(i/7)})).filter(p=>p.x!==cell.x||p.y!==cell.y);
 const target=hexNeighbors(cell.x,cell.y).find(p=>p.x>=0&&p.x<7&&p.y>=0&&p.y<8);
 const seats=other.filter(p=>p.x!==target.x||p.y!==target.y);
 const sim=new BattleSim(cfg,[{cfg:guard,side:0,...cell},
  ...['oris','blackstar_warlock'].map((id,i)=>({cfg:{...cfg.getUnit(id),maxMana:0,startMana:0},side:0,...seats[i]})),
  {cfg:dummy,side:1,...target}],{seed:1022});
 sim.units.forEach(u=>{u.atkCd=100000;u.moveCd=100000;});const u=sim.units[0];
 assert.equal(u.cfg.physicalPower,30);assert.equal(u.cfg.spellPower,30);assert.equal(u.cfg.hp,840);
 ready(sim,u);assert.equal(u.shield,325,'natural three Astral gives doubled member bonus to physical shield');
}
{
 const pool=new CardPool(roster),owned=new OwnedUnits(),economy=new EconomySystem(undefined,{gold:10,winStreak:0,loseStreak:0});
 const stock=pool.count(guard.id),slots=[0,1,2,3,4].map(i=>({unitId:i<3?guard.id:null}));
 const shop=new ShopSystem(pool,owned,economy,new Map(roster.map(u=>[u.id,u])),new Rng(1022),()=>1,9,slots,false);
 for(let i=0;i<3;i++)assert.equal(shop.buy(i).error,undefined);
 assert.equal(economy.gold,7);assert.equal(pool.count(guard.id),stock-3);
 assert.equal(owned.all().length,1);assert.equal(owned.all()[0].star,2);assert.equal(owned.all()[0].unitId,guard.id);
}
for(const y of [2,3,4,5])for(const target of hexNeighbors(3,y)) {
 const from={x:3,y},ray=stellarChargeRay(from,target,2,7,8);
 assert.equal(ray.length,2);assert.deepEqual(ray[0],target);assert.equal(hexDist(from,ray[1]),2);
}
assert.deepEqual(stellarChargeRay({x:0,y:0},{x:1,y:0},2,7,8),[{x:1,y:0},{x:2,y:0}]);
assert.deepEqual(stellarChargeRay({x:0,y:0},{x:0,y:0},2,7,8),[]);
for(const star of [1,2,3]) {
 const {sim,u,enemy,cfg}=setup({star,changes:{physicalPower:100,spellPower:900,damageAmp:5,atk:999}});
 ready(sim,u);const amount=[500,750,1100][star-1];assert.equal(u.shield,amount);assert.equal(u.stellarShield.untilTick,81);
 assert.deepEqual(u.stellarCharge.to,{x:4,y:3});assert.equal(u.stellarCharge.endTick,7);assert.equal(u.mana,0);
 u.atkCd=100000;until(sim,7);assert.deepEqual(u.pos,{x:4,y:3});assert.equal(u.stellarCharge,null);
 assert.equal(enemy.hp,10000,'dash has no damage');assert.equal(sim.events.filter(e=>e.t==='hit').length,0);
 const hits=sim.events.filter(e=>e.t==='knockup');assert.equal(hits.length,1);assert.equal(hits[0].id,enemy.id);assert.equal(hits[0].duration,.75);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale);assert.equal(Number(rows[0].current),amount);
 assert.equal(parseFloat(rows.at(-1).current),.75);assert.doesNotMatch(buildSkillDescription(cfg,u.cfg,star,u.skillScale),/\{|\}/);
 assert.equal(configuredShieldAmount({...u.cfg,atk:1,spellPower:0,damageAmp:0},skill,star),amount);
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);
 assert.equal(stats.snapshot().find(r=>r.id===u.id).shielding,amount);
 until(sim,80);assert.equal(u.shield,amount);until(sim,81);assert.equal(u.shield,0);assert.equal(u.stellarShield,null);
}
for(const side of [0,1]) {
 const {sim,u,enemy}=setup({side,from:{x:side?4:2,y:3},target:{x:3,y:3}});ready(sim,u);u.atkCd=100000;
 until(sim,7);assert.deepEqual(u.pos,{x:side?2:4,y:3});assert.equal(sim.events.filter(e=>e.t==='knockup').length,1);
 assert.ok(enemy.stunnedUntilTick>sim.tick);
}
{
 const {sim,u,enemy}=setup();u.shield=100;ready(sim,u);hit(sim,enemy,u,80);assert.equal(u.stellarShield.remaining,170);
 u.atkCd=100000;until(sim,81);assert.equal(u.shield,100,'expiry preserves unrelated shield');
}
{
 const {sim,u,enemy}=setup();u.shield=100;ready(sim,u);hit(sim,enemy,u,80);
 until(sim,7);enemy.x=3;enemy.y=3;ready(sim,u);
 assert.equal(u.shield,350,'recast replaces own surviving layer');assert.equal(u.stellarShield.remaining,250);
 hit(sim,enemy,u,300);assert.equal(u.stellarShield,null);assert.equal(u.shield,50);
}
{
 const {sim,u}=setup({extra:[{cfg:{...dummy,id:'ally'},side:0,x:4,y:3}]});ready(sim,u);
 assert.equal(u.stellarCharge,null,'occupied forward ray never displaces an ally');assert.equal(u.shield,250);assert.equal(sim.events.some(e=>e.t==='dash'),false);
}
{
 const {sim,u,enemy}=setup({from:{x:5,y:3},target:{x:6,y:3}});ready(sim,u);
 assert.equal(u.stellarCharge,null,'board edge with no free cell still grants shield');assert.equal(u.shield,250);assert.deepEqual(u.pos,{x:5,y:3});
}
for(const state of ['untargetable','immune','movesAway']) {
 const {sim,u,enemy}=setup();ready(sim,u);u.atkCd=100000;
 if(state==='untargetable')enemy.untargetableUntilTick=100;
 if(state==='immune')enemy.susanooUntilTick=100;
 if(state==='movesAway'){enemy.x=6;enemy.y=7;}
 until(sim,7);assert.equal(sim.events.filter(e=>e.t==='knockup').length,0,state);
}
for(const state of ['stun','fear','death','end','occupiedEnd']) {
 const {sim,u,enemy}=setup();ready(sim,u);until(sim,3);
 if(state==='stun'){sim.pendingStuns.push({src:enemy,dst:u,seconds:1});sim.resolveStuns();}
 if(state==='fear'){u.fearUntilTick=100;sim.step();}
 if(state==='death')hit(sim,enemy,u,100000);
 if(state==='end')sim.end(-1);
 if(state==='occupiedEnd'){enemy.x=4;enemy.y=3;until(sim,7);}
 assert.equal(u.stellarCharge,null,state);
 if(u.alive)assert.notDeepEqual(u.pos,enemy.pos,'interrupted/occupied dash lands on a free hex');
 if(state==='end'||state==='death'){assert.equal(u.stellarShield,null);assert.equal(u.shield,0);}
}
{
 const {sim,u}=setup();ready(sim,u);u.atkCd=100000;until(sim,7);const knock=sim.events.find(e=>e.t==='knockup');
 const {sim:repeat,u:other}=setup();ready(repeat,other);other.atkCd=100000;until(repeat,7);assert.deepEqual(sim.events,repeat.events);
 assert.equal(knock.duration,.75);
}
for(const changes of [{distance:0},{distance:1.5},{speedMultiplier:0},{shieldSeconds:NaN},{knockupSeconds:-1}]) {
 const cfg=new ConfigManager();assert.throws(()=>cfg.setSkills({x:{...skill,stellarBulwark:{...skill.stellarBulwark,...changes}}}),/Invalid stellar bulwark/);
}
console.log('PASS star armor guard: roster/traits, six hex directions, both sides, shield scaling/layers/expiry/recast, full trajectory, once-only fixed knockup, blockers/edge/target movement/immunity, interruption/death/end, UI/stats/config and deterministic replay');

