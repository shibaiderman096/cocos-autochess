const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,Node,Label,RichText,Sprite,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {UnitView}=load(path.join(__dirname,'../assets/scripts/view/UnitView.ts'));
const {Unit}=load(path.join(__dirname,'../assets/scripts/battle/Unit.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const {combatEquipmentIdentity,sameCombatConfigurationIdentity,stableEnemyJson}=load(path.join(__dirname,'../assets/scripts/core/EnemyGenerationTypes.ts'));
const {equipmentIdentity,sameEquipmentIdentity}=load(path.join(__dirname,'../assets/scripts/core/EquipmentPolicy.ts'));
const before=require('../art-source/original-equipment/equipment-before.json');
const items=require('../assets/resources/config/equipment.json');
const roster=require('../assets/resources/config/units.json'),battle=require('../assets/resources/config/battle.json');
assert.deepEqual(combatEquipmentIdentity(items.filter(item=>before.some(old=>old.id===item.id))),combatEquipmentIdentity(before),'existing mechanical fields are preserved; new authored equipment extends the catalogue');
for(const item of items) {
  const png=fs.readFileSync(path.join(__dirname,'../assets/resources',item.icon.replace('/spriteFrame','.png')));
  assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);
  assert.equal(png.readUInt8(25),6,'equipment PNG uses RGBA');
}
const oldIdentity=stableEnemyJson({skills:{},equipment:before}),currentIdentity=stableEnemyJson({skills:{},equipment:items});
assert.ok(sameCombatConfigurationIdentity(oldIdentity,currentIdentity));
const oldPolicy=stableEnemyJson({policy:{},roles:null,items:before.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)});
assert.ok(sameEquipmentIdentity(oldPolicy,equipmentIdentity({},items)));
const changed=JSON.parse(JSON.stringify(items));changed[0].attackSpeedPerAttack+=.01;
assert.ok(!sameEquipmentIdentity(oldPolicy,equipmentIdentity({},changed)));
assert.ok(!sameCombatConfigurationIdentity(oldIdentity,stableEnemyJson({skills:{},equipment:changed})));
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();};
const rgb=c=>[c.r,c.g,c.b];
for(const item of items){
 const expected=[[163,177,169],[89,203,176],[86,167,226],[181,127,230],[204,174,109]][item.quality-1];
 ui.showEquipmentDetail(item);flush();assert.deepEqual(rgb(ui.equipmentDetail.getChildByName('equipmentDetailName').getComponent(Label).color),expected,'detail names share equipment quality colors');
 if(item.introduction){
  const content=ui.equipmentDetail.getChildByName('equipmentDetailViewport').getChildByName('equipmentDetailContent');
  assert.equal(content.getChildByName('equipmentDetailEffect').getComponent(RichText).string.replace(/<img[^>]*\/>/g,'').replace(/<[^>]+>/g,''),item.introduction,'basic items show their introduction without inventing a passive');
 }
 ui.showEquipment([item],false,0);ui.equipmentSlots[0].node.events.get('enter')();flush();
 assert.deepEqual(rgb(ui.equipmentTooltipTitle.color),expected,'backpack/equipped tooltip names use the same colors');
}
const overdrive=items.find(i=>i.id==='spell_overdrive_armor');
assert.equal(overdrive.castAttackSpeed.bonus,.5);
assert.ok(items.filter(i=>!i.id.startsWith('basic_')&&!i.specialShopOnly&&!i.consumable).every(i=>i.quality===2),'all completed equipment is green');
assert.deepEqual(items.filter(i=>i.specialShopOnly&&i.consumable?.kind!=='permanentStat').map(i=>i.quality),[5,1,3,5,5],'special items use authored quality, including orange firmament replicator');
for(const stat of ['hp','physicalPower','spellPower']) assert.deepEqual(items.filter(i=>i.consumable?.kind==='permanentStat'&&i.consumable.stat===stat).map(i=>i.quality),[1,2,3,4],'permanent boosts progress through white, green, blue and purple');
ui.showEquipmentTooltip(items.find(i=>i.id==='totem_of_undying'),0);
ui.showEquipmentTooltip(overdrive,0);flush();
assert.match(ui.equipmentTooltipText.string,/<img src='attr_aspd'/);
assert.match(ui.equipmentTooltipText.string,/<b>\+?50%<\/b>/);
assert.doesNotMatch(ui.equipmentTooltipText.string,/150%|命核/,'late asset callbacks cannot restore the previous hover');
const rich=ui.equipmentTooltipText;
assert.equal(ui.equipmentTooltip.getComponent(UITransform).contentSize.height,130+36+rich.node.getComponent(UITransform).contentSize.height,'tooltip follows final icon wrapping height');
ui.hideEquipmentDetail();ui.hideEquipmentTooltip();
const changedCopy=items.map(item=>({...item,introduction:'新的展示简介'}));
assert.deepEqual(combatEquipmentIdentity(changedCopy),combatEquipmentIdentity(items),'introductions never change combat/save identity');
const base={name:'卫士',star:1,cost:1,artId:'helion',side:0,hp:700,maxHp:700,mana:0,maxMana:50,atk:40,armor:40,mr:40,atkSpeed:1,range:1,skillName:'技能',skillDescription:''};
const traits=resolveTraits(battle.traits,[],roster).filter(s=>s.config.members.includes('helion')).map(s=>s.config.name);
ui.showUnitDetail({...base,traits});
assert.equal(ui.unitTraits.string,traits.join(' · '));assert.ok(traits.includes('日辉')&&traits.includes('重甲坦克'),'inactive and reserve memberships appear');
assert.ok(ui.unitTraits.node.position.y>90);
ui.showUnitDetail({...base,name:'野怪',traits:[]});assert.equal(ui.unitTraits.string,'','membership clears when selection changes');
ui.showEquipment([items[0],items[3],items[0]],true,12);flush();
for(const slot of ui.equipmentSlots) {
  assert.deepEqual(slot.icon.node.getComponent(UITransform).contentSize,{width:64,height:64});
  assert.ok(slot.icon.spriteFrame);assert.equal(slot.icon.sizeMode,Sprite.SizeMode.CUSTOM);
}
assert.equal(ui.equipmentSlots[0].stacks.string,'12');assert.ok(ui.equipmentSlots[0].stacks.node.parent.active);
assert.equal(ui.equipmentSlots[1].stacks.node.parent.active,false);assert.equal(ui.equipmentSlots[2].stacks.string,'12');
let removed=-1;ui.onEquipment=index=>removed=index;ui.equipmentSlots[1].node.events.get('end')();assert.equal(removed,1);
ui.equipmentSlots[0].node.events.get('enter')();flush();assert.ok(ui.equipmentTooltip.active);assert.equal(ui.equipmentTooltipTitle.string,items[0].name);
ui.showEquipment([items[0]],false,0);assert.equal(ui.equipmentSlots[0].stacks.string,'0');
removed=-1;ui.equipmentSlots[0].node.events.get('end')();assert.equal(removed,-1,'battle equipment is locked');
ui.showEquipment([],true,0);assert.ok(ui.equipmentSlots.every(s=>!s.stacks.node.parent.active&&!s.icon.node.active));
const root=ui.unitPanel.getChildByName('equipment');
assert.ok(!root.children.some(n=>n.getComponent(Label)?.string),'no equipment heading or hint copy');
const view=new UnitView();view.node=new Node('unit');view.setup('helion',0,1,64);view.setEquipment([items[0],items[3]]);flush();
const counter=view.equipmentStackLabels[0].node;
assert.ok(!Array.from(counter.components.keys()).some(type=>type.name==='Graphics'),'stack label has no competing Graphics renderer or opaque backing over the equipment art');
assert.ok(Array.from(counter.components.keys()).some(type=>type.name==='LabelOutline'),'stack digits retain a readable outline without hiding the icon');
const unit=new Unit(1,0,{...roster.find(u=>u.id==='helion')},0,0);unit.equipmentAttackStacks=17;
view.sync(unit.snapshot(),64);assert.equal(view.equipmentStackLabels[0].string,'17');
unit.equipmentAttackStacks=0;view.sync(unit.snapshot(),64);assert.equal(view.equipmentStackLabels[0].string,'0');
view.setEquipment([items[3]]);assert.equal(view.equipmentStackLabels.length,0);
const forged=items.find(item=>item.id==='thousand_forged_armor');
ui.showEquipment([items[0],forged],false,7,30);flush();
assert.equal(ui.equipmentSlots[0].stacks.string,'7');assert.equal(ui.equipmentSlots[1].stacks.string,'30');assert.ok(ui.equipmentSlots[1].stacks.node.parent.active);
view.setEquipment([forged,items[0]]);flush();unit.equipment=[forged,items[0]];unit.equipmentAttackStacks=7;unit.equipmentDamageStacks=30;
view.sync(unit.snapshot(),64);assert.deepEqual(view.equipmentStackLabels.map(l=>l.string),['30','7'],'board counters follow their own equipment slot');
console.log('PASS equipment presentation: existing configuration fields, all 128px RGBA assets, fixed detail slots, memberships, per-item stacks/reset, tooltip, unload/lock, and legacy identity checks');
