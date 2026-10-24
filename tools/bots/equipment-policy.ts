import type {BotPlayerPort} from '../../assets/scripts/core/BotObservation';
import type {ActionAttempt,RunAction} from '../../assets/scripts/core/RunSessionTypes';
import type {BotConfig} from './types';
import {equipmentFit,ownedQuality} from './evaluation';
import { claimStageRewards } from './stage-rewards';

export function chooseReward(player:BotPlayerPort,c:BotConfig):ActionAttempt[] {
  const actions = claimStageRewards(player);
  const o=player.observe(),pending=o.pendingEquipmentReward;if(!pending)return actions;
  const available=o.units.filter(u=>(u.equipment?.length??0)<o.catalog.maxEquipment),units=available.length?available:o.units;
  const scores=pending.candidates.map((id,index)=>({index,score:Math.max(0,...units.map(u=>equipmentFit(id,u,o,c.reward==='synergy')))}));
  const choice=c.reward==='first-useful'?(scores.find(s=>s.score>0)?.index??0):scores.sort((a,b)=>b.score-a.score||a.index-b.index)[0].index;
  const action:RunAction={type:'claimEquipmentReward',index:choice};return [...actions,{action,result:player.act(action)}];
}
export function equipInventory(player:BotPlayerPort,c:BotConfig,actions:ActionAttempt[]):void {
  const act=(action:RunAction)=>{const result=player.act(action);actions.push({action,result});return result.ok;};
  if(player.observe().pendingTraitChoice)act({type:'chooseEquipmentTrait',index:0});
  if(c.equipment==='synergy'){
    const o=player.observe(),core=o.units.filter(u=>u.location==='board').sort((a,b)=>ownedQuality(b,o)-ownedQuality(a,o))[0];
    if(core&&(core.equipment?.length??0)<o.catalog.maxEquipment){const bench=o.units.filter(u=>u.location==='bench');
      const swap=bench.flatMap(u=>(u.equipment??[]).map((id,slot)=>({u,id,slot,gain:equipmentFit(id,core,o,true)-equipmentFit(id,u,o,true)}))).sort((a,b)=>b.gain-a.gain||a.u.uid-b.u.uid)[0];
      if(swap&&swap.gain>10)act({type:'unequip',uid:swap.u.uid,slot:swap.slot});}
  }
  for(let n=0;n<100;n++){const o=player.observe();if(!o.equipmentReserve.length)break;
    const id=o.equipmentReserve[0],units=o.units.filter(u=>(u.equipment?.length??0)<o.catalog.maxEquipment);if(!units.length)break;
    const ranked=units.map(u=>({u,score:equipmentFit(id,u,o,c.equipment==='synergy')*(u.location==='board'?1.3:1)+(c.equipment==='synergy'?ownedQuality(u,o)*.08:0)}))
      .sort((a,b)=>c.equipment==='first-fit'?Number(b.score>0)-Number(a.score>0)||a.u.uid-b.u.uid:b.score-a.score||a.u.uid-b.u.uid);
    if(!act({type:'equip',uid:ranked[0].u.uid,reserveIndex:0}))break;
    if(player.observe().pendingTraitChoice)act({type:'chooseEquipmentTrait',index:0});
  }
}
