const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {TraitPanel}=load(path.resolve('assets/scripts/ui/TraitPanel.ts'));
const {resolveTraits}=load(path.resolve('assets/scripts/battle/Traits.ts'));
const {ConfigManager}=load(path.resolve('assets/scripts/core/ConfigManager.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const trait=battle.traits.find(t=>t.id==='explorer'),state=resolveTraits([trait],[],roster)[0];
const panel=new TraitPanel(new Node('UI')),flush=()=>{while(pending.length)pending.shift()();};
const text=n=>[...n.components.values()].find(c=>c.string!==undefined)?.string??'';
panel.refresh([state],roster);assert.equal(panel.rows.children.length,0,'unassigned explorer does not clutter the active sidebar');
for(const tier of [null,...trait.breakpoints]){
 panel.inspectForCatalog({...state,count:tier?.count??0,active:tier},roster);flush();
 const card=panel.detail,rows=card.children.filter(n=>n.name==='traitBreakpoint');assert.equal(rows.length,4);
 assert.match(text(card.getChildByName('traitDescription')),/向上取整.*开箱后清零/);
 rows.forEach((row,n)=>{const e=trait.breakpoints[n].explorer,copy=text(row.getChildByName('explorerEffect')).replace(/<[^>]+>/g,'');
  assert.match(copy,new RegExp(`战斗结束 \\+${e.pointsPerBattle} 探险值`));assert.ok(copy.includes(`击杀 +${e.pointsPerKill}`));assert.ok(copy.includes(`×${e.lossMultiplier}`));
  const bounds=row.getComponent(UITransform).contentSize;assert.ok(Math.abs(row.position.y)+bounds.height/2<card.getComponent(UITransform).contentSize.height/2);
 });
 panel.hideDetail();
}
panel.inspectForCatalog(state,roster);panel.hideDetail();flush();assert.equal(panel.detail,null);
for(const bad of [{pointsPerBattle:-1},{pointsPerKill:.5},{lossMultiplier:0},{rewardValuePerPoint:NaN}]){
 const cfg=new ConfigManager(),t={...trait,breakpoints:[{...trait.breakpoints[0],explorer:{...trait.breakpoints[0].explorer,...bad}}]};
 assert.throws(()=>cfg.setBattle({...battle,traits:[t]}),/explorer trait/);
}
console.log('PASS explorer UI: pending catalogue, four exact tiers, rounding/reset copy, bounded cards, async close and invalid-rule rejection');
