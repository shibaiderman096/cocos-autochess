import type { Rng } from './Rng';

export const OPENING_ENCOUNTER_IDS = ['inspiration', 'stipend', 'tempered', 'bounty', 'study', 'renewal', 'vacancy', 'resonance', 'ascension', 'abundance', 'bossHunt', 'secondLife', 'kindred', 'compound', 'luckyRoll'] as const;
export type OpeningEncounterId = typeof OPENING_ENCOUNTER_IDS[number];
export interface EncounterEffects {
  vacancyPerSlot: number; vacancyMaxStacks: number;
  starDamageAmp: number; starDamageReduction: number;
  monsterRewardMultiplier: number;
  reviveSeconds: number; reviveHealthFraction: number;
  giftStartStage: number; freeRefreshChance: number;
}
export function validateEncounterEffects(e: EncounterEffects): void {
  if (!e || ![e.vacancyPerSlot,e.starDamageAmp,e.starDamageReduction,e.reviveHealthFraction,e.freeRefreshChance]
    .every(n=>Number.isFinite(n)&&n>0&&n<=1)
    || ![e.vacancyMaxStacks,e.giftStartStage].every(n=>Number.isSafeInteger(n)&&n>0)
    || !Number.isFinite(e.monsterRewardMultiplier)||e.monsterRewardMultiplier<1
    || !Number.isFinite(e.reviveSeconds)||e.reviveSeconds<=0) throw new Error('Invalid encounter effects');
}
export interface OpeningEncounterRules {
  effects?: EncounterEffects;
  name: string;
  refreshesPerLevel: number;
  incomeStartStage: number;
  incomePerStage: number;
  survivorMaxHp: number;
  victoryGold: number;
  battleExp: number;
  victoryHeal: number;
}
export interface OpeningEncounterState {
  selected?: OpeningEncounterId;
  freeRefreshes: number;
  lastIncomeStage: number;
  offered: OpeningEncounterId[];
  lastGiftStage?: number;
}
export function drawOpeningEncounters(rng: Rng, extended = true): OpeningEncounterId[] {
  const pool: OpeningEncounterId[] = [...OPENING_ENCOUNTER_IDS].slice(0,extended?undefined:6);
  const result: OpeningEncounterId[] = [];
  while (result.length < 3) result.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return result;
}
export function openingEncounterChoices(rules: OpeningEncounterRules) {
  const e = rules.effects;
  return [
    ...(e ? [
      {id:'vacancy' as const,name:'精兵强将',description:`战斗开始时，每个空余上场人口提供${e.vacancyPerSlot*100}%增伤和减伤，最多${e.vacancyMaxStacks}层。`},
      {id:'resonance' as const,name:'羁绊共鸣',description:'已激活人数最多的一项羁绊计数+1；并列时随机选择，不增加真实棋子。'},
      {id:'ascension' as const,name:'三星登神',description:`所有上场三星棋子获得${e.starDamageAmp*100}%增伤、${e.starDamageReduction*100}%减伤。`},
      {id:'abundance' as const,name:'荒野丰收',description:`所有野怪宝箱总价值提升${(e.monsterRewardMultiplier-1)*100}%，向下取整。`},
      {id:'bossHunt' as const,name:'首领狩猎',description:'所有精英关替换为Boss关，敌军和奖励均使用Boss规则。'},
      {id:'secondLife' as const,name:'再续前缘',description:`每场战斗首次友军阵亡，${e.reviveSeconds}秒后以${e.reviveHealthFraction*100}%生命复活一次。`},
      {id:'kindred' as const,name:'同道来援',description:`从第${e.giftStartStage}大阶段起，每阶段随机获得一张最高已激活羁绊的棋子；并列随机，满备战席暂存。`},
      {id:'compound' as const,name:'复利无穷',description:'利息无上限，仍按战斗开始前金币每10金币+1。'},
      {id:'luckyRoll' as const,name:'好运连连',description:`棋子商店每次付费或关卡刷新有${e.freeRefreshChance*100}%概率获得一次免费刷新；消耗免费次数不再触发。`},
    ] : []),
    { id: 'inspiration' as const, name: '灵感迸发', description: `每次升级获得${rules.refreshesPerLevel}次免费刷新，可累积使用。` },
    { id: 'stipend' as const, name: '行旅津贴', description: `从第${rules.incomeStartStage}阶段开始，每阶段获得${rules.incomePerStage}金币。` },
    { id: 'tempered' as const, name: '百战淬体', description: `战斗结束，己方存活棋子获得${rules.survivorMaxHp}点永久最大生命值。` },
    { id: 'bounty' as const, name: '凯旋馈赠', description: `每次战斗胜利，额外获得${rules.victoryGold}金币。` },
    { id: 'study' as const, name: '勤学苦练', description: `每场战斗结束，额外获得${rules.battleExp}点经验，胜负均可。` },
    { id: 'renewal' as const, name: '复苏之风', description: `每次战斗胜利，恢复${rules.victoryHeal}点玩家生命，不超过生命上限。` },
  ];
}
