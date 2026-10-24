import type { EquipmentPolicyConfig,EquipmentProgress,EquipmentRewardEvent,RewardWave } from './EquipmentPolicyTypes';
import { unlockedEquipment } from './EquipmentPolicy';
import { RunRandomContext } from './RunRandomContext';
import { formationHash } from './EnemyFormationTypes';

/** Progression only. Does not touch combat, inventory, economy, or other random domains. */
export function createEquipmentReward(c:EquipmentPolicyConfig,random:RunRandomContext,wave:RewardWave,winner:number,progress:EquipmentProgress):EquipmentRewardEvent {
  const event:EquipmentRewardEvent={rewardTriggered:false,rewardCandidates:[],diagnostics:[]};
  if(progress.pending||wave.id<=progress.lastEvaluatedWaveId)return event;
  progress.lastEvaluatedWaveId=wave.id;
  if(winner!==0||!['elite','boss'].includes(wave.waveKind??''))return event;
  const stage=wave.stage!,round=wave.round!,kind=wave.waveKind as 'elite'|'boss';
  const rng=random.stream('reward',wave.id,parseInt(formationHash(c.rewardVersion),16)>>>0);
  const guarantee=round===wave.roundsInStage&&!progress.guaranteeSatisfied[stage];
  const chance=kind==='boss'?c.reward.bossChance:c.reward.eliteChance;
  const rolled=rng.next()<chance;if(!rolled&&!guarantee)return event;
  let pool=unlockedEquipment(c,stage,c.reward.tierUnlock).filter(id => !c.reward.excludedIds?.includes(id));
  if(!pool.length){pool=c.reward.emptyBasicFallbackIds.slice().sort();event.diagnostics.push('EMPTY_BASIC_POOL_CONFIGURED_ADVANCED_FALLBACK');}
  if(pool.length<c.reward.choices)event.diagnostics.push('INSUFFICIENT_POOL_FEWER_CHOICES:'+pool.length);
  if(!pool.length){event.diagnostics.push('EMPTY_REWARD_POOL');return event;}
  for(let i=pool.length-1;i>0;i--){const j=rng.int(0,i);[pool[i],pool[j]]=[pool[j],pool[i]];}
  const rewardId=`${c.rewardVersion}:${random.runSeed}:${wave.id}`,source=guarantee&&!rolled?'guarantee':kind;
  const candidates=pool.slice(0,c.reward.choices);
  progress.pending={rewardId,waveId:wave.id,stage,round,source,candidates,claimed:false,diagnostics:event.diagnostics.slice()};
  return {...event,rewardTriggered:true,rewardId,rewardCandidates:candidates.slice(),source};
}
