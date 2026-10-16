require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const base=cfg.getUnit('warrior');
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
const guardian=cfg.getUnit('guardian');
const guardSim=new BattleSim(cfg,[{cfg:guardian,side:0,x:3,y:3},{cfg:{...base,atk:0,hp:10000},side:1,x:3,y:4}]);
guardSim.units[0].mana=guardSim.units[0].cfg.maxMana;stats.begin(guardSim.units);
for(let i=0;i<100&&!guardSim.events.some(event=>event.t==='shield');i++)guardSim.step();
const skillShield=guardSim.events.find(event=>event.t==='shield');assert.ok(skillShield?.amount>0);
stats.consume(guardSim.events);assert.equal(stats.snapshot().find(row=>row.id===1).shielding,skillShield.amount,'real guardian skill credits shields on acquisition');
