import type {BotObservation} from '../../assets/scripts/core/BotObservation';
import type {BotConfig} from './types';
import {coreUnits,ownedQuality,quality,roleOf,unitConfig} from './evaluation';
import {selectRoster} from './roster-policy';
import {affordable} from './economy-policy';

export function purchaseScore(index:number,o:BotObservation,c:BotConfig,weak:boolean,policy?:{reserveGold:number;minGold:number;coreIds:string[]}):number {
  const slot=o.shop[index];if(!slot.unitId)return -Infinity;
  const cfg=unitConfig(slot.unitId,o),same=o.units.filter(u=>u.unitId===slot.unitId),ones=same.filter(u=>u.star===1).length;
  if(same.some(u=>u.star===3))return -Infinity;
  const merge=ones>=2,urgent=merge&&(!weak||o.state.playerHp/o.catalog.initialHealth<c.dangerHp);
  if(policy?o.state.gold-slot.price<(merge?policy.minGold:policy.reserveGold):!affordable(o,c,slot.price,urgent))return -Infinity;
  if(o.units.filter(u=>u.location==='bench').length>=o.benchSlots&&!merge)return -Infinity;
  if(weak)return (cfg.cost??1)*c.qualityWeight+ones*c.mergeWeight;
  const selected=selectRoster(o,c),worst=selected.length?Math.min(...selected.map(u=>ownedQuality(u,o))):0;
  const cores=policy?.coreIds??coreUnits(o,c.coreCopies),hasTwo=same.some(u=>u.star===2);
  if(hasTwo&&(!cores.includes(cfg.id)||o.state.stage<4))return -Infinity;
  const value=quality(cfg,1,o),needRole=roleOf(cfg,o)==='tank'&&!selected.some(u=>roleOf(unitConfig(u.unitId,o),o)==='tank');
  const projectedUpgrade=!!policy&&quality(cfg,2,o)>worst*1.15;
  if(!same.length&&selected.length>=o.unitCap&&value<worst*.78&&!needRole&&!projectedUpgrade)return -Infinity;
  return c.qualityWeight*(value-worst*.7)+ones*c.mergeWeight+(merge?c.mergeWeight*2:0)+(needRole?20:0)+(hasTwo?c.mergeWeight*.25:0);
}
export function saleCandidates(o:BotObservation,c:BotConfig):number[] {
  const selected=new Set(selectRoster(o,c).map(u=>u.uid)),cores=coreUnits(o,c.coreCopies);
  return o.units.filter(u=>u.location==='bench'&&!selected.has(u.uid)&&u.star===1
    &&!cores.includes(u.unitId)&&o.units.filter(v=>v.unitId===u.unitId&&v.star===1).length<2)
    .sort((a,b)=>ownedQuality(a,o)-ownedQuality(b,o)||a.uid-b.uid).map(u=>u.uid);
}
export function needsRoll(o:BotObservation,c:BotConfig,weak:boolean):boolean {
  if(weak)return o.state.waveId%c.rollEvery===0;
  const board=o.units.filter(u=>u.location==='board'),ratio=board.filter(u=>u.star>=2).length/Math.max(1,board.length);
  return board.length<o.unitCap||ratio<(c.formation==='counter'?.85:.7)||o.state.playerHp/o.catalog.initialHealth<c.dangerHp;
}
