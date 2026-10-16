import type {BotObservation} from '../../assets/scripts/core/BotObservation';
import type {BotConfig} from './types';
import {ownedQuality,quality,roleOf,unitConfig} from './evaluation';
import {selectRoster} from './roster-policy';
export type EconomyMode='save'|'develop'|'stabilize'|'all_in';
export function mediumCores(o:BotObservation,c:BotConfig){
  const roster=selectRoster(o,c).sort((a,b)=>ownedQuality(b,o)-ownedQuality(a,o)||a.uid-b.uid);
  const tanks=roster.filter(u=>roleOf(unitConfig(u.unitId,o),o)==='tank'),carries=roster.filter(u=>roleOf(unitConfig(u.unitId,o),o)!=='tank');
  const tank=tanks[0],carry=carries[0],secondary=carries.find(u=>u.unitId!==carry?.unitId);
  const chase=[carry,tank,secondary].filter((u):u is typeof roster[number]=>!!u);
  return {tank,carry,secondary,ready:!!tank&&!!carry&&tank.star>=2&&carry.star>=2,
    chase:[...new Set(chase.map(u=>u.unitId))].slice(0,c.economyV2!.maxThreeStarCores)};
}
export function populationValue(o:BotObservation,c:BotConfig){
  const selected=selectRoster(o,c),selectedIds=new Set(selected.map(u=>u.uid));
  const mean=selected.reduce((n,u)=>n+ownedQuality(u,o),0)/Math.max(1,selected.length);
  const candidates=o.units.filter(u=>!selectedIds.has(u.uid)&&!selected.some(s=>s.unitId===u.unitId&&s.star>u.star))
    .sort((a,b)=>ownedQuality(b,o)-ownedQuality(a,o)||a.uid-b.uid);
  const candidate=candidates[0],value=candidate?ownedQuality(candidate,o):0;
  const needed=o.catalog.levelUpExp[o.state.level-1];
  const gold=needed===undefined?null:Math.ceil(Math.max(0,needed-o.state.xp)/o.catalog.xpPurchase.exp)*o.catalog.xpPurchase.gold;
  return {candidateUid:candidate?.uid??null,candidateUnitId:candidate?.unitId??null,nextPopulationValue:value,relativeValue:value/Math.max(1,mean),gold,
    worthwhile:!!candidate&&gold!==null&&value>=mean*c.economyV2!.benchValueRatio&&value/Math.max(1,mean)/Math.max(1,gold)>=c.economyV2!.populationValuePerGold};
}
export function economyPlan(o:BotObservation,c:BotConfig,lossStreak=0){
  const p=c.economyV2!,cores=mediumCores(o,c),population=populationValue(o,c),hp=o.state.playerHp/o.catalog.initialHealth;
  const board=selectRoster(o,c),underfilled=board.length<o.unitCap;
  const ranked=board.map(u=>ownedQuality(u,o)).sort((a,b)=>b-a),weakSlot=ranked.length>0&&ranked[ranked.length-1]<ranked[0]*p.weakSlotRatio;
  const pairs=[...new Set(o.units.map(u=>u.unitId))].filter(id=>o.units.filter(u=>u.unitId===id&&u.star===1).length>=2
    &&(!o.units.some(u=>u.unitId===id&&u.star>=2)||cores.chase.includes(id)&&!o.units.some(u=>u.unitId===id&&u.star===3))).length;
  const coreChase=cores.chase.some(id=>!o.units.some(u=>u.unitId===id&&u.star===3));
  const catalogUpgrade=ranked.length>0&&o.catalog.units.some(cfg=>quality(cfg,2,o)>ranked[ranked.length-1]*1.15
    &&!o.units.some(u=>u.unitId===cfg.id&&u.star>=2));
  const unstable=underfilled||!cores.ready||board.some(u=>u.star===1)||weakSlot;
  let mode:EconomyMode=hp<=c.criticalHp?'all_in':hp<=c.dangerHp||lossStreak>=2||o.waveKind==='boss'||o.waveKind==='elite'?'stabilize':
    population.worthwhile||underfilled||o.state.gold>p.excessGoldThreshold?'develop':'save';
  const e=o.catalog.economy,interestGold=e.interestRate>0?Math.ceil(e.interestCap/e.interestRate):0;
  const normalReserve=Math.min(interestGold,c.reserveStages[Math.min(o.state.stage,c.reserveStages.length-1)]);
  const reserveGold=mode==='all_in'?p.minGold:mode==='stabilize'?Math.min(normalReserve,o.waveKind==='boss'?p.bossReserve:o.waveKind==='elite'?p.eliteReserve:Math.floor(normalReserve/2)):normalReserve;
  const rollLimit=mode==='all_in'?p.allInRolls:mode==='stabilize'?p.stabilizeRolls:mode==='develop'?p.developRolls:p.saveRolls;
  const canUpgradeBoard=board.some(u=>u.star===1&&!o.units.some(v=>v.unitId===u.unitId&&v.star>=2));
  // A weak relative slot alone is not a purchasable upgrade. Do not pay for a
  // search after all allowed core/star and catalog goals are already fulfilled.
  const wantsRoll=underfilled||!cores.ready||canUpgradeBoard||pairs>0||catalogUpgrade
    ||(o.state.stage>=4&&coreChase&&(mode!=='save'||o.state.gold>p.excessGoldThreshold));
  return {mode,reserveGold,spendableGold:Math.max(0,o.state.gold-reserveGold),minGold:mode==='all_in'?p.minGold:0,
    maxRolls:rollLimit,cores:{tank:cores.tank?.unitId??null,carry:cores.carry?.unitId??null,secondaryCarry:cores.secondary?.unitId??null,ready:cores.ready},
    coreIds:cores.chase,population,weakSlot,pairs,coreChase,catalogUpgrade,canUpgradeBoard,wantsRoll,lossStreak,
    levelUpAllowed:population.worthwhile&&population.gold!==null&&o.state.gold-population.gold>=reserveGold};
}
