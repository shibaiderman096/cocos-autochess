const assert=require('node:assert/strict');
const path=require('node:path');
const {load,Node,Label,Sprite,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const traits=require('../assets/resources/config/battle.json').traits;
const native=traits.find(trait=>trait.id==='native');
const roster=require('../assets/resources/config/units.json');
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();};
for(const count of [1,2,3,4,5,6,7]) {
  ui.refreshTraits(resolveTraits(traits,native.members.slice(0,count)),roster);flush();
  const row=ui.traitPanel.rows.getChildByName('trait_native');assert.ok(row?.active);
  assert.ok(row.children.some(node=>node.getComponent(Label)?.string==='原'));
  row.events.get('end')();flush();
  const card=ui.traitPanel.detail;
  assert.equal(card.getComponent(UITransform).contentSize.height,540);
  assert.equal(card.children.filter(node=>node.name.startsWith('traitOwner_')).length,7);
  const breakpoints=card.children.filter(node=>node.name==='traitBreakpoint');assert.equal(breakpoints.length,3);
  breakpoints.forEach((tier,index)=>{
    const text=tier.children.map(node=>node.getComponent(Label)?.string).filter(Boolean);
    const bonus=native.breakpoints[index].formation;
    for(const value of Object.values(bonus))assert.ok(text.includes(`+${Number((value*100).toFixed(2))}%`),'all four actual bonuses shown');
    assert.ok(text.includes('前排')&&text.includes('后排'));
    const icons=tier.children.filter(node=>node.name==='traitArt');assert.equal(icons.length,4);
    assert.deepEqual(icons.map(node=>node.getComponent(Sprite).spriteFrame.name),[
      'art/ui_m2/stat_hp/spriteFrame','art/ui_m2/attr_dmg_reduce/spriteFrame',
      'art/ui_m2/attr_aspd/spriteFrame','art/ui_m2/attr_dmg_amp/spriteFrame',
    ]);
  });
  for(const owner of card.children.filter(node=>node.name.startsWith('traitOwner_'))) {
    assert.ok(Math.abs(owner.position.y)+22<=270,'all seven portraits fit the card');
  }
  ui.traitPanel.hideDetail();
}
ui.refreshTraits(resolveTraits(traits,['archer','scout','guardian','duelist']),roster);flush();
assert.equal(ui.traitPanel.rows.children.length,2,'native and naruto coexist');
ui.traitPanel.rows.getChildByName('trait_native').events.get('end')();flush();
ui.refreshTraits(resolveTraits(traits,['scout']),roster);flush();
assert.equal(ui.traitPanel.detail,null,'last native leaving closes its detail');
assert.ok(!ui.traitPanel.rows.getChildByName('trait_native'));
console.log('PASS native trait UI: all activation states, four colored stat icons per tier, seven portraits, card bounds, coexistence and removal');
