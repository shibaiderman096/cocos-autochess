require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {equipmentStatRows,equipmentEffectText}=require('../assets/scripts/ui/EquipmentPresentation.ts');
const {validateEquipmentPolicy}=require('../assets/scripts/core/EquipmentPolicy.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadEquipmentInputs,loadFormationInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadEquipmentInputs(),...loadFormationInputs()},clone=x=>JSON.parse(JSON.stringify(x));
const basics=input.equipment.filter(e=>e.id.startsWith('basic_'));
const values={attackSpeedBonus:.2,physicalPower:20,spellPower:20,armor:20,mr:20,hp:300,manaPerSecond:3,lifesteal:.1};
assert.equal(basics.length,8);assert.deepEqual(basics.map(e=>Object.keys(values).find(k=>e[k]>0)).sort(),Object.keys(values).sort());
const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle({...input.battle,traits:[]});cfg.setEquipment(input.equipment);
const base={...input.units.find(u=>u.id==='saiph'),hp:1000,atk:100,armor:0,mr:0,atkSpeed:1,spellPower:0,physicalPower:0,lifesteal:0,critChance:0,
 skillId:undefined,maxMana:100,startMana:0,manaPerHit:0};
const simFor=equipment=>new BattleSim(cfg,[{cfg:base,equipment,side:0,x:2,y:2},{cfg:{...base,id:'dummy',hp:100000,atk:0,maxMana:0},side:1,x:3,y:2}],{seed:1025});
for(const item of basics){
 assert.equal(item.shopPrice,3);assert.equal(cfg.equipmentPrice(item.id,6),3);assert.equal(deps.equipmentPolicy.tiers[item.id],'basic');
 assert.ok(input.run.stageEncounters.basicEquipmentIds.includes(item.id));
 assert.equal(item.effectDescription,'');assert.equal(equipmentEffectText(item),'');
 assert.ok(item.introduction?.length>0&&item.introduction.length<=30,'basic items have concise display-only introductions');
 const key=Object.keys(values).find(k=>item[k]>0);assert.equal(item[key],values[key]);assert.equal(equipmentStatRows(item).length,1);
 for(const field of Object.keys(item))assert.ok(['id','name','shopPrice','spellPower','attackSpeedBonus','attackSpeedPerAttack','description','effectDescription','introduction','icon',key].includes(field),'only basic attributes and metadata are allowed');
 const sim=simFor([item.id]),u=sim.units[0];
 if(key==='attackSpeedBonus')assert.equal(u.attackSpeed,1.2);else if(key!=='lifesteal')assert.equal(u.cfg[key],(base[key]??0)+values[key]);
 if(key==='lifesteal')assert.equal(u.lifesteal,.1);
 const sprite=path.join(__dirname,'../assets/resources',item.icon.replace('/spriteFrame','.png')),png=fs.readFileSync(sprite),meta=JSON.parse(fs.readFileSync(sprite+'.meta'));
 assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);assert.equal(png[25],6);assert.equal(meta.userData.hasAlpha,true);
 assert.equal(deps.equipmentPolicy.enemy.itemTags[item.id].goldCost,3);
}
const bow=basics.find(e=>e.attackSpeedBonus>0),mana=basics.find(e=>e.manaPerSecond>0),blood=basics.find(e=>e.lifesteal>0);
assert.ok(Math.abs(simFor([bow.id,bow.id,bow.id]).units[0].attackSpeed-1.6)<1e-9,'three copies stack without an on-hit passive');
const regen=simFor([mana.id]);regen.units.forEach(u=>u.atkCd=u.moveCd=10000);for(let t=0;t<20;t++)regen.step();assert.ok(Math.abs(regen.units[0].mana-3)<1e-9,'real mana restoration is three per second');
const drain=simFor([blood.id]);drain.units[0].hp=500;drain.damage(drain.units[0],drain.units[1],100,'true');drain.resolveDamage();assert.equal(drain.units[0].hp,510,'actual damage restores ten percent health');
for(const shopPrice of [0,-1,NaN,1.5])assert.throws(()=>new ConfigManager().setEquipment([{...basics[0],shopPrice}]),/Invalid equipment shop price/);
validateEquipmentPolicy(deps.equipmentPolicy,input.equipment,deps.enemyPower);
const mismatch=clone(deps.equipmentPolicy);mismatch.enemy.itemTags[basics[0].id].goldCost=6;assert.throws(()=>validateEquipmentPolicy(mismatch,input.equipment,deps.enemyPower),/Invalid equipment policy/);
function make({equipment=input.equipment,run=input.run,policy=deps.equipmentPolicy,seed=17,save}={}){
 const c=new ConfigManager();c.setUnits(input.units);c.setSkills(input.skills);c.setBattle(input.battle);c.setEquipment(equipment);
 return new RunSession(c,run,input.waves,{...deps,equipmentPolicy:policy,stageCount:6,runSeed:seed,...(save?{save}:{})});
}
const seen=new Set();let purchases=0;
for(let seed=1;seed<=20;seed++){
 const s=make({seed});s.economy.add(100);
 const shop=s.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');assert.ok(s.debugJump(2,shop.round));
 for(const [index,offer] of s.pendingStageReward.offers.entries())if(offer.kind==='equipment'&&offer.id.startsWith('basic_')){
  seen.add(offer.id);assert.equal(offer.price,3);const before=s.economy.gold;
  assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'buy',index}).ok);
  assert.equal(s.economy.gold,before-3);assert.ok(s.owned.equipmentReserve.includes(offer.id));purchases++;
 }
 const restored=make({seed,save:s.snapshot()});assert.deepEqual(restored.pendingStageReward,s.pendingStageReward,'three-gold prices survive reload');
}
assert.equal(seen.size,8,'all eight basic items appear in actual special shops');assert.ok(purchases>0);
const oldItems=input.equipment.filter(e=>!e.id.startsWith('basic_')),oldPolicy=clone(deps.equipmentPolicy),oldRun=clone(input.run);
for(const e of basics){delete oldPolicy.tiers[e.id];delete oldPolicy.enemy.itemTags[e.id];}
oldRun.stageEncounters.basicEquipmentIds=oldRun.stageEncounters.basicEquipmentIds.filter(id=>!id.startsWith('basic_'));
const old=make({equipment:oldItems,run:oldRun,policy:oldPolicy});old.economy.add(10);const oldShop=old.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');old.debugJump(2,oldShop.round);
const saved=old.snapshot(),adopted=make({save:saved});assert.deepEqual(adopted.pendingStageReward,old.pendingStageReward,'old catalogue saves retain their pending purchases');
assert.equal(adopted.economy.gold,old.economy.gold);assert.equal(adopted.cfg.allEquipment().length,25);
console.log('PASS basic equipment: eight supplied icons, final stats, no passives, real stacking/mana/lifesteal, 3-gold purchase/reload, all shop entries, old-save adoption and matching enemy gold costs');
