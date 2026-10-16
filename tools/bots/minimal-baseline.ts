import type { ActionAttempt, RunAction, RunPlayerPort } from '../../assets/scripts/core/RunSessionTypes';
import { MAX_EQUIPMENT } from '../../assets/scripts/battle/types';
import { claimStageRewards } from './stage-rewards';

/** Infrastructure fixture only: fixed purchase order, star/cost/uid ranking, fixed legal cells. */
export class MinimalBaselineBot {
  claimRewards(player:RunPlayerPort):ActionAttempt[] {
    const actions = claimStageRewards(player);
    if(!player.observe().pendingEquipmentReward)return actions;
    const action:RunAction={type:'claimEquipmentReward',index:0};return [...actions,{action,result:player.act(action)}];
  }
  prepare(player: RunPlayerPort): ActionAttempt[] {
    const actions: ActionAttempt[] = [];
    const act = (action: RunAction) => {
      const result = player.act(action); actions.push({ action, result });
      return result;
    };
    const deploy = () => {
      const observation = player.observe();
      const selected = observation.units.slice().sort((a, b) => b.star - a.star || b.cost - a.cost || a.uid - b.uid)
        .slice(0, observation.unitCap);
      const selectedIds = new Set(selected.map(u => u.uid));
      const center = Math.floor(observation.boardWidth / 2);
      const columns = Array.from({ length: observation.boardWidth }, (_, x) => x)
        .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
      const cells = Array.from({ length: observation.ownRows }, (_, depth) => observation.ownRows - 1 - depth)
        .flatMap(y => columns.map(x => ({ location: 'board' as const, x, y })));
      for (let i = 0; i < selected.length && i < cells.length; i++) {
        let view = player.observe(), unit = view.units.find(u => u.uid === selected[i].uid);
        if (!unit) continue;
        const target = cells[i];
        if (unit.location === 'board' && unit.x === target.x && unit.y === target.y) continue;
        const occupant = view.units.find(u => u.location === 'board' && u.x === target.x && u.y === target.y);
        if (unit.location === 'bench' && !occupant && view.units.filter(u => u.location === 'board').length >= view.unitCap) {
          const outgoing = view.units.find(u => u.location === 'board' && !selectedIds.has(u.uid));
          if (!outgoing || !act({ type: 'move', uid: unit.uid, to: { location: 'board', x: outgoing.x, y: outgoing.y } }).ok) continue;
          view = player.observe(); unit = view.units.find(u => u.uid === selected[i].uid);
          if (!unit) continue;
        }
        act({ type: 'move', uid: unit.uid, to: target });
      }
    };
    // Deploy first to release bench space, then reevaluate after each purchase/automatic merge.
    deploy();
    const slots = player.observe().shop.length;
    for (let index = 0; index < slots; index++) {
      const observation = player.observe(), slot = observation.shop[index];
      if (slot.unitId && observation.state.gold >= slot.price) {
        act({ type: 'buy', index }); deploy();
      }
    }
    // Infrastructure fixture: first reserve item goes to first uid with an empty slot, without role strategy.
    while(player.observe().equipmentReserve.length){const unit=player.observe().units.slice().sort((a,b)=>a.uid-b.uid).find(u=>(u.equipment?.length??0)<MAX_EQUIPMENT);
      if(!unit||!act({type:'equip',uid:unit.uid,reserveIndex:0}).ok)break;}
    return actions;
  }
}
