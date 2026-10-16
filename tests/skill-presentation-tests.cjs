require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {buildSkillStatRows,skillParagraphs,skillBodyHeight}=require('../assets/scripts/ui/SkillPresentation.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
function rows(id,star=1,bonuses={}) {return buildSkillStatRows(cfg,{...cfg.scaleUnit(cfg.getUnit(id),star),...bonuses},star,cfg.battle.starScaling[star-1].skill);}
assert.deepEqual(rows('archer',2,{physicalPower:100,damageAmp:.2})[0],{label:'伤害',current:'540',stars:'150 / 225 / 350',tone:'physical'});
assert.equal(rows('guardian',1,{spellPower:100,damageAmp:1})[0].current,'320','shield excludes damage amplification');
assert.equal(rows('shaman',1,{spellPower:100,damageAmp:1})[0].current,'360','healing excludes damage amplification');
assert.equal(rows('sorcerer',1,{spellPower:100,damageAmp:.2})[1].current,'3.6%');
assert.equal(rows('sorcerer')[1].stars,'1.5% / 1.5% / 1.5%');
assert.equal(rows('enderman')[1].stars,'+50% / +100% / +400%','attack speed is absolute attacks per second');
assert.equal(rows('iron_golem')[1].stars,'30% / 40% / 60%');
assert.equal(rows('itachi')[1].stars,'0.5秒 / 1秒 / 3秒');
for(const u of cfg.allUnits())for(const star of [1,2,3])for(const row of rows(u.id,star)) {
 assert.ok(!JSON.stringify(row).match(/NaN|undefined|Infinity/));
 assert.equal(row.stars.split(' / ').length,3);
}
assert.equal(skillParagraphs('第一段。第二段。\n第三段。'),'第一段。\n\n第二段。\n\n第三段。');
assert.ok(skillBodyHeight('长'.repeat(100))>skillBodyHeight('短说明'));
console.log('PASS skill presentation: current equipment bonuses, base ranks, damage/healing/shield distinctions, secondary stats, additive speed, all units/stars and paragraphs');

const {buildSkillDescription,unitRoleLabel}=require('../assets/scripts/ui/SkillPresentation.ts');
assert.equal(unitRoleLabel('caster','physical'),'物理术士');
assert.equal(unitRoleLabel('marksman','magic'),'魔法射手');
assert.equal(unitRoleLabel('tank','magic'),'魔法坦克');
for(const u of cfg.allUnits())for(const star of [1,2,3]) {
 const unit={...cfg.scaleUnit(u,star),physicalPower:50,spellPower:75,damageAmp:.2};
 const scale=cfg.battle.starScaling[star-1].skill;
 const plain=buildSkillDescription(cfg,unit,star,scale),rich=buildSkillDescription(cfg,unit,star,scale,true);
 assert.doesNotMatch(plain,/\{[^}]+\}|undefined|NaN|Infinity/);
 assert.doesNotMatch(rich,/\{[^}]+\}|undefined|NaN|Infinity/);
 assert.doesNotMatch(plain,/标注来源|\d+%?\/\d+%?\/\d+/);
 assert.doesNotMatch(plain.split('\n')[0],/回蓝锁定|刷新灼烧|本场战斗永久|受法术加成/);
 assert.doesNotMatch(rich,/标注来源/);
 assert.ok(skillBodyHeight(rich)>0);
}
const hybrid={...cfg.scaleUnit(cfg.getUnit('young_sasuke'),2),physicalPower:100,spellPower:50,damageAmp:.2};
assert.match(buildSkillDescription(cfg,hybrid,2,1.8),/342点魔法伤害/);
assert.equal(buildSkillDescription(cfg,hybrid,2,1.8),'对当前目标造成342点魔法伤害。');
assert.deepEqual(rows('young_sasuke',2,{physicalPower:100,spellPower:50,damageAmp:.2}).slice(1),[
 {label:'基础物理伤害',current:'30',stars:'20 / 30 / 50',tone:'physical'},
 {label:'基础魔法伤害',current:'150',stars:'100 / 150 / 250',tone:'magic'},
]);
const dual=buildSkillDescription(cfg,hybrid,2,1.8,true);
assert.match(dual,/src='attr_phys_bonus'/);assert.match(dual,/src='attr_spell_bonus'/);
const burn={...cfg.getUnit('sorcerer'),spellPower:100,damageAmp:.2};
assert.match(buildSkillDescription(cfg,burn,1,1),/336点魔法伤害[\s\S]*3.6%的魔法伤害/);
const healing={...cfg.getUnit('sakura'),hp:2000,spellPower:999,damageAmp:1};
assert.match(buildSkillDescription(cfg,healing,3,3.24),/300点生命值/);
assert.match(buildSkillDescription(cfg,cfg.getUnit('enderman'),3,3.24),/400%攻击速度/);
for(const u of cfg.allUnits())for(const star of [1,2,3]) {
 const unit={...cfg.scaleUnit(u,star),physicalPower:50,spellPower:75,damageAmp:.2};
 const display=buildSkillStatRows(cfg,unit,star,cfg.battle.starScaling[star-1].skill,true);
 const skill=cfg.getSkill(u.skillId);
 assert.equal(display.length,skill.statRows.length);
 for(const [i,row] of display.entries()) {
  const text=row.currentRich.replace(/<img[^>]*\/>/g,'').replace(/<[^>]*>/g,'').replace(/（）/g,'');
  assert.equal(text,row.current,'body and table use the same live values');
  assert.equal(row.stars.replace(/\s*\/\s*/g,'/').replace(/\+/g,'').replace(/秒\//g,'/'),skill.statRows[i].stars,'metadata base ranks match the real formula');
 }
}
assert.equal((buildSkillStatRows(cfg,hybrid,2,1.8,true)[0].currentRich.match(/<img /g)||[]).length,2);
assert.equal(rows('young_sasuke',2,{physicalPower:100})[0].stars,rows('young_sasuke',2)[0].stars,'equipment does not alter the right base column');
console.log('PASS unit design presentation: 16 units x 3 stars, current bonuses, body/table consistency, split hybrid icons, base ranks, healing and role labels');
