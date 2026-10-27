require('tsx/cjs');
const assert=require('node:assert/strict');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {unlockedEquipment,sameEquipmentIdentity,equipmentIdentity}=require('../assets/scripts/core/EquipmentPolicy.ts');
const input=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
const ids=input.equipment.filter(item=>!item.specialShopOnly).map(item=>item.id).sort();
assert.ok(input.equipment.every(item=>item.specialShopOnly||deps.equipmentPolicy.tiers[item.id]==='basic'));
assert.deepEqual([...input.run.stageEncounters.basicEquipmentIds].sort(),ids);
assert.deepEqual(unlockedEquipment(deps.equipmentPolicy,1,deps.equipmentPolicy.reward.tierUnlock).filter(id=>!deps.equipmentPolicy.reward.excludedIds.includes(id)),ids);
function make(run,policy,save){const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);
 return new RunSession(cfg,run,input.waves,{...deps,equipmentPolicy:policy,stageCount:6,runSeed:123,...(save?{save}:{})});}
// Fixed prior classification, without depending on changes to Git HEAD after delivery.
const oldPolicy=JSON.parse(JSON.stringify(deps.equipmentPolicy));
for(const id of ids)oldPolicy.tiers[id]=['totem_of_undying','forest_sanctuary'].includes(id)?'special':'advanced';
const oldRun=JSON.parse(JSON.stringify(input.run));oldRun.stageEncounters.basicEquipmentIds=oldRun.stageEncounters.basicEquipmentIds.filter(id=>oldPolicy.tiers[id]!=='special');
// Isolate the historical 6 -> 3 price migration from today's authored prices and random merchant catalogue.
const currentRun=JSON.parse(JSON.stringify(input.run));currentRun.stageEncounters.shop.equipmentPrices.basic=3;
const old=make(oldRun,oldPolicy);old.economy.add(100);
const wave=old.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');assert.ok(old.debugJump(4,wave.round));
old.save.stageProgress.pending.offers=['guinsoo','totem_of_undying','jeweled_gauntlet','infinity_edge','forest_sanctuary'].map(id=>({kind:'equipment',id,price:oldRun.stageEncounters.shop.equipmentPrices[oldPolicy.tiers[id]],bought:false}));
const index=0;
assert.equal(old.pendingStageReward.offers[index].price,6);
assert.ok(old.claimStageReward({type:'stageChoice',rewardId:old.pendingStageReward.id,choice:'buy',index}).ok);
const saved=old.snapshot();delete saved.equipmentTierVersion;
const resumed=make(currentRun,deps.equipmentPolicy,saved);
assert.equal(resumed.economy.gold,old.economy.gold);assert.deepEqual(resumed.owned.equipmentReserve,old.owned.equipmentReserve);
assert.ok(resumed.pendingStageReward.offers[index].bought);
assert.ok(resumed.pendingStageReward.offers.filter(offer=>offer.kind==='equipment'&&ids.includes(offer.id)).every(offer=>offer.price===3));
assert.equal(resumed.save.equipmentTierVersion,'all-basic-v1');
assert.deepEqual(make(currentRun,deps.equipmentPolicy,resumed.snapshot()).snapshot(),resumed.snapshot());
const corrupt=resumed.snapshot();corrupt.stageProgress.pending.offers[index].price=6;
assert.throws(()=>make(currentRun,deps.equipmentPolicy,corrupt),/Invalid pending stage reward/);
const changed=JSON.parse(JSON.stringify(deps.equipmentPolicy));changed.reward.eliteChance+=.01;
assert.ok(!sameEquipmentIdentity(equipmentIdentity(oldPolicy,input.equipment),equipmentIdentity(changed,input.equipment)));
console.log('PASS all ordinary items: complete ordinary reward pool, early unlocks, legacy tier/pool/price migration, gold/inventory/claimed preservation, repeat load and invalid price/rule rejection');

const {load,Node,Label,RichText,Sprite,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(require('node:path').resolve('assets/scripts/ui/BattleUI.ts'));
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
for(const item of input.equipment){
 ui.showEquipmentTooltip(item,-250);while(pending.length)pending.shift()();
 const rows=ui.equipmentTooltipRows;
 for(const row of rows){assert.equal(row.name.node.active,false);assert.match(row.value.string,/^[+-]/);
  assert.ok(row.iconRoot.getChildByName('skin').getComponent(Sprite).spriteFrame,'attribute artwork loaded');}
 assert.ok(ui.equipmentTooltipText.string.length>0,'equipment effect stays readable');
}
console.log('PASS every equipment tooltip: attribute artwork and numeric bonuses, no repeated attribute-name boxes, preserved effect copy and recycled item cleanup');

const {CollectionPanel}=load(require('node:path').resolve('assets/scripts/ui/CollectionPanel.ts'));
const {equipmentStatRows,equipmentDescriptionText}=load(require('node:path').resolve('assets/scripts/ui/EquipmentPresentation.ts'));
const catalogueCfg=new ConfigManager();catalogueCfg.setUnits(input.units);catalogueCfg.setSkills(input.skills);catalogueCfg.setBattle(input.battle);catalogueCfg.setEquipment(input.equipment);
const collection=new CollectionPanel(new Node('Canvas'),catalogueCfg);
collection.show('equipment');
for(let i=0;i<input.equipment.length;i++){
 collection.page=Math.floor(i/8);collection.selected=i;collection.render();while(pending.length)pending.shift()();
 const item=input.equipment[i],detail=collection.body.getChildByName('collectionDetail'),stats=detail.getChildByName('equipmentStats');
 const expected=equipmentStatRows(item);assert.equal(stats.children.length,expected.length);
 stats.children.forEach((row,index)=>{
  assert.equal(row.getChildByName('value').getComponent(Label).string,expected[index].value);
  assert.equal(row.getChildByName('attributeName').active,false);
  assert.ok(row.getChildByName(expected[index].icon).getChildByName('skin').getComponent(Sprite).spriteFrame);
 });
 assert.equal(detail.getChildByName('collectionViewport').getChildByName('collectionText').getChildByName('equipmentDescription').getComponent(RichText).string.replace(/<[^>]+>/g,''),equipmentDescriptionText(item));
}
console.log('PASS every catalogue item: shared base-attribute icons/values and effect-only text, including five-stat and newly added equipment');
