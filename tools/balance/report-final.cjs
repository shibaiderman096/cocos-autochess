const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),readline=require('node:readline');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/p4-balance'),load=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const read=p=>fs.readFileSync(path.join(base,p),'utf8'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ids=['weak','medium','strong'],fmt=(v,n=2)=>v===null||v===undefined?'NA':Number(v).toFixed(n),pct=v=>v===null?'NA':(v*100).toFixed(1)+'%',rate=r=>r.rate===null?'NA (n=0)':`${r.wins}/${r.total} = ${pct(r.rate)} [${pct(r.low)}, ${pct(r.high)}]`;
const table=(headers,rows)=>'| '+headers.join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+rows.map(row=>'| '+row.join(' | ')+' |').join('\n')+'\n\n';
const rel=p=>'['+p+']('+p+')';
const baseline=load('baseline/runs-500/aggregate.json'),training=load('training/confirmation-500/aggregate.json'),validation=load('validation/runs-500/aggregate.json'),holdout=load('holdout/runs-250/aggregate.json');
const frozen=load('baseline/frozen.json'),candidate=load('freeze/candidate.json'),freeze=load('freeze/manifest.json'),ranked=load('training/search-v1/ranked-20.json'),history=read('training/search-v1/iterations.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(hash(path.join(base,'freeze/candidate.json')),freeze.candidateSha256);
for(const [file,digest]of Object.entries(freeze.sourceHashes))assert.equal(hash(path.join(root,file)),digest,'Frozen runtime changed: '+file);
for(const [name,value]of Object.entries(frozen.configs))assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config',name+'.json'),'utf8')),value,'Production numerical config changed: '+name);
for(const [group,count]of [[validation,500],[holdout,250]])for(const s of Object.values(group)){assert.equal(s.runs,count);assert.equal(s.errors.length,0);assert.equal(s.failedActions,0);assert.equal(s.stages.length,99);}
const a=load('determinism/single-50/manifest.json').hashes,b=load('determinism/parallel-50/manifest.json').hashes;
const logicalFiles=Object.keys(a).filter(file=>file!=='provenance.json');for(const file of logicalFiles)assert.equal(a[file],b[file],file);
const finalLog=read('final-tests.log');assert.ok(finalLog.includes('P4 balance: 6 passed, 0 failed'));assert.ok(finalLog.includes('Formal bots: 8 passed, 0 failed'));
assert.equal(load('final-test-result.json').exitCode,0);
const reasons=[];
const economyDiagnosis=load('analysis/medium-economy-validation.json');
if(economyDiagnosis.deathsWith100PlusGold>0)reasons.push('Medium基准策略资格不足：Stage6死亡'+economyDiagnosis.stage6Deaths+'局，其中'+economyDiagnosis.deathsWith100PlusGold+'局入战仍有100+金币，固定等级目标造成过度囤积');
for(const [label,group]of [['Validation',validation],['Holdout',holdout]]){
 const s=group.medium.stages;
 if(s[2].cumulativeCompletion.rate<.8||s[2].cumulativeCompletion.rate>.9)reasons.push(`${label} Medium Stage3不在80%..90%区间`);
 if(s[5].cumulativeCompletion.rate<.45||s[5].cumulativeCompletion.rate>.55)reasons.push(`${label} Medium Stage6不在45%..55%区间`);
 for(const stage of [6,12,99])if(group.weak.stages[stage-1].completed>group.medium.stages[stage-1].completed||group.medium.stages[stage-1].completed>group.strong.stages[stage-1].completed)reasons.push(`${label} Stage${stage}机器人排序倒挂`);
 if(group.strong.stages[98].cumulativeCompletion.rate>=.9)reasons.push(`${label} Strong仍有至少90%通关99阶段，无尽上限未解决`);
}
assert.ok(reasons.length,'This reporting run expects the documented unsuccessful finite search; successful promotion requires an explicit reviewed implementation.');
const performanceRows=[];
function collectPerformance(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())collectPerformance(file);else if(e.name==='performance.json'){const p=JSON.parse(fs.readFileSync(file,'utf8'));if(Number.isFinite(p.runs)&&Number.isFinite(p.battles))performanceRows.push({report:path.relative(base,path.dirname(file)).replaceAll('\\','/'),...p});}}}
collectPerformance(base);const total={runs:performanceRows.reduce((n,p)=>n+p.runs,0),battles:performanceRows.reduce((n,p)=>n+p.battles,0),sumBatchWallSeconds:performanceRows.reduce((n,p)=>n+p.wallMilliseconds/1000,0)};
const replay=load('replay/comparison.json');assert.equal(replay.actionsExactlyMatch,true);
Object.assign(total,{standaloneReplayRuns:1,standaloneReplayBattles:replay.waves,recordedRuns:total.runs+1,recordedBattles:total.battles+replay.waves});
const decision={status:'rejected',candidateBalanceVersion:'balance-v1',productionBalance:'p3-baseline (unchanged)',productionNumericalChanges:[],candidateSha256:freeze.candidateSha256,
 acceptedBalanceVersion:null,retainedGenerationVersion:'budget-v1',retainedPowerModelVersion:frozen.configs['enemy-power'].version,
 sourceReport:'docs/p4-balance/README.md',trainingSeeds:[1,500],validationSeeds:[501,1000],holdoutSeeds:[1001,1250],searchIterations:20,reasons,
 retainedConfigHashes:load('baseline/baseline-completed.json').configHashes,policy:'Do not deploy a candidate that fails the primary target. No tuning after validation/holdout; a new experiment needs a new version and untouched seed partitions.'};
const within=(s,stage,min,max)=>s.stages[stage-1].cumulativeCompletion.rate>=min&&s.stages[stage-1].cumulativeCompletion.rate<=max;
decision.gates={publicActionsAndResources:true,determinism:true,independentSeedPartitions:true,holdoutUsedOnce:true,fullRegression:true,
 mediumNormalPlayerProxy:false,validationStage3:within(validation.medium,3,.8,.9),validationStage6:within(validation.medium,6,.45,.55),holdoutStage3:within(holdout.medium,3,.8,.9),holdoutStage6:within(holdout.medium,6,.45,.55),
 newBalanceAccepted:false};
assert.deepEqual(load('holdout-once.json').seeds,[1001,1250]);assert.deepEqual(load('holdout-once.json').bots,ids);
assert.equal(load('holdout-once.json').inputHash,load('holdout/runs-250/provenance.json').inputHash);
async function publicCompositionAudit(bot,report='validation/runs-500',count=500){
 const input=readline.createInterface({input:fs.createReadStream(path.join(base,report,bot,'per-run.jsonl')),crlfDelay:Infinity});
 const result={runs:0,ironGolemPlayerRuns:0,ironGolemPlayerWaves:0,ironGolemEnemyWaves:0,uncalibratedEnemyItems:[],deathByKind:{},stage3And6Composition:{}};
 const allowed=new Set(frozen.configs['equipment-policy'].enemy.calibratedItems);
 for await(const line of input){if(!line)continue;const run=JSON.parse(line);result.runs++;let iron=false;
  if(run.deathContext)result.deathByKind[run.deathContext.stage+'-'+run.deathContext.waveKind]=(result.deathByKind[run.deathContext.stage+'-'+run.deathContext.waveKind]??0)+1;
  for(const w of run.waves){if(w.playerRoster.some(u=>u.unitId==='iron_golem')){iron=true;result.ironGolemPlayerWaves++;}if(w.enemyRoster.some(u=>u.unitId==='iron_golem'))result.ironGolemEnemyWaves++;
   for(const item of w.enemyRoster.flatMap(u=>u.equipment??[]))if(!allowed.has(item))result.uncalibratedEnemyItems.push(item);
   if(bot==='medium'&&[3,6].includes(w.stage)){const key=w.stage+'-'+w.round,row=result.stage3And6Composition[key]??={encounters:0,units:{},stars:{},items:{}};row.encounters++;
    for(const u of w.enemyRoster){row.units[u.unitId]=(row.units[u.unitId]??0)+1;row.stars[u.star]=(row.stars[u.star]??0)+1;for(const item of u.equipment??[])row.items[item]=(row.items[item]??0)+1;}}
  }if(iron)result.ironGolemPlayerRuns++;
 }assert.equal(result.runs,count);assert.equal(result.uncalibratedEnemyItems.length,0);return result;
}
async function main(){
 const usage={},holdoutUsage={};for(const bot of ids){usage[bot]=await publicCompositionAudit(bot);holdoutUsage[bot]=await publicCompositionAudit(bot,'holdout/runs-250',250);}
 let text='# P4：机器人、整局平衡与有限调参验收\n\n**当前验收未通过，P4不能宣布完成。** 三档策略代码、真实公共动作审计、批量工具、独立Validation/Holdout和回归已落地；Medium经济策略的正常玩家代表性仍有缺陷，20轮搜索也未满足Stage3目标，未将失败候选写入正式难度资源。详见第13节的拒绝记录。\n\n';
 text+='所有完成率均以阶段末波结算后HP>0为完成，允许末波战败但存活。单波胜率、条件阶段完成率、累计完成率及Boss击败率分别统计；主要比例为Wilson95%区间。未到达波次不计为遭遇。\n\n';
 text+='## 1. 三档机器人设计\n\n';
 text+=table(['机器人/版本','经济与搜卡','升级/升星','布阵','装备/奖励'],[
 ['Weak / weak-v1','不保利息，5波最多刷新1次，优先现成合成','少量买经验，保留便宜核心；并非随机自杀','基本前后排','第一件大致可用奖励、第一名适配单位'],
 ['Medium / medium-v1','从真实利息规则计算10..50储备；低HP花储备，有限刷新','追关键2★，人口不足且有候补时买经验，保留1个核心追3★','角色分排、基础分散','按角色与空缺选择、穿戴'],
 ['Strong / strong-v1','更多即时边际价值与有限搜卡，低HP更早消费','更积极补人口/关键2★；仅2个核心可追3★','当前预览刺客/AoE/侧翼反应','核心carry/tank与组合协同、合法转移装备']]);
 text+='共用 '+rel('../../tools/bots/heuristic-bot.ts')+'，拆分economy/shop/roster/formation/equipment；升级与奖励逻辑分别归入经济和装备模块。策略配置与源文件SHA在'+rel('baseline/bot-freeze.json')+'；正式报告逐局保留botVersion、botConfigHash、每波决策SHA、真实敌我阵容与指标。Bot不调用BattleSim搜索。\n\n';
 text+='## 2. 机器人合法性\n\n';
 text+='RunSession.botPort仅有observe/act；静态公开目录与当前敌军预览冻结，玩家快照分离。没有未来商店、奖励、敌军、子系统RNG或模型接口。策略只通过真实购买、付费刷新/经验、移动、卖出、穿戴、卸下和领奖动作改变状态。原playerPort与Minimal夹具保留。\n\n';
 text+='逐动作审计非负金币、UID、棋盘/人口/备战席/装备槽、卡池+保留商店+owned基础卡总守恒；装备只有成功领奖增加1，其余动作守恒。Smoke、Development及全部大批次无流程错误/失败动作。测试另有未来敌军getter陷阱、禁止依赖扫描、3/6/99完整决策共同前缀和同seed重放。玩家原公共state包含runSeed，但策略既不读取也不派生未来RNG；不以隐藏卡池/标定战力估值。\n\n';
 text+='## 3. Baseline\n\n';
 text+='先冻结11份配置、真实经济/商店规则、原源码与P0–P3证据（'+rel('baseline/frozen.json')+'），再实现并冻结策略，50-seed Smoke→200-seed Development→500-seed未调参Baseline之后才开始搜索。Baseline为各500局seed1..500、真实12阶段campaign；另有各20局99阶段诊断，不能把12阶段完成写成99通关。\n\n';
 text+=table(['机器人','Stage3累计','Stage6累计','Stage12累计'],ids.map(id=>[id,...[3,6,12].map(n=>rate(baseline[id].stages[n-1].cumulativeCompletion))]));
 text+='Stage1..10的三档完整基线表见'+rel('baseline/README.md')+'。Baseline Medium/Strong各20局长尾全部通关99，说明原配置确有无尽内容上限。\n\n';
 text+='## 4. Medium核心结果\n\n';
 text+=table(['分区','种子/样本','Stage3累计 / 95%CI','Stage6累计 / 95%CI'],[
 ['Training确认','1..500 / 500',rate(training.medium.stages[2].cumulativeCompletion),rate(training.medium.stages[5].cumulativeCompletion)],
 ['Validation（最终独立结论）','501..1000 / 500',rate(validation.medium.stages[2].cumulativeCompletion),rate(validation.medium.stages[5].cumulativeCompletion)],
 ['Holdout（冻结后仅一次）','1001..1250 / 250',rate(holdout.medium.stages[2].cumulativeCompletion),rate(holdout.medium.stages[5].cumulativeCompletion)]]);
 text+='Stage3目标80%..90%，Stage6目标45%..55%。Stage3的100%累计存活不是100%单波/Boss获胜；即使Boss失利也可保留HP。训练20轮都没有改变这个事实，不能声称“已调好”。\n\n';
 text+='## 5. Weak/Strong对比\n\n';
 text+=table(['分区','机器人','Stage3','Stage6','Stage99'],[['Validation',validation],['Holdout',holdout]].flatMap(([name,g])=>ids.map(id=>[name,id,...[3,6,99].map(n=>rate(g[id].stages[n-1].cumulativeCompletion))])));
 text+='按Stage6/12/99检查Strong≥Medium≥Weak；早期三者100%并列，区分度不足。Strong远高于Medium，但99阶段通过仍过高，不能将这种上限解释为理想最终难度。\n\n';
 text+='## 6. 每阶段数据\n\n';
 text+='Validation Medium核心及长尾代表点如下；全部99阶段、三档均有逐波/逐阶段CSV与summary.json，包含HP、金币、等级、人口、星级和装备。\n\n';
 text+=table(['Stage','进入','完成','条件完成 / CI','累计完成 / CI','入阶段HP','购物后金币','等级','人口'],validation.medium.stages.filter(s=>s.stage<=12||[25,50,99].includes(s.stage)).map(s=>[s.stage,s.entered,s.completed,rate(s.conditionalCompletion),rate(s.cumulativeCompletion),fmt(s.averageEntryHp),fmt(s.averageGold),fmt(s.averageLevel),fmt(s.averagePopulation)]));
 for(const id of ids)text+=rel('validation/runs-500/'+id+'/per-stage.csv')+' · '+rel('validation/runs-500/'+id+'/per-wave.csv')+' · '+rel('validation/runs-500/'+id+'/per-run.jsonl')+'\n\n';
 text+='每波还保存购物前/后金币、利息、刷新/经验/买卡花费、战斗时长、敌存活数、HP前后、库存/已装备、主carry/tank、失败上下文、敌军预算/阵型/模板。主carry/tank按当波公开属性启发式排名，不保证全局固定UID；formationChanges计战前已有单位位置变化，新上场体现在阵容。死亡分布见各summary.failureDistribution和逐局deathContext。\n\n';
 text+='**经济资格问题：** Validation Medium在Stage6死亡'+economyDiagnosis.stage6Deaths+'局，全部'+economyDiagnosis.deathsWith100PlusGold+'局入战仍有100+金币，平均'+fmt(economyDiagnosis.averageDeathGold)+'金，平均等级'+fmt(economyDiagnosis.averageDeathLevel)+'。固定阶段等级目标限制买经验，刷新规则又把高2★比例视作足够强，富余收入因此长期闲置；低HP触发消费在大额Boss伤害前可能来不及。详细种子与入战状态见'+rel('analysis/medium-economy-validation.json')+'。这说明淘汰并非只由敌军难度决定，当前Medium还不能视作已验收的正常玩家代理，不能只削敌军凑50%。本轮保持冻结；后续应先修订并升级botVersion，重新建立未调参基线和未使用的验证分区，再恢复难度调优。\n\n';
 text+='## 7. 升星\n\n';
 text+=table(['Validation机器人','首次2★ P25/中位/P75','达成/总局','首次3★ P25/中位/P75','达成/总局','首次主carry2★中位'],ids.map(id=>{const g=validation[id].growth;return[id,[g.first2Star.p25,g.first2Star.median,g.first2Star.p75].map(v=>fmt(v,1)).join('/'),g.first2Star.observed+'/'+g.first2Star.total,[g.first3Star.p25,g.first3Star.median,g.first3Star.p75].map(v=>fmt(v,1)).join('/'),g.first3Star.observed+'/'+g.first3Star.total,fmt(g.mainCarry2Star.median,1)];}));
 text+='时间为global waveId，仅达成者的分位；未达成/先死亡是删失，不能据此宣称全体玩家的3★中位时间。\n\n';
 text+=table(['机器人 Stage5','平均1★/2★/3★上阵','主carry1★/2★/3★观测数','主carry≥2★观测占比'],ids.map(id=>{const s=validation[id].stages[4];return[id,[s.averageBoard1,s.averageBoard2,s.averageBoard3].map(v=>fmt(v)).join('/'),[s.mainCarryStars.one,s.mainCarryStars.two,s.mainCarryStars.three].join('/'),pct(s.mainCarry2PlusRate)];}));
 text+='“Stage5主力通常2★”对本组启发式机器人得到支持，首次2★实际早在开局合成；Weak便宜3★可能比Medium更早，单看首次3★不等于整局策略更强。\n\n';
 text+='## 8. 装备\n\n';
 text+=table(['Validation Medium Stage','平均玩家总装备','平均敌军总装备','库存','carry/tank装备','提供/领取','advanced/special已选'],validation.medium.stages.filter(s=>[2,3,5,6,8,12,50,99].includes(s.stage)).map(s=>[s.stage,fmt(s.averagePlayerItems),fmt(s.averageEnemyItems),fmt(s.averageInventory),fmt(s.averageCarryItems)+'/'+fmt(s.averageTankItems),s.rewardsOffered+'/'+s.rewardsClaimed,s.rewardTiers.advanced+'/'+s.rewardTiers.special]));
 text+='玩家累计库存与敌军“当前波”装备不是同一口径；玩家上阵/穿戴明细在逐波数据，不能仅用总件数推断战斗强度。前期仍是真实2选1 advanced fallback，未伪造basic。当前早期存活过高与装备成长并存，但没有随机化装备对照，不能断言advanced奖励就是唯一原因。建议补充真正basic内容并单独测量，保持现有装备效果不改。\n\n';
 text+='奖励后下一波胜率仅相关诊断：'+table(['Medium Validation','获胜 / CI'],[['前波领奖',rate(validation.medium.rewardAssociation.nextWaveAfterReward)],['前波未领奖',rate(validation.medium.rewardAssociation.nextWaveWithoutReward)]]);
 text+='分组混杂阶段、剩余HP、既有战力与生存者筛选，不作因果解释。敌军继续仅用4件已标定装备；6件未标定装备未加入敌军白名单，逐波审计未发现越界。\n\n';
 text+='## 9. 关键难度波与Formation\n\n';
 text+=table(['Validation Medium波次','类型','遭遇/胜率CI','平均/中位掉血','入波HP','敌存活数','标记'],validation.medium.anomalies.slice(0,10).map(w=>[w.stage+'-'+w.round,w.waveKind,rate(w.victory),fmt(w.averageHpLoss)+'/'+fmt(w.medianHpLoss),fmt(w.averageHpBefore),fmt(w.enemySurvivors),w.flags.join(',')]));
 text+='这些是相邻暴露样本的异常标记，不是自动因果判断；Boss/Elite峰值与生存筛选需分开解释。完整异常、入Boss状态、时长、预算、星级及装备见summary.waves/anomalies和逐局阵容。Stage3/6逐波单位频数和死亡类型见'+rel('accepted/diagnostics.json')+'。\n\n';
 text+='Stage3逐波诊断（Validation Medium）：\n\n';
 text+=table(['波','胜率CI','入波HP / 平均掉血','requested / effective / actual','玩家等级 / 2★数','敌2★数 / 装备'],validation.medium.waves.filter(w=>w.stage===3).map(w=>[w.stage+'-'+w.round,rate(w.victory),fmt(w.averageHpBefore)+' / '+fmt(w.averageHpLoss),[w.requested,w.effective,w.actual].map(v=>fmt(v)).join(' / '),fmt(w.averagePlayerLevel)+' / '+fmt(w.averageBoard2),fmt(w.enemy2)+' / '+fmt(w.enemyItems)]));
 const boss6=validation.medium.waves.find(w=>w.stage===6&&w.waveKind==='boss'),composition6=usage.medium.stage3And6Composition['6-'+boss6.round];
 const topUnits=Object.entries(composition6.units).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id,count])=>id+' '+fmt(count/composition6.encounters)+'名/场').join('，');
 text+='Stage3首波仍受上一阶段可恢复锚点约束，普通波消耗很少；到Boss前HP充足，Boss战败率无法直接转成累计淘汰率。Stage6则已接近全人口，高预算生成器明显集中选择'+topUnits+'；该Boss敌2★均值'+fmt(boss6.enemy2)+'、玩家等级均值'+fmt(boss6.averagePlayerLevel)+'、实际预算'+fmt(boss6.actual)+'、入波HP'+fmt(boss6.averageHpBefore)+'、平均掉血'+fmt(boss6.averageHpLoss)+'。这是预算、重复强单位和人口/星级阈值共同出现的证据，不能把单兵标定总和当成整队胜率保证。单位基础属性不在本轮修改白名单内。\n\n';
 const kindLoss=(stage,kind)=>{const rows=validation.medium.waves.filter(w=>w.stage===stage&&w.waveKind===kind),n=rows.reduce((s,w)=>s+w.encounters,0);return n?rows.reduce((s,w)=>s+w.averageHpLoss*w.encounters,0)/n:null;};
 text+=table(['Stage','普通胜率 / 掉血','Elite胜率 / 掉血','Boss胜率 / 掉血'],[3,5,6,7,8].map(stage=>{const s=validation.medium.stages[stage-1];return[stage,...['normal','elite','boss'].map(kind=>rate(s[kind+'Victory'])+' / '+fmt(kindLoss(stage,kind)))];}));
 text+='Elite/Boss并非在每阶段都严格更难：阶段内玩家升人口与装备，敌预算又开始受可行上限约束，可使Stage7/8后段精英/Boss胜率反而回升；数据保留这类异常，不借修改名义倍率隐藏。普通波池化区间只作描述（同局多波相关），单波及每阶段完成率各seed一票，是主要统计口径。\n\n';
 text+=table(['边界','前阶段Boss胜率CI / 掉血','后阶段首波胜率CI / 掉血'],validation.medium.boundaries.map(x=>[x.from+'→'+x.to,x.last?rate(x.last.victory)+' / '+fmt(x.last.averageHpLoss):'未遭遇',x.first?rate(x.first.victory)+' / '+fmt(x.first.averageHpLoss):'未遭遇']));
 const cliffs=[];for(let n=1;n<12;n++){const prev=validation.medium.stages[n-1],s=validation.medium.stages[n];if(prev.conditionalCompletion.rate!==null&&s.conditionalCompletion.rate!==null&&prev.conditionalCompletion.rate-s.conditionalCompletion.rate>.15)cliffs.push({stage:s.stage,drop:prev.conditionalCompletion.rate-s.conditionalCompletion.rate,conditional:s.conditionalCompletion});}
 text+='条件阶段完成率下降>15pp：'+(cliffs.length?cliffs.map(c=>'Stage'+c.stage+'下降'+pct(c.drop)+'，本阶段'+rate(c.conditional)).join('；'):'无')+'。预算连续不保证玩法连续，解锁、合成强度、入波HP和阵型会共同形成阈值。\n\n';
 text+='P2配对实验保持候选/机器人不变，只变Formation覆盖；delta为auto减指定级别：\n\n';
 text+=table(['对照','配对seed数','Stage6 delta / paired95%','Stage12 delta / paired95%'],['L0','L1','L2','L3'].map(level=>{const p=load('formation/paired-'+level+'-vs-auto.json'),show=n=>{const s=p.stages.find(s=>s.stage===n);return pct(s.deltaBMinusA)+' ['+s.pairedNormal95.map(pct).join(', ')+']';};return[level+'→auto',p.pairedSeeds,show(6),show(12)];}));
 text+='L0使用200对，L1/L2/L3各50对；差值区间为配对均值差的正态近似95%，不是Wilson单率区间。auto相对L0存在明显难度贡献，其他级别小样本区间宽，不按噪声调P2权重。这是Medium的整局策略对照；战果变化会继续改变收入、奖励与阵容，不能称固定玩家站位的单波因果隔离。本次未关闭L3、未调整cover/spacing/counter权重。逐波配对仅统计双方都到达的波，避免把未遭遇当战败。\n\n';
 text+='## 10. Stage7/8结论\n\n';
 text+=table(['阶段','配置2★软目标（原值保留）','Baseline实际敌2★','候选Validation实际敌2★','候选条件完成CI'],[6,7,8].map(n=>[n,pct(frozen.configs['enemy-difficulty'].starPolicy.twoStarTargets.filter(t=>t.stage<=n).at(-1).ratio),pct(baseline.medium.stages[n-1].enemy2StarRatio),pct(validation.medium.stages[n-1].enemy2StarRatio),rate(validation.medium.stages[n-1].conditionalCompletion)]));
 text+='当前源码的软目标本来就是1/3、2/3、100%；用户背景提到约30%/42%/56%更接近旧生成结果，不能冒称本次把目标调到这些值。候选仅提前Stage3的2★/3费解锁，提高预算后实际星级更接近目标。此轮不再提高Stage7/8软目标；需要先修复Stage3与Stage6阈值，幸存者后期过强也不能简单推导应继续抬高早期难度。\n\n';
 text+='## 11. Stage12+饱和\n\n';
 text+=table(['Validation Medium波','遭遇','requested均值','effective均值','actual均值','胜率CI'],validation.medium.waves.filter(w=>(w.stage===12&&w.round===5)||([13,25,50,99].includes(w.stage)&&w.round===1)).map(w=>[w.stage+'-'+w.round,w.encounters,Number(w.requested).toExponential(4),fmt(w.effective),fmt(w.actual),rate(w.victory)]));
 text+='固定人口10、费用/星级/装备硬上限最终使有效预算饱和，requested继续增长不代表实际变强。这里并非“正常玩家到不了Stage12”：独立样本中有相当比例Medium与绝大多数Strong到达并持续通关，属于真实无尽内容上限，仍需后续设计。优先独立立项新增后期内容或有明确封顶的prestige/更多3★/装备方案；不恢复旧5%无限增伤减伤。本次仅报告，不暗改战斗公式或内容池。\n\n';
 const saturation=load('analysis/saturation-shape.json'),point=p=>'Stage'+p.stage+'-'+p.round;
 text+='相同seed12345的纯生成探针（0次BattleSim）确认：原配置持续ABOVE_MAX_FEASIBLE从'+point(saturation.baseline.permanentAboveMaxFrom)+'开始，候选提前到'+point(saturation.candidate.permanentAboveMaxFrom)+'；候选没有修复上限，反而更早触顶。完整requested/effective/actual/max见'+rel('analysis/saturation-shape.json')+'。\n\n';
 text+=table(['独立分区','机器人','完成Stage8','完成Stage12','完成Stage99'],[['Validation',validation],['Holdout',holdout]].flatMap(([name,g])=>['medium','strong'].map(id=>[name,id,...[8,12,99].map(stage=>g[id].stages[stage-1].completed)])));
 text+='## 12. 调参历史\n\n';
 text+='20轮均为Medium seed1..100、真实6阶段campaign；之后最优训练候选用1..500三档12阶段确认。前16轮只调预算/统一早期解锁两类，后4轮有记录地测试阶段内指数形状，首尾锚点、恢复、人口不变。搜索边界和后续细分说明见'+rel('training/search-v1/bounds.json')+'、'+rel('training/search-v1/ramp-bounds-extension.json')+'。Stage3均100%说明这20个候选未解决问题，不是对整个设计空间的不可能性证明。\n\n';
 text+=table(['参数','min/max/step','作用'],[['budgetScale','1 / 12 / .25','相对实测B0的静态请求规模，B0本身不重标定'],['growthRate','1.02 / 1.06 / .005→.0025','在原区间内细分，记录扩展'],['earlyChallengeStage','3 / 6 / 1','同一包提前2★与3费解锁'],['stageRampExponent','.25 / 1 / .05','最后4轮阶段内预算形状，未改首尾锚点']]);
 text+=table(['轮次','before → after (scale,growth,unlock,ramp)','Stage3 / Stage6','目标函数','原因'],history.map(h=>[h.iteration,JSON.stringify(h.previous??{budgetScale:1,growthRate:frozen.configs['enemy-difficulty'].growthRate,earlyChallengeStage:frozen.configs['enemy-difficulty'].starPolicy.twoStarUnlockStage,stageRampExponent:1})+' → '+JSON.stringify(h.parameters),pct(h.stage3)+' / '+pct(h.stage6),fmt(h.score,5),h.reason]));
 text+='目标函数含3/6阶段误差、条件阶段断崖、异常普通波掉血；函数提供三档排序惩罚，但20轮细扫仅Medium，因此排序项当时不可用。500-seed三档确认另验排序，不隐称每轮都优化过Strong/Weak。量纲一致的排序与合理性是接受门槛。最优为第'+ranked.best.iteration+'轮；growth用于后半程挑战，scale/早解锁用于突破原前期费用星级可行上限；Boss/Elite名义倍率在原pacing中代数抵消，不能把无效旋钮当成有效贡献；装备与Formation保持原样，避免同时改五个系统。\n\n';
 text+='## 13. 最终accepted配置\n\n';
 text+='**本轮没有通过验收的新accepted数值配置。** '+rel('accepted/decision.json')+'保存正式拒绝决定，candidate balance-v1仅实验身份，正式资源保留p3-baseline原值。'+rel('freeze/candidate.json')+'是冻结失败候选，不能当生产推荐。\n\n';
 text+='候选实际差异：growth 1.04→1.045；新增静态budgetScale 6.5；2★解锁6→3；Stage3新增maxCost3并使后续费用上限不下降；Stage3新增1/3软目标；balanceVersion=balance-v1。第13轮没有stageRampExponent（默认1），最后4轮的形状实验没有入选。全部正式数值修改：**0项**。新增源码能力只有可选预算控制、版本拒绝、公共Bot观察与批量/报告工具；默认968波历史结果仍通过原P3断言。\n\n';
 text+='拒绝原因：\n\n'+reasons.map(r=>'- '+r).join('\n')+'\n\n旧存档不能静默切换：已绑定p3-baseline存档加载balance-v1明确拒绝；同版本配置身份改变也拒绝；真正未绑定的新局才允许绑定，显式未知balance版本即使未开战也拒绝。已通过保存/恢复/版本/身份专项测试。由于未发布新数值，原存档保留原配置语义。\n\n';
 text+='## 14. Validation\n\n';
 text+='独立501..1000，每档500局，全部使用真正99阶段campaign，无采样截断。冻结配置SHA-256：`'+freeze.candidateSha256+'`。运行源文件也锁定SHA；CLI对源身份变化拒绝继续。Validation在训练与参数冻结后才打开，未根据它修改策略或游戏数值。原始数据与来源见'+rel('validation/runs-500/provenance.json')+'和'+rel('validation/runs-500/manifest.json')+'。\n\n';
 text+='## 15. Holdout\n\n';
 text+='1001..1250，每档250局，冻结后仅一次，真正99阶段campaign；排他锁在'+rel('holdout-once.json')+'，结果见'+rel('holdout/runs-250/aggregate.json')+'。Holdout之后没有改参数、机器人或运行代码。不得再以本批seed调下一轮；新的实验须另立版本与未用seed。当前以失败结果作拒绝记录，没有用holdout选另一个候选。\n\n';
 text+='## 16. 确定性\n\n';
 text+='同一冻结候选、各机器人seed1..50、12阶段campaign独立执行两次（1进程与2进程），聚合与逐局、逐波、逐阶段逻辑文件SHA全部一致；同时覆盖重复执行和并行一致性。耗时/调度不进入逻辑身份。3/6/99共同前缀另由完整RunSession测试检查。\n\n';
 text+=table(['文件','SHA-256（两次一致）'],['aggregate.json','weak/per-run.jsonl','medium/per-run.jsonl','strong/per-run.jsonl'].map(file=>[file,a[file]]));
 text+='完整哈希见'+rel('determinism/comparison.json')+'。报告原始数据SHA也保存在每批manifest；策略源SHA、配置身份、冻结源与分区都可追溯。环境：Node '+process.version+'，Windows '+process.arch+'，纯TS运行器，无Cocos Node/UI/图片。\n\n';
 text+='另有'+rel('replay/medium-seed17-full.json')+'保存训练seed17的完整本局购买/刷新/经验/移动/装备/领奖动作正文；其'+replay.waves+'波动作SHA逐一匹配批量数据，见'+rel('replay/comparison.json')+'。training-only重放工具不允许使用Holdout种子。\n\n';
 text+='## 17. 性能\n\n';
 text+='有performance.json的P4批次合计 **'+total.runs+'局 / '+total.battles+'次真实BattleSim**，累计各批报告wall time '+fmt(total.sumBatchWallSeconds,1)+'秒。此数含基线、搜索、对照、复跑；不含单元测试内部模拟与生成器纯预算探针，不把这些无计数运行冒称已计入。部分批次并行重叠，累计wall不能当本次实际经过时间；早期工具记录worker阶段，正式Validation/Holdout还含报告合并时间。\n\n';
 text+='另有上述完整动作复现1局/'+replay.waves+'次BattleSim（未单独测wall）；所有已保存批量与复现合计'+total.recordedRuns+'局/'+total.recordedBattles+'次BattleSim，仍不包含单元测试内部模拟。\n\n';
 text+=table(['批次','局数','BattleSim','进程','wall秒','runs/s','waves/s'],performanceRows.filter(p=>!p.report.includes('search-v1/iteration-')).map(p=>[p.report,p.runs,p.battles,p.workers,fmt(p.wallMilliseconds/1000,1),fmt(p.runsPerSecond,2),fmt(p.wavesPerSecond,1)]));
 text+='20轮搜索的逐轮性能和全部批次清单在'+rel('accepted/performance.json')+'。多进程按seed分区，各机器人逐局按seed稳定合并；99阶段报告采用流式读取，内存不保留全部阵容，全部逐波指标与上阵阵容仍落盘；批量文件不保留全量BattleEvent或逐动作正文，保留决策SHA，可用相同版本与seed的单局报告复现深查。\n\n';
 text+='## 18. npm test\n\n';
 text+='最终 `npm.cmd test` **exit 0**，真实日志：'+rel('final-tests.log')+'，退出身份：'+rel('final-test-result.json')+'。P0–P3守卫、确定性、RNG隔离、前缀、存档、pending奖励、预算≤5%、Formation、装备效果全部通过；新Formal Bot 8项、balance CLI 2项、P4平衡6项通过。P3仅对EnemyBudget可选扩展作明确兼容声明，原968波证据和断言未替换。最早一次P3源文件哈希守卫失败已保留在regression-before-validation.log，不隐藏。\n\n';
 text+='这是无UI的纯逻辑验收，本阶段未改界面；未将其宣称为编辑器/浏览器/设备验收。\n\n';
 text+='## 19. 尚存问题与复现\n\n';
 text+='1. Stage3双目标失败，Stage6仍有玩法阈值；有限20轮耗尽，没有扩大搜索或拿Validation/Holdout继续试参数。下一轮应单独设计早期预算/可行上限与阶段过渡，并换全新seed分区。\n2. Medium在大量存款下停留7人口，正常玩家代表性尚不合格，不能拿它的约50%淘汰当合格平衡证明；应先以新版Bot修复富余金币/人口决策，再重新冻结策略、重跑Baseline。三档只是启发式策略，不等同真实人群，公共属性估值也不等于真实组队战力。\n3. 成本/星级/装备内容上限让后期幸存者长期不再死亡，Strong99阶段过高；不能恢复旧无限加伤/减伤来掩盖。\n4. 六件玩家奖励装备仍无P1-B标定、敌军禁用；铁傀儡无正式标定，当前仍low-confidence cost fallback，不升级为high。Validation实际使用次数见下表，不能因fallback有数值就认为平衡可信。\n5. 装备奖励相关性有阶段与存活偏差；advanced fallback的因果强度未被隔离测量。Formation L1/L2/L3对照只有50对，区间较宽。\n6. 单位/技能/装备效果、经济/卡池/P2权重/P1-B模型均未自动篡改；本轮不是一个成功发布的balance-v1。\n\n';
 text+='铁傀儡专项记录：'+rel('accepted/iron-golem.md')+'，另列Validation/Holdout的上阵与敌军暴露情况。\n\n';
 text+=table(['Validation机器人','铁傀儡上阵局数/500','玩家波次','敌军波次','carry/tank观测次数'],ids.map(id=>[id,usage[id].ironGolemPlayerRuns,usage[id].ironGolemPlayerWaves,usage[id].ironGolemEnemyWaves,validation[id].ironGolemPlayerEncounters]));
 text+='可复现命令（在项目根目录运行，输出必须换新目录）：\n\n```powershell\nnpm.cmd run balance-sim -- --bot all --seed-start 501 --seed-count 500 --stages 99 --workers 4 --partition validation --config docs/p4-balance/freeze/candidate.json --output docs/p4-balance/replay-validation-new\nnode --require tsx/cjs tools/balance/replay-run.ts --bot medium --seed 17 --stages 99 --config docs/p4-balance/freeze/candidate.json --json temp/candidate-medium17-new.json\nnpm.cmd run run-sim -- --bot medium --seed 17 --stages 99 --json temp/p3-medium17-new.json\nnpm.cmd test\n```\n\n第二条保存冻结候选的完整训练动作，第三条使用当前保留的正式P3配置。Holdout不能再次作为新实验使用；原始数据可重新聚合。自动搜索入口 `npm.cmd run tune-balance` 会拒绝覆盖已存在搜索，20轮过程和补充4轮脚本均已保留；不通过删除锁重跑。\n';
 fs.mkdirSync(path.join(base,'accepted'),{recursive:true});
 const iron=frozen.configs.units.find(u=>u.id==='iron_golem');assert.ok(iron);assert.ok(!JSON.stringify(frozen.configs['enemy-power']).includes('iron_golem'));
 const ironReport='# 铁傀儡专项：未标定的重要路径\n\n当前P1-B enemy-power-v1没有iron_golem实测单位条目。EnemyPowerModel对未知单位使用显式费用的cost-fallback，confidence=low；并非正式标定。P4没有修改模型或自动把它升为high。\n\n公开单位配置：费用'+iron.cost+'、HP '+iron.hp+'、攻击'+iron.atk+'、护甲'+iron.armor+'、魔抗'+iron.mr+'、技能'+iron.skillId+'。机器人只用这些公开属性与技能启发式评估，不查询EnemyPowerModel。\n\n'+table(['分区','策略','上阵局数/总局','上阵波数','主carry/tank波数','敌军出现波数'],[['Validation',usage,validation,500],['Holdout',holdoutUsage,holdout,250]].flatMap(([name,u,g,n])=>ids.map(id=>[name,id,u[id].ironGolemPlayerRuns+'/'+n,u[id].ironGolemPlayerWaves,g[id].ironGolemPlayerEncounters,u[id].ironGolemEnemyWaves])))+'\nTraining确认的主carry/tank观测：'+ids.map(id=>id+' '+training[id].ironGolemPlayerEncounters+'波').join('；')+'。不同指标口径：上阵包含任何位置，主carry/tank仅当波启发式选中的角色。\n\n该单位确实进入重要平衡路径，最终通过率包含它的真实战斗效果；不能拿fallback结果当作可信强度证明。没有随机化移除实验，不声称它导致了某个通过率差异。敌军仍禁止给它添加未标定装备组合；需在独立增量标定中覆盖星级、技能、目标环境和装备，锁新模型版本后才能重新验收。\n';
 fs.writeFileSync(path.join(base,'accepted/iron-golem.md'),ironReport,{flag:'wx'});
 for(const [file,value]of Object.entries({'accepted/decision.json':decision,'accepted/diagnostics.json':{validation:usage,holdout:holdoutUsage},'accepted/performance.json':{total,batches:performanceRows},'determinism/comparison.json':{equal:true,seedRange:[1,50],campaignStages:12,singleWorkers:1,parallelWorkers:2,logicalHashes:Object.fromEntries(logicalFiles.map(file=>[file,a[file]]))}}))fs.writeFileSync(path.join(base,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(base,'README.md'),text,{flag:'wx'});console.log(JSON.stringify({status:'rejected',reasons,total,report:path.join(base,'README.md')},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
