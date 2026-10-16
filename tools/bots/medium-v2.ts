import type {BotPlayerPort} from '../../assets/scripts/core/BotObservation';
import type {ActionAttempt,RunAction} from '../../assets/scripts/core/RunSessionTypes';
import type {BotConfig} from './types';
import {HeuristicBot} from './heuristic-bot';
import {economyPlan} from './medium-economy';
import {purchaseScore,saleCandidates} from './shop-policy';
import {deploy} from './formation-policy';
import {equipInventory} from './equipment-policy';

export class MediumV2Bot extends HeuristicBot {
  diagnostics?:{mode:string;policy:unknown;unusedGoldReason:string[]};
  private previousHp:number|undefined;
  private lossStreak=0;
  constructor(private readonly policyConfig:BotConfig,hash:string){super('medium',policyConfig,hash);}
  prepare(player:BotPlayerPort):ActionAttempt[]{
    const c=this.policyConfig,actions:ActionAttempt[]=[];
    const entry=player.observe();
    if(this.previousHp!==undefined)this.lossStreak=entry.state.playerHp<this.previousHp?this.lossStreak+1:0;
    this.previousHp=entry.state.playerHp;
    const plan=()=>economyPlan(player.observe(),c,this.lossStreak);
    const act=(action:RunAction)=>{const result=player.act(action);actions.push({action,result});return result.ok;};
    const tidy=()=>{for(const uid of saleCandidates(player.observe(),c)){
      const o=player.observe();if(o.units.filter(u=>u.location==='bench').length<o.benchSlots-c.benchBuffer)break;
      if(!act({type:'sell',uid}))break;
    }};
    const shop=()=>{tidy();for(let n=0;n<10;n++){
      const o=player.observe(),p=plan();
      const offers=o.shop.map((_,index)=>({index,score:purchaseScore(index,o,c,false,p)}))
        .filter(s=>Number.isFinite(s.score)).sort((a,b)=>b.score-a.score||a.index-b.index);
      if(!offers.length||!act({type:'buy',index:offers[0].index}))break;
      deploy(player,c,actions);
    }};
    const initial=plan();let xpBuys=0,rolls=0;
    const level=()=>{while(xpBuys<c.maxXpBuys){const p=plan();if(!p.levelUpAllowed)break;
      if(!act({type:'buyExp'}))break;xpBuys++;deploy(player,c,actions);
    }};
    deploy(player,c,actions);shop();level();shop();
    // The per-wave cap never grows after spending or a state transition.
    const limit=initial.maxRolls;
    while(rolls<limit){const o=player.observe(),p=plan();
      if(!p.wantsRoll||o.state.gold-o.catalog.refreshCost<Math.max(p.reserveGold,p.minGold)+1)break;
      if(!act({type:'refresh'}))break;rolls++;shop();level();
    }
    deploy(player,c,actions);equipInventory(player,c,actions);
    const final=plan(),o=player.observe(),unusedGoldReason:string[]=[];
    if(o.state.gold<=final.reserveGold)unusedGoldReason.push('INTEREST_RESERVE');
    else {
      if(final.population.gold===null)unusedGoldReason.push('MAX_LEVEL');
      else if(!final.population.candidateUid)unusedGoldReason.push('NO_BENCH_UPGRADE');
      else if(!final.population.worthwhile)unusedGoldReason.push('LEVEL_UP_NOT_WORTH');
      else if(!final.levelUpAllowed)unusedGoldReason.push('LEVEL_UP_NOT_AFFORDABLE_WITH_RESERVE');
      else if(xpBuys>=c.maxXpBuys)unusedGoldReason.push('XP_ACTION_LIMIT');
      if(rolls>=limit&&final.wantsRoll)unusedGoldReason.push('ROLL_LIMIT');
      if(!final.wantsRoll)unusedGoldReason.push('CORE_ALREADY_STABLE','NO_POLICY_UPGRADE_TARGET');
      if(!o.shop.some((_,index)=>Number.isFinite(purchaseScore(index,o,c,false,final))))unusedGoldReason.push('NO_USEFUL_SHOP_OPTION');
      if(o.units.filter(u=>u.location==='bench').length>=o.benchSlots)unusedGoldReason.push('BENCH_FULL');
    }
    this.diagnostics={mode:initial.mode,policy:{initial,final,xpBuys,rolls,rollLimit:limit},unusedGoldReason};
    return actions;
  }
}
