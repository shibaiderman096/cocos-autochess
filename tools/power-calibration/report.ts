import { EnemyPowerModel } from '../../assets/scripts/core/EnemyPowerModel';
import type { EnemyPowerData } from '../../assets/scripts/core/EnemyPowerTypes';
import type { CaseAggregate, Summary, ModelFit } from './fitting';
import type { RunInputs } from '../run-simulation';

export function evaluateModel(model:EnemyPowerData,data:CaseAggregate[]):any {
  const consumer=new EnemyPowerModel(model);
  const rows=data.filter(d=>d.fixture.category!=='mirror').map(d=>{
    const pa=consumer.estimateTeamPower(d.fixture.a).power,pb=consumer.estimateTeamPower(d.fixture.b).power;
    const p=consumer.winProbability(pa,pb),s=d.validation;
    return {id:d.fixture.id,category:d.fixture.category,labels:d.fixture.labels,a:d.fixture.a,b:d.fixture.b,predictedPowerA:pa,predictedPowerB:pb,
      ratio:pa/pb,predictedScore:p,actualScore:s.score,actualWinRate:s.winRate,drawRate:s.draws/s.samples,score95:s.score95,
      absoluteError:Math.abs(p-s.score),samples:s.samples,independentSeeds:s.seeds,
      brier:p*p-2*p*s.score+(s.wins+.25*s.draws)/s.samples,
      correctDecisive:p>=.5?s.wins:s.losses,decisive:s.wins+s.losses};
  });
  const summary=(list:typeof rows)=>{
    const n=list.reduce((s,r)=>s+r.samples,0),decisive=list.reduce((s,r)=>s+r.decisive,0);
    const bins=Array.from({length:10},(_,i)=>{const b=list.filter(r=>Math.min(9,Math.floor(r.predictedScore*10))===i),samples=b.reduce((s,r)=>s+r.samples,0);
      return {lower:i/10,upper:(i+1)/10,samples,predicted:samples?b.reduce((s,r)=>s+r.predictedScore*r.samples,0)/samples:null,actual:samples?b.reduce((s,r)=>s+r.actualScore*r.samples,0)/samples:null};});
    return {cases:list.length,samples:n,mae:n?list.reduce((s,r)=>s+r.absoluteError*r.samples,0)/n:null,
      brier:n?list.reduce((s,r)=>s+r.brier*r.samples,0)/n:null,decisiveAccuracy:decisive?list.reduce((s,r)=>s+r.correctDecisive,0)/decisive:null,
      expectedCalibrationError:n?bins.reduce((s,b)=>s+b.samples*Math.abs((b.predicted??0)-(b.actual??0)),0)/n:null,bins};
  };
  const teamRows=rows.filter(r=>r.category==='team'),duelRows=rows.filter(r=>r.category!=='team');
  const nearEqual=teamRows.filter(r=>r.ratio>=.95&&r.ratio<=1.05);
  return {unit:summary(duelRows),team:summary(teamRows),rows,
    worstUnit:duelRows.slice().sort((a,b)=>b.absoluteError-a.absoluteError).slice(0,10),
    worstTeam:teamRows.slice().sort((a,b)=>b.absoluteError-a.absoluteError).slice(0,10),
    nearEqualTeams:nearEqual,nearEqualExtreme:nearEqual.filter(r=>r.actualScore>=.9||r.actualScore<=.1),
    note:'All rows use held-out seeds; actualScore = win + draw/2. Metrics include draws separately. Confidence intervals cluster the four orientations by seed.'};
}
export function analyzeModel(model:EnemyPowerData,data:CaseAggregate[],inputs:RunInputs):any {
  const rows=inputs.units.map(u=>{const p=model.units[u.id],p1=p.points[1][''].power,p2=p.points[2][''].power,p3=p.points[3][''].power;
    return {unitId:u.id,cost:u.cost,tags:p.tags,p1,p2,p3,p2over1:p2/p1,p3over2:p3/p2,p3over1:p3/p1,
      threeStarVsCandidate:p3/p1/3.24,costCorrection:p.baseFactor,scaling:p.scaling,confidence:p.points[1][''].confidence.reliability};});
  const stars=rows.slice().sort((a,b)=>Math.abs(Math.log(b.threeStarVsCandidate))-Math.abs(Math.log(a.threeStarVsCandidate)));
  const singles:any[]=[],combos:any[]=[];
  for(const [unitId,u]of Object.entries(model.units))for(const [star,points]of Object.entries(u.points)){
    const base=points[''].power;
    for(const [key,p]of Object.entries(points))if(key){
      const items=key.split('+');
      if(items.length===1)singles.push({unitId,star:Number(star),equipment:key,base,power:p.power,delta:p.power-base,relativeGain:p.power/base-1,confidence:p.confidence.reliability});
      else{const additive=base+items.reduce((s,id)=>s+points[id].power-base,0);
        combos.push({unitId,star:Number(star),equipment:items,base,power:p.power,additive,interaction:p.power-additive,relativeAdditiveError:(additive-p.power)/p.power});}
    }
  }
  const mirror=data.filter(d=>d.fixture.category==='mirror').map(d=>({id:d.fixture.id,unit:d.fixture.a[0],
    train:d.train,validation:d.validation,byEnvironment:d.validationEnvironments,
    sideBias:Math.abs(d.validation.side0Score-.5),idBias:Math.abs(d.validation.firstIdScore-.5),
    idIntervalExcludesHalf:d.validation.firstIdScore95[1]<.5||d.validation.firstIdScore95[0]>.5}));
  const trends=[1,2,3,4,5].map(cost=>{const u=rows.filter(r=>r.cost===cost);return {cost,identities:u.length,baseline:model.costBaseline[cost],mean:u.reduce((s,r)=>s+r.p1,0)/u.length};});
  return {unitValues:rows,costTrends:trends,costTrendInversions:trends.slice(1).filter((r,i)=>r.mean<trends[i].mean),
    undervalued:rows.filter(r=>r.costCorrection>1).sort((a,b)=>b.costCorrection-a.costCorrection).slice(0,10),
    overvalued:rows.filter(r=>r.costCorrection<1).sort((a,b)=>a.costCorrection-b.costCorrection).slice(0,10),
    starAnomalies:stars,starMonotonicViolations:rows.filter(r=>r.p2<=r.p1||r.p3<=r.p2),
    singleEquipment:singles,negativeEquipment:singles.filter(r=>r.delta<0),
    equipmentSynergyAnomalies:combos.sort((a,b)=>Math.abs(b.relativeAdditiveError)-Math.abs(a.relativeAdditiveError)),
    mirror:{cases:mirror.length,maxSideBias:Math.max(...mirror.map(m=>m.sideBias)),maxIdBias:Math.max(...mirror.map(m=>m.idBias)),
      outliers:mirror.filter(m=>m.sideBias>.05||m.idBias>.05).sort((a,b)=>Math.max(b.sideBias,b.idBias)-Math.max(a.sideBias,a.idBias)),
      intervalFlagged:mirror.filter(m=>m.idBias>.05&&m.idIntervalExcludesHalf),rows:mirror},
    confidenceCounts:['high','medium','low'].map(reliability=>({reliability,points:Object.values(model.units).flatMap(u=>Object.values(u.points).flatMap(Object.values)).filter(p=>p.confidence.reliability===reliability).length})),
    metricLimitations:['The resource-ratio target is an explicit heuristic, not a uniquely identifiable true power.',
      'Exact skill damage attribution is unavailable; actual damage types, cast counts, applied stun durations, healing and teleports are recorded.',
      'A 5-cost tier containing one identity cannot establish population-wide cost reliability.',
      'Equipment interaction error is relative to a separately fitted combination, not to an independent physical power measurement.']};
}
const num=(n:number,d=3)=>Number.isFinite(n)?n.toFixed(d):'n/a';
const table=(headers:string[],rows:any[][])=>['| '+headers.join(' | ')+' |','| '+headers.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.join(' | ')+' |')].join('\n');
export function calibrationMarkdown(model:EnemyPowerData,fit:ModelFit,analysis:any,validation:any,experiment:any):string {
  return `# P1-B 离线战力标定结果\n\n版本：${model.version}；模型哈希：${model.calibrationHash}。不接入实际敌军生成。\n\n`
    +`## 方法与范围\n\n真实 BattleSim，保持当前属性、技能、装备效果不变。${experiment.caseCount}组对战，每种子换边×实例顺序4场；三个合法距离环境按种子轮换。共${experiment.logicalBattles}场逻辑样本。训练${experiment.trainSeeds[0]}～${experiment.trainSeeds[1]}；独立验证${experiment.validationSeeds[0]}～${experiment.validationSeeds[1]}，同一 matchup+seed 不跨集合。\n\n`
    +`拟合观测是 0.5×log((初始生命A+实际治疗A)/(初始生命B+实际治疗B)) + 0.5×log((实际伤害A+1)/(实际伤害B+1))。共享时长在DPS比值中相消；+1生命平滑零伤害。该量是公开的近似尺度，不是战力真值。胜负不直接转换成价格，而用于训练 logistic 胜率映射和独立验证。使用有锚点、ridge=0.001、最多4000次坐标下降的联合最小二乘。\n\n`
    +`基准为所有实际1费1★无装备棋子的估值中位数100；费用baseline由各档中位数计算，不强制随费用递增。每单位、星级和已测装备组合保留独立点；close/medium/far环境各自使用同一中位数归一约定。\n\n`
    +table(['拟合','迭代','收敛','RMSE','边界命中'],Object.entries(fit.fits).map(([k,v])=>[k,v.iterations,v.converged,num(v.rmse),v.boundHits]))+'\n\n'
    +`## 费用与个体\n\n`+table(['费用','身份样本数','baseline','档内均值'],analysis.costTrends.map((r:any)=>[r.cost,r.identities,num(r.baseline),num(r.mean)]))+'\n\n'
    +table(['单位','费','个体修正','P1','P2/P1','P3/P2','P3/P1','分类'],analysis.unitValues.map((r:any)=>[r.unitId,r.cost,num(r.costCorrection),num(r.p1),num(r.p2over1),num(r.p3over2),num(r.p3over1),r.scaling]))+'\n\n'
    +`全局候选星级参考是1/1.8/3.24，实际拟合中位数为 ${num(model.globalStarFactors[1])}/${num(model.globalStarFactors[2])}/${num(model.globalStarFactors[3])}，没有把异常值改回候选倍率。星级非单调条目${analysis.starMonotonicViolations.length}个，费用均值逆序${analysis.costTrendInversions.length}处；全部明细见 analysis.json。\n\n`
    +`## 费用基线低估 / 高估的单位\n\n以下仅比较费用档中位数与本模型个体值，不等于已验证的游戏强弱评级。若不足10个符合方向的条目，列出现有全部。\n\n`
    +table(['方向','单位','个体/费用基线'],[...analysis.undervalued.map((r:any)=>['低估',r.unitId,num(r.costCorrection)]),...analysis.overvalued.map((r:any)=>['高估',r.unitId,num(r.costCorrection)])])+'\n\n'
    +`## 星级异常\n\n`+table(['单位','P3/P1','相对3.24','分类'],analysis.starAnomalies.slice(0,10).map((r:any)=>[r.unitId,num(r.p3over1),num(r.threeStarVsCandidate),r.scaling]))+'\n\n'
    +`末影人3★的额外5000生命与50倍/永久强化、鼬的3★长控制、小樱自疗等均保持原效果。对这些机制没有削弱或加强。零伤害、极端全胜和跨对手覆盖不足会造成可识别性问题，三★统一保留low标记。\n\n`
    +`## 装备与组合\n\n`+table(['装备','1★跨单位边际中位数','相对收益中位数','置信度'],Object.entries(model.equipment).map(([k,v])=>[k,num(v.marginalAtOneStar),num(v.relativeGain),v.confidence.reliability]))+'\n\n'
    +`单装备负边际样本${analysis.negativeEquipment.length}个，未强行改为正数。运行时优先读取单位×星级的具体数据；全局值只供明确fallback。\n\n`
    +table(['单位/星级','组合','组合拟合值','简单相加','相加相对误差'],analysis.equipmentSynergyAnomalies.slice(0,10).map((r:any)=>[r.unitId+'/'+r.star,r.equipment.join('+'),num(r.power),num(r.additive),num(r.relativeAdditiveError)]))+'\n\n'
    +`组合误差以独立组合拟合值为参照，不是假定存在真实装备价格。未测组合只给 additive-fallback + low + diagnostic。3★多装备未穷举，不能当作已标定。\n\n`
    +`## 独立验证\n\n`+table(['集合','case','样本','胜率MAE','Brier','有胜负准确率','ECE'],[['单挑',validation.unit.cases,validation.unit.samples,num(validation.unit.mae),num(validation.unit.brier),num(validation.unit.decisiveAccuracy),num(validation.unit.expectedCalibrationError)],['阵容',validation.team.cases,validation.team.samples,num(validation.team.mae),num(validation.team.brier),num(validation.team.decisiveAccuracy),num(validation.team.expectedCalibrationError)]] )+'\n\n'
    +`预测目标是 win+draw/2，胜/负/平同时单独保存；区间按seed对四种朝向聚类，非把重复朝向当作独立种子。阵容包含2v2、3v3、5v5：前后排、双近战、双远程、AoE、控制、自疗、传送；无虚构团队治疗。团队训练不参与个体拟合与胜率斜率估计。\n\n`
    +table(['阵容case','预测战力A/B','预测score','实际score','实际胜率','绝对误差'],validation.worstTeam.map((r:any)=>[r.id,num(r.predictedPowerA)+'/'+num(r.predictedPowerB),num(r.predictedScore),num(r.actualScore),num(r.actualWinRate),num(r.absoluteError)]))+'\n\n'
    +`相近预测战力（比值0.95～1.05）的验证阵容${validation.nearEqualTeams.length}组，其中实际score≤0.1或≥0.9的极端组合${validation.nearEqualExtreme.length}组，完整列在 validation.json。不能靠属性倍率掩盖这些反例；P1-C必须保留诊断与模型适用范围。\n\n`
    +`## 镜像与置信度\n\n镜像${analysis.mirror.cases}组，最大换边偏差${num(analysis.mirror.maxSideBias)}，最大先实例化偏差${num(analysis.mirror.maxIdBias)}；偏差超过0.05的条目${analysis.mirror.outliers.length}组，其中先实例化区间不含0.5的${analysis.mirror.intervalFlagged.length}组。区间未做165项多重比较校正，不直接宣称系统性公平缺陷；平衡交换后的A/B对称也不等于消除了实例顺序效应。具体位置/星级/装备及胜负平、余血、伤害、治疗、时长见 observations.json 与 analysis.json。镜像不参与定价。\n\n`
    +table(['置信度','组合点数'],analysis.confidenceCounts.map((r:any)=>[r.reliability,r.points]))+'\n\n'
    +`high需要至少400个独立训练seed、多个对手、较小拟合残差；medium表示样本足够但覆盖有限；low包括5费仅一名身份、三★、强距离敏感、零伤害删失或大残差。sampleCount是实际对战数，independentSeeds是独立seed数，不能混用。\n\n`
    +`## 产物和边界\n\nmodel保存在 enemy-power.json；原始逐seed缓存位于指定缓存目录，不塞进运行时配置。observations.json为分组统计，validation.json为未参与拟合的验证结果，analysis.json为异常与标签，provenance.json记录源码/配置哈希及seed集合。performance.json单独记录实际新跑场数、缓存命中和wall clock，不参与确定性哈希。\n\n当前游戏不读取新模型。P1-C预算生成、智能布阵、Boss/Elite生成、装备奖励和正式机器人都未实现。\n`;
}
