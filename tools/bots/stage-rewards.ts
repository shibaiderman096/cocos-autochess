import type { RunPlayerPort, RunAction, ActionAttempt } from '../../assets/scripts/core/RunSessionTypes';

/** Infrastructure policy for the new public encounter actions; no future state is read. */
export function claimStageRewards(player: RunPlayerPort): ActionAttempt[] {
  const actions: ActionAttempt[] = [];
  const act = (action: RunAction) => { const result = player.act(action); actions.push({ action, result }); return result.ok; };
  for (let n = 0; n < 12; n++) {
    if (player.observe().pendingTraitChoice) {
      if (!act({ type: 'chooseEquipmentTrait', index: 0 })) break;
      continue;
    }
    const o = player.observe(), p = o.pendingStageReward; if (!p) break;
    const base = { type: 'stageChoice' as const, rewardId: p.id };
    if (p.kind === 'specialShop') {
      for (let index = 0; index < p.offers.length; index++) {
        const offer = p.offers[index];
        if (!offer.bought && player.observe().state.gold >= offer.price) act({ ...base, choice: 'buy', index });
      }
      act({ ...base, choice: 'continue' }); break;
    } else if (!act({ ...base, choice: 'claim', index: 0 })) break;
  }
  return actions;
}
