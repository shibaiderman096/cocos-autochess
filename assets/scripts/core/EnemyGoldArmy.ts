import type { UnitConfigData } from './ConfigManager';
import type { TraitConfigData } from '../battle/types';
import type { WaveEnemy } from './RoundFlow';
import type { WaveKind } from './EnemyGenerationTypes';
import { COST_PRICE, rollShopCost, shopCostRates, validCost } from './ShopConfig';
import { RunRandomContext } from './RunRandomContext';

export interface EnemyGoldRules {
  version: 'gold-v1'; initialGold: number; goldPerRound: number; goldPerStage: number;
  eliteGoldPerStage: number; bossGoldPerStage: number; maxShopRolls: number; themeTraits: string[];
}
export interface EnemyGoldDiagnostics {
  version: 'gold-v1'; baseGold: number; bonusGold: number; totalGold: number; spentGold: number; remainingGold: number;
  population: number; shopLevel: number; shopRates: number[]; costDraws: number[]; themeTrait?: string;
  themeMembers: number; distinctUnits: number;
}

export function validateEnemyGoldRules(r: EnemyGoldRules): void {
  if (!r || r.version !== 'gold-v1' || ![r.initialGold,r.goldPerRound,r.goldPerStage,r.eliteGoldPerStage,r.bossGoldPerStage,r.maxShopRolls]
    .every(n=>Number.isSafeInteger(n)&&n>=0) || r.initialGold<1 || r.maxShopRolls<10 || r.maxShopRolls>2000
    || !Array.isArray(r.themeTraits) || !r.themeTraits.length || new Set(r.themeTraits).size!==r.themeTraits.length
    || r.themeTraits.some(id=>typeof id!=='string'||!id)) throw new Error('Invalid enemy gold rules');
}

export const enemyUnitGold = (unit: Pick<UnitConfigData,'cost'>, star: number): number => COST_PRICE[validCost(unit.cost)] * 3 ** (star - 1);

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

/** Shop cost rolls share the player's table. Affordability, uniqueness and a common faction guide purchases. */
export function generateGoldArmy(rules: EnemyGoldRules, stage: number, completedRounds: number, waveId: number, kind: WaveKind,
  population: number, roster: UnitConfigData[], traits: readonly TraitConfigData[], random: RunRandomContext): {enemies:WaveEnemy[];diagnostics:EnemyGoldDiagnostics} {
  validateEnemyGoldRules(rules);
  if(!Number.isSafeInteger(stage)||stage<2||!Number.isSafeInteger(completedRounds)||completedRounds<0
    ||!Number.isSafeInteger(population)||population<1||population>10)throw new Error('Invalid enemy gold context');
  const baseGold=rules.initialGold+completedRounds*rules.goldPerRound+(stage-2)*rules.goldPerStage;
  const bonusGold=stage*(kind==='elite'?rules.eliteGoldPerStage:kind==='boss'?rules.bossGoldPerStage:0),totalGold=baseGold+bonusGold;
  if(!Number.isSafeInteger(totalGold)||totalGold<population||population<1||population>10)throw new Error('Enemy gold budget cannot fund population');
  const sorted=roster.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),shopRates=shopCostRates(population,sorted.map(u=>validCost(u.cost)));
  const rng=random.stream('enemy',waveId,7201),themeRng=random.stream('enemy',stage,7202),costDraws=[0,0,0,0,0];
  const affordable=sorted.filter(u=>shopRates[validCost(u.cost)-1]>0&&enemyUnitGold(u,1)<=totalGold-population+1);
  const themes=traits.filter(t=>rules.themeTraits.includes(t.id)&&!t.pendingMembers).map(t=>({id:t.id,members:new Set(t.members),
    available:affordable.filter(u=>t.members.includes(u.id)).length,threshold:t.breakpoints[0]?.count??3})).filter(t=>t.available>0);
  const feasible=themes.filter(t=>t.available>=Math.min(population,t.threshold));
  const themePool=feasible.length?feasible:themes.sort((a,b)=>b.available-a.available||a.id.localeCompare(b.id)).slice(0,1);
  const theme=themePool.length?themePool[themeRng.int(0,themePool.length-1)]:undefined;
  const team: Array<{unit:UnitConfigData;star:number}>=[];let remaining=totalGold;
  const choose=(choices:UnitConfigData[],excludeIndex=-1):UnitConfigData=>{
    const existing=new Set(team.filter((_u,i)=>i!==excludeIndex).map(u=>u.unit.id));
    const unique=choices.filter(u=>!existing.has(u.id)),pool=unique.length?unique:choices;
    const themed=pool.filter(u=>theme?.members.has(u.id)),cohort=themed.length?themed:pool;
    return cohort[rng.int(0,cohort.length-1)];
  };
  for(let roll=0;roll<rules.maxShopRolls;roll++){
    if(team.length===population&&remaining===0)break;
    const cost=rollShopCost(shopRates,()=>rng.next());if(!cost)break;costDraws[cost-1]++;
    if(team.length<population){
      const reserve=population-team.length-1;
      const choices=sorted.filter(u=>u.cost===cost&&enemyUnitGold(u,1)<=remaining-reserve);
      if(!choices.length)continue;const unit=choose(choices);team.push({unit,star:1});remaining-=enemyUnitGold(unit,1);continue;
    }
    const upgrades=team.map((u,i)=>({u,i,price:u.star<3?enemyUnitGold(u.unit,u.star+1)-enemyUnitGold(u.unit,u.star):Infinity}))
      .filter(v=>v.u.unit.cost===cost&&v.price<=remaining).sort((a,b)=>a.u.star-b.u.star
        ||Number(!!theme?.members.has(b.u.unit.id))-Number(!!theme?.members.has(a.u.unit.id))||a.i-b.i);
    if(upgrades.length){const selected=upgrades[0];selected.u.star++;remaining-=selected.price;continue;}
    const replacements=team.map((u,i)=>({u,i,price:(COST_PRICE[cost]-COST_PRICE[validCost(u.unit.cost)])*3**(u.star-1)}))
      .filter(v=>v.price>0&&v.price<=remaining).sort((a,b)=>a.price-b.price||a.i-b.i);
    for(const target of replacements){
      const choices=sorted.filter(u=>u.cost===cost&&!team.some((v,i)=>i!==target.i&&v.unit.id===u.id));
      // Retain an established faction whenever upgrading card cost permits it.
      const themed=choices.filter(u=>theme?.members.has(u.id));
      if(theme?.members.has(target.u.unit.id)&&!themed.length)continue;
      if(!choices.length)continue;target.u.unit=choose(themed.length?themed:choices,target.i);remaining-=target.price;break;
    }
  }
  while(team.length<population){
    const reserve=population-team.length-1,choices=sorted.filter(u=>shopRates[validCost(u.cost)-1]>0&&enemyUnitGold(u,1)<=remaining-reserve);
    const min=Math.min(...choices.map(u=>enemyUnitGold(u,1))),unit=choose(choices.filter(u=>enemyUnitGold(u,1)===min));
    team.push({unit,star:1});remaining-=min;
  }
  // Reconcile three-copy upgrades jointly, so an early purchase never strands an otherwise spendable budget.
  let states=new Map<number,{stars:number[];score:number}>([[0,{stars:[],score:0}]]);
  for(const member of team){
    const next=new Map<number,{stars:number[];score:number}>();
    for(const [sum,state] of states)for(const star of [1,2,3]){
      const value=sum+enemyUnitGold(member.unit,star);if(value>totalGold)continue;
      const score=state.score+star*star,previous=next.get(value);
      if(!previous||score<previous.score)next.set(value,{stars:[...state.stars,star],score});
    }
    states=next;
  }
  const spent=Math.max(...states.keys()),ranks=states.get(spent)!;
  team.forEach((member,i)=>member.star=ranks.stars[i]);remaining=totalGold-spent;
  const enemies=tidyEnemyRows(team.map(({unit,star})=>({unitId:unit.id,star,x:0,y:4,statMultiplier:1,equipment:[]})),roster);
  return {enemies,diagnostics:{version:'gold-v1',baseGold,bonusGold,totalGold,spentGold:totalGold-remaining,remainingGold:remaining,
    population,shopLevel:population,shopRates,costDraws,themeTrait:theme?.id,
    themeMembers:new Set(team.filter(u=>theme?.members.has(u.unit.id)).map(u=>u.unit.id)).size,distinctUnits:new Set(team.map(u=>u.unit.id)).size}};
}
