import type { UnitConfigData } from './ConfigManager';
import type { TraitConfigData } from '../battle/types';
import type { WaveEnemy } from './RoundFlow';
import type { WaveKind } from './EnemyGenerationTypes';
import { unitPrice, rollShopCost, shopCostRates, validCost } from './ShopConfig';
import { RunRandomContext } from './RunRandomContext';

export interface EnemyGoldRules {
  version: 'gold-v1'; initialGold: number; goldPerRound: number; goldPerStage: number;
  eliteGoldPerStage: number; bossGoldPerStage: number; maxShopRolls: number; themeTraits: string[];
  earlyGrowth?: { beforeStage: number; roundsPerGold: number };
}
export interface EnemyGoldDiagnostics {
  version: 'gold-v1'; baseGold: number; bonusGold: number; totalGold: number; spentGold: number; remainingGold: number;
  population: number; shopLevel: number; shopRates: number[];
  /** One accepted shop-tier draw per deployed slot; rank upgrades never change these fees. */
  costDraws: number[]; themeTrait?: string;
  themeMembers: number; distinctUnits: number;
}

export function validateEnemyGoldRules(r: EnemyGoldRules): void {
  if (!r || r.version !== 'gold-v1' || ![r.initialGold,r.goldPerRound,r.goldPerStage,r.eliteGoldPerStage,r.bossGoldPerStage,r.maxShopRolls]
    .every(n=>Number.isSafeInteger(n)&&n>=0) || r.initialGold<1 || r.maxShopRolls<10 || r.maxShopRolls>2000
    || !Array.isArray(r.themeTraits) || !r.themeTraits.length || new Set(r.themeTraits).size!==r.themeTraits.length
    || r.themeTraits.some(id=>typeof id!=='string'||!id)) throw new Error('Invalid enemy gold rules');
  if(r.earlyGrowth&&(!Number.isSafeInteger(r.earlyGrowth.beforeStage)||r.earlyGrowth.beforeStage<3
    ||!Number.isSafeInteger(r.earlyGrowth.roundsPerGold)||r.earlyGrowth.roundsPerGold<1))throw new Error('Invalid early enemy gold growth');
}

export const enemyUnitGold = (unit: Pick<UnitConfigData,'cost'>, star: number): number => unitPrice(unit.cost) * 3 ** (star - 1);

/** Range determines depth. Each occupied row is centered and uses legal unique odd-r cells. */
export function tidyEnemyRows(enemies: WaveEnemy[], roster: UnitConfigData[]): WaveEnemy[] {
  const units = new Map(roster.map(u=>[u.id,u]));
  const order = enemies.map((e,i)=>({i,u:units.get(e.unitId)!})).sort((a,b)=>a.u.range-b.u.range
    || Number(b.u.role==='tank')-Number(a.u.role==='tank') || a.i-b.i);
  const rows: number[][] = [[],[],[],[]];
  for (const {i,u} of order) {
    const preferred=Math.max(0,Math.min(3,Math.ceil(u.range)-1));
    const row=[...Array.from({length:4-preferred},(_,j)=>preferred+j),...Array.from({length:preferred},(_,j)=>preferred-j-1)].find(y=>rows[y].length<7);
    if(row===undefined)throw new Error('Enemy formation exceeds board capacity');
    rows[row].push(i);
  }
  const result=enemies.map(e=>({...e}));
  rows.forEach((indices,depth)=>{
    const n=indices.length,y=4+depth;
    const columns=n%2===1?Array.from({length:n},(_,i)=>3-Math.floor(n/2)+i)
      :y%2===1?Array.from({length:n},(_,i)=>3-n/2+i)
      :Array.from({length:n},(_,i)=>i<n/2?3-n/2+i:4+i-n/2);
    indices.forEach((index,i)=>Object.assign(result[index],{x:columns[i],y}));
  });
  return result;
}

/** Draw deployed fees from the player's shop table before spending the remaining gold on ranks. */
export function generateGoldArmy(rules: EnemyGoldRules, stage: number, completedRounds: number, waveId: number, kind: WaveKind,
  population: number, roster: UnitConfigData[], traits: readonly TraitConfigData[], random: RunRandomContext): {enemies:WaveEnemy[];diagnostics:EnemyGoldDiagnostics} {
  validateEnemyGoldRules(rules);
  if(!Number.isSafeInteger(stage)||stage<2||!Number.isSafeInteger(completedRounds)||completedRounds<0
    ||!Number.isSafeInteger(population)||population<1||population>10)throw new Error('Invalid enemy gold context');
  const interval=rules.earlyGrowth&&stage<rules.earlyGrowth.beforeStage?rules.earlyGrowth.roundsPerGold:1;
  const baseGold=rules.initialGold+Math.floor(completedRounds/interval)*rules.goldPerRound+(stage-2)*rules.goldPerStage;
  const bonusGold=stage*(kind==='elite'?rules.eliteGoldPerStage:kind==='boss'?rules.bossGoldPerStage:0),totalGold=baseGold+bonusGold;
  if(!Number.isSafeInteger(totalGold)||totalGold<population||population<1||population>10)throw new Error('Enemy gold budget cannot fund population');
  const sorted=roster.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),shopRates=shopCostRates(population,sorted.map(u=>validCost(u.cost)));
  const rng=random.stream('enemy',waveId,7201),themeRng=random.stream('enemy',stage,7202),costDraws=[0,0,0,0,0];
  const affordable=sorted.filter(u=>shopRates[validCost(u.cost)-1]>0&&enemyUnitGold(u,1)<=totalGold-population+1);
  const themes=traits.filter(t=>rules.themeTraits.includes(t.id)&&!t.pendingMembers).map(t=>({id:t.id,members:new Set(t.members),
    available:affordable.filter(u=>t.members.includes(u.id)).length,threshold:t.breakpoints[0]?.count??3})).filter(t=>t.available>0);
  const feasible=themes.filter(t=>t.available>=Math.min(population,t.threshold));
  const themePool=feasible.length?feasible:themes.sort((a,b)=>b.available-a.available||a.id.localeCompare(b.id)).slice(0,1);
  let theme=themePool.length?themePool[themeRng.int(0,themePool.length-1)]:undefined;
  const team: Array<{unit:UnitConfigData;star:number}>=[];let remaining=totalGold;
  const choose=(choices:UnitConfigData[]):UnitConfigData=>{
    const existing=new Set(team.map(u=>u.unit.id));
    const unique=choices.filter(u=>!existing.has(u.id)),pool=unique.length?unique:choices;
    const themed=pool.filter(u=>theme?.members.has(u.id)),cohort=themed.length?themed:pool;
    return cohort[rng.int(0,cohort.length-1)];
  };
  if(!affordable.length)throw new Error('Enemy gold budget cannot fund supported shop costs');
  const cheapest=Math.min(...affordable.map(u=>u.cost??1));
  if(cheapest*population>totalGold)throw new Error('Enemy gold budget cannot fund supported shop costs');
  const drawnCosts:number[]=[];
  for(let slot=0;slot<population;slot++){
    const allowance=remaining-(population-slot-1)*cheapest;
    const available=affordable.filter(u=>unitPrice(u.cost)<=allowance);
    let tier:ReturnType<typeof rollShopCost>=null;
    // Unaffordable rolls cannot consume the gold reserved for the remaining slots.
    for(let roll=0;roll<rules.maxShopRolls;roll++){
      const drawn=rollShopCost(shopRates,()=>rng.next());
      if(drawn&&available.some(u=>validCost(u.cost)===drawn)){tier=drawn;break;}
    }
    const pool=available.filter(u=>tier?validCost(u.cost)===tier:(u.cost??1)===cheapest);
    const cost=pool[rng.int(0,pool.length-1)].cost??1;
    drawnCosts.push(cost);costDraws[validCost(cost)-1]++;remaining-=unitPrice(cost);
  }
  const costs=[...new Set(drawnCosts)].sort((a,b)=>a-b);
  type Purchase = {cost:number;star:number;gold:number};
  type Allocation = {purchases:Purchase[];squares:number};
  let states=new Map<number,Allocation>([[0,{purchases:[],squares:0}]]);
  for(let slot=0;slot<population;slot++){
    const next=new Map<number,Allocation>();
    const options=[1,2,3].map(star=>({cost:drawnCosts[slot],star,gold:unitPrice(drawnCosts[slot])*3**(star-1)}));
    const reserved=drawnCosts.slice(slot+1).reduce((sum,cost)=>sum+unitPrice(cost),0);
    for(const [sum,state] of states)for(const option of options){
      const value=sum+option.gold;
      if(value+reserved>totalGold)continue;
      // At the same total spend, minimum squared gold is exactly minimum variance.
      const squares=state.squares+option.gold**2,previous=next.get(value);
      if(!previous||squares<previous.squares)
        next.set(value,{purchases:[...state.purchases,option],squares});
    }
    states=next;
  }
  if(!states.size)throw new Error('Enemy gold budget cannot fund supported shop costs');
  const spent=Math.max(...states.keys()),allocation=states.get(spent)!;
  const slotsByCost=costs.map(cost=>({cost,count:allocation.purchases.filter(p=>p.cost===cost).length}));
  const themeCoverage=(candidate:typeof theme)=>slotsByCost.reduce((n,{cost,count})=>n+Math.min(count,
    sorted.filter(u=>(u.cost??1)===cost&&candidate?.members.has(u.id)).length),0);
  // Pick a faction supported by the fees that were actually rolled.
  if(themeCoverage(theme)<Math.min(2,population))
    theme=themes.slice().sort((a,b)=>themeCoverage(b)-themeCoverage(a)||a.id.localeCompare(b.id))[0];
  for(const purchase of allocation.purchases){
    const unit=choose(sorted.filter(u=>(u.cost??1)===purchase.cost));
    team.push({unit,star:purchase.star});
  }
  // Improve diversity within the same fee. Equal-value cards from other fees must not replace a draw.
  for(const member of team){
    const duplicate=team.filter(u=>u.unit.id===member.unit.id).length>1;
    const alternatives=sorted.filter(unit=>(unit.cost??1)===(member.unit.cost??1)&&!team.some(u=>u.unit.id===unit.id)
      &&(duplicate||(!theme?.members.has(member.unit.id)&&theme?.members.has(unit.id))));
    if(alternatives.length){
      member.unit=choose(alternatives);
    }
  }
  remaining=totalGold-spent;
  const enemies=tidyEnemyRows(team.map(({unit,star})=>({unitId:unit.id,star,x:0,y:4,statMultiplier:1,equipment:[]})),roster);
  return {enemies,diagnostics:{version:'gold-v1',baseGold,bonusGold,totalGold,spentGold:totalGold-remaining,remainingGold:remaining,
    population,shopLevel:population,shopRates,costDraws,themeTrait:theme?.id,
    themeMembers:new Set(team.filter(u=>theme?.members.has(u.unit.id)).map(u=>u.unit.id)).size,distinctUnits:new Set(team.map(u=>u.unit.id)).size}};
}
