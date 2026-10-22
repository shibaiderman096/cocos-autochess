require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics} = require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits} = require('../assets/scripts/battle/Traits.ts');
const {astralCells, densestAstralCenter} = require('../assets/scripts/battle/Astral.ts');
const {hexDist} = require('../assets/scripts/battle/HexMath.ts');
const {combatConfigurationIdentity}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const battle = require('../assets/resources/config/battle.json');
const roster = require('../assets/resources/config/units.json');
const original = battle.traits.find(t => t.id === 'astral');
const clone = v => JSON.parse(JSON.stringify(v));
const seed = 1022;
const base = {name:'fixture',hp:10000,atk:100,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:10,
  maxMana:0,startMana:0,manaPerHit:0,physicalPower:10,spellPower:20,critChance:0};
function create(n=10, side=0, enemies=[{x:2,y:6},{x:3,y:6},{x:2,y:5},{x:6,y:7}]) {
  const trait = clone(original), units = Array.from({length:n},(_,i)=>({...base,id:`astral_${i}`}));
  trait.members = units.map(u=>u.id); trait.pendingMembers = false;
  const effect=trait.breakpoints.filter(t=>n>=t.count).at(-1)?.astral;
  const cells=astralCells(seed,side,7,8,4,effect?.cellCount??7);
  const home=Array.from({length:28},(_,i)=>({x:i%7,y:side===0?Math.floor(i/7):7-Math.floor(i/7)}));
  const memberCells=[cells[0],...home.filter(p=>p.x!==cells[0].x||p.y!==cells[0].y)].slice(0,n);
  const free=p=>!memberCells.some(c=>c.x===p.x&&c.y===p.y);
  const inside=cells.find(free);
  const outside=home.find(p=>free(p)&&!cells.some(c=>c.x===p.x&&c.y===p.y))??{x:6,y:side===0?4:3};
  const cfg=new ConfigManager(); cfg.setBattle({...clone(battle),traits:[trait]});cfg.setUnits(units);
  const sim=new BattleSim(cfg,[...units.map((cfg,i)=>({cfg,side,...memberCells[i]})),
    {cfg:{...base,id:'inside'},side,...inside},{cfg:{...base,id:'outside'},side,...outside},
    ...enemies.map((p,i)=>({cfg:{...base,id:`enemy_${i}`},side:1-side,...(side===0?p:{x:p.x,y:7-p.y})}))],{seed});
  sim.units.forEach(u=>u.stunnedUntilTick=1000000);
  return {sim,cfg,trait,effect};
}
function until(sim,tick){while(sim.tick<tick&&!sim.finished)sim.step();assert.equal(sim.tick,tick);}
assert.equal(original.pendingMembers,false);
assert.deepEqual(original.members,['oris','blackstar_warlock','star_armor_guard','milu']);
const authored=resolveTraits(battle.traits,['oris','blackstar_warlock','oris'],roster);
assert.equal(authored.find(t=>t.config.id==='astral').count,2,'copies count once');
assert.equal(authored.find(t=>t.config.id==='astral').active,null,'two members cannot activate the authored three-unit threshold');
assert.equal(authored.find(t=>t.config.id==='sunlight').count,1,'Oris retains Sunlight');
assert.equal(authored.find(t=>t.config.id==='shadow').count,1,'Blackstar retains Shadow');
assert.deepEqual(original.breakpoints.map(t=>[t.count,t.astral.cellCount,t.astral.power,t.astral.maxHpBonus]),
  [[3,7,15,.1],[5,14,30,.2],[7,21,50,.3],[10,'all',100,.6]]);
assert.deepEqual(original.breakpoints.at(-1).astral.meteor,{intervalSeconds:5,damage:3000,radius:1});
{
  const before=clone(battle);before.traits=before.traits.filter(t=>t.id!=='astral');
  const identity=b=>combatConfigurationIdentity({battle:b,skills:{}});
  const reserved=clone(battle);Object.assign(reserved.traits.find(t=>t.id==='astral'),{members:[],pendingMembers:true});
  assert.equal(identity(before),identity(reserved),'reserved empty faction preserves existing save identities');
  assert.notEqual(identity(before),identity(battle),'authored membership participates in combat save identity');
  const active=clone(battle);active.traits.find(t=>t.id==='astral').members=['helion'];
  assert.notEqual(identity(before),identity(active),'adding members later requires normal combat compatibility checks');
}
for(const side of [0,1]) for(const n of [3,5,7,10]) {
  const {sim,effect}=create(n,side),cells=sim.astralFields[0].cells;
  assert.equal(cells.length,effect.cellCount==='all'?28:effect.cellCount);
  assert.equal(new Set(cells.map(p=>`${p.x},${p.y}`)).size,cells.length);
  assert.ok(cells.every(p=>p.x>=0&&p.x<7&&(side===0?p.y<4:p.y>=4)));
  for(const u of sim.units){
    const on=u.side===side&&cells.some(p=>p.x===u.x&&p.y===u.y);
    const factor=on?(u.cfg.id.startsWith('astral_')?2:1):0;
    assert.equal(u.cfg.physicalPower,10+effect.power*factor,u.cfg.id);
    assert.equal(u.cfg.spellPower,20+effect.power*factor,u.cfg.id);
    assert.equal(u.cfg.hp,Math.round(10000*(1+effect.maxHpBonus*factor)),u.cfg.id);
    assert.equal(u.hp,u.cfg.hp); assert.equal(u.cfg.atk,100,'double power is not basic attack scaling');
  }
  const member=sim.units[0],hp=member.cfg.hp,phys=member.cfg.physicalPower;
  member.y=side===0?7:0;until(sim,1);assert.equal(member.cfg.hp,hp);assert.equal(member.cfg.physicalPower,phys,'buff persists after leaving starting tile');
  const outside=sim.units.find(u=>u.cfg.id==='outside');outside.x=cells[0].x;outside.y=cells[0].y;
  until(sim,2);assert.equal(outside.cfg.hp,10000,'moving onto a tile does not add a late buff');
  assert.equal(base.hp,10000,'input configuration is never mutated');
  assert.deepEqual(create(n,side).sim.astralFields,create(n,side).sim.astralFields,'preview and battle use identical seeded cells');
  until(sim,99);assert.equal(sim.events.some(e=>e.t==='astral_meteor'),false);
  until(sim,100);assert.equal(sim.events.filter(e=>e.t==='astral_meteor').length,n===10?1:0);
}
for(const side of [0,1]) {
  const small=astralCells(seed,side,7,8,4,7),medium=astralCells(seed,side,7,8,4,14);
  assert.ok(small.every(p=>medium.some(q=>q.x===p.x&&q.y===p.y)),'raising a tier adds tiles without rerolling old tiles');
  assert.notDeepEqual(small,astralCells(seed+1,side,7,8,4,7),'next round seed can change tiles');
}
{
  const {cfg,trait}=create(3),cell=astralCells(seed,0,7,8,4,7)[0];
  cfg.setBattle({traits:[...cfg.battle.traits,{id:'health',name:'health',glyph:'H',description:'',members:trait.members,
    breakpoints:[{count:3,tier:'bronze',stats:{maxHpBonus:.2}}]}]});
  cfg.setEquipment([{id:'health_item',name:'health',icon:'',hp:1000,spellPower:0,attackSpeedBonus:0,attackSpeedPerAttack:0}]);
  const placements=trait.members.map((id,i)=>({cfg:cfg.getUnit(id),side:0,x:i?i:cell.x,y:i?0:cell.y,star:i?1:2,equipment:i?[]:['health_item']}));
  const sim=new BattleSim(cfg,placements,{seed});
  assert.equal(sim.units[0].cfg.hp,Math.round(Math.round((10000*1.8+1000)*1.2)*1.2),'star/equipment and existing HP trait precede astral bonus');
}
{
  const {cfg,trait}=create(10),placements=[];
  for(const side of [0,1])trait.members.forEach((id,i)=>placements.push({cfg:cfg.getUnit(id),side,x:i%7,y:side===0?Math.floor(i/7):7-Math.floor(i/7)}));
  const sim=new BattleSim(cfg,placements,{seed});sim.units.forEach(u=>u.stunnedUntilTick=1000000);
  assert.equal(sim.astralFields.length,2);until(sim,100);
  assert.deepEqual(sim.events.filter(e=>e.t==='astral_meteor').map(e=>e.side),[0,1],'both sides emit independent meteors on the same tick');
  const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);
  assert.deepEqual(stats.snapshot().filter(r=>r.sourceKind==='astralMeteor').map(r=>r.id),[-5,-6]);
}
{
  const units=[{...base,id:'a'},{...base,id:'b'}],placements=units.map((cfg,i)=>({cfg,side:i,x:3,y:i?6:1}));
  const make=traits=>{const cfg=new ConfigManager();cfg.setBattle({...clone(battle),traits});cfg.setUnits(units);return new BattleSim(cfg,placements,{seed});};
  assert.deepEqual(make([clone(original)]).run(),make([]).run(),'inactive faction changes neither RNG nor existing battle replay');
}
{
  const {sim,cfg,trait}=create(3);
  const copies=sim.units.filter(u=>u.side===0).slice(0,3).map(u=>({cfg:cfg.getUnit(trait.members[0]),side:0,x:u.x,y:u.y}));
  const duplicate=new BattleSim(cfg,copies);assert.equal(duplicate.astralFields.length,0,'copies count once');
}
{
  // An empty central tile can cover six enemies, while occupied centers cover fewer.
  const targets=Array.from({length:56},(_,i)=>({x:i%7,y:Math.floor(i/7)})).filter(p=>hexDist(p,{x:3,y:5})===1);
  assert.deepEqual(densestAstralCenter(targets,7,8,1),{x:3,y:5});
  assert.equal(densestAstralCenter([],7,8,1),null);
}
for(const side of [0,1]) {
  const {sim}=create(10,side),source=sim.units[0],enemies=sim.units.filter(u=>u.side!==side);
  // A faction meteor does not inherit the representative's offense, execute or lifesteal.
  source.hp=100;source.cfg.spellPower=9999;source.cfg.damageAmp=9;source.cfg.lifesteal=1;source.traitExecuteThreshold=.99;
  source.conqueror={damageAmp:9,lifesteal:1,lowHealthThreshold:.9,lowHealthMultiplier:2};
  source.equipment=[{lowTargetDamageAmp:{threshold:1,bonus:9}}];
  source.spellchanter={spellPower:0,manaOnTakedown:20};
  enemies[0].cfg.mr=100;enemies[1].shield=4000;enemies[2].hp=500;
  const stats=new CombatStatistics();stats.begin(sim.units);
  until(sim,99);assert.equal(sim.events.filter(e=>e.t==='astral_meteor').length,0);
  until(sim,100);
  const meteor=sim.events.find(e=>e.t==='astral_meteor'),hits=sim.events.filter(e=>e.astralMeteorSide===side);
  assert.equal(hits.length,3,'one full hit per enemy in the densest hex area');
  assert.ok(hits.every(e=>e.dmgType==='magic'&&!e.critical&&!e.executed));
  assert.equal(hits.find(e=>e.id===enemies[0].id).actualDamage,1500,'magic resistance applies');
  assert.equal(enemies[1].shield,1000,'shield absorbs the full 3000 hit');
  assert.equal(hits.find(e=>e.id===enemies[1].id).actualDamage,0);
  assert.equal(hits.find(e=>e.id===enemies[2].id).actualDamage,500,'overkill excluded');
  assert.equal(source.hp,100,'faction damage cannot lifesteal');
  assert.equal(sim.spellchanterContributors.size,0,'faction damage is not a personal takedown contribution');
  assert.ok(hits.every(e=>hexDist(meteor.center,enemies.find(u=>u.id===e.id).pos)<=1));
  stats.consume(sim.events);const rows=stats.snapshot(),team=rows.find(r=>r.sourceKind==='astralMeteor');
  assert.equal(team.damage,2000);assert.equal(team.side,side);assert.equal(team.star,4);assert.equal(team.damageByType.magic,2000);
  assert.equal(rows.find(r=>r.id===source.id).damage,0,'independent statistics never double count');
  assert.equal(stats.consume(sim.events),false,'event cursor is idempotent');
  source.alive=false;source.hp=0;until(sim,200);
  assert.equal(sim.events.filter(e=>e.t==='astral_meteor').length,2,'representative death does not disable a team field');
  sim.end(-1);const events=sim.events.length;sim.step();assert.equal(sim.events.length,events,'finished battle stops meteors');
  stats.begin(sim.units);assert.equal(stats.snapshot().some(r=>r.sourceKind==='astralMeteor'),false,'statistics reset');
}
{
  const {sim}=create(10),enemies=sim.units.filter(u=>u.side===1);
  enemies[0].untargetableUntilTick=101;enemies[1].skillUntargetable=true;
  enemies[2].alive=false;enemies[2].hp=0;
  until(sim,100);const hits=sim.events.filter(e=>e.astralMeteorSide===0);
  assert.deepEqual(hits.map(e=>e.id),[enemies[3].id],'dead and untargetable enemies neither attract nor receive meteors');
}
{
  const {sim}=create(10),target=sim.units.find(u=>u.side===1);
  target.cfg.damageReduction=.2;target.equipment=[{magicDamageReduction:.1}];
  until(sim,100);assert.equal(sim.events.find(e=>e.id===target.id&&e.astralMeteorSide===0).dmg,2100);
}
for(const key of ['power','maxHpBonus','memberMultiplier','cellCount']) for(const value of [-1,NaN,Infinity]) {
  const trait=clone(original);trait.breakpoints[0].astral[key]=value;
  assert.throws(()=>new ConfigManager().setBattle({traits:[trait]}),/Invalid astral/);
}
for(const key of ['damage','intervalSeconds','radius']) for(const value of [-1,NaN,Infinity]) {
  const trait=clone(original);trait.breakpoints.at(-1).astral.meteor[key]=value;
  assert.throws(()=>new ConfigManager().setBattle({traits:[trait]}),/Invalid astral/);
}
assert.deepEqual(create().sim.run(),create().sim.run(),'deterministic complete battles');
console.log('PASS astral: authored four-member roster and retained factions, all tiers/sides, stable unique tiles, start-only buffs, densest radius, 5s boundary, 3000 full magic damage, defenses, source isolation, statistics, death and cleanup');
