const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,Label,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {TraitPanel}=load(path.join(__dirname,'../assets/scripts/ui/TraitPanel.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const shadow=require('../assets/resources/config/battle.json').traits.find(t=>t.id==='shadow');
const roster=require('../assets/resources/config/units.json');
const flush=()=>{while(pending.length)pending.shift()();};
const parent=new Node('UI'),panel=new TraitPanel(parent);
panel.refresh(resolveTraits([{...shadow,members:[],pendingMembers:true}],roster.map(u=>u.id)),roster);assert.equal(panel.rows.children.length,0);
const trait={...shadow,pendingMembers:false};
const textOf=node=>[...node.components.values()].map(component=>component.string??'').join(' ').replace(/<[^>]*>/g,'');
for(const n of [3,5,7,10]) {
  panel.refresh(resolveTraits([trait],trait.members.slice(0,n)),roster);flush();
  panel.rows.getChildByName('trait_shadow').events.get('end')();flush();
  const card=panel.detail,rows=card.children.filter(node=>node.name==='traitBreakpoint');
  assert.equal(rows.length,4);assert.equal(card.children.filter(node=>node.name.startsWith('traitOwner_')).length,10);
  const texts=rows.map(row=>row.children.map(textOf).join(' '));
  assert.ok(texts[0].includes('30%')&&texts[0].includes('护甲和')&&texts[0].includes('魔抗'));
  assert.ok(texts[1].includes('+30%物理加成')&&texts[1].includes('+30%法术加成'));
  assert.ok(texts[2].includes('每秒 −2%，最多 −20%'));
  assert.ok(texts[3].includes('全体友军每秒 +20%攻速（最多 +200%）'));
  assert.ok(texts[3].includes('暗影笼罩整个棋盘，侵蚀所有敌军'));
  assert.ok(texts[3].includes('被侵蚀的敌军每0.5秒受到 100真实伤害'));
  assert.equal(textOf(card.getChildByName('shadowStackingNote')).trim(),'各效果累加');
  assert.ok(card.getChildByName('shadowStackingNote').position.y>card.getChildByName('shadowDescription').position.y);
  assert.ok(!card.children.map(textOf).join(' ').includes('暗影英雄'));
  assert.ok(card.children.map(textOf).join(' ').includes('侵蚀持续至战斗结束'));
  for(const row of rows) {
    const effect=[...row.getChildByName('shadowEffect').components.values()].find(component=>component.imageAtlas);
    const icons=[...effect.string.matchAll(/<img src='([^']+)'/g)].map(match=>match[1]);
    assert.ok(icons.length>0&&icons.every(key=>effect.imageAtlas.spriteFrames[key]),'inline effect icons load');
    assert.ok([...effect.string.matchAll(/<img[^>]*>/g)].every(match=>match[0].includes('width=16 height=16 align=center offset=4')),'icons share the text baseline');
    assert.equal(effect.handleTouchEvent,false,'copy does not block card interaction');
    assert.doesNotMatch(effect.string,/保留前档|保留破甲/);
    assert.ok((effect.string.match(/<br\/>/g)?.length??0)+1<=3);
  }
  for(const portrait of card.children.filter(node=>node.name.startsWith('traitOwner_'))) {
    const size=portrait.getComponent(UITransform).contentSize;
    assert.ok(Math.abs(portrait.position.y)+size.height/2<=card.getComponent(UITransform).contentSize.height/2,'10 formal portraits remain inside card');
  }
  const firstPortrait=card.children.find(node=>node.name.startsWith('traitOwner_'));
  const bottom=rows[3].position.y-rows[3].getComponent(UITransform).contentSize.height/2;
  assert.equal(bottom-(firstPortrait.position.y+22),12,'portraits sit immediately below the effects');
  panel.hideDetail();
}
// Closing before asynchronous image completion must leave the next card untouched.
panel.rows.getChildByName('trait_shadow').events.get('end')();panel.hideDetail();flush();assert.equal(panel.detail,null);
console.log('PASS shadow UI: exact icon-rich tier copy, cumulative header, async close safety, 10 fitted portraits directly below effects');
