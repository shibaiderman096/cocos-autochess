require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const base=cfg.getUnit('leon');
const sim=new BattleSim(cfg,[{cfg:{...base,hp:100,atk:1000,critChance:0,lifesteal:.5},side:0,x:3,y:3},
  {cfg:{...base,hp:20,atk:0,critChance:0},side:1,x:3,y:4}]);
sim.units[0].hp=50;
const stats=new CombatStatistics();stats.begin(sim.units);sim.step();assert.equal(stats.consume(sim.events),true);
const rows=stats.snapshot(),source=rows.find(row=>row.side===0),target=rows.find(row=>row.side===1);
assert.equal(source.damage,20,'overkill counts actual HP removed');assert.equal(target.taken,20);
assert.equal(source.damageByType.physical,20);assert.equal(target.takenByType.physical,20);
assert.equal(source.healing,10,'lifesteal counts actual recovered HP');assert.equal(source.taken,target.damage);
assert.equal(stats.consume(sim.events),false);assert.deepEqual(stats.snapshot(),rows,'events never count twice');
rows[0].damage=999;assert.notEqual(stats.snapshot()[0].damage,999,'snapshot cannot mutate the accumulator');
rows[0].damageByType.physical=999;assert.notEqual(stats.snapshot()[0].damageByType.physical,999,'type breakdown snapshots are independent');
stats.begin(sim.units);assert.ok(stats.snapshot().every(row=>!row.damage&&!row.taken&&!row.healing&&!row.shielding));
const mixed=['physical','magic','true'].map((dmgType,index)=>({t:'hit',tick:1,id:2,source:1,actualDamage:index+1,dmg:index+1,hp:10,dmgType}));
stats.consume(mixed);
assert.deepEqual(stats.snapshot().find(row=>row.id===1).damageByType,{physical:1,magic:2,true:3});
assert.deepEqual(stats.snapshot().find(row=>row.id===2).takenByType,{physical:1,magic:2,true:3});
assert.equal(stats.snapshot().find(row=>row.id===1).damage,6);
console.log('PASS combat statistics: source attribution, actual damage, capped healing, deaths, no double count and reset');
stats.begin(sim.units);
const shieldEvents=[{t:'shield',tick:1,id:1,amount:100,shield:100},
 {t:'shield',tick:2,id:1,amount:50,shield:150},
 {t:'equipment_trigger',tick:2,id:1,equipmentId:'totem_of_undying',shield:150},
 {t:'shield',tick:3,id:2,source:1,amount:25,shield:25}];
stats.consume(shieldEvents);
assert.equal(stats.snapshot().find(row=>row.id===1).shielding,175,'count each grant, not the cumulative remaining shield or duplicate equipment notification');
assert.equal(stats.snapshot().find(row=>row.id===2).shielding,0,'ally shields credit their source');
assert.equal(stats.consume(shieldEvents),false);
cfg.setEquipment(require('../assets/resources/config/equipment.json'));
const totemSim=new BattleSim(cfg,[{cfg:{...base,atk:0},side:0,x:3,y:3,equipment:['totem_of_undying']},
 {cfg:{...base,atk:0},side:1,x:3,y:4}]);
totemSim.units[0].hp=1;stats.begin(totemSim.units);totemSim.step();stats.consume(totemSim.events);
const granted=Math.round(totemSim.units[0].cfg.hp*.1);
assert.equal(stats.snapshot().find(row=>row.id===1).shielding,granted,'equipment shield counts immediately without incoming damage');
totemSim.units[0].shield=0;totemSim.step();stats.consume(totemSim.events);
assert.equal(stats.snapshot().find(row=>row.id===1).shielding,granted,'consuming shield never deducts the amount granted');
stats.begin(totemSim.units);assert.ok(stats.snapshot().every(row=>row.shielding===0),'new battle clears shield statistics');
console.log('PASS generated shield statistics: immediate grant, stacking, source attribution, equipment, no double count, consumption and reset');
const guardian=cfg.getUnit('helion');
const guardSim=new BattleSim(cfg,[{cfg:guardian,side:0,x:3,y:3},{cfg:{...base,atk:0,hp:10000},side:1,x:3,y:4}]);
guardSim.units[0].mana=guardSim.units[0].cfg.maxMana;stats.begin(guardSim.units);
for(let i=0;i<100&&!guardSim.events.some(event=>event.t==='shield');i++)guardSim.step();
const skillShield=guardSim.events.find(event=>event.t==='shield');assert.ok(skillShield?.amount>0);
stats.consume(guardSim.events);assert.equal(stats.snapshot().find(row=>row.id===1).shielding,skillShield.amount,'real guardian skill credits shields on acquisition');
// Team effects retain actual-damage accounting, independent sides and unit damage.
stats.begin(sim.units);
stats.consume([
 {t:'hit',tick:1,id:2,source:1,actualDamage:7,dmg:100,hp:0,dmgType:'true',shadowBoardSide:0},
 {t:'hit',tick:1,id:1,source:2,actualDamage:9,dmg:100,hp:0,dmgType:'true',shadowBoardSide:1},
 {t:'hit',tick:1,id:2,source:1,actualDamage:3,dmg:3,hp:0,dmgType:'magic'},
]);
assert.equal(stats.snapshot().find(r=>r.id===-1).damage,7);
assert.equal(stats.snapshot().find(r=>r.id===-2).damage,9);
assert.equal(stats.snapshot().find(r=>r.id===1).damage,3);
assert.equal(stats.snapshot().find(r=>r.id===2).taken,10);
assert.equal(stats.snapshot().filter(r=>r.side===0).reduce((n,r)=>n+r.damage,0),10);
console.log('PASS independent 4-star shadow statistics: both sides, capped actual damage, personal damage and totals');
stats.begin(sim.units);
const factions=[
 {t:'hit',tick:1,id:2,source:1,actualDamage:7,dmg:100,hp:0,dmgType:'true',sunlightJudgmentSide:0},
 {t:'hit',tick:1,id:1,source:2,actualDamage:9,dmg:100,hp:0,dmgType:'true',sunlightJudgmentSide:1},
 {t:'hit',tick:1,id:2,source:1,actualDamage:2,dmg:2,hp:0,dmgType:'true',shadowBoardSide:0},
 {t:'hit',tick:1,id:2,source:1,actualDamage:3,dmg:3,hp:0,dmgType:'magic'},
];
stats.consume(factions);
assert.deepEqual(stats.snapshot().filter(r=>r.sourceKind==='sunlightJudgment').map(r=>[r.id,r.side,r.star,r.damage,r.damageByType.true]),[[-3,0,4,7,7],[-4,1,4,9,9]]);
assert.equal(stats.snapshot().find(r=>r.id===1).damage,3,'personal skill damage stays personal');
assert.equal(stats.snapshot().find(r=>r.id===-1).damage,2,'shadow and sunlight never share a row');
assert.equal(stats.snapshot().find(r=>r.id===2).taken,12);
assert.equal(stats.snapshot().filter(r=>r.side===0).reduce((n,r)=>n+r.damage,0),12);
assert.equal(stats.consume(factions),false,'repeated consumption cannot double-count sunlight damage');
stats.begin(sim.units);assert.equal(stats.snapshot().filter(r=>r.sourceKind).length,0,'new battle removes faction rows');
console.log('PASS independent 4-star sunlight statistics: both sides, shadow coexistence, actual damage, totals, personal skills, cursor and reset');
