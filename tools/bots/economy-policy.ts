import type {BotObservation} from '../../assets/scripts/core/BotObservation';
import type {BotConfig} from './types';
export function bankReserve(o:BotObservation,c:BotConfig):number {
  const e=o.catalog.economy,cap=e.interestRate>0?Math.ceil(e.interestCap/e.interestRate):0;
  const target=Math.min(cap,c.reserveStages[Math.min(o.state.stage,c.reserveStages.length-1)]);
  const hp=o.state.playerHp/o.catalog.initialHealth;
  if(hp<=c.criticalHp)return 0;if(hp<=c.dangerHp)return Math.floor(target/2);
  return Math.min(target,Math.floor(o.state.gold*e.interestRate)/Math.max(e.interestRate,1e-9));
}
export function affordable(o:BotObservation,c:BotConfig,price:number,urgent=false):boolean {
  return o.state.gold>=price&&(urgent||o.state.gold-price>=bankReserve(o,c));
}
export function levelTarget(o:BotObservation,c:BotConfig):number {
  const target=c.targetLevels[Math.min(o.state.stage,c.targetLevels.length-1)];
  return Math.min(o.catalog.levelUpExp.length+1,target+(o.state.playerHp/o.catalog.initialHealth<=c.criticalHp?1:0));
}
