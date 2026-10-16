import type {BotObservation} from '../../assets/scripts/core/BotObservation';
import type {BotConfig} from '../bots/types';
import {bankReserve,levelTarget} from '../bots/economy-policy';
import {ownedQuality} from '../bots/evaluation';
import {purchaseScore,needsRoll} from '../bots/shop-policy';

export function publicEconomySnapshot(o:BotObservation,c:BotConfig,weak=false){
  const board=o.units.filter(u=>u.location==='board'),bench=o.units.filter(u=>u.location==='bench');
  const xpNeeded=Math.max(0,(o.catalog.levelUpExp[o.state.level-1]??Infinity)-o.state.xp);
  const levelUpGold=Number.isFinite(xpNeeded)?Math.ceil(xpNeeded/o.catalog.xpPurchase.exp)*o.catalog.xpPurchase.gold:null;
  const usable=bench.filter(u=>!board.some(b=>b.unitId===u.unitId&&b.star>=u.star));
  const offers=o.shop.flatMap((s,index)=>{
    if(!s.unitId||s.price>o.state.gold)return [];
    const completes2=o.units.filter(u=>u.unitId===s.unitId&&u.star===1).length>=2;
    const legal=bench.length<o.benchSlots||completes2;
    return legal&&Number.isFinite(purchaseScore(index,o,c,weak))?[{index,unitId:s.unitId,completes2,price:s.price}]:[];
  });
  return {gold:o.state.gold,hp:o.state.playerHp,level:o.state.level,xp:o.state.xp,population:board.length,bench:bench.length,
    benchPowerProxy:usable.reduce((n,u)=>n+ownedQuality(u,o),0),benchUnitCouldDeploy:usable.length>0,levelUpGold,
    levelUpAffordable:levelUpGold!==null&&o.state.gold>=levelUpGold,populationOpportunity:usable.length>0&&levelUpGold!==null&&o.state.gold>=levelUpGold,
    reserveGold:bankReserve(o,c),spendableGold:Math.max(0,o.state.gold-bankReserve(o,c)),offers,
    unusedGoldReason:[] as string[],legacyLevelTarget:levelTarget(o,c),rollWanted:needsRoll(o,c,weak),
    ironGolemOnBoard:board.some(u=>u.unitId==='iron_golem'),ironGolemTank:board.some(u=>u.unitId==='iron_golem')};
}
export type BotEconomyDiagnostics={before:ReturnType<typeof publicEconomySnapshot>;after:ReturnType<typeof publicEconomySnapshot>;
  goldPeak:number;benchFullEvents:number;ignoredUsefulOffers:number;missedImmediate2Star:number;populationOpportunityMissed:number;
  ironGolemPurchases:number;mode?:string;policy?:unknown};
