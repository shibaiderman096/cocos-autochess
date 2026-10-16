import type {BotObservation} from '../../assets/scripts/core/BotObservation';
import type {BotConfig} from './types';
import {ownedQuality,roleOf,unitConfig} from './evaluation';

export function selectRoster(o:BotObservation,c:BotConfig) {
  const ranked=o.units.slice().sort((a,b)=>ownedQuality(b,o)-ownedQuality(a,o)||b.star-a.star||a.uid-b.uid);
  const selected=ranked.slice(0,o.unitCap),required=Math.min(2,Math.ceil(o.unitCap/4));
  const tank=(u:typeof ranked[number])=>roleOf(unitConfig(u.unitId,o),o)==='tank';
  for(const candidate of ranked.filter(tank)){
    if(selected.filter(tank).length>=required)break;if(selected.some(u=>u.uid===candidate.uid))continue;
    const replace=selected.filter(u=>!tank(u)).sort((a,b)=>ownedQuality(a,o)-ownedQuality(b,o)||b.uid-a.uid)[0];
    if(replace&&ownedQuality(candidate,o)>=ownedQuality(replace,o)*.5)selected[selected.indexOf(replace)]=candidate;
  }
  return selected;
}
