require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {buildSkillStatRows,buildSkillDescription,skillParagraphs,skillBodyHeight,unitRoleLabel}=require('../assets/scripts/ui/SkillPresentation.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const rows=(id,star=1,bonuses={},rich=false)=>buildSkillStatRows(cfg,{...cfg.scaleUnit(cfg.getUnit(id),star),...bonuses},star,cfg.battle.starScaling[star-1].skill,rich);
assert.equal(rows('helion',1,{physicalPower:100,spellPower:250,damageAmp:1})[0].current,'360');
assert.equal(rows('helion',1,{spellPower:250})[0].current,'180');
for(const unit of cfg.allUnits())for(const star of [1,2,3]){
 const bonuses={physicalPower:50,spellPower:75,damageAmp:.2},scaled={...cfg.scaleUnit(unit,star),...bonuses},scale=cfg.battle.starScaling[star-1].skill;
 const plain=buildSkillDescription(cfg,scaled,star,scale),rich=buildSkillDescription(cfg,scaled,star,scale,true);
 assert.doesNotMatch(plain,/\{[^}]+\}|undefined|NaN|Infinity|标注来源/);
 assert.doesNotMatch(rich,/\{[^}]+\}|undefined|NaN|Infinity|标注来源/);
 assert.ok(skillBodyHeight(rich)>0);
 const display=rows(unit.id,star,bonuses,true),base=rows(unit.id,star);
 assert.equal(display.length,cfg.getSkill(unit.skillId).statRows.length);
 for(const [index,row] of display.entries()){
  assert.doesNotMatch(JSON.stringify(row),/NaN|undefined|Infinity/);
  assert.equal(row.stars,base[index].stars,'bonuses do not alter base-star column');
  if(['被动累计生命','本局累计法术加成','累计物理成长'].includes(row.label))assert.equal(row.stars,'本局累计');
  else assert.equal(row.stars.split(' / ').length,3);
  const text=row.currentRich.replace(/<img[^>]*\/>/g,'').replace(/<[^>]*>/g,'').replace(/（）/g,'');
  if(unit.id==='nightmare_lamplighter'&&row.label==='每秒伤害'){assert.match(text,/^\d+(?:\.\d+)?＋\d+(?:\.\d+)?$/);assert.ok(Math.abs(text.split('＋').reduce((n,v)=>n+Number(v),0)-Number(row.current))<=.5);}
  else if(unit.id==='nightmare_lamplighter'&&row.label==='最大生命系数')assert.equal(text,row.current+'最大生命值');
  else assert.equal(text,row.current,'body and table share current values');
 }
}
assert.equal(unitRoleLabel('caster','physical'),'物理术士');assert.equal(unitRoleLabel('tank','magic'),'魔法坦克');
assert.equal(skillParagraphs('第一段。第二段。\n第三段。'),'第一段。\n\n第二段。\n\n第三段。');
assert.ok(skillBodyHeight('长'.repeat(100))>skillBodyHeight('短说明'));
console.log(`PASS skill presentation: ${cfg.allUnits().length} units x 3 stars, descriptions, tables, current bonuses, base columns and shield scaling`);
