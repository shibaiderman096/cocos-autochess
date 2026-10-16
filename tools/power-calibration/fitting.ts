import type { SideMetrics, SeedBlock, CaseSamples } from './sampling';
import { canonical, sha256 } from './sampling';
import type { Provenance } from './sampling';
import { analysisTags, CALIBRATION_VERSION, environments, variantKey } from './fixtures';
import type { CalibrationCase } from './fixtures';
import type { RunInputs } from '../run-simulation';
import type { EnemyPowerData, PowerRequest, CalibrationConfidence, PowerReliability } from '../../assets/scripts/core/EnemyPowerTypes';

const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
export const median=(v:number[])=>{const s=v.slice().sort((a,b)=>a-b);if(!s.length)throw new Error('Cannot take an empty median');return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
export interface Summary {
  samples:number; seeds:number; wins:number; losses:number; draws:number; winRate:number; score:number; score95:[number,number];
  winRate95:[number,number]; seconds:number; target:number; censored:number; timeout:number; side0Score:number; firstIdScore:number;
  side0Score95:[number,number]; firstIdScore95:[number,number];
  a:SideMetrics; b:SideMetrics;
}
export interface CaseAggregate { fixture:CalibrationCase; train:Summary; validation:Summary; trainEnvironments:Summary[]; validationEnvironments:Summary[] }
function interval(values:number[]):[number,number]{const m=mean(values);if(values.length<2)return[0,1];const variance=values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1);const r=1.96*Math.sqrt(variance/values.length);return[Math.max(0,m-r),Math.min(1,m+r)];}
export function summarize(blocks:SeedBlock[]):Summary {
  if(!blocks.length)throw new Error('Empty calibration partition');
  const all=blocks.flatMap(b=>b.samples),n=all.length;
  const metric=(side:'a'|'b'):SideMetrics=>Object.fromEntries(Object.keys(all[0][side]).map(k=>[k,mean(all.map(s=>(s[side] as any)[k]))])) as unknown as SideMetrics;
  const wins=all.filter(s=>s.outcome===1).length,losses=all.filter(s=>s.outcome===0).length,draws=n-wins-losses;
  return {samples:n,seeds:blocks.length,wins,losses,draws,winRate:wins/n,score:(wins+draws*.5)/n,
    score95:interval(blocks.map(b=>mean(b.samples.map(s=>s.outcome)))),winRate95:interval(blocks.map(b=>mean(b.samples.map(s=>s.outcome===1?1:0)))),
    seconds:mean(all.map(s=>s.seconds)),target:mean(all.map(s=>s.logResourceRatio)),censored:mean(all.map(s=>s.censored)),timeout:mean(all.map(s=>s.timeout)),
    side0Score:mean(all.map(s=>s.aSide===0?s.outcome:1-s.outcome)),firstIdScore:mean(all.map(s=>s.aFirst?s.outcome:1-s.outcome)),
    side0Score95:interval(blocks.map(b=>mean(b.samples.map(s=>s.aSide===0?s.outcome:1-s.outcome)))),
    firstIdScore95:interval(blocks.map(b=>mean(b.samples.map(s=>s.aFirst?s.outcome:1-s.outcome)))),a:metric('a'),b:metric('b')};
}
export function aggregateCase(data:CaseSamples, trainingSeeds:number):CaseAggregate {
  const train=data.blocks.slice(0,trainingSeeds),validation=data.blocks.slice(trainingSeeds);
  return {fixture:data.fixture,train:summarize(train),validation:summarize(validation),
    trainEnvironments:environments.map((_,i)=>summarize(train.filter(b=>b.environment===i))),
    validationEnvironments:environments.map((_,i)=>summarize(validation.filter(b=>b.environment===i)))};
}
export interface FitEdge { a:number;b:number;target:number;weight:number }
export interface RatingFit { logPowers:number[];iterations:number;converged:boolean;rmse:number;maxChange:number;boundHits:number }
/** Anchored, ridge-regularized least squares; coordinate descent has a fixed hard iteration limit. */
export function fitRatings(count:number,edges:FitEdge[],maxIterations=4000,tolerance=1e-9):RatingFit {
  if(!Number.isInteger(count)||count<2||!edges.length||!Number.isInteger(maxIterations)||maxIterations<1||!Number.isFinite(tolerance)||tolerance<=0)throw new Error('Invalid fitting problem');
  const neighbors:Array<Array<{other:number;target:number;weight:number}>>=Array.from({length:count},()=>[]);
  for(const e of edges){if(!Number.isInteger(e.a)||!Number.isInteger(e.b)||e.a<0||e.b<0||e.a>=count||e.b>=count||e.a===e.b||!Number.isFinite(e.target)||!Number.isFinite(e.weight)||e.weight<=0)throw new Error('Invalid fitting edge');
    neighbors[e.a].push({other:e.b,target:e.target,weight:e.weight});neighbors[e.b].push({other:e.a,target:-e.target,weight:e.weight});}
  const visited=new Set<number>([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const n of neighbors[queue[i]])if(!visited.has(n.other)){visited.add(n.other);queue.push(n.other);}
  if(visited.size!==count)throw new Error('Disconnected calibration graph');
  const x=Array(count).fill(0),ridge=.001;let iterations=0,maxChange=Infinity,boundHits=0;
  for(;iterations<maxIterations;iterations++){
    maxChange=0;
    for(let i=1;i<count;i++){
      let numerator=0,denominator=ridge;for(const n of neighbors[i]){numerator+=n.weight*(x[n.other]+n.target);denominator+=n.weight;}
      const raw=numerator/denominator,next=Math.max(-12,Math.min(12,raw));if(next!==raw)boundHits++;
      maxChange=Math.max(maxChange,Math.abs(next-x[i]));x[i]=next;
    }
    if(maxChange<tolerance){iterations++;break;}
  }
  const totalWeight=edges.reduce((s,e)=>s+e.weight,0),rmse=Math.sqrt(edges.reduce((s,e)=>s+e.weight*(x[e.a]-x[e.b]-e.target)**2,0)/totalWeight);
  return {logPowers:x,iterations,converged:maxChange<tolerance,rmse,maxChange,boundHits};
}
function fitSlope(rows:Array<{x:number;y:number;weight:number}>):{slope:number;iterations:number;converged:boolean;boundHit:boolean}{
  let slope=1,converged=false,iterations=0;
  for(;iterations<100;iterations++){
    let g=.001*slope,h=.001;
    for(const r of rows){const p=1/(1+Math.exp(-slope*r.x));g+=r.weight*(p-r.y)*r.x;h+=r.weight*p*(1-p)*r.x*r.x;}
    const next=Math.max(.05,Math.min(20,slope-g/h));if(Math.abs(next-slope)<1e-9){slope=next;converged=true;iterations++;break;}slope=next;
  }
  return {slope,iterations,converged,boundHit:slope===.05||slope===20};
}
export interface ModelFit { model:EnemyPowerData;fits:Record<string,RatingFit>;slopeFit:ReturnType<typeof fitSlope>; variantCount:number }
export function fitPowerModel(data:CaseAggregate[],inputs:RunInputs,prov:Provenance):ModelFit {
  const duels=data.filter(d=>d.fixture.category!=='mirror'&&d.fixture.category!=='team');
  const variants=new Map<string,PowerRequest>();for(const d of duels)for(const u of [...d.fixture.a,...d.fixture.b])variants.set(variantKey(u),u);
  const keys=[...variants.keys()].sort(),index=new Map(keys.map((k,i)=>[k,i]));
  const summaries=(d:CaseAggregate,env:number)=>env<0?d.train:d.trainEnvironments[env];
  const edges=(env:number):FitEdge[]=>duels.map(d=>{const s=summaries(d,env);return {a:index.get(variantKey(d.fixture.a[0]))!,b:index.get(variantKey(d.fixture.b[0]))!,target:s.target,
    weight:(1-.75*s.censored)*(1-.5*s.timeout)};});
  const fits:Record<string,RatingFit>={global:fitRatings(keys.length,edges(-1))};
  environments.forEach((env,i)=>{fits[env]=fitRatings(keys.length,edges(i));});
  const oneCost=inputs.units.filter(u=>u.cost===1).map(u=>index.get(variantKey({unitId:u.id,star:1,equipment:[]}))!);
  const scale=(name:string)=>100/median(oneCost.map(i=>Math.exp(fits[name].logPowers[i])));
  const normalizers=Object.fromEntries(Object.keys(fits).map(name=>[name,scale(name)]));
  const power=(key:string,env='global')=>Math.exp(fits[env].logPowers[index.get(key)!])*normalizers[env];
  const costs:Record<string,number>={};
  for(const cost of [1,2,3,4,5])costs[cost]=median(inputs.units.filter(u=>u.cost===cost).map(u=>power(variantKey({unitId:u.id,star:1,equipment:[]}))));
  const confidence=(key:string,env=-1):CalibrationConfidence=>{
    const i=index.get(key)!,related=duels.filter(d=>variantKey(d.fixture.a[0])===key||variantKey(d.fixture.b[0])===key),node=variants.get(key)!;
    const count=related.reduce((s,d)=>s+summaries(d,env).samples,0),opponents=related.length,fit=fits[env<0?'global':environments[env]];
    const censored=related.reduce((s,d)=>s+summaries(d,env).censored*summaries(d,env).samples,0)/count;
    const errors=edges(env).filter(e=>e.a===i||e.b===i).map(e=>fit.logPowers[e.a]-fit.logPowers[e.b]-e.target);
    const residualRmse=Math.sqrt(mean(errors.map(x=>x*x))),seeds=Math.max(...related.map(d=>summaries(d,env).seeds));
    let reliability:PowerReliability=seeds>=400&&opponents>=5&&residualRmse<.35?'high':seeds>=100?'medium':'low';
    const reasons:string[]=[];
    if(seeds<400)reasons.push('limited independent training seed coverage');
    if(opponents<3)reasons.push('only within-unit or single-opponent comparisons');
    const cfg=inputs.units.find(u=>u.id===node.unitId)!;
    if(inputs.units.filter(u=>u.cost===cfg.cost).length===1){reliability='low';reasons.push('cost tier contains only one unit identity');}
    if(node.star===3){reliability='low';reasons.push('three-star estimate has limited cross-unit opponents; nonlinear skills may be context dependent');}
    if(censored>.02){reliability='low';reasons.push('zero-damage censored samples');}
    const spread=Math.max(...environments.map(e=>power(key,e)))/Math.min(...environments.map(e=>power(key,e)));
    if(spread>1.5){reliability='low';reasons.push('strong distance/environment sensitivity');}
    if(residualRmse>.35){reliability='low';reasons.push('large relative-resource fitting residual');}
    if(node.equipment?.length&&reliability==='high')reliability='medium';
    return {sampleCount:count,independentSeeds:seeds,reliability,reasons,residualRmse,censoredFraction:censored};
  };
  const units:EnemyPowerData['units']={};
  for(const u of inputs.units){
    const p1=power(variantKey({unitId:u.id,star:1,equipment:[]})),stars:Record<string,number>={};
    for(const star of [1,2,3])stars[star]=power(variantKey({unitId:u.id,star,equipment:[]}))/p1;
    const ratio=stars[3]/3.24;
    units[u.id]={cost:u.cost!,baseFactor:p1/costs[u.cost!],starFactors:stars,points:{'1':{},'2':{},'3':{}},tags:analysisTags(u,inputs.skills),
      scaling:ratio>1.8||ratio<1/1.8?'extremeScaling':ratio>1.2||ratio<1/1.2?'specialScaling':'normalScaling'};
  }
  for(const key of keys){const u=variants.get(key)!;units[u.unitId].points[u.star][(u.equipment??[]).slice().sort().join('+')]=
    {power:power(key),environments:Object.fromEntries(environments.map(e=>[e,power(key,e)])) as any,confidence:confidence(key),
      environmentConfidence:Object.fromEntries(environments.map((e,i)=>[e,confidence(key,i)])) as any};}
  const equipment:EnemyPowerData['equipment']={};
  for(const item of inputs.equipment){
    const rows=inputs.units.map(u=>({base:units[u.id].points[1][''],geared:units[u.id].points[1][item.id]}));
    const deltas=rows.map(r=>r.geared.power-r.base.power),gains=rows.map(r=>r.geared.power/r.base.power-1);
    equipment[item.id]={marginalAtOneStar:median(deltas),relativeGain:median(gains),confidence:{
      sampleCount:rows.reduce((s,r)=>s+r.geared.confidence.sampleCount,0),independentSeeds:Math.max(...rows.map(r=>r.geared.confidence.independentSeeds)),
      reliability:'low',reasons:['aggregate across heterogeneous unit synergies; prefer unit/star-specific points'],
      residualRmse:Math.sqrt(mean(rows.map(r=>r.geared.confidence.residualRmse**2))),censoredFraction:mean(rows.map(r=>r.geared.confidence.censoredFraction))}};
  }
  const slopeFit=fitSlope(duels.map(d=>({x:Math.log(power(variantKey(d.fixture.a[0]))/power(variantKey(d.fixture.b[0]))),y:d.train.score,weight:1})));
  const model:EnemyPowerData={version:CALIBRATION_VERSION,calibrationHash:'pending',sourceHash:prov.sourceHash,configHash:prov.configHash,baseScale:100,
    normalization:'median of actual one-cost one-star naked unit estimates = 100; each distance environment normalized separately',
    costBaseline:costs,globalStarFactors:{'1':1,'2':median(Object.values(units).map(u=>u.starFactors[2])),'3':median(Object.values(units).map(u=>u.starFactors[3]))},
    units,equipment,winProbabilitySlope:slopeFit.slope,applicability:{teamValidationMae:0,unitValidationMae:0,notes:[
      'Empirical relative-resource proxy; budget units are not a physical invariant or a guarantee of victory.',
      'Exact measured equipment combinations override additive estimates; unmeasured combinations must return diagnostics.',
      'Validation uses held-out seeds, never fitted ratings or slopes.',
      'Cast counts, damage types and applied stun seconds are available; exact per-skill damage and effective disabled time are unavailable in current event schema.']}};
  // Derived scalars also keep explicit support. A matchup is counted once even when both ends support it.
  const supportFor=(needed:Set<string>,reliability:PowerReliability,reasons:string[]):CalibrationConfidence=>{
    const rows=duels.filter(d=>needed.has(variantKey(d.fixture.a[0]))||needed.has(variantKey(d.fixture.b[0])));
    const points=[...needed].map(k=>confidence(k));
    return {sampleCount:rows.reduce((s,d)=>s+d.train.samples,0),independentSeeds:Math.max(...rows.map(d=>d.train.seeds)),reliability,reasons,
      residualRmse:Math.sqrt(mean(points.map(p=>p.residualRmse**2))),censoredFraction:mean(points.map(p=>p.censoredFraction))};
  };
  const naked=(unitId:string,star:number)=>variantKey({unitId,star,equipment:[]});
  model.derivedConfidence={costBaseline:{},globalStarFactors:{},unitFactors:{},starFactors:{}};
  for(const cost of [1,2,3,4,5]){
    const roster=inputs.units.filter(u=>u.cost===cost);
    model.derivedConfidence.costBaseline[cost]=supportFor(new Set(roster.map(u=>naked(u.id,1))),roster.length===1?'low':'medium',
      ['cost-tier median of measured identities; support counts distinct direct training matchups',...(roster.length===1?['only one identity in cost tier']:[])]);
  }
  for(const star of [1,2,3])model.derivedConfidence.globalStarFactors[star]=supportFor(
    new Set(inputs.units.flatMap(u=>[naked(u.id,1),naked(u.id,star)])),star===3?'low':'medium',['cross-unit median ratio; not an exact universal star multiplier']);
  for(const u of inputs.units){
    const tier=inputs.units.filter(v=>v.cost===u.cost);
    model.derivedConfidence.unitFactors[u.id]=supportFor(new Set(tier.map(v=>naked(v.id,1))),tier.length===1?'low':'medium',['ratio to a cost-tier median; constituent dependencies are shared']);
    model.derivedConfidence.starFactors[u.id]={};
    for(const star of [1,2,3])model.derivedConfidence.starFactors[u.id][star]=supportFor(new Set([naked(u.id,1),naked(u.id,star)]),
      confidence(naked(u.id,star)).reliability,['ratio of correlated measured points; support is not an independent posterior interval']);
  }
  return {model,fits,slopeFit,variantCount:keys.length};
}
export function finalizeModelHash(model:EnemyPowerData,experiment:unknown):void {
  const {calibrationHash:_,...values}=model;model.calibrationHash=sha256(canonical({values,experiment}));
}
