require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {loadRunInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs(),cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setEquipment(input.equipment);cfg.setBattle({...input.battle,traits:[]});
const ID='thousand_forged_armor',item=cfg.getEquipment([ID])[0];
const base={id:'dummy',name:'dummy',hp:10000,atk:1,armor:0,mr:0,atkSpeed:1,range:10,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function make(items=[ID]){return new BattleSim(cfg,[{cfg:base,side:0,x:3,y:3,equipment:items},{cfg:{...base,id:'enemy'},side:1,x:3,y:4}],{seed:92});}
function hit(sim,raw=1,type='physical'){sim.damage(sim.units[1],sim.units[0],raw,type);sim.resolveDamage();sim.pendingDamage.length=0;return sim.events.filter(e=>e.t==='hit').at(-1);}
assert.equal(loadEquipmentInputs().equipmentPolicy.tiers[ID],'basic');assert.ok(input.run.stageEncounters.basicEquipmentIds.includes(ID));
for(const copies of [1,2,3]){
 const sim=make(Array(copies).fill(ID)),u=sim.units[0];assert.equal(u.cfg.hp,10000+300*copies);
 for(let count=1;count<=35;count++){
  hit(sim);assert.equal(u.equipmentDamageStacks,Math.min(count,30));assert.equal(u.armor,Math.min(count,30)*copies);assert.equal(u.mr,u.armor);
  assert.ok(Math.abs(u.damageReductionAt(sim.tick)-(count<30?0:.1*copies))<1e-9);
 }
 assert.equal(hit(sim,100,'physical').dmg,Math.round(100*(1-.1*copies)*100/(100+30*copies)));
 assert.equal(hit(sim,100,'magic').dmg,Math.round(100*(1-.1*copies)*100/(100+30*copies)));
 assert.equal(hit(sim,100,'true').dmg,Math.round(100*(1-.1*copies)));
 assert.deepEqual(u.snapshot().equipmentStacks,Array(copies).fill(30));
}
{
 const sim=make(),u=sim.units[0];u.shield=1000;const hp=u.hp;
 hit(sim);assert.equal(u.hp,hp);assert.equal(u.shield,999);assert.equal(u.equipmentDamageStacks,1,'shield-only damage counts');
 u.cfg.damageReduction=1;assert.equal(hit(sim,100).dmg,0);assert.equal(u.equipmentDamageStacks,1,'zero damage never counts');
 u.cfg.damageReduction=0;u.untargetableUntilTick=100;hit(sim);assert.equal(u.equipmentDamageStacks,1,'missed targeted hit never counts');
}
{
 const sim=make(),[u,enemy]=sim.units;u.equipmentDamageStacks=28;
 for(let i=0;i<3;i++)sim.damage(enemy,u,100,'physical');sim.resolveDamage();
 assert.deepEqual(sim.events.filter(e=>e.t==='hit').map(e=>e.dmg),[78,78,69],'each hit uses existing stacks; new stack/full-stack reduction affect the next hit');
 assert.equal(u.equipmentDamageStacks,30);
}
{
 const sim=make(),u=sim.units[0];u.equipmentDamageStacks=30;u.shadowCorruption={resistanceReduction:.5,damageAmpLoss:0};
 assert.equal(u.armor,15);assert.equal(hit(sim,100).dmg,78,'stack resistance receives ordinary resistance reductions');
 const other=make().units[0];assert.equal(other.equipmentDamageStacks,0);assert.equal(other.armor,0);assert.equal(other.damageReductionAt(0),0,'each new battle resets stacks and reduction');
}
{
 const a=make(),b=make();for(let tick=0;tick<100;tick++){a.step();b.step();}assert.deepEqual(a.events,b.events);assert.deepEqual(a.units.map(u=>u.snapshot()),b.units.map(u=>u.snapshot()));
}
for(const patch of [{maxStacks:0},{maxStacks:1.5},{resistancePerStack:-1},{maxStackDamageReduction:1.1}])assert.throws(()=>new ConfigManager().setEquipment([{...item,damageTakenStacks:{...item.damageTakenStacks,...patch}}]),/damage taken stacks/);
console.log('PASS thousand forged armor: flat HP, shield/zero/miss rules, per-hit resistance, cap and exact full-stack timing, same-tick hits, three damage types, duplicate stacking, corruption, battle reset, snapshot counters and deterministic battle');
