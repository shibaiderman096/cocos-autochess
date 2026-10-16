import type {BotPlayerPort} from '../../assets/scripts/core/BotObservation';
import type {ActionAttempt,RunAction} from '../../assets/scripts/core/RunSessionTypes';
import type {BotConfig,RunBot} from './types';
import {affordable,levelTarget} from './economy-policy';
import {purchaseScore,saleCandidates,needsRoll} from './shop-policy';
import {deploy} from './formation-policy';
import {chooseReward,equipInventory} from './equipment-policy';

export class HeuristicBot implements RunBot {
  readonly version:string;
  private readonly c:BotConfig;
  constructor(readonly id:'weak'|'medium'|'strong',config:BotConfig,readonly configHash:string){this.c=JSON.parse(JSON.stringify(config));this.version=this.c.version;}
  claimRewards(player:BotPlayerPort):ActionAttempt[]{return chooseReward(player,this.c);}
  prepare(player:BotPlayerPort):ActionAttempt[] {
    const actions:ActionAttempt[]=[],c=this.c,weak=this.id==='weak';
    const act=(action:RunAction)=>{const result=player.act(action);actions.push({action,result});return result.ok;};
    const buyVisible=()=>{
      for(let n=0;n<10;n++){const o=player.observe();
        const ranked=o.shop.map((_,index)=>({index,score:purchaseScore(index,o,c,weak)})).filter(v=>Number.isFinite(v.score)).sort((a,b)=>b.score-a.score||a.index-b.index);
        if(!ranked.length)break;
        if(!act({type:'buy',index:ranked[0].index}))break;
        deploy(player,c,actions);
      }
    };
    deploy(player,c,actions);
    let o=player.observe();
    for(const uid of saleCandidates(o,c)){
      o=player.observe();if(o.units.filter(u=>u.location==='bench').length<o.benchSlots-c.benchBuffer)break;
      act({type:'sell',uid});
    }
    buyVisible();
    for(let n=0;n<c.maxXpBuys;n++){o=player.observe();
      const target=levelTarget(o,c),neededPopulation=o.units.length>o.unitCap;
      if(o.state.level>=target||!neededPopulation||!affordable(o,c,o.catalog.xpPurchase.gold))break;
      if(!act({type:'buyExp'}))break;deploy(player,c,actions);
    }
    for(let roll=0;roll<c.maxRolls;roll++){
      o=player.observe();if(!needsRoll(o,c,weak)||!affordable(o,c,o.catalog.refreshCost+Math.min(...o.shop.filter(s=>s.unitId).map(s=>s.price),1)))break;
      if(!act({type:'refresh'}))break;buyVisible();
    }
    deploy(player,c,actions);equipInventory(player,c,actions);return actions;
  }
}
