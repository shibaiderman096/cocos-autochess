import type { UnitConfigData } from './ConfigManager';
import type { EnemyPowerData } from './EnemyPowerTypes';
import { EnemyPowerModel } from './EnemyPowerModel';
import { RunRandomContext } from './RunRandomContext';
import type { EnemyCandidate, EnemyDifficultyConfig, EnemyGenerationDiagnostics, WaveKind } from './EnemyGenerationTypes';
import { stableEnemyJson, validateEnemyDifficulty } from './EnemyGenerationTypes';
import { buildEnemyCandidates, compareCandidate, feasibleEnemyBounds } from './EnemyCandidates';
import type { CandidatePool } from './EnemyCandidates';
import type { EnemyBudgetResult } from './EnemyGenerationTypes';
import type { WaveEnemy } from './RoundFlow';
import type { EquipmentPolicyConfig,EnemyEquipmentDiagnostics } from './EquipmentPolicyTypes';
import { equipmentQuota,validateEquipmentPolicy } from './EquipmentPolicy';
import { equipmentCandidates } from './EnemyEquipmentCandidates';
import type { EnemyRoleConfig } from './EnemyFormationTypes';

export interface GeneratedEnemies { enemies:WaveEnemy[]; diagnostics:EnemyGenerationDiagnostics }
const total=(team:EnemyCandidate[])=>team.reduce((n,u)=>n+u.power,0);
const threeCount=(team:EnemyCandidate[])=>team.filter(u=>u.star===3).length;
const deviation=(sum:number,target:number)=>Math.abs(sum-target)/target;

/** Bounded composition search. Placement remains the existing L0 cell sequence. */
export class EnemyGenerator {
  readonly model:EnemyPowerModel;
  readonly config:EnemyDifficultyConfig;
  private roster:UnitConfigData[];
  private pools=new Map<string,CandidatePool>();
  private equippedPools=new Map<string,CandidatePool>();
  private streamIndex:number;
  constructor(c:EnemyDifficultyConfig,readonly power:EnemyPowerData,roster:UnitConfigData[],private random:RunRandomContext,private equipmentPolicy?:EquipmentPolicyConfig,private equipmentRoles?:EnemyRoleConfig) {
    validateEnemyDifficulty(c);
    if(equipmentPolicy)validateEquipmentPolicy(equipmentPolicy,undefined,power);
    if(power.version!==c.powerModelVersion||power.calibrationHash!==c.calibrationHash)throw new Error('Enemy difficulty / power model version or calibration hash mismatch');
    this.model=new EnemyPowerModel(power,{version:c.powerModelVersion});
    this.config=JSON.parse(JSON.stringify(c));this.roster=roster.map(u=>({...u}));
    this.equipmentPolicy=equipmentPolicy&&JSON.parse(JSON.stringify(equipmentPolicy));
    this.equipmentRoles=equipmentRoles&&JSON.parse(JSON.stringify(equipmentRoles));
    const identity=stableEnemyJson({rules:'budget-v1',model:power.version,hash:power.calibrationHash,config:c});
    let tag=0x811c9dc5;for(let i=0;i<identity.length;i++)tag=Math.imul(tag^identity.charCodeAt(i),0x01000193);
    this.streamIndex=tag>>>0;
  }
  pool(stage:number,kind:Exclude<WaveKind,'intro'>):CandidatePool {
    const key=stage+':'+kind;
    if(!this.pools.has(key))this.pools.set(key,buildEnemyCandidates(stage,kind,this.roster,this.model,this.config));
    return this.pools.get(key)!;
  }
  bounds(stage:number,kind:Exclude<WaveKind,'intro'>,population:number):{min:number;max:number} {
    // P3 spends the existing envelope; equipped candidates cannot raise the target or fix late saturation.
    return feasibleEnemyBounds(this.pool(stage,kind),population);
  }
  selectionPool(stage:number,kind:Exclude<WaveKind,'intro'>):CandidatePool {
    const naked=this.pool(stage,kind);if(!this.equipmentPolicy)return naked;
    const key=stage+':'+kind;
    if(!this.equippedPools.has(key))this.equippedPools.set(key,{...naked,candidates:equipmentCandidates(naked.candidates,this.roster,stage,kind,this.equipmentPolicy,this.power,this.model,this.equipmentRoles).sort(compareCandidate)});
    return this.equippedPools.get(key)!;
  }
  generate(budget:EnemyBudgetResult,population:number,cells:Array<{x:number;y:number}>):GeneratedEnemies {
    if(budget.waveKind==='intro')throw new Error('Intro monsters are not budget candidates');
    const naked=this.pool(budget.stage,budget.waveKind),pool=this.selectionPool(budget.stage,budget.waveKind),c=this.config,all=pool.candidates,target=budget.effectiveBudget;
    const limits=feasibleEnemyBounds(naked,population),policy=this.equipmentPolicy,quota=policy&&equipmentQuota(policy,budget.stage,budget.waveKind);
    const nakedPowers=new Map(naked.candidates.map(u=>[u.unitId+':'+u.star,u.power]));
    if(!Number.isFinite(target)||target<=0||target<limits.min-1e-8||target>limits.max+1e-8)throw new Error('Invalid effective budget');
    if(cells.length<population||new Set(cells.map(p=>p.x+','+p.y)).size!==cells.length
      ||cells.some(p=>!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=7||p.y<4||p.y>=8))throw new Error('Illegal L0 enemy cells');
    const rng=this.random.stream('enemy',budget.globalWaveId,this.streamIndex);
    const legal=(team:EnemyCandidate[])=>threeCount(team)<=pool.maxThreeStars&&(!quota||team.filter(u=>u.equipment.length).length<=quota.maxEquippedUnits);
    const error=(team:EnemyCandidate[])=>deviation(total(team),target);
    const score=(team:EnemyCandidate[])=>{
      const sum=total(team),err=deviation(sum,target),counts=new Map<string,number>();
      for(const u of team)counts.set(u.unitId,(counts.get(u.unitId)??0)+1);
      const stars=Math.abs(team.filter(u=>u.star===2).length/population-pool.twoStarTarget);
      const duplicates=(team.length-counts.size)/population+(team.length>1&&counts.size===1?1:0);
      const concentration=Math.max(...team.map(u=>u.power))/sum-1/population;
      // Reaching the budget tolerance is the primary objective. Inside that band, soft policies
      // may spend some of the allowed residual instead of optimizing meaningless decimal places.
      let equipmentScore=0;
      if(quota&&policy){const count=team.reduce((n,u)=>n+u.equipment.length,0),maxNaked=Math.max(...team.map(u=>nakedPowers.get(u.unitId+':'+u.star)!));
        const weakCarrier=team.filter(u=>u.equipment.length).reduce((n,u)=>n+1-nakedPowers.get(u.unitId+':'+u.star)!/maxNaked,0);
        equipmentScore=policy.enemy.targetPenalty*Math.abs(count-quota.targetItems)/Math.max(1,quota.targetItems)+policy.enemy.corePenalty*weakCarrier;
      }
      return (err>c.optimizer.targetDeviation?1+err:err*c.optimizer.targetDeviation)
        +c.optimizer.starPenalty*stars+c.optimizer.diversityPenalty*duplicates+c.optimizer.concentrationPenalty*concentration+equipmentScore;
    };
    const minOne=Math.min(...all.filter(u=>u.star===1).map(u=>u.power));
    const twos=all.filter(u=>u.star===2),minTwo=twos.length?Math.min(...twos.map(u=>u.power)):minOne;
    let desiredTwo=twos.length?Math.round(population*pool.twoStarTarget):0;
    for(;desiredTwo>0;desiredTwo--)if(desiredTwo*minTwo+(population-desiredTwo)*minOne<=target*(1+c.optimizer.targetDeviation))break;
    let team:EnemyCandidate[]=[],remaining=target;
    for(let i=0;i<population;i++){
      const slotTarget=remaining/(population-i);
      const needTwo=desiredTwo-team.filter(u=>u.star===2).length;
      const preferred=Math.floor((i+1)*desiredTwo/population)>Math.floor(i*desiredTwo/population)?2:1;
      const affordable=all.filter(u=>legal([...team,u])).filter(u=>{
        const futureTwo=Math.max(0,needTwo-(u.star===2?1:0)),futureSlots=population-i-1;
        return futureTwo<=futureSlots&&u.power+futureTwo*minTwo+(futureSlots-futureTwo)*minOne<=remaining+target*c.optimizer.targetDeviation;
      });
      const preferredPool=affordable.filter(u=>u.star===preferred);
      const choices=preferredPool.length?preferredPool:affordable.length?affordable:all.filter(u=>legal([...team,u]));
      const ranked=choices.map(u=>({u,s:Math.abs(u.power-slotTarget)/target
        +c.optimizer.starPenalty*Math.abs((team.filter(v=>v.star===2).length+(u.star===2?1:0))/population-pool.twoStarTarget)}))
        .sort((a,b)=>a.s-b.s||compareCandidate(a.u,b.u));
      const best=ranked[0].s,near=ranked.filter(v=>v.s<=best+c.optimizer.targetDeviation/population).slice(0,c.optimizer.topK);
      const chosen=near[rng.int(0,near.length-1)].u;team.push(chosen);remaining-=chosen.power;
    }
    let iterations=0,exactNearest:number|undefined;
    // Small populations permit an exact discrete certificate without a team-combination explosion.
    if(population<=2){
      let best=team,bestScore=score(team),bestError=error(team);exactNearest=total(team);
      const consider=(t:EnemyCandidate[])=>{if(!legal(t))return;const e=error(t),s=score(t);
        if(e<bestError-1e-12){bestError=e;exactNearest=total(t);}
        if((e<=c.optimizer.targetDeviation||error(best)>c.optimizer.targetDeviation)&&(s<bestScore-1e-12)) {best=t;bestScore=s;}
      };
      for(const a of all)if(population===1)consider([a]);else for(const b of all)consider([a,b]);
      team=best;iterations=1;
      if(error(team)>c.optimizer.targetDeviation){
        // The certificate is about nearest budget, not the soft-policy objective.
        for(const a of all)if(population===1){if(a.power===exactNearest)team=[a];}
        else for(const b of all)if(legal([a,b])&&Math.abs(a.power+b.power-exactNearest)<1e-9)team=[a,b];
      }
    } else for(;iterations<c.optimizer.maxIterations;iterations++){
      let best=team,bestScore=score(team);
      const consider=(t:EnemyCandidate[])=>{if(!legal(t))return;
        if(error(team)<=c.optimizer.targetDeviation&&error(t)>c.optimizer.targetDeviation)return;
        const s=score(t);if(s<bestScore-1e-12){best=t;bestScore=s;}
      };
      for(let i=0;i<population;i++)for(const u of all){const next=team.slice();next[i]=u;consider(next);}
      if(best===team&&(error(team)>c.optimizer.targetDeviation
        || Math.abs(team.filter(u=>u.star===2).length/population-pool.twoStarTarget)>1/population+1e-12)){
        for(let i=0;i<population;i++)for(let j=i+1;j<population;j++)for(const a of all){
          const needed=target-(total(team)-team[i].power-team[j].power)-a.power;
          const nearest=all.slice().sort((u,v)=>Math.abs(u.power-needed)-Math.abs(v.power-needed)||compareCandidate(u,v)).slice(0,c.optimizer.pairTopK);
          for(const b of nearest){const next=team.slice();next[i]=a;next[j]=b;consider(next);}
        }
      }
      if(best===team)break;team=best;
    }
    // Deterministic slot order comes from construction/replacements, never role-based deployment.
    const estimate=this.model.estimateTeamPower(team.map(u=>({unitId:u.unitId,cost:u.cost,star:u.star,equipment:u.equipment})));
    const actual=estimate.power,dev=deviation(actual,target),costs:Record<string,number>={},stars:Record<string,number>={};
    for(const u of team){costs[u.cost]=(costs[u.cost]??0)+1;stars[u.star]=(stars[u.star]??0)+1;}
    const within=dev<=c.optimizer.targetDeviation+1e-12,solution=within?'within-tolerance':exactNearest!==undefined?'nearest-discrete':'optimizer-limit';
    const powerDiagnostics=Array.from(new Set(team.flatMap(u=>u.diagnostics)));
    powerDiagnostics.push('Individual-power sum omits composition effects; P1-B held-out team MAE is '+this.power.applicability.teamValidationMae);
    if(!budget.recoveryFeasible)powerDiagnostics.push('Stage recovery cannot be satisfied under the supplied feasible intervals');
    let equipment:EnemyEquipmentDiagnostics|undefined;
    if(policy&&quota){const ids=team.flatMap(u=>u.equipment),conflict=ids.length<quota.targetItems;
      const contribution=actual-this.model.estimateTeamPower(team.map(u=>({unitId:u.unitId,cost:u.cost,star:u.star,equipment:[]}))).power;
      equipment={enemyEquipmentPolicy:policy.enemyVersion,enemyEquipmentTarget:quota.targetItems,enemyEquipmentActual:ids.length,
        enemyEquipmentCount:ids.length,equippedEnemyCount:team.filter(u=>u.equipment.length).length,equipmentIds:ids,
        enemyEquipmentItems:ids.slice(),enemyEquipmentPower:contribution,equipmentPowerContribution:contribution,
        equipmentPolicyBudgetConflict:conflict,equipmentDiagnostics:conflict?['EQUIPMENT_POLICY_BUDGET_CONFLICT: soft target relaxed under budget / bounded search']:[],nakedCandidateCount:naked.candidates.length};}
    return {enemies:team.map((u,i)=>({unitId:u.unitId,star:u.star,...cells[i],equipment:[...u.equipment],statMultiplier:1,damageAmp:0,damageReduction:0})),
      diagnostics:{...budget,...equipment,enemyGenerationMode:'budget-v1',population,actualBudget:actual,deviationPct:dev*100,
        feasible:within,solution,reason:within?undefined:solution==='nearest-discrete'?'NEAREST_DISCRETE_SOLUTION':'BOUNDED_OPTIMIZER_LIMIT',
        nearestAchievableBudget:within?undefined:exactNearest,candidateCount:all.length,optimizerIterations:iterations,
        enemyCostDistribution:costs,enemyStarDistribution:stars,unitDiversity:new Set(team.map(u=>u.unitId)).size,
        twoStarTarget:pool.twoStarTarget,twoStarRatio:(stars[2]??0)/population,
        starPolicyBudgetConflict:Math.abs((stars[2]??0)/population-pool.twoStarTarget)>1/population+1e-12,
        lowConfidenceUnits:team.filter(u=>u.confidence==='low').map(u=>u.unitId+'*'+u.star),estimatedBudgetConfidence:'low',powerDiagnostics,
        powerModelVersion:this.power.version,calibrationHash:this.power.calibrationHash,difficultyConfigVersion:c.version,statMultiplier:1}};
  }
}
