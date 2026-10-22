const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();};
const richText=node=>[...node.components.values()].find(c=>c.string!==undefined);
const all=resolveTraits(battle.traits,roster.map(u=>u.id),roster);
ui.refreshTraits(all,roster);flush();
assert.equal(ui.traitPanel.rows.children.length,all.filter(s=>s.count>0).length,'all current factions/classes remain visible');
for(const row of ui.traitPanel.rows.children){const h=row.getComponent(UITransform).contentSize.height;assert.ok(-row.position.y+h/2<=ui.traitPanel.rows.getComponent(UITransform).contentSize.height);}
for(const id of ['conqueror','spellblade']) {
  const state=all.find(s=>s.config.id===id);
  for(const tier of state.config.breakpoints) {
    ui.refreshTraits([{...state,count:tier.count,active:tier}],roster);flush();
    ui.traitPanel.rows.getChildByName(`trait_${id}`).events.get('end')();flush();
    const card=ui.traitPanel.detail,rows=card.children.filter(n=>n.name==='traitBreakpoint');
    assert.ok(card.getComponent(UITransform).contentSize.height<610,'card follows text instead of a fixed 610px frame');
    assert.equal(rows.length,4);assert.equal(card.children.filter(n=>n.name.startsWith('traitOwner_')).length,state.memberIds.length);
    for(const row of rows){const rich=richText(row.getChildByName('warriorEffect'));assert.ok(rich.string&&!rich.string.includes('undefined'));}
    const last=richText(rows[3].getChildByName('warriorEffect')).string;
    if(id==='conqueror'){assert.match(last,/40%/);assert.match(last,/35%/);assert.match(last,/15%/);assert.match(last,/5秒/);}
    else {assert.match(last,/80/);assert.match(last,/75%/);assert.match(last,/25%/);assert.match(last,/70/);assert.match(last,/重置次数/);}
    ui.traitPanel.hideDetail();
  }
  ui.refreshTraits([state],roster);
  ui.traitPanel.rows.getChildByName(`trait_${id}`).events.get('end')();
  ui.traitPanel.hideDetail();flush();assert.equal(ui.traitPanel.detail,null,'late icon callbacks cannot rebuild closed cards');
}
console.log('PASS warrior trait UI: current list rows fit, current member portraits, all tiers, description values, colored rich text and async close');
