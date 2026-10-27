import { ConfigManager, hybridSpellDamage, configuredSkillDamage, channelHealAmount, configuredShieldAmount, hydraulicBulwarkValues, UnitConfigData, SkillConfigData } from '../core/ConfigManager';

export interface SkillStatRow {
  label: string;
  current: string;
  currentRich?: string;
  stars: string;
  tone: 'physical' | 'magic' | 'true' | 'healing' | 'shield' | 'speed' | 'neutral';
}

const number = (v: number) => String(Number(v.toFixed(2)));

/** Presentation only: current equipment/wave stats versus unequipped, unscaled base ranks. */
export function buildSkillStatRows(configs: ConfigManager, unit: UnitConfigData, star: number, skillScale: number, rich = false, passiveHealth = 0, passiveSpellPower = 0, passivePhysicalPower = 0): SkillStatRow[] {
  if (!unit.skillId) return [];
  const skill = configs.getSkill(unit.skillId);
  const base = configs.getUnit(unit.id);
  const ranks = [1, 2, 3].map(rank => configs.scaleUnit(base, rank));
  const rows: SkillStatRow[] = [];
  const add = (label: string, value: (u: UnitConfigData, rank: number, scale: number) => string, tone: SkillStatRow['tone']) => {
    rows.push({ label, current: value(unit, star - 1, skillScale),
      stars: ranks.map((u, i) => value(u, i, configs.battle.starScaling[i].skill)).join(' / '), tone });
  };
  const power = (u: UnitConfigData) => 1 + (skill.dmgType === 'physical' ? u.physicalPower ?? 0 : skill.dmgType === 'magic' ? u.spellPower ?? 0 : 0) / 100;
  const shadow = skill.shadow;
  const sunlight = skill.sunlight;
  if (skill.ropeHunt) {
    add('单发伤害',(u,i)=>String(Math.round(skill.starDamage![i]*power(u)*(1+(u.damageAmp??0)))),'physical');
    add('射击次数',()=>String(skill.ropeHunt!.shotCount),'neutral');
    add('回旋持续',()=>`${number(skill.ropeHunt!.durationSeconds)}秒`,'neutral');
    add('射击间隔',()=>`${number(skill.ropeHunt!.intervalSeconds)}秒`,'neutral');
    add('施法前摇',()=>`${number(skill.castSeconds!)}秒`,'neutral');
  } else if (skill.sandCompass) {
    add('友军护盾',(u,i)=>String(configuredShieldAmount(u,skill,i+1)),'shield');
    add('沙浪伤害',(u,i)=>String(Math.round(skill.starDamage![i]*power(u)*(1+(u.damageAmp??0)))),'physical');
    add('护盾持续',()=>`${number(skill.sandCompass!.shieldSeconds)}秒`,'neutral');
    add('作用半径',()=>`${number(skill.radius)}格`,'neutral');
    add('施法前摇',()=>`${number(skill.castSeconds!)}秒`,'neutral');
  } else if(skill.corrosion){
    add('每层每次伤害',(u,i)=>number(skill.corrosion!.damagePerPulse[i]*(1+(u.spellPower??0)/100)*(1+(u.damageAmp??0))),'magic');
    add('每层持续',()=>`${number(skill.corrosion!.durationSeconds)}秒`,'neutral');
    add('伤害间隔',()=>`${number(skill.corrosion!.intervalSeconds)}秒`,'neutral');
    add('施法前摇',()=>`${number(skill.castSeconds!)}秒`,'neutral');
  } else if(skill.effect==='windHunt'){
    add('强化攻速',(_u,i)=>`${number(skill.windHunt!.attackSpeedBonuses[i]*100)}%`,'speed');
    add('强化持续',()=>`${number(skill.windHunt!.durationSeconds)}秒`,'neutral');
    add('击杀物理成长',(_u,i)=>`${number(skill.windHunt!.physicalPowerPerKill[i])}%`,'physical');
    add('施法前摇',()=>`${number(skill.castSeconds!)}秒`,'neutral');
    rows.push({label:'累计物理成长',current:`${number(passivePhysicalPower)}%`,stars:'本局累计',tone:'physical'});
  } else if(skill.effect==='lanternGuard'){
    add('最多降低攻速',()=>`${number(skill.lanternGuard!.maxAttackSpeedPenalty*100)}%`,'speed');
    add('最多获得护甲',(u,i)=>number(skill.lanternGuard!.maxArmorBonuses[i]*(1+(u.spellPower??0)/100)),'shield');
    add('每点护甲转化',(_u,i)=>`${number(skill.lanternGuard!.physicalPowerPerArmor[i])}%`,'physical');
  } else if(skill.effect==='inspiration'){
    add('初始攻速',(u,i)=>`+${number(skill.inspiration!.attackSpeedBonuses[i]*(1+(u.spellPower??0)/100)*100)}%`,'speed');
    add('持续时间',()=>`${number(skill.inspiration!.durationSeconds)}秒`,'neutral');
  } else if (sunlight) {
    const hit = (label: string, values = skill.starDamage!, type = skill.dmgType, multiplier = 1) => add(label, (u, i) => String(Math.round(values[i]
      * (1 + (type === 'physical' ? u.physicalPower ?? 0 : type === 'magic' ? u.spellPower ?? 0 : 0) / 100) * (1 + (u.damageAmp ?? 0)) * multiplier)), type);
    const shield = (label = '护盾', values = skill.shieldAmounts!, multiplier = 1) => add(label, (u, i) => String(configuredShieldAmount(u, skill, i + 1, values) * multiplier), 'shield');
    const heal = (values: number[]) => add('治疗', (u, i) => String(Math.round(values[i] * (1 + (u.spellPower ?? 0) / 100))), 'healing');
    switch (sunlight.kind) {
      case 'bulwark': shield(); hit('爆炸伤害'); break;
      case 'arrows': hit('前两箭单箭伤害'); hit('第三箭伤害', sunlight.finalDamage); hit('贯穿伤害', sunlight.finalDamage, skill.dmgType, sunlight.pierceMultiplier); break;
      case 'bastion': shield('自身护盾'); shield('友军护盾', sunlight.allyShields); heal(sunlight.heals); break;
      case 'hunt': hit('每段伤害'); hit('三段总伤害', skill.starDamage, skill.dmgType, sunlight.hits); break;
      case 'cleave': hit('伤害'); shield('单目标护盾'); shield('最高护盾', skill.shieldAmounts, sunlight.shieldTargetCap); break;
      case 'empower': hit('附加魔法伤害'); hit('爆炸伤害', sunlight.burstDamage); break;
      case 'crossbow': hit('首目标伤害'); hit('最低贯穿伤害', skill.starDamage, skill.dmgType, sunlight.minimum); break;
      case 'prayer': shield(); heal(sunlight.heals); hit('伤害'); break;
      case 'judgment': add('审判目标', (_u, i) => i + 1 >= sunlight.allEnemiesStar ? '全部' : String(sunlight.counts[i]), 'neutral'); hit('魔法伤害'); hit('真实伤害', sunlight.trueDamage, 'true'); break;
      case 'transit': add('连击次数', (_u, i) => String(sunlight.counts[i]), 'neutral'); hit('普通段伤害'); hit('最后一击伤害', sunlight.finalDamage); break;
    }
  } else if (shadow) {
    const damage = (u: UnitConfigData, i: number, values = skill.starDamage!, multiplier = 1) => String(Math.round(values[i] * power(u) * (1 + (u.damageAmp ?? 0)) * multiplier));
    const hit = (label: string, values = skill.starDamage!, multiplier = 1) => add(label, (u, i) => damage(u, i, values, multiplier), skill.dmgType);
    switch (shadow.kind) {
      case 'bulwark':
        add('护盾', (u, i) => String(configuredShieldAmount(u, skill, i + 1)), 'shield');
        add('双抗提升', (_u, i) => number(shadow.resistanceBonuses[i]), 'shield'); hit('震击伤害'); break;
      case 'piercing': hit('首目标伤害'); hit('后续目标伤害', shadow.secondaryDamage); break;
      case 'domain':
        add('自身护盾', (u, i) => String(configuredShieldAmount(u, skill, i + 1)), 'shield');
        add('友军护盾', (u, i) => String(configuredShieldAmount(u, skill, i + 1, shadow.allyShieldAmounts)), 'shield');
        add('攻速降低', (_u, i) => `${number(shadow.slowAmounts[i] * 100)}%`, 'speed'); break;
      case 'soulLamp':
        add('每秒伤害', (u, i) => String(Math.round((skill.starDamage![i] * power(u) + u.hp * shadow.maxHpFractions[i]) * (1 + (u.damageAmp ?? 0)))), 'magic');
        rows[rows.length - 1].stars = skill.starDamage!.join(' / ');
        add('最大生命系数', (_u, i) => `${number(shadow.maxHpFractions[i] * 100)}%`, 'healing');
        add('参与击杀永久生命', (_u, i) => number(shadow.takedownHealth[i]), 'healing');
        rows.push({ label: '被动累计生命', current: number(passiveHealth), stars: '本局累计', tone: 'healing' });
        add('持续时间', () => `${number(shadow.durationSeconds)}秒`, 'neutral'); break;
      case 'flurry': hit('每段伤害'); add('三段总伤害', (u, i) => String(Number(damage(u, i)) * shadow.hits), skill.dmgType); add('法力回复', () => number(shadow.refundMana), 'neutral'); break;
      case 'cleave': hit('基础伤害'); hit('最高伤害', skill.starDamage, 1 + shadow.missingHpBonusCap); break;
      case 'empower':
        hit('附加魔法伤害'); hit('爆炸伤害', shadow.burstDamage);
        add('攻击速度', (_u, i) => `+${number(skill.attackSpeedBonuses![i] * 100)}%`, 'speed'); break;
      case 'execute': hit('基础伤害'); hit('处决伤害', skill.starDamage, shadow.damageMultiplier); break;
      case 'lanterns': hit('单盏伤害'); hit('重复命中伤害', skill.starDamage, shadow.repeatMultiplier);
        add('恐惧时间', (_u, i) => `${number(shadow.fearSeconds[i])}秒`, 'neutral'); break;
      case 'blackstars':
        add('黑星数量', (_u, i) => number(shadow.counts[i]), 'neutral'); hit('每颗伤害');
        hit('重复命中伤害', skill.starDamage, shadow.repeatMultiplier); hit('坍缩伤害', shadow.collapseDamage); break;
      case 'void':
        add('跃迁次数', (_u, i) => number(shadow.counts[i]), 'neutral'); hit('每次跃迁伤害'); hit('虚痕爆炸伤害', shadow.markDamage); break;
    }
  } else if (skill.effect === 'gravity') {
    const pulses=Math.floor(skill.gravity!.durationSeconds/skill.gravity!.intervalSeconds+1e-9);
    const hit=(u:UnitConfigData,i:number)=>Math.round(skill.starDamage![i]*power(u)*(1+(u.damageAmp??0)));
    add('每次伤害',(u,i)=>String(hit(u,i)),'magic');
    add('完整伤害',(u,i)=>String(hit(u,i)*pulses),'magic');
    add('每名敌人双抗',(_u,i)=>String(skill.gravity!.resistancePerEnemy[i]),'neutral');
    add('持续时间',()=>`${number(skill.gravity!.durationSeconds)}秒`,'neutral');
  } else if (skill.effect === 'nebula') {
    const pulses=Math.floor(skill.nebula!.durationSeconds/skill.nebula!.intervalSeconds+1e-9);
    const hit=(u: UnitConfigData,i:number)=>Math.round(skill.starDamage![i]*power(u)*(1+(u.damageAmp??0)));
    add('每次伤害',(u,i)=>String(hit(u,i)),'magic');
    add('完整伤害',(u,i)=>String(hit(u,i)*pulses),'magic');
    add('攻速降低',()=>`${number(skill.nebula!.attackSpeedPenalty*100)}%`,'speed');
    add('持续时间',()=>`${number(skill.nebula!.durationSeconds)}秒`,'neutral');
  } else if (skill.effect === 'arrowVolley') {
    const hit = (u: UnitConfigData, i: number) => Math.round(skill.starDamage![i] * power(u) * (1 + (u.damageAmp ?? 0)));
    add('每箭伤害', (u, i) => String(hit(u, i)), 'physical');
    add('三段总伤害', (u, i) => String(hit(u, i) * skill.arrowVolley!.count), 'physical');
  } else if (skill.effect === 'hydraulicBulwark') {
    add('双抗提升', (u, i) => number(hydraulicBulwarkValues(u, skill, i + 1).resistanceBonus), 'physical');
    add('结束治疗', (u, i) => number(hydraulicBulwarkValues(u, skill, i + 1).healAmount), 'healing');
    add('持续时间', () => `${number(skill.hydraulicBulwark!.durationSeconds)}秒`, 'neutral');
  } else if (skill.effect === 'susanoo') {
    add('持续时间', (u, i) => `${number(skill.formDurations![i] * (1 + (u.physicalPower ?? 0) / 100))}秒`, 'neutral');
    add('伤害减免', (_u, i) => `${number(skill.formReductions![i] * 100)}%`, 'shield');
    add('额外伤害', (u, i) => String(Math.round(skill.formBonusDamage![i] * (1 + (u.physicalPower ?? 0) / 100) * (1 + (u.damageAmp ?? 0)))), 'physical');
  } else if (skill.effect === 'selfShield') {
    add('护盾', (u, i) => String(configuredShieldAmount(u, skill, i + 1)), 'shield');
  } else if (skill.effect === 'atlasMissiles') {
    add('导弹伤害',(u,i)=>String(Math.round(skill.starDamage![i]*power(u)*(1+(u.damageAmp??0)))),'physical');
    add('目标数量',(_u,i)=>String(skill.atlasMissiles!.targetCounts[i]),'neutral');
    add('每次蓝条降低',()=>String(skill.atlasMissiles!.manaReductionPerCast),'neutral');
    add('最多降低',()=>String(skill.atlasMissiles!.maxManaReduction),'neutral');
  } else if (skill.effect === 'stellarBulwark') {
    add('护盾',(u,i)=>String(configuredShieldAmount(u,skill,i+1)),'shield');
    add('护盾持续',()=>`${number(skill.stellarBulwark!.shieldSeconds)}秒`,'neutral');
    add('冲刺距离',()=>`${skill.stellarBulwark!.distance}格`,'neutral');
    add('击飞时间',()=>`${number(skill.stellarBulwark!.knockupSeconds)}秒`,'neutral');
  } else if (skill.effect === 'furnaceDash') {
    add('目标伤害', (u,i) => String(Math.round(skill.starDamage![i] * power(u) * (1+(u.damageAmp??0)))), 'magic');
    add('沿途伤害', (u,i) => String(Math.round(skill.furnaceDash!.trailDamage[i] * power(u) * (1+(u.damageAmp??0)))), 'magic');
    add('击飞时间', () => `${number(skill.furnaceDash!.knockupSeconds)}秒`, 'neutral');
  } else if (skill.effect === 'lineFear') {
    add('伤害', (u,i) => String(Math.round(skill.starDamage![i] * power(u) * (1 + (u.damageAmp ?? 0)))), 'magic');
    add('恐惧时间', (_u,i) => `${number(skill.lineFear!.fearSeconds[i])}秒`, 'neutral');
    add('怒吼距离', () => `${number(skill.lineFear!.length)}格`, 'neutral');
    add('蓄力时间', () => `${number(skill.castSeconds!)}秒`, 'neutral');
  } else if (skill.effect === 'bloodReign') {
    add('生命提升',(_u,i)=>number(skill.bloodReign!.healthGains[i]),'healing');
    add('强化伤害',(u,i)=>String(Math.round(skill.starDamage![i]*(1+(u.physicalPower??0)/100)*(1+(u.damageAmp??0)))),'physical');
    add('触发生命',()=>`${number(skill.bloodReign!.rebirthThreshold*100)}%`,'healing');
    add('恢复比例',()=>`${number(skill.bloodReign!.rebirthHealMaxHpFraction*100)}%`,'healing');
    add('恢复时间',()=>`${number(skill.bloodReign!.rebirthSeconds)}秒`,'neutral');
    add('斩击距离',()=>`${number(skill.bloodReign!.length)}格`,'neutral');
  } else if (skill.effect === 'bloodAid') {
    add('治疗',(u,i)=>String(Math.round(skill.bloodAid!.healAmounts[i]*(1+(u.spellPower??0)/100))),'healing');
    add('双抗提升',(_u,i)=>number(skill.bloodAid!.resistanceBonuses[i]),'shield');
    add('普攻附伤',(u,i)=>String(Math.round(skill.bloodAid!.attackBonusDamage[i]*(1+(u.spellPower??0)/100)*(1+(u.damageAmp??0)))),'magic');
    add('停留时间',()=>`${number(skill.bloodAid!.staySeconds)}秒`,'neutral');
    add('双抗持续',()=>`${number(skill.bloodAid!.resistanceSeconds)}秒`,'neutral');
  } else if (skill.effect === 'bloodDrain') {
    add('伤害', (u,i) => String(Math.round(skill.starDamage![i] * power(u) * (1 + (u.damageAmp ?? 0)))), 'magic');
    add('治疗', (u,i) => String(Math.round(skill.bloodDrain!.healAmounts[i] * (1 + (u.spellPower ?? 0) / 100))), 'healing');
    add('击杀法术加成', (_u,i) => number(skill.bloodDrain!.spellPowerPerKill[i]), 'magic');
    rows.push({ label: '本局累计法术加成', current: number(passiveSpellPower), stars: '本局累计', tone: 'magic' });
  } else if (skill.effect === 'strikeHealOnKill') {
    add('伤害', (u, i) => String(Math.round(configuredSkillDamage(skill, i + 1) * power(u) * (1 + (u.damageAmp ?? 0)))), 'physical');
    add('击杀治疗', (u, i) => String(Math.round(skill.healAmounts![i] * (1 + (u.spellPower ?? 0) / 100))), 'healing');
  } else if (skill.effect === 'lowestHealthHeal') {
    add('单目标治疗', (u, i) => String(Math.round(skill.healAmounts![i] * (1 + (u.spellPower ?? 0) / 100))), 'healing');
    add('治疗目标', (_u, i) => String(skill.healTargetCounts![i]), 'neutral');
  } else if (skill.effect === 'healAlly') {
    add('治疗', (u, i) => String(Math.round(skill.healAmounts![i] * (1 + (u.spellPower ?? 0) / 100))), 'healing');
  } else if (skill.effect === 'healChannel') {
    add('每次治疗', (u, i) => String(channelHealAmount(u, skill, i + 1)), 'healing');
    add('生命比例', (_u, i) => `${number(skill.heal!.maxHpFractions[i] * 100)}%`, 'healing');
    if (skill.heal!.bonusAmounts) add('额外治疗', (u, i) => number(skill.heal!.bonusAmounts![i] * (1 + (u.spellPower ?? 0) / 100)), 'healing');
  } else {
    add(skill.effect === 'spiderLeap' ? '基础伤害' : skill.effect === 'splitPhysical' ? '平摊总伤害' : skill.effect === 'teleportEmpower' ? '强化普攻' : '伤害', (u, i, scale) => {
      if (skill.effect === 'hybridSpell') return String(Math.round(hybridSpellDamage(u, skill, i + 1) * (1 + (u.damageAmp ?? 0))));
      const raw = configuredSkillDamage(skill, i + 1, scale);
      return String(Math.round(raw * power(u) * (1 + (u.damageAmp ?? 0))));
    }, skill.dmgType);
  }
  if (skill.effect === 'starLeap') add('位移距离',()=>`${skill.starLeap!.distance}格`,'neutral');
  if (skill.hybrid) {
    add('基础物理伤害', (_u, i) => number(skill.hybrid!.physicalDamage[i]), 'physical');
    add('基础魔法伤害', (_u, i) => number(skill.hybrid!.magicDamage[i]), 'magic');
  }
  if (skill.attackSpeedBonuses && !shadow) add('攻击速度', (_u, i) => `+${number(skill.attackSpeedBonuses![i] * 100)}%`, 'speed');
  if (skill.stunSeconds) add('眩晕时间', (_u, i) => `${number(skill.stunSeconds![i])}秒`, 'neutral');
  if (skill.chargedKnockup) {
    add('击飞时间', (_u,i) => `${number(skill.chargedKnockup!.durationsSeconds[i])}秒`, 'neutral');
    add('蓄力时间', () => `${number(skill.castSeconds!)}秒`, 'neutral');
  }
  if (skill.effect === 'railShot') add('蓄力时间', () => `${number(skill.castSeconds!)}秒`, 'neutral');
  if (skill.effect === 'spiderLeap') {
    add('已损失生命伤害', (_u, i) => `${number(skill.spiderLeap!.missingHealthFractions[i] * 100)}%`, 'physical');
    add('蓄力时间', () => `${number(skill.castSeconds!)}秒`, 'neutral');
  }
  if (skill.guard) {
    add('伤害减免', (_u, i) => `${number(skill.guard!.reductions[i] * 100)}%`, 'shield');
    add('减免持续', (_u, i) => `${number(skill.guard!.durations[i])}秒`, 'neutral');
  }
  if (skill.burn) {
    add('每秒生命伤害', u => {
      const bonus = skill.burn!.dmgType === 'magic' ? u.spellPower ?? 0 : skill.burn!.dmgType === 'physical' ? u.physicalPower ?? 0 : 0;
      return `${number(skill.burn!.maxHpFraction * 100 * (skill.burn!.untilBattleEnd ? 1 : (1 + bonus / 100) * (1 + (u.damageAmp ?? 0))))}%`;
    }, skill.burn.dmgType);
    if (!skill.burn.untilBattleEnd) add('持续时间', () => `${number(skill.burn!.durationSeconds)}秒`, 'neutral');
  }
  if (!rich) return rows;
  const values = skillCurrentValues(skill, rows, star, unit, passiveHealth);
  return rows.map((row, i) => ({ ...row,
    currentRich: skill.statRows?.[i] ? formatSkillTokens(skill.statRows[i].value, values, true, 1, skill.effect === 'hydraulicBulwark' ? 'physical' : 'magic') : undefined }));
}

export function skillParagraphs(text: string): string {
  return text.split(/\n+/).map(part => part.trim()).filter(Boolean).join('\n\n')
    .replace(/。(?=[^\n])/g, '。\n\n');
}

/** Estimate wrapped body lines; CJK consumes one em and Latin roughly half an em. */
export function skillBodyHeight(text: string, width = 544, font = 17): number {
  text = text.replace(/<img[^>]*\/>/g, '■').replace(/<[^>]*>/g, '');
  const lines = text.split('\n').reduce((sum, part) => {
    const ems = Array.from(part).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.55), 0);
    return sum + Math.max(1, Math.ceil(ems / (width / font)));
  }, 0);
  return Math.max(66, lines * 26 + 12);
}

const TOKEN_COLORS: Record<string, string> = {
  '物理': '#ff9740', '魔法': '#50b4ff', '真实': '#ffffff',
  '治疗': '#7bf59a', '生命': '#7bf59a', '攻速': '#f2d04b', '控制': '#b57fe6',
};

/** The roster stores combat role and damage identity independently. */
export function unitRoleLabel(role?: string, damageType?: 'physical' | 'magic'): string {
  const names: Record<string, string> = { warrior:'战士', caster:'术士', marksman:'射手', assassin:'刺客', tank:'坦克' };
  return names[role ?? ''] ? `${damageType === 'magic' ? '魔法' : '物理'}${names[role!]}` : '';
}

/** Resolve the configuration template from the same current stats used by the skill rows. */
function skillCurrentValues(skill: SkillConfigData, rows: SkillStatRow[], star: number, unit?: UnitConfigData, passiveHealth = 0): Record<string, string | number> {
  const current = (label: string) => rows.find(row => row.label === label)?.current ?? '';
  const kind = skill.shadow?.kind;
  const damageLabels: Record<string, string> = { bulwark:'震击伤害', piercing:'首目标伤害', flurry:'每段伤害', cleave:'基础伤害',
    empower:'附加魔法伤害', execute:'基础伤害', lanterns:'单盏伤害', blackstars:'每颗伤害', void:'每次跃迁伤害' };
  if (skill.sunlight) {
    const labels: Record<string, string> = { bulwark:'爆炸伤害', arrows:'前两箭单箭伤害', hunt:'每段伤害', cleave:'伤害', empower:'附加魔法伤害', crossbow:'首目标伤害', prayer:'伤害', judgment:'魔法伤害', transit:'普通段伤害' };
    return { dmg: current(labels[skill.sunlight.kind]), shield: current('护盾') || current('自身护盾') || current('单目标护盾'),
      allyShield: current('友军护盾'), heal: current('治疗'), final: current('最后一击伤害') || current('第三箭伤害'), pierce: current('贯穿伤害'), total: current('三段总伤害'),
      maximumShield: current('最高护盾'), burst: current('爆炸伤害'), minimumDamage: current('最低贯穿伤害'),
      trueDamage: current('真实伤害'), count: current('审判目标') || current('连击次数') || current('跃迁次数'),
      recastLoss: skill.sunlight.kind === 'transit' ? number(skill.sunlight.recastDamageLoss * 100) : 0,
      recastCap: skill.sunlight.kind === 'transit' ? number(skill.sunlight.recastDamageLossCap * 100) : 0,
      aspd: skill.attackSpeedBonuses?.[star - 1] ?? 0, stun: skill.stunSeconds?.[star - 1] ?? 0 };
  }
  return {
    inspireSpeed:(skill.inspiration?.attackSpeedBonuses[star-1]??0)*(1+(unit?.spellPower??0)/100),
    inspireDuration:skill.inspiration?.durationSeconds??0,
    guardSlow:skill.lanternGuard?.maxAttackSpeedPenalty??0,
    guardArmor:(skill.lanternGuard?.maxArmorBonuses[star-1]??0)*(1+(unit?.spellPower??0)/100),
    guardConversion:skill.lanternGuard?.physicalPowerPerArmor[star-1]??0,
    windSpeed:skill.windHunt?.attackSpeedBonuses[star-1]??0,
    windDuration:skill.windHunt?.durationSeconds??0,
    windGrowth:skill.windHunt?.physicalPowerPerKill[star-1]??0,
    windCast:skill.castSeconds??0,
    windPermanent:current('累计物理成长'),
    corrosionDamage:(skill.corrosion?.damagePerPulse[star-1]??0)*(1+(unit?.spellPower??0)/100)*(1+(unit?.damageAmp??0)),
    corrosionDuration:skill.corrosion?.durationSeconds??0,
    corrosionInterval:skill.corrosion?.intervalSeconds??0,
    corrosionCast:skill.castSeconds??0,
    compassCast:skill.castSeconds??0,compassRadius:skill.radius,
    compassShieldDuration:skill.sandCompass?.shieldSeconds??0,
    ropeCast:skill.castSeconds??0,ropeDuration:skill.ropeHunt?.durationSeconds??0,
    ropeInterval:skill.ropeHunt?.intervalSeconds??0,ropeCount:skill.ropeHunt?.shotCount??0,
    dmg: skill.sandCompass ? current('沙浪伤害') : kind ? current(damageLabels[kind]) : rows[0]?.current ?? '0', trail:current('沿途伤害'), knockup:skill.chargedKnockup?.durationsSeconds[star - 1]??skill.stellarBulwark?.knockupSeconds??skill.furnaceDash?.knockupSeconds??0, shield: current('护盾') || current('自身护盾') || current('友军护盾'), heal: current('单目标治疗') || current('击杀治疗') || current('结束治疗') || current('每次治疗') || current('治疗'),
    killPower: skill.bloodDrain?.spellPowerPerKill[star - 1] ?? 0,
    permanentPower: current('本局累计法术加成'),
    lineLength: skill.lineFear?.length ?? 0,
    aidAttackDamage: current('普攻附伤'),aidStayDuration:skill.bloodAid?.staySeconds??0,aidResistanceDuration:skill.bloodAid?.resistanceSeconds??0,
    reignHealth:current('生命提升'),reignDamage:current('强化伤害'),rebirthThreshold:current('触发生命'),
    rebirthHealing:current('恢复比例'),rebirthDuration:skill.bloodReign?.rebirthSeconds??0,reignLength:skill.bloodReign?.length??0,reignWindup:skill.bloodReign?.attackWindupSeconds??0,
    chargeDistance:skill.stellarBulwark?.distance??0,shieldDuration:skill.stellarBulwark?.shieldSeconds??0,leapDistance:skill.starLeap?.distance??0,
    resists: current('双抗提升'), secondary: current('后续目标伤害'), allyShield: current('友军护盾'),
    total: current('三段总伤害') || current('完整伤害'), refund: current('法力回复'), maximum: current('最高伤害') || current('处决伤害'),
    burst: current('爆炸伤害'), repeat: current('重复命中伤害'), collapse: current('坍缩伤害'), mark: current('虚痕爆炸伤害'),
    count: current('目标数量') || current('治疗目标') || current('黑星数量') || current('跃迁次数'),
    manaReduction: current('每次蓝条降低'), manaCap:current('最多降低'),
    lampDamage: current('每秒伤害'), permanentHealth: current('参与击杀永久生命'),
    lampBase: skill.shadow?.kind === 'soulLamp' ? number(skill.starDamage![star - 1] * (1 + (unit?.spellPower ?? 0) / 100) * (1 + (unit?.damageAmp ?? 0))) : 0,
    lampHp: skill.shadow?.kind === 'soulLamp' ? number((unit?.hp ?? 0) * skill.shadow.maxHpFractions[star - 1] * (1 + (unit?.damageAmp ?? 0))) : 0,
    passiveHealth,
    lampRatio: skill.shadow?.kind === 'soulLamp' ? number(skill.shadow.maxHpFractions[star - 1] * 100) : 0,
    slow: skill.nebula ? number(skill.nebula.attackSpeedPenalty*100) : skill.shadow?.kind === 'domain' ? skill.shadow.slowAmounts[star - 1] : 0,
    duration: skill.nebula?.durationSeconds ?? skill.gravity?.durationSeconds ?? 0,
    gravityResists: current('每名敌人双抗'),
    fear: skill.lineFear?.fearSeconds[star - 1] ?? (skill.shadow?.kind === 'lanterns' ? skill.shadow.fearSeconds[star - 1] : 0),
    basePhysical: current('基础物理伤害'), baseMagic: current('基础魔法伤害'),
    burn: current('每秒生命伤害'), aspd: skill.attackSpeedBonuses?.[star - 1] ?? 0,
    stun: skill.stunSeconds?.[star - 1] ?? 0,
    formDuration: current('持续时间').replace(/秒$/, ''),
    castDuration: skill.castSeconds ?? 0,
    missingHealth: current('已损失生命伤害'),
    formReduction: current('伤害减免'), formBonus: current('额外伤害'),
    guardDuration: skill.guard?.durations[star - 1] ?? 0,
    guardReduction: current('伤害减免'),
    healPercent: current('生命比例'), healBonus: current('额外治疗'), burnDuration: skill.burn?.durationSeconds ?? 0,
  };
}

function formatSkillTokens(template: string, values: Record<string, string | number>, rich: boolean, iconOffset = 5, healingScaling: 'physical' | 'magic' = 'magic'): string {
    return template.replace(/\{(物理|魔法|真实|治疗|生命|攻速|控制)(\+{0,2}):([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?%?)\}/g,
      (_match, type: string, plus: string, key: string) => {
        const raw = values[key] ?? key;
        const value = type === '攻速' && typeof raw === 'number' ? `${number(raw * 100)}%` : String(raw);
        if (!rich) return value;
        const icons = type === '生命' ? ['stat_hp'] : plus.length === 2 ? ['attr_phys_bonus', 'attr_spell_bonus']
          : plus ? [type === '物理' || (type === '治疗' && healingScaling === 'physical') ? 'attr_phys_bonus' : 'attr_spell_bonus'] : [];
        return `<color=${TOKEN_COLORS[type]}>${value}</color>`
          + (icons.length ? `（${icons.map(icon => `<img src='${icon}' width=16 height=16 align=center offset=${iconOffset} />`).join('')}）` : '');
      });
}

/** Body only; the UI renders stat rows in independent left/right columns below it. */
export function buildSkillDescription(configs: ConfigManager, unit: UnitConfigData, star: number, skillScale: number, rich = false, passiveHealth = 0): string {
  if (!unit.skillId) return unit.description ?? '无主动技能';
  const skill = configs.getSkill(unit.skillId);
  const rows = buildSkillStatRows(configs, unit, star, skillScale);
  return formatSkillTokens(skill.description ?? '', skillCurrentValues(skill, rows, star, unit, passiveHealth), rich, 5, skill.effect === 'hydraulicBulwark' ? 'physical' : 'magic');
}
