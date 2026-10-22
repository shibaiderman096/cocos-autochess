const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {TraitPanel}=load(path.join(__dirname,'../assets/scripts/ui/TraitPanel.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const trait=battle.traits.find(t=>t.id==='mechanical_pioneer'),state=resolveTraits([trait],[],roster)[0];
const panel=new TraitPanel(new Node('UI'));const flush=()=>{while(pending.length)pending.shift()();};
const text=n=>[...n.components.values()].find(c=>c.string!==undefined)?.string??'';
panel.refresh([state],roster);assert.equal(panel.rows.children.length,0);
for(const tier of trait.breakpoints){
 panel.refresh([{...state,count:tier.count,active:tier}],roster);panel.showDetail(trait.id);flush();
 const card=panel.detail,rows=card.children.filter(n=>n.name==='mechanicalBreakpoint');assert.equal(rows.length,3);
 assert.ok(card.getComponent(UITransform).contentSize.height<610,'height follows content');
 rows.forEach((row,i)=>{const copy=text(row.getChildByName('mechanicalEffect')),e=trait.breakpoints[i].mechanicalPioneer;
  assert.ok(copy.includes(`+${e.attackSpeedBonus*100}%`));assert.ok(copy.includes(`${e.regenPerSecond*100}%`));
  assert.match(copy,new RegExp(`${e.cooldownSeconds}秒`));
  assert.ok(Math.abs(row.position.y)+row.getComponent(UITransform).contentSize.height/2<305);
 });
 assert.match(text(rows[1].getChildByName('mechanicalEffect')),/每场首次低于.*50%/);
 assert.ok(card.getChildByName('traitOwner_bao_zero'));panel.hideDetail();assert.equal(panel.detail,null);
}
console.log('PASS mechanical UI: pending hidden, three configured colored tiers, timing, half-health wording, bounded rows and close');
