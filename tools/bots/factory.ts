import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {stableEnemyJson} from '../../assets/scripts/core/EnemyGenerationTypes';
import {WeakBot,MediumBot,StrongBot} from './formal-bots';
import {MediumV2Bot} from './medium-v2';
import type {BotConfig,RunBot} from './types';

export function loadBotConfigs(root=process.cwd()):Record<'weak'|'medium'|'strong',BotConfig> {
  return JSON.parse(readFileSync(resolve(root,'tools/bots/bot-configs.json'),'utf8'));
}
export function createBot(id:'weak'|'medium'|'strong',override?:BotConfig):RunBot {
  const c=override??loadBotConfigs()[id];
  if(!c||!(c.version===id+'-v1'||id==='medium'&&['medium-v2','medium-v2r1b'].includes(c.version))||![c.qualityWeight,c.mergeWeight,c.dangerHp,c.criticalHp].every(n=>Number.isFinite(n)&&n>=0)
    ||c.criticalHp>=c.dangerHp||c.dangerHp>1||!c.reserveStages?.length||!c.targetLevels?.length||c.targetLevels.some(n=>!Number.isInteger(n)||n<1||n>10)
    ||![c.coreCopies,c.maxXpBuys,c.maxRolls,c.rollEvery].every(n=>Number.isInteger(n)&&n>=0&&n<=20)||c.rollEvery<1)throw Error('Invalid bot policy configuration');
  const hash=createHash('sha256').update(stableEnemyJson(c)).digest('hex');
  if(c.version.startsWith('medium-v2')){
    const p=c.economyV2;
    if(!p||Object.values(p).some(n=>!Number.isFinite(n)||n<0)||p.minGold>p.bossReserve||p.bossReserve>p.eliteReserve||p.excessGoldThreshold<50
      ||!Number.isInteger(p.maxThreeStarCores)||p.maxThreeStarCores<1||p.maxThreeStarCores>2||![p.saveRolls,p.developRolls,p.stabilizeRolls,p.allInRolls].every(n=>Number.isInteger(n)&&n<=20)
      ||p.allInRolls>c.maxRolls||p.populationValuePerGold>1||p.benchValueRatio>1)throw Error('Invalid Medium-v2 economy configuration');
    return new MediumV2Bot(c,hash);
  }
  return id==='weak'?new WeakBot(c,hash):id==='medium'?new MediumBot(c,hash):new StrongBot(c,hash);
}
