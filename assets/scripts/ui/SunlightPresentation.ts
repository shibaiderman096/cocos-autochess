import type { TraitBreakpoint } from '../battle/types';

export function sunlightTierText(tier: TraitBreakpoint, rich = false, icons = false): string {
  const s = tier.sunlight!;
  const p = (v: number) => `${Number((v * 100).toFixed(2))}%`;
  const n = (text: string, color = '#c6acff') => rich ? `<color=${color}><b>${text}</b></color>` : text;
  const icon = (key: string) => icons ? `<img src='${key}' width=16 height=16 align=center offset=3/> ` : '';
  const shield = `${icon('sun_shield')}最大生命值${n(p(s.shieldMaxHpFraction), '#7bf59a')}的护盾`;
  if (s.judgment?.targetMaxHpFraction) return `${shield}\n开战：${icon('sun_reduce')}前排${n(p(s.formation!.frontReduction), '#50b4ff')}减伤／${icon('sun_amp')}后排${n(p(s.formation!.backAmp), '#ff9740')}增伤\n${icon('sun_judgment')}每${n(String(s.judgment.intervalSeconds))}秒随机审判${n('1')}名敌人，眩晕${n(String(s.judgment.stunSeconds))}秒\n造成（${n(String(s.judgment.damage), '#ffffff')}＋${icon('sun_hp')}目标最大生命值${n(p(s.judgment.targetMaxHpFraction), '#ffffff')}）\n真实伤害`;
  if (s.judgment) return `${shield}\n${icon('sun_judgment')}每${n(String(s.judgment.intervalSeconds))}秒审判${n('1')}名随机敌人\n${n(String(s.judgment.damage), '#ffffff')}真实伤害，眩晕${n(String(s.judgment.stunSeconds))}秒`;
  if (s.formation) return `${shield}\n${n(String(s.formation.delaySeconds))}秒后：${icon('sun_reduce')}前两排${n(p(s.formation.frontReduction), '#50b4ff')}减伤\n${icon('sun_amp')}后两排${n(p(s.formation.backAmp), '#ff9740')}增伤，持续至战斗结束`;
  return shield;
}
