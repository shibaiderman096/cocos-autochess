require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {buildUnitDetailData}=require('../assets/scripts/ui/UnitDetailPresentation.ts');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs(),deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const clone=x=>JSON.parse(JSON.stringify(x));
function make(save,_unused=false,seed=10627){
 const cfg=new ConfigManager(),units=clone(input.units),skills=clone(input.skills),policy=clone(deps.equipmentPolicy),equipment=clone(input.equipment);
 cfg.setUnits(units);cfg.setSkills(skills);cfg.setBattle(input.battle);cfg.setEquipment(equipment);
 const s=new RunSession(cfg,input.run,input.waves,{...deps,equipmentPolicy:policy,stageCount:6,runSeed:save?.runSeed??seed,enemyGenerationMode:'budget-v1',...(save?{save}:{})});if(s.pendingOpeningEncounter)s.chooseOpeningEncounter('inspiration');return s;
}
function merchant(s){const w=s.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');assert.ok(s.debugJump(4,w.round));s.economy.gold=10000;}
const radiant=input.equipment.filter(e=>e.radiantBaseId);assert.equal(radiant.length,16);
const boosts=['hp','armor','mr','physicalPower','spellPower','attackSpeedBonus','attackSpeedPerAttack','physicalPowerPerAttack','manaPerSecond','maxManaBonus','castMaxManaDamage','critChance','lifesteal','maxHpBonus','magicDamageReduction'];
const nested={lowHealthProtection:['shieldMaxHpFraction','healMaxHpFraction'],spellPowerDamageAmp:['bonus','cap'],missingHpLifesteal:['bonus'],armorDamageReduction:['bonus'],lowTargetDamageAmp:['bonus'],lowHealthRegen:['maxHpFraction'],maxHpResistance:['bonus'],castAttackSpeed:['bonus'],healthStance:['attackSpeedBonus','armor'],damageTakenStacks:['resistancePerStack','maxStackDamageReduction']};
for(const e of radiant){const b=input.equipment.find(b=>b.id===e.radiantBaseId);assert.equal(e.quality,4);assert.equal(e.shopPrice,(b.shopPrice??6)+18);assert.ok(e.chestDrop&&e.specialShopOnly);assert.equal(deps.equipmentPolicy.enemy.itemTags[e.id].enabled,false);
 for(const key of boosts)if(b[key]!==undefined)assert.ok(Math.abs(e[key]-b[key]*2)<1e-8,`${e.id}.${key}`);
 for(const [key,fields]of Object.entries(nested))if(b[key])for(const [sub,value]of Object.entries(b[key]))assert.ok(Math.abs(e[key][sub]-value*(fields.includes(sub)?2:1))<1e-8,`${e.id}.${key}.${sub}`);
 const s=make();merchant(s);s.owned.equipmentReserve.push(b.id,b.id);assert.ok(s.enhanceEquipment(0,b.id).ok);assert.equal(s.economy.gold,9982);assert.deepEqual(s.owned.equipmentReserve.slice(-2),[e.id,b.id]);assert.equal(s.canForge(e.id),false);
 const snap=JSON.stringify(s.snapshot());assert.equal(s.enhanceEquipment(0,e.id).ok,false);assert.equal(JSON.stringify(s.snapshot()),snap);
 const owned=s.owned.all()[0];assert.ok(s.equipItem(owned.uid,0).ok);const loaded=make(s.snapshot());assert.equal(loaded.owned.get(owned.uid).equipment[0],e.id);assert.ok(loaded.unequipItem(owned.uid,0).ok);assert.equal(loaded.equipmentRecycleGold(loaded.owned.equipmentReserve.indexOf(e.id)),12);
}
{
 const s=make();s.owned.equipmentReserve.push('guinsoo');const snap=JSON.stringify(s.snapshot());assert.equal(s.enhanceEquipment(0,'guinsoo').ok,false);assert.equal(JSON.stringify(s.snapshot()),snap);merchant(s);s.economy.gold=17;const poor=JSON.stringify(s.snapshot());assert.equal(s.enhanceEquipment(0,'guinsoo').error,'not_enough_gold');assert.equal(JSON.stringify(s.snapshot()),poor);s.economy.gold=18;assert.ok(s.enhanceEquipment(0,'guinsoo').ok);assert.equal(s.economy.gold,0);
 for(const id of ['trait_emblem','expedition_command_crown','stat_boost_spell_medium','replicator_firmament'])assert.equal(s.canForge(id),false);
}
const base={id:'test',name:'test',hp:10000,atk:100,armor:0,mr:0,atkSpeed:1,range:10,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
{
 const cfg=new ConfigManager();cfg.setEquipment(input.equipment);
 const sim=new BattleSim(cfg,[{cfg:base,side:0,x:1,y:2,equipment:['radiant_blazing_feather']},{cfg:{...base,hp:1000000,atk:0},side:1,x:2,y:2}],{seed:17,maxTicks:400});
 const u=sim.units[0];assert.equal(u.cfg.physicalPower,20);assert.equal(u.attackSpeed,1.2);u.atkCd=0;sim.step();assert.equal(u.cfg.physicalPower,24);assert.equal(sim.events.find(e=>e.t==='hit'&&e.source===u.id).dmg,124,'doubled on-hit stacks affect real combat');
 cfg.setSkills({pulse:{id:'pulse',power:0,radius:0,dmgType:'true'}});
 const cast=new BattleSim(cfg,[{cfg:{...base,atk:0,maxMana:50,startMana:50,skillId:'pulse'},side:0,x:1,y:2,equipment:['radiant_arcane_overflow_codex']},{cfg:{...base,hp:100000,atk:0},side:1,x:2,y:2}],{seed:17,maxTicks:400});cast.step();assert.equal(cast.units[0].cfg.maxMana,30);assert.equal(cast.events.find(e=>e.t==='hit'&&e.source===1&&e.dmgType==='magic').dmg,180,'30 mana x 500% x 120% AP');
}
{
 const cfg=make().cfg,detail=buildUnitDetailData(cfg,cfg.getUnit('crimson_demon_knight'),1);assert.deepEqual(detail.skillStats.map(r=>r.label),['生命提升','强化伤害']);assert.match(detail.skillDescription,/10%/);assert.match(detail.skillDescription,/100%/);assert.match(detail.skillDescription,/1\.5/);
 const alchemist=buildUnitDetailData(cfg,{...cfg.getUnit('wayward_alchemist'),spellPower:100},1);assert.deepEqual(alchemist.skillStats.map(r=>r.label),['每层每次伤害']);assert.equal(alchemist.skillStats[0].current,'100');assert.equal(alchemist.maxMana,30);assert.equal(detail.maxMana,50);
}
{

}
let chest=false,shop=false;
for(let seed=1;seed<=48&&(!chest||!shop);seed++){
 const s=make(undefined,false,seed),grant=s.stageProgression.grantExplorerReward(100,1,0,1000);chest ||=grant.equipmentIds.some(id=>id.startsWith('radiant_'));
 const value=grant.units.reduce((v,u)=>v+s.cfg.getUnit(u.unitId).cost*3**(u.star-1)*u.star,0)+grant.equipmentIds.reduce((v,id)=>v+s.cfg.equipmentPrice(id,input.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[id]]),0)+grant.health*2+grant.gold;assert.equal(value,100);
 merchant(s);shop ||=s.pendingStageReward.offers.some(o=>o.kind==='equipment'&&o.id.startsWith('radiant_'));
}
assert.ok(chest&&shop,'radiant gear is drawn from real mixed chests and travelling shops');
console.log('PASS radiant: 16 items, doubled benefits/preserved trigger rules, 18-gold once-only conversion, 24 value, equip/save/recycle, combat procs, fixed-row UI, reward pools');
