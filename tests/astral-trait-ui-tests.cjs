const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {TraitPanel}=load(path.resolve(__dirname,'../assets/scripts/ui/TraitPanel.ts'));
const {resolveTraits}=load(path.resolve(__dirname,'../assets/scripts/battle/Traits.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const trait=battle.traits.find(t=>t.id==='astral'),state=resolveTraits([trait],[],roster)[0];
const panel=new TraitPanel(new Node('UI')),flush=()=>{while(pending.length)pending.shift()();};
const text=n=>[...n.components.values()].find(c=>c.string!==undefined)?.string??'';
panel.refresh([state],roster);assert.equal(panel.rows.children.length,0,'undeployed trait is hidden from live list');
const authored=resolveTraits([trait],['oris','blackstar_warlock'],roster)[0];
panel.refresh([authored],roster);assert.equal(panel.rows.children.length,1,'two authored members show their progress toward three');
assert.equal(authored.count,2);assert.equal(authored.active,null);assert.equal(authored.next,3);
const active=resolveTraits([trait],['oris','blackstar_warlock','star_armor_guard'],roster)[0];
panel.refresh([active],roster);assert.equal(active.count,3);assert.equal(active.active.count,3);assert.equal(active.next,5);
for(const tier of trait.breakpoints){
  panel.refresh([{...state,count:tier.count,active:tier}],roster);panel.showDetail(trait.id);flush();
  const card=panel.detail,rows=card.children.filter(n=>n.name==='astralBreakpoint');
  assert.equal(rows.length,4);assert.match(text(card.getChildByName('traitDescription')),/己方棋子.*星穹棋子获得双倍/);
  const size=card.getComponent(UITransform).contentSize;
  assert.ok(size.height<688,'card fits the game viewport');
  rows.forEach((row,i)=>{
    const copy=text(row.getChildByName('astralEffect')),e=trait.breakpoints[i].astral;
    assert.ok(copy.includes(`+${e.power}%`));assert.ok(copy.includes(`+${Math.round(e.maxHpBonus*100)}%`));
    const rich=[...row.getChildByName('astralEffect').components.values()].find(c=>c.string!==undefined);
    for(const key of ['attr_phys_bonus','attr_spell_bonus','stat_hp']){
      assert.ok(copy.includes(`<img src='${key}'`),'each astral bonus uses its attribute image');
      assert.ok(rich.imageAtlas.spriteFrames[key],'attribute image actually loaded');
    }
    assert.ok(Math.abs(row.position.y)+row.getComponent(UITransform).contentSize.height/2<size.height/2);
    if(i){const previous=rows[i-1];assert.equal(previous.position.y-previous.getComponent(UITransform).contentSize.height/2-row.position.y-row.getComponent(UITransform).contentSize.height/2,6);}
  });
  assert.match(text(rows[3].getChildByName('astralEffect')),/3000/);
  assert.match(text(rows[3].getChildByName('astralEffect')),/中心及周围1格/);
  card.children.find(n=>n.children.some(c=>text(c)==='×')).events.get('end')({});assert.equal(panel.detail,null,'close interaction works');
}
console.log('PASS astral UI: empty board hidden, authored 2/3 progress, colored tiers, 3000 full-area wording, fitted rows and close');
