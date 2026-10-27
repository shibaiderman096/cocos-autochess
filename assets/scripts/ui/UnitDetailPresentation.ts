import type { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import { resolveTraits, isTraitMember } from '../battle/Traits';
import type { UnitDetailData } from './BattleUI';
import { buildSkillStatRows, buildSkillDescription } from './SkillPresentation';

interface DetailContext {
  runtimeStats?: boolean;
  skillScale?: number;
  side?: 0 | 1;
  hp?: number;
  mana?: number;
  shield?: number;
  passiveHealth?: number;
  passiveSpellPower?: number;
  passivePhysicalPower?: number;
  detailKey?: string;
}

/** Shared by the live unit inspector and the unequipped collection preview. */
export function buildUnitDetailData(configs: ConfigManager, unit: UnitConfigData, star: number, context: DetailContext = {}): UnitDetailData {
  const { side = 0, hp = unit.hp, mana = unit.startMana, shield = 0, passiveHealth = 0 } = context;
  const skillScale = context.skillScale ?? configs.battle.starScaling[star - 1].skill;
  const skill = unit.skillId ? configs.getSkill(unit.skillId) : null;
  if(skill?.lanternGuard&&!context.runtimeStats){
    const e=skill.lanternGuard,missing=Math.max(0,Math.min(1,1-hp/unit.hp));
    const armor=unit.armor+e.maxArmorBonuses[star-1]*(1+(unit.spellPower??0)/100)*missing;
    unit={...unit,armor,atkSpeed:Math.max(.1,unit.atkSpeed-e.maxAttackSpeedPenalty*missing),physicalPower:(unit.physicalPower??0)+armor*e.physicalPowerPerArmor[star-1]};
  }
  const rows = buildSkillStatRows(configs, unit, star, skillScale, true, passiveHealth, context.passiveSpellPower ?? 0, context.passivePhysicalPower ?? 0);
  const damage = rows[0]?.current ?? '0';
  const healing = rows.find(row => row.label === '治疗')?.current ?? '0';
  const shielding = rows.find(row => row.label === '护盾')?.current ?? '0';
  const damageType = skill?.dmgType === 'physical' ? '物理' : skill?.dmgType === 'magic' ? '魔法' : '真实';
  return {
    name: unit.name, star, cost: unit.cost, artId: unit.artId ?? unit.id, side, tint: unit.tint, role: unit.role, damageType: unit.damageType,
    detailKey: context.detailKey ?? `${unit.id}:${side}:${star}`,
    skillDisplayName: skill?.name ?? '普通攻击',
    traits: resolveTraits(configs.battle.traits ?? [], [], configs.allUnits())
      .filter(state => isTraitMember(state, unit)).map(state => state.config.name),
    skillStats: rows,
    skillRichDescription: buildSkillDescription(configs, unit, star, skillScale, true, passiveHealth),
    skillIcon: skill?.effect === 'inspiration' || skill?.effect === 'windHunt' ? 'attr_aspd' : skill?.effect === 'lanternGuard' || skill?.effect === 'sandCompass' ? 'attr_armor' : skill?.effect === 'healChannel' ? 'stat_hp' : skill?.effect === 'teleportEmpower' ? 'icon_speed'
      : skill?.dmgType === 'magic' ? 'attr_spell_bonus' : skill?.dmgType === 'true' ? 'attr_dmg_amp' : 'icon_swords',
    attackSpeedCap: configs.battle.attackSpeedCap ?? 5,
    hp, maxHp: unit.hp, mana, maxMana: unit.maxMana, shield, atk: unit.atk, armor: unit.armor, mr: unit.mr, atkSpeed: unit.atkSpeed, range: unit.range,
    manaPerSecond: (unit.manaPerSecond ?? 0) + (unit.role === 'caster' ? configs.battle.roleMana?.casterPerSecond ?? 0 : 0),
    physicalPower: unit.physicalPower, spellPower: unit.spellPower, critChance: unit.critChance, lifesteal: unit.lifesteal, damageAmp: unit.damageAmp, damageReduction: unit.damageReduction,
    skillName: skill ? skill.effect === 'healAlly' ? `${skill.name} · ${healing}治疗` : skill.effect === 'selfShield' || skill.effect === 'stellarBulwark' ? `${skill.name} · ${shielding}护盾`
      : ['shadow','susanoo','teleportEmpower','healChannel','inspiration','lanternGuard','windHunt','sandCompass'].includes(skill.effect) ? skill.name ?? unit.skillId : `${skill.name ?? unit.skillId} · ${damage}${damageType}伤害` : '普通攻击',
    skillDescription: buildSkillDescription(configs, unit, star, skillScale, false, passiveHealth),
  };
}
