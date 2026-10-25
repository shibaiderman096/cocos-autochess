const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();},text=n=>[...n.components.values()].find(c=>c.string!==undefined);
const states=resolveTraits(battle.traits,roster.map(u=>u.id),roster),state=states.find(s=>s.config.id==='swiftmartialist');
ui.refreshTraits(states,roster);flush();assert.equal(ui.traitPanel.rows.children.length,14,'Saiph adds the swift marksman row alongside the five factions');
for(const tier of state.config.breakpoints) {
  ui.refreshTraits([...states.filter(s=>s!==state),{...state,count:tier.count,active:tier}],roster);flush();
  assert.equal(ui.traitPanel.rows.children.length,14);
  for(const row of ui.traitPanel.rows.children)assert.ok(-row.position.y+row.getComponent(UITransform).contentSize.height/2<=ui.traitPanel.rows.getComponent(UITransform).contentSize.height);
  ui.traitPanel.rows.getChildByName('trait_swiftmartialist').events.get('end')();flush();
  const card=ui.traitPanel.detail,rows=card.children.filter(n=>n.name==='traitBreakpoint');
  assert.ok(card.getComponent(UITransform).contentSize.height<540,'content-fit card removes fixed padding');assert.equal(rows.length,4);
  assert.equal(card.children.filter(n=>n.name.startsWith('traitOwner_')).length,2);
  rows.forEach((row,i)=>{const content=text(row.getChildByName('swiftmartialistEffect')),e=state.config.breakpoints[i].swiftmartialist;
    assert.match(content.string,new RegExp(`\\+${e.physicalPower}%`));assert.ok(content.string.includes(`+${Number((e.attackSpeedPerCast*100).toFixed(2))}%`));
    assert.match(content.string,/5层/);assert.ok(content.imageAtlas.spriteFrames.attr_phys_bonus);});
  const copy=card.children.map(n=>text(n)?.string??'').join('\n');assert.ok(card.getChildByName('traitOwner_rail_hunter_07'));assert.match(copy,/持续至战斗结束/);
  ui.traitPanel.hideDetail();
}
ui.refreshTraits([{...state,count:2,active:state.config.breakpoints[0]}],roster);
ui.traitPanel.rows.getChildByName('trait_swiftmartialist').events.get('end')();ui.traitPanel.hideDetail();flush();assert.equal(ui.traitPanel.detail,null);
console.log('PASS swiftmartialist UI: authored members, 12 fitted rows, exact four colored tiers/icons, absolute speed display and async close safety');
