const assert = require('node:assert/strict'), path = require('node:path');
const { load, Node, Sprite, pending } = require('./helpers/ui-harness.cjs');
const source = file => load(path.resolve('assets/scripts', file));
const { ConfigManager } = source('core/ConfigManager.ts');
const { CollectionPanel } = source('ui/CollectionPanel.ts');
const { BattleUI } = source('ui/BattleUI.ts');
const { BattleStage } = source('view/BattleStage.ts');
const { buildUnitDetailData } = source('ui/UnitDetailPresentation.ts');
const { TraitPanel, TRAIT_PORTRAIT_FRAMES } = source('ui/TraitPanel.ts');
const { resolveTraits } = source('battle/Traits.ts');
const cfg = new ConfigManager();
cfg.setUnits(require('../assets/resources/config/units.json'));
cfg.setSkills(require('../assets/resources/config/skills.json'));
cfg.setBattle(require('../assets/resources/config/battle.json'));
cfg.setEquipment(require('../assets/resources/config/equipment.json'));
const flush = () => { while (pending.length) pending.shift()(); };
const collection = new CollectionPanel(new Node('Canvas'), cfg);
collection.show('units');
const backdrop = [...collection.root.components.values()].find(component => Array.isArray(component.points));
for (let i = 0; i < 2; i++) {
  collection.hide(); backdrop.clear(); collection.show('units');
  assert.equal(backdrop.points.length, 8, 'opening and reopening rebuild the native panel background');
}
let visited = 0;
for (const [index, entry] of collection.entries().entries()) {
  for (const star of [1, 2, 3]) {
    collection.page = Math.floor(index / 8); collection.selected = index; collection.star = star;
    collection.render(); flush();
    const host = collection.body.getChildByName('collectionDetail'), inspector = host.getComponent(BattleUI);
    assert.ok(inspector, 'collection embeds the actual game inspector');
    assert.equal(inspector.enabled, false, 'collection never runs the combat HUD update loop');
    assert.deepEqual(host.children.map(node => node.name).sort(), ['unitDetail', 'collectionStar_1', 'collectionStar_2', 'collectionStar_3'].sort());
    const unit = cfg.scaleUnit(cfg.getUnit(entry.id), star);
    let liveData;
    BattleStage.prototype.showDetail.call({ cfg, selectedDetail: null, ui: { showUnitDetail: data => liveData = data } },
      star, unit, cfg.battle.starScaling[star - 1].skill, 0, unit.hp, unit.startMana);
    assert.deepEqual(inspector.currentDetail, liveData, `${entry.id} ${star} star matches the live game`);
    assert.equal(inspector.unitTraits.string, liveData.traits.join(' · '));
    inspector.skillIconNode.events.get(Node.EventType.TOUCH_END)();
    assert.equal(inspector.detailPopup.active, true);
    assert.equal(inspector.detailPopupTitle.string, liveData.skillDisplayName);
    for (const [rowIndex, row] of liveData.skillStats.entries()) {
      const text = inspector.detailPopupStatLabels[rowIndex].current.string;
      if (row.currentRich) assert.equal(text, row.currentRich);
      else assert.ok(text.includes(row.current));
    }
    inspector.attackSpeedIconNode.events.get(Node.EventType.TOUCH_END)();
    assert.equal(inspector.detailPopupTitle.string, '攻速说明');
    assert.equal(inspector.detailPopupRows.active, false);
    visited++;
  }
}
// A star click rebuilds both vitals and skills, and stale texture callbacks stay on the old view.
collection.star = 1; collection.render();
const old = collection.body.getChildByName('collectionDetail').getComponent(BattleUI);
collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_3').events.get(Node.EventType.TOUCH_END)();
flush();
assert.equal(collection.star, 3);
assert.equal(old.unitPortrait.isValid, false);
assert.equal(collection.body.getChildByName('collectionDetail').getComponent(BattleUI).currentDetail.star, 3);
collection.show('equipment'); flush();
assert.equal(collection.body.getChildByName('collectionDetail').getComponent(BattleUI), undefined);
// Creator nulls component references when a scene is destroyed before texture completion.
collection.show('units');
const destroyedInspector=collection.body.getChildByName('collectionDetail').getComponent(BattleUI);
const artPaths=source('view/ArtPaths.ts');
artPaths.UNIT_PORTRAIT.portrait_teardown_probe='art/fx/moon_arrow_sheet/spriteFrame';
destroyedInspector.showUnitDetail({...destroyedInspector.currentDetail,artId:'portrait_teardown_probe'});
assert.ok(pending.some(cb=>cb.path==='art/fx/moon_arrow_sheet/spriteFrame'),'uncached portrait request is pending');
destroyedInspector.unitPortrait=null;
destroyedInspector.unitDetail=null;
assert.doesNotThrow(flush,'late portrait callbacks tolerate a destroyed inspector');
delete artPaths.UNIT_PORTRAIT.portrait_teardown_probe;
console.log(`PASS shared collection/game inspector: ${visited} unit/star pairs, all attributes/traits/skills, skill and speed clicks, star change, async teardown and category switch`);

const panel = new TraitPanel(new Node('Traits')), roster = cfg.allUnits();
const scrambled = roster.slice().sort((a, b) => (b.cost ?? 1) - (a.cost ?? 1));
const ids = scrambled.map(unit => unit.id), baseline = JSON.stringify(cfg.battle.traits);
for (const base of resolveTraits(cfg.battle.traits, [], roster)) {
  const state = { ...base, config: { ...base.config, pendingMembers: false, members: [...ids, ids[0], 'missing-test-member'] },
    memberIds: [ids[0]], count: 1 };
  const expected = scrambled.slice().sort((a, b) => (a.cost ?? 1) - (b.cost ?? 1));
  panel.inspectForCatalog(state, roster); flush();
  let portraits = panel.detail.children.filter(node => node.name.startsWith('traitOwner_'));
  assert.deepEqual(portraits.map(node => node.name.slice('traitOwner_'.length)), expected.map(unit => unit.id), `${base.config.id}: ascending costs and stable ties`);
  portraits.forEach((node, i) => assert.equal(node.getChildByName('portraitRarityFrame').getComponent(Sprite).spriteFrame.name,
    TRAIT_PORTRAIT_FRAMES[Math.min(5,expected[i].cost ?? 1) - 1]));
  panel.hideDetail();
  panel.refresh([state], roster); panel.showDetail(state.config.id); flush();
  portraits = panel.detail.children.filter(node => node.name.startsWith('traitOwner_'));
  assert.deepEqual(portraits.map(node => node.name), expected.map(unit => `traitOwner_${unit.id}`), `${base.config.id}: live and collection order match`);
  panel.hideDetail();
}
assert.equal(JSON.stringify(cfg.battle.traits), baseline, 'UI sorting preserves authored trait configuration');
console.log('PASS all trait renderers: mixed costs, stable ties, duplicates/missing IDs, live/catalogue parity and matching rarity frames');
const growthUI=new BattleUI();growthUI.node=new Node('GrowthUI');new Node('GrowthCanvas').addChild(growthUI.node);growthUI.init();
for(const entry of cfg.allUnits()){
  const data=buildUnitDetailData(cfg,cfg.scaleUnit(entry,3),3,{itemGrowth:{itemHealth:640,itemPhysicalPower:32,itemSpellPower:32}});
  growthUI.showUnitDetail(data);growthUI.skillIconNode.events.get(Node.EventType.TOUCH_END)();
  assert.equal(growthUI.detailPopupStatLabels.filter(row=>row.root.active).length,data.skillStats.length,entry.id+' renders all skill and consumable rows');
  for(const [index,row] of data.skillStats.entries())assert.equal(growthUI.detailPopupStatLabels[index].name.string,row.label+'：');
  growthUI.closeDetailPopup();
}
console.log('PASS permanent growth UI: all 39 units retain every skill row and all three item growth rows');
