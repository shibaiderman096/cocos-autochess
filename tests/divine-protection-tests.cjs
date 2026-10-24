require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {equipmentStatRows}=require('../assets/scripts/ui/EquipmentPresentation.ts');
const {loadRunInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs(),cfg=new ConfigManager();
cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setEquipment(input.equipment);cfg.setBattle({...input.battle,traits:[]});
const ID='divine_protection',item=cfg.getEquipment([ID])[0];
const base={id:'dummy',name:'dummy',hp:1000,atk:0,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:6,maxMana:100,startMana:0,manaPerHit:0,critChance:0};
function make(items=[ID]){return new BattleSim(cfg,[{cfg:base,side:0,x:3,y:3,equipment:items},{cfg:{...base,id:'enemy'},side:1,x:3,y:4}],{seed:39});}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
assert.deepEqual(equipmentStatRows(item).map(r=>[r.icon,r.value]),[['stat_hp','+200'],['attr_mr','+20']]);
assert.equal(loadEquipmentInputs().equipmentPolicy.tiers[ID],'basic');
assert.ok(!loadEquipmentInputs().equipmentPolicy.reward.excludedIds.includes(ID));
for(const copies of [1,2,3]){
 const sim=make(Array(copies).fill(ID)),u=sim.units[0];
 assert.equal(u.cfg.hp,1000+200*copies);assert.equal(u.mr,20*copies);assert.equal(u.crowdControlImmune,true);
 for(const ratio of [1,.5,.49,.5,1]){
  u.hp=u.cfg.hp*ratio;near(u.attackSpeed,1+(ratio>=.5?.5*copies:0));assert.equal(u.armor,ratio<.5?40*copies:0);
 }
 u.cfg.atkSpeed=4.9;assert.equal(u.attackSpeed,5);
 u.cfg.hp+=1000;u.hp=700;assert.equal(u.equipmentHealthArmor,40*copies,'threshold follows final maximum health');
}
{
 const sim=make(),[u,enemy]=sim.units;u.hp=650;
 for(let i=0;i<3;i++)sim.damage(enemy,u,100,'physical');
 sim.resolveDamage();assert.deepEqual(sim.events.filter(e=>e.t==='hit').map(e=>e.dmg),[100,71,71],'later queued hits use low-health armor');
 u.hp=599;u.shadowCorruption={resistanceReduction:.25,damageAmpLoss:0};assert.equal(u.armor,30);
 sim.pendingDamage.length=0;sim.damage(enemy,u,100,'physical');sim.damage(enemy,u,100,'magic');sim.damage(enemy,u,100,'true');sim.resolveDamage();
 assert.deepEqual(sim.events.filter(e=>e.t==='hit').slice(-3).map(e=>e.dmg),[77,87,100],'armor, MR and true damage use their normal formulas');
}
for(const items of [[ID],[]])for(const kind of ['stun','knockup','fear']){
 const sim=make(items),[u,enemy]=sim.units;const cast=u.pendingCast={skillId:'test',remainingTicks:10};
 sim.pendingStuns.push({src:enemy,dst:u,seconds:2,...(kind==='knockup'?{knockup:true}:{}),...(kind==='fear'?{fearOrigin:enemy.pos}:{})});
 sim.resolveStuns();
 assert.equal(sim.events.some(e=>e.t===kind),!items.length);
 assert.equal(kind==='fear'?u.fearUntilTick>0:u.stunnedUntilTick>0,!items.length);
 assert.equal(u.pendingCast,items.length?cast:null,'immune carriers retain their in-progress cast');
}
{
 const sim=make(),[u,enemy]=sim.units;
 u.skillAttackSpeedPenalty=.4;near(u.attackSpeed,1.5,'immune to attack-speed slow');
 sim.shadowSkills.domains.set(enemy.id,{source:enemy,end:100,skill:{id:'legacy_domain',radius:2,shadow:{kind:'domain',slowAmounts:[.4,.4,.4]}}});
 sim.shadowSkills.updateDomainSlows();assert.equal(u.skillAttackSpeedPenalty,0);
 u.equipment=[];sim.shadowSkills.updateDomainSlows();near(u.skillAttackSpeedPenalty,.4);near(u.attackSpeed,.6);
 const other=make([]).units[0];assert.equal(other.crowdControlImmune,false,'new unequipped battle has no immunity');
}
for(const patch of [{threshold:0},{threshold:1.1},{attackSpeedBonus:-1},{armor:NaN}])assert.throws(()=>new ConfigManager().setEquipment([{...item,healthStance:{...item.healthStance,...patch}}]),/health stance/);
console.log('PASS divine protection: base stats and ordinary pool; exact 50% boundary/heal recovery/max-HP changes; stacking/cap; same-tick armor and damage types; stun/knockup/fear/slow immunity and cast preservation; unequipped control baseline');
