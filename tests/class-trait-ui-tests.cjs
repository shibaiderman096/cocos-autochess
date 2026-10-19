const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,Label,Sprite,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const traits=require('../assets/resources/config/battle.json').traits,roster=require('../assets/resources/config/units.json');
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();};
const all=resolveTraits(traits,roster.map(unit=>unit.id),roster);
ui.refreshTraits(all,roster);flush();
const visible=all.filter(state=>state.count>0);
assert.equal(ui.traitPanel.rows.children.length,visible.length);
for(const row of ui.traitPanel.rows.children) {
  const height=row.getComponent(UITransform).contentSize.height;
  assert.ok(Math.abs(row.position.y)+height/2<=195,'seven compact rows fit their panel');
  assert.equal(row.children.find(node=>node.name==='traitArt').getComponent(UITransform).contentSize.width,34);
}
for(const state of visible.filter(state=>state.config.selector)) {
  ui.traitPanel.rows.getChildByName(`trait_${state.config.id}`).events.get('end')();flush();
  const card=ui.traitPanel.detail,rows=card.children.filter(n=>n.name==='traitBreakpoint');
  assert.equal(rows.length,4);
  assert.equal(card.children.filter(n=>n.name.startsWith('traitOwner_')).length,state.config.members.length);
  for(const row of rows) {
    assert.ok(row.children.filter(n=>n.name==='traitArt').every(n=>n.getComponent(Sprite).spriteFrame),'each bonus has a loaded icon');
    assert.ok(!row.children.some(n=>n.getComponent(Label)?.string?.includes('undefined')));
  }
  ui.traitPanel.hideDetail();
}
const heavy=all.find(s=>s.config.id==='armored_tank');
for(const tier of heavy.config.breakpoints) {
  ui.refreshTraits([{...heavy,count:tier.count,active:tier}],roster);flush();
  ui.traitPanel.rows.getChildByName('trait_armored_tank').events.get('end')();flush();
  assert.ok(ui.traitPanel.detail.children.some(n=>n.getComponent(Label)?.string.includes({bronze:'黄铜',silver:'白银',gold:'黄金',prismatic:'棱彩'}[tier.tier])));
  ui.traitPanel.hideDetail();
}
ui.refreshTraits(all,roster);flush();ui.traitPanel.rows.getChildByName('trait_assassin').events.get('end')();flush();
const assassinRows=ui.traitPanel.detail.children.filter(n=>n.name==='traitBreakpoint');
assert.ok(assassinRows[0].children.some(n=>n.getComponent(Label)?.string==='<8%'));
assert.ok(assassinRows[3].children.some(n=>n.getComponent(Label)?.string==='+60%'));
console.log('PASS class trait UI: all fitted rows, automatic member portraits, all five details, icons, four tier colors and execute thresholds');
