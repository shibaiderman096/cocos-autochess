require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {migrateSaveV2}=require('../assets/scripts/core/ShopSave.ts');
const cfg=new ConfigManager();cfg.setEquipment(require('../assets/resources/config/equipment.json'));
const base={id:'test',name:'test',hp:100000,atk:10,armor:0,mr:0,atkSpeed:1,range:2,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function make(count=1){return new BattleSim(cfg,[{cfg:base,side:0,x:0,y:0,equipment:Array(count).fill('guinsoo')},{cfg:base,side:1,x:1,y:0}],{seed:7});}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const speed of [.5,.7,2])for(const count of [0,1,2,3]){
 const sim=new BattleSim(cfg,[{cfg:{...base,atkSpeed:speed},side:0,x:0,y:0,equipment:Array(count).fill('guinsoo')},{cfg:base,side:1,x:1,y:0}]);
 const u=sim.units[0];approx(u.attackSpeed,speed+.1*count);
 u.attackSpeedBonus=.05;approx(u.attackSpeed,speed+.1*count+.05);
 u.attackSpeedBonus=0;sim.step();approx(u.attackSpeed,speed+.15*count);
}
for(const count of [0,1,2,3]){
 const sim=make(count),u=sim.units[0];approx(u.attackSpeed,1+.1*count);assert.equal(u.cfg.spellPower,10*count);
 sim.step();assert.equal(u.equipmentAttackStacks,count?1:0);approx(u.attackSpeed,1+.15*count);
 while(sim.events.filter(e=>e.t==='attack'&&e.id===u.id).length<10)sim.step();
 assert.equal(u.equipmentAttackStacks,count?10:0);approx(u.attackSpeed,1+.6*count);
 u.attackSpeedBonus=1;approx(u.attackSpeed,Math.min(5,2+.6*count));
 u.attackSpeedBonus=0;approx(u.attackSpeed,1+.6*count);
 u.equipmentAttackStacks=10000;assert.equal(u.attackSpeed,count?5:1);
 assert.equal(make(count).units[0].equipmentAttackStacks,0);
}
cfg.setSkills({bolt:{id:'bolt',power:100,radius:0,targeting:'nearest',dmgType:'magic'}});
const mage=()=>new BattleSim(cfg,[{cfg:{...base,skillId:'bolt',startMana:10,maxMana:10,spellPower:20},side:0,x:0,y:0,equipment:['guinsoo']},{cfg:base,side:1,x:1,y:0}]);
const spell=mage();spell.step();assert.equal(spell.events.find(e=>e.t==='hit'&&e.source===1).dmg,130);
assert.equal(spell.units[0].equipmentAttackStacks,0,'casting does not stack');
assert.equal(base.spellPower,undefined);assert.throws(()=>make(4));
assert.deepEqual(make(3).run(),make(3).run());
const o=new OwnedUnits();for(let i=0;i<3;i++){const u=o.forceAdd('test');for(let j=0;j<2;j++)assert.ok(o.equip(u.uid,'guinsoo'));}
o.tryMerge('test');assert.equal(o.all().length,1);assert.equal(o.all()[0].equipment.length,3);assert.equal(o.equipmentReserve.length,3);
const snap=o.snapshot();snap[0].equipment.pop();assert.equal(o.all()[0].equipment.length,3);
const saved=migrateSaveV2({owned:o.snapshot(),equipmentReserve:o.equipmentReserve});assert.equal(saved.owned[0].equipment.length,3);assert.equal(saved.equipmentReserve.length,3);
assert.deepEqual(migrateSaveV2({owned:[{unitId:'test'}]}).owned[0].equipment,[]);
const uid=o.all()[0].uid;assert.equal(o.equip(uid,'guinsoo'),false);assert.equal(o.unequip(uid,3),false);
o.remove(uid);assert.equal(o.equipmentReserve.length,6);
console.log('PASS equipment: three slots, stats, attack stacks, skill bonus isolation, cap, new battle reset, deterministic replay, merge overflow, sale return and save');
require('./advanced-equipment-tests.cjs');
