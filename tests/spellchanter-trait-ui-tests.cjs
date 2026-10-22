const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();},text=n=>[...n.components.values()].find(c=>c.string!==undefined);
const states=resolveTraits(battle.traits,roster.map(u=>u.id),roster),state=states.find(s=>s.config.id==='spellchanter');
ui.refreshTraits(states,roster);flush();assert.equal(ui.traitPanel.rows.children.length,12);
for(const row of ui.traitPanel.rows.children)assert.ok(-row.position.y+row.getComponent(UITransform).contentSize.height/2<=ui.traitPanel.rows.getComponent(UITransform).contentSize.height);
for(const tier of state.config.breakpoints) {
  ui.refreshTraits([{...state,count:tier.count,active:tier}],roster);flush();
  ui.traitPanel.rows.getChildByName('trait_spellchanter').events.get('end')();flush();
  const card=ui.traitPanel.detail,rows=card.children.filter(n=>n.name==='traitBreakpoint');
  assert.ok(card.getComponent(UITransform).contentSize.height<430,'content-fit card removes fixed padding');assert.equal(rows.length,4);
  assert.equal(card.children.filter(n=>n.name.startsWith('traitOwner_')).length,5);
  rows.forEach((row,i)=>{const content=text(row.getChildByName('spellchanterEffect'));const e=state.config.breakpoints[i].spellchanter;
    assert.ok(content.string.includes(`+${e.spellPower}%`)&&content.string.includes(`+${e.manaOnTakedown}`));assert.ok(content.imageAtlas.spriteFrames.attr_spell_bonus);});
  const copy=card.children.map(n=>text(n)?.string??'').join('\n');assert.doesNotMatch(copy,/近5秒|解除后补回/,'auxiliary footer hints removed');
  ui.traitPanel.hideDetail();
}
console.log('PASS spellchanter UI: fitted list, member portraits, exact tier descriptions and icons, auxiliary footer hints removed');
