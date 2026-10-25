const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {TraitPanel}=load(path.join(__dirname,'../assets/scripts/ui/TraitPanel.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const {ConfigManager}=load(path.join(__dirname,'../assets/scripts/core/ConfigManager.ts'));
const {buildUnitDetailData}=load(path.join(__dirname,'../assets/scripts/ui/UnitDetailPresentation.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const trait=battle.traits.find(t=>t.id==='bloodfiend'),state=resolveTraits([trait],[],roster)[0];
const panel=new TraitPanel(new Node('UI'));const flush=()=>{while(pending.length)pending.shift()();};
const text=n=>[...n.components.values()].find(c=>c.string!==undefined)?.string??'';
panel.refresh([state],roster);assert.equal(panel.rows.children.length,0,'pending trait does not clutter battle sidebar');
for(const tier of [null,...trait.breakpoints]) {
  panel.inspectForCatalog({...state,count:tier?.count??0,active:tier},roster);flush();
  const card=panel.detail,rows=card.children.filter(n=>n.name==='traitBreakpoint');assert.equal(rows.length,3);
  const intro=[...card.getChildByName('traitDescription').components.values()].find(c=>c.imageAtlas);
  for(const key of ['attr_lifesteal','attr_aspd','stat_hp','blood_shield'])assert.ok(intro.imageAtlas.spriteFrames[key],key+' loaded into shared atlas');
  assert.match(text(card.getChildByName('traitDescription')),/10%全能吸血/);
  rows.forEach((row,i)=>{
    const copy=text(row.getChildByName('bloodfiendEffect')),e=trait.breakpoints[i].bloodfiend;
    assert.ok(copy.includes(`+${Number((e.attackSpeedBonus*100).toFixed(2))}%`));
    assert.ok(copy.includes(`${e.healMaxHpFraction*100}%`));assert.match(copy,/4秒/);
    const bounds=row.getComponent(UITransform).contentSize;
    assert.ok(Math.abs(row.position.y)+bounds.height/2<card.getComponent(UITransform).contentSize.height/2);
    assert.match(copy,/<img src='attr_aspd'/);assert.match(copy,/<img src='stat_hp'/);
    if(i===2){assert.match(copy.replace(/<[^>]+>/g,''),/溢出治疗.*100%.*转为护盾/);assert.match(copy,/<img src='blood_shield'/);}
    if(!tier || tier.count<trait.breakpoints[i].count)assert.doesNotMatch(copy,/#f2d04b|#7bf59a/);
  });
  panel.hideDetail();
}
panel.inspectForCatalog(state,roster);panel.hideDetail();flush();assert.equal(panel.detail,null,'late callbacks do not reopen closed panel');
const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[{...trait,members:['test'],pendingMembers:false}]});
const unit={...roster[0],id:'test',skillId:undefined};cfg.setUnits([unit]);
assert.equal(buildUnitDetailData(cfg,cfg.scaleUnit(unit),1).lifesteal,.1,'catalogue shows the passive below activation');
console.log('PASS bloodfiend UI: catalogue, empty roster, tiers/grey state, bounded layout, async close and innate detail');
