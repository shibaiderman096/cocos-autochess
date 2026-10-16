const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const revised=process.argv[2]==='--revision-b';
const root=path.resolve(__dirname,'../..'),originalDir=path.join(root,'docs/p4r1-bot-qualification'),dir=revised?path.join(originalDir,'revision-b'):originalDir;
const read=f=>JSON.parse(fs.readFileSync(path.join(revised&&f==='freeze/historical-before.json'?originalDir:dir,f),'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fmt=n=>n===null||n===undefined?'N/A':Number(n).toFixed(2),pct=n=>n===null?'N/A':(n*100).toFixed(1)+'%';
const ci=x=>`${x.wins}/${x.total} = ${pct(x.rate)} [${pct(x.low)}, ${pct(x.high)}]`;
function main(){
 if(fs.existsSync(path.join(dir,'decision.json')))throw Error('Qualification decision already exists');
 const before=read('freeze/game-before.json'),history=read('freeze/historical-before.json'),frozen=read('freeze/bots-v2.json');
 for(const [f,h]of Object.entries({...before.hashes,...history}))if(sha(path.join(root,f))!==h)throw Error('Protected file changed '+f);
 for(const [f,h]of Object.entries(frozen.freeze.sourceHashes))if(sha(path.join(root,f))!==h)throw Error('Frozen source changed '+f);
 if(revised)for(const [f,h]of Object.entries(read('freeze/rejected-r1-before.json')))if(sha(path.join(root,f))!==h)throw Error('Rejected R1 evidence changed '+f);
 const ids=['weak','medium','strong'],agg=read('qualification-500/aggregate.json'),economy=Object.fromEntries(ids.map(id=>[id,read(`qualification-500/${id}/economy.json`)]));
 const medium=economy.medium,v1=read('v1-control-50/economy.json'),paired=read((revised?'smoke-50':'smoke-50-r2')+'/economy.json'),old=require('../../docs/p4-balance/analysis/medium-economy-validation.json');
 const long=read('long-tail-50/medium/summary.json'),longEcon=read('long-tail-50/medium/economy.json'),stress=read(revised?'pressure-fixtures-late-critical-50.json':'pressure-fixtures-50.json'),replays=read('replays/index.json'),review=read('replays/review.json');
 const deterministic=read('determinism/verification.json'),tests=read('final-test-result.json'),legacy=read('legacy-bot-equality/verification.json');
 const complete=(id,s)=>agg[id].stages[s-1].cumulativeCompletion;
 const ranking=[6,12].every(s=>complete('strong',s).rate>=complete('medium',s).rate&&complete('medium',s).rate>=complete('weak',s).rate);
 const medGoldOk=[4,5,6,7,8].every(s=>medium.stages[s].shoppingEndGold.median<150);
 const popOk=[4,5,6,7,8].every(s=>medium.stages[s].populationOpportunityMissedRate===null||medium.stages[s].populationOpportunityMissedRate<.1);
 const pressureStages=[4,5,6,7,8],bossSpend=pressureStages.reduce((n,s)=>n+medium.byWaveKind[s+':boss'].combatConversionGold,0)/pressureStages.reduce((n,s)=>n+medium.byWaveKind[s+':boss'].waves,0);
 const normalSpend=pressureStages.reduce((n,s)=>n+medium.byWaveKind[s+':normal'].combatConversionGold,0)/pressureStages.reduce((n,s)=>n+medium.byWaveKind[s+':normal'].waves,0);
 const stressEvidence=stress.summary.v1.deaths>0&&stress.summary.v1.deathGold100Plus>0&&stress.summary.v2.meanGoldAtBattle<100&&
  (stress.summary.v2.deaths===0||stress.summary.v2.deathGold100Plus/stress.summary.v2.deaths<.25);
 const gates={publicActionsAndFutureInfoTraps:tests.exitCode===0,determinism:deterministic.identical&&deterministic.actualWorkers.join(',')==='1,4',
  bossPreSpending:bossSpend>normalSpend,lowHpReserveAndFiniteRolls:tests.exitCode===0,coreStageGold:medGoldOk,populationOpportunities:popOk,
  stableStateInterest:tests.exitCode===0,stressIdleDeathReduction:stressEvidence,naturalDeathHighGold:medium.deaths.length===0?null:medium.death100Plus.rate<.25,
  ranking,qualitativeReplayReview:review.passed===true,gameBytesUnchanged:true,historicalBytesUnchanged:true,fullRegression:tests.exitCode===0,
  weakStrongUnchanged:legacy.unchanged,runsAndLongTail:ids.every(id=>agg[id].runs===500)&&long.runs===50};
 // A zero natural-death denominator is explicitly unestimated; controlled paired tests
 // supply the pressure behavior gate, never a fabricated natural death rate.
 const accepted=Object.values(gates).every(v=>v===true||v===null),status=accepted?'BOT QUALIFICATION PASSED':'BOT QUALIFICATION FAILED';
 const decision={status,gameBalanceChanges:[],newGameBalanceAccepted:false,botVersions:Object.fromEntries(ids.map(id=>[id,frozen.bots[id].version])),
  frozenBotSha256:sha(path.join(dir,'freeze/bots-v2.json')),botConfigHashes:frozen.botConfigHashes,gates,
  naturalDeathInference:medium.deaths.length===0?'No natural v2 deaths in this production sample. Death-gold rate is unknown (0/0), not zero percent. Old candidate results are not a causal comparator.':
   'Natural death gold is reported descriptively; compare the matched current-production control separately.',
  controlledStress:stress.summary,nextPhase:accepted?'P4-R2 requires explicit continuation and the frozen bots; no difficulty tuning performed here':'Do not enter P4-R2: this frozen bot is reproducible but has not passed all normal-player qualification requirements',
  reservedNextBalance:frozen.reservedNextBalance,...(revised?{priorR1Attempt:{status:'BOT QUALIFICATION FAILED',source:'../decision.json',reason:'Qualitative replay found 14 useless refreshes without an allowed upgrade target. Frozen medium-v2 was rejected; neither its reports nor seed set were reused.'},
    highGoldExceptionPolicy:'Policy-target exhaustion is diagnosis only. More non-core star upgrades remain legal in the game; therefore it does not automatically waive the core-stage high-gold qualification gate.'}:{})};
 const changed=[
 ['tools/bots/bot-configs.json','Medium-v2 state reserves, excess threshold, finite action bounds and marginal population constants; Weak/Strong unchanged'],
 ['tools/bots/types.ts','Optional v2 economic policy and bot diagnostics'],['tools/bots/factory.ts','Versioned v2 validation and dispatch; original v1 remains replayable'],
 ['tools/bots/medium-economy.ts','Public-attribute cores, population value, four economy modes'],['tools/bots/medium-v2.ts','Real-action spending, upgrades, finite rolling, unused-money reasons'],
 ['tools/bots/shop-policy.ts','Optional v2 reserve/core policy and projected 2-star upgrades; v1 default branch preserved'],
 ['tools/run-simulation.ts','Optional per-wave action economy observation and bot decision diagnostics'],['tools/balance-sim.ts','Separate R1 partitions, frozen game/source checks, 500-run qualification lock and old evidence protection'],
 ['tools/balance/metrics.ts','Persist per-wave bot economy fields'],['tools/balance/bot-economy-metrics.ts','Preparation snapshots, opportunities, peaks, iron-golem transactions'],
 ['tools/balance/audit-bot-economy.ts','Streaming Weak/Medium/Strong stage, Boss, death and opportunity report'],
 ['tools/balance/capture-qualification.cjs','Capture exact game/history bytes, old bot source, seed reservations and pre-existing editor metadata drift'],
 ['tools/balance/replay-v1-economy.cjs','Ten exact historical Stage6 death replays with isolated old prices/source'],
 ['tools/balance/freeze-qualification-bots.cjs','Freeze bots after smoke/development economic gates'],
 ['tools/balance/verify-legacy-bots.cjs','Old/current Weak and Strong full-report/action equality'],
 ['tools/balance/verify-qualification-determinism.cjs','Real one/four worker SHA comparison'],
 ['tools/balance/pressure-test-bot-economy.cjs','Matched controlled Boss stress fixtures, separate from natural campaigns'],
 ['tools/balance/review-qualification-replays.cjs','Five full current qualification decision replays'],
 ['tools/balance/report-bot-qualification.cjs','This 15-section evidence report and protected-source decision'],
 ['tests/medium-economy-tests.cjs','Real-action A-E scenarios, excess/core tests, information traps and entry freeze protection'],
 ['tests/qualification-cli-tests.cjs','Reject old/reserved seeds, candidate/formation override, partial qualification and evidence overwrite'],
 ['tests/formal-bot-tests.cjs','Expect Medium-v2 while retaining real actions and determinism tests'],
 ['tests/enemy-power-tests.cjs','Protect editor-owned metadata against captured R1 entry bytes; other historical checks retained'],
 ['tools/run-tests.ps1','Compile audit tool and run the two new test files'],
 ];
 const sections=[];const add=(s,t)=>sections.push(`## ${s}\n\n${t}`);const table=(head,rows)=>[head.map(x=>`| ${x} `).join('')+'|','| '+head.map(()=> '---').join(' | ')+' |',...rows.map(r=>'| '+r.join(' | ')+' |')].join('\n');
 add('1. 为什么Medium-v1不合格',`第一次P4的正式结论仍是 **P4 FAILED / balance-v1 REJECTED**，没有部署候选。旧Validation中Stage6死亡${old.stage6Deaths}局，${old.deathsWith100PlusGold}局保留100+金，平均${fmt(old.averageDeathGold)}金、Lv${fmt(old.averageDeathLevel)}。Stage3累计100%，Stage6约55%并非已合格的平衡结论；Strong99阶段约98%及Stage12-5可行预算上限仍属于旧实验事实。\n\n[v1-diagnosis/summary.json](v1-diagnosis/summary.json)的10个死亡种子逐波动作SHA、金币与旧档完全一致。seed501还差28金升8，有候补却保留391金；固定阶段目标已达7级而停止购买经验。低血时虽允许目标+1，每波最多3次/12金经验购买仍限制即时人口转化；高2★占比使部分局不再刷新，没有Boss储备窗口。\n\n旧报告、Validation、Holdout、candidate和decision全部保持原字节。原1..1250及其他已登记P4分区不作为未见数据。初次诊断曾误读经验字段，已纠正并完整重放；\`v1-diagnosis-invalid-xp\`仅保留无效开发记录，不参与结论。`);
 add('2. Medium-v2修改',`经济状态为save/develop/stabilize/all_in。最大有效利息储备由真实5金上限/10%利率得到50金；分阶段储备、Boss20金、Elite30金，低血再降，critical保留4金。spendableGold=max(0,gold−reserveGold)。\n\n升级不使用固定阶段等级目标：以当前候补公开属性质量、相对阵容价值、剩余XP金价、余额与储备计算nextPopulationValue。没有可部署收益时不买经验。\n\n刷新同时看主tank/carry的2★、最弱槽、对子、人口空位、可提升单位和少量核心3★；新卡允许为可预期的2★升级收集素材。最多1个当前核心追3★，没有全队追3★。save/develop/stabilize/all_in单波刷新上限分别为0/12/14/18，经验购买最多20次。先买眼前有用卡，再升级/刷新，并重新合法部署、穿装。每波保留mode、reserve、spendable、边际人口、coreReady、rolls和unusedGoldReason。\n\nWeak/Strong策略与配置版本维持weak-v1/strong-v1；原始与当前源码在相同种子上的完整报告及动作SHA一致。Strong的公开估值仅使用属性/技能说明和角色，不调用标定模型；仍是粗略启发式，不声称等于真人或实测队伍战力。`);
 add('3. 修改文件',table(['文件','用途'],changed));
 add('4. 游戏配置保护',`GAME BALANCE CHANGES = **0**。入口冻结${Object.keys(before.hashes).length}份assets源码/配置和${Object.keys(history).length}份P0～旧P4证据，结束全部SHA逐项一致。11份正式游戏JSON与旧P4拒绝决定的retainedConfigHashes一致。冻结策略及运行源共${Object.keys(frozen.freeze.sourceHashes).length}份。\n\n本阶段入口已经包含此前独立授权的4费4金/5费5金，R1没有再改价格、出售、经济公式、概率、卡池、属性、技能、装备、模型、敌军星级/装备政策、Boss/Elite倍率或阵型。旧候选历史重放仅在隔离进程编译旧价格，不写入正式文件。\n\n既存Cocos自动服务设置\`settings/v2/packages/information.json\`与P1旧哈希不符；它不是游戏输入。本次只把该文件单独固定到R1入口哈希，历史记录和设置字节均未改写，其余游戏/模型/证据保护保持严格。`);
 add('5. 资格数据',table(['Bot/版本','真实campaign / 新seed','Stage3累计 / Wilson95%','Stage6累计 / Wilson95%','Stage12累计 / Wilson95%'],ids.map(id=>[frozen.bots[id].version,'12阶段 / 2201..2700 / 500局',ci(complete(id,3)),ci(complete(id,6)),ci(complete(id,12))]))+
 `\n\nMedium另用2701..2750的50局真实99阶段长尾，Stage99累计${ci(long.stages[98].cumulativeCompletion)}；无采样截断。完整逐局、逐波、逐阶段、阵容和决策SHA保存在各批目录。50-seed smoke、200-seed development先于机器人冻结；首轮smoke经济不合格的结果保留，第二轮通过后才进入development。正式500资格集合只运行一次，未根据它改策略。\n\n这是 **Bot Qualification Baseline**，不是最终游戏平衡Baseline。新种子登记于freeze/seed-partitions.json；P4-R2 training3001..3500、validation4001..4500、holdout5001..5250未运行。`);
 add('6. Medium经济（Stage1～12）',table(['Stage','进入/离开金币中位','购物后金币中位','平均等级/人口','买卡/刷新/经验 每波金','利息 每波金'],Array.from({length:12},(_,n)=>{const s=n+1,e=medium.stages[s];return[s,`${fmt(e.enteringGold.median)}/${fmt(e.leavingGold.median)}`,fmt(e.shoppingEndGold.median),`${fmt(e.meanLevel)}/${fmt(e.meanPopulation)}`,`${fmt(e.meanUnitSpending)}/${fmt(e.meanRefreshSpending)}/${fmt(e.meanXpSpending)}`,fmt(e.interestIncome/e.waves)];}))+`\n\n完整进入/离开、峰值、未消费、reserve/spendable、板凳、放弃的有用卡、可立即2★未买、备战席满和铁傀儡购买/上阵/tank计数见qualification-500/{weak,medium,strong}/economy.json。金币多不自动判浪费；保留储备与可支配部分分别报告。Stage99长尾后期银行增长与人口/核心/内容上限并列报告，不能以无效刷新清零美化消费。`);
 add('7. 死亡金币',`旧拒绝候选：Stage6死亡220/500，220/220携带100+金，平均370.97金。**旧候选难度与本轮正式配置不同，不能据此声称因果改善。**\n\n当前正式配置的50-seed配对控制中v1死亡${v1.deaths.length}局、v2死亡${paired.deaths.length}局。正式资格Medium死亡${medium.deaths.length}局，100+闲置死亡比例${ci(medium.death100Plus)}；长尾死亡${longEcon.deaths.length}局。没有死亡时该指标为0/0、N/A，不写成0%或宣称已经测得自然死亡金币下降。\n\n另外50个开发seed的同局面压力夹具使用真实Stage6 Boss、HP8、300金、Lv7和同一弱板凳/上阵存档，所有规则不变，统计独立：\n\n`+table(['压力Bot','局数/死亡','死亡且100+金','平均入战金币','平均等级/人口','平均转化金币'],['v1','v2'].map(v=>{const x=stress.summary[v];return[v,`${x.runs}/${x.deaths}`,x.deathGold100Plus,fmt(x.meanGoldAtBattle),`${fmt(x.meanLevel)}/${fmt(x.meanPopulation)}`,fmt(x.meanSpent)];}))+`\n\n压力夹具逐局保存deathGold/level/population/benchPowerProxy、全部动作与理由，见pressure-fixtures-50.json；它不计入500自然campaign完成率。`);
 add('8. Boss前消费',table(['Stage','Boss进入金均值','Boss入战金均值','买卡/刷新/经验 均值','Boss总消费','普通波总消费'],pressureStages.map(s=>{const b=medium.byWaveKind[s+':boss'],n=medium.byWaveKind[s+':normal'];return[s,fmt(b.meanGoldBeforePreparation),fmt(b.meanGoldAtBattle),`${fmt(b.meanUnitSpending)}/${fmt(b.meanRefreshSpending)}/${fmt(b.meanXpSpending)}`,fmt(b.meanCombatConversionGold),fmt(n.meanCombatConversionGold)];}))+
 `\n\nStage4～8池化Boss消费${fmt(bossSpend)}金/波，普通波${fmt(normalSpend)}金/波。逐Boss购物前后及分类花费来自真实动作；描述性差异不等于Boss消费的随机化因果效应。Elite与Boss使用不同储备，均只读取当前可见波类型。`);
 add('9. 人口机会',table(['Stage','配对v1金币中位','配对v2金币中位','配对v1/v2平均人口','资格v2结束仍可升级次数/有机会波次'],pressureStages.map(s=>{const a=v1.stages[s],b=paired.stages[s],q=medium.stages[s];return[s,fmt(a.shoppingEndGold.median),fmt(b.shoppingEndGold.median),`${fmt(a.meanPopulation)}/${fmt(b.meanPopulation)}`,`${q.populationOpportunityMissed}/${q.populationOpportunitySeen}`];}))+
 `\n\n可升级定义同时要求候补边际价值足够且能支付全段剩余XP与储备。旧诊断的粗略“有候补且买得起”和新版边际机会口径不同，未把两个不同分母的miss-rate直接当同口径改善；额外rawAffordableBenchIdle使用统一原始观察。Stage6人口不再被固定Lv7目标锁死。`);
 add('10. 典型决策重放',table(['Medium-v2 seed','结果','最低HP','完整动作SHA','资格动作逐波匹配'],replays.rows.map(r=>[r.seed,r.result,r.minimumHp,r.fullActionHash,r.qualificationActionsMatch]))+
 `\n\n${review.summary}\n\n完整购买、刷新、经验、出售、站位、装备及领奖见replays/medium-v2-seed*.json。资格集中Stage6死亡样本${replays.stage6DeathCasesAvailable}局，缺失类型明确披露；没有通过改难度、伪造失败或只截短campaign来造样本。旧真实死亡10局在v1-diagnosis，低血真实动作压力样本在pressure-fixtures-50.json。`);
 add('11. 强弱排序',table(['Stage','Weak','Medium-v2','Strong'],[6,12].map(s=>[s,pct(complete('weak',s).rate),pct(complete('medium',s).rate),pct(complete('strong',s).rate)]))+
 `\n\nStrong≥Medium-v2≥Weak检查${ranking?'通过':'失败'}。允许早期并列；本轮不以目标胜率反推敌军数值。Strong的长期通关与内容上限不会通过故意削弱Bot掩盖。铁傀儡允许按公开属性正常使用，但仍未被冒称完成P1-B标定；qualification经济文件分别记录购买、上阵和tank角色。`);
 add('12. 确定性',table(['产物','1 worker和4 workers一致的SHA-256'],['medium/per-run.jsonl','medium/per-wave.csv','medium/per-stage.csv','medium/summary.json','aggregate.json'].map(f=>[f,deterministic.hashes[f]]))+
 `\n\n相同冻结botVersion/config/seed2199..2200，三档真实12阶段campaign，实际worker数1与4，全部${Object.keys(deterministic.hashes).length}份逻辑产物SHA一致。运行时间与worker分片调度不参与逻辑SHA比较。另有Weak/Strong原始/当前完整报告相等；资格5局完整重放逐波动作SHA相等。`);
 add('13. 性能',table(['批次','runs','waves','workers','秒','runs/sec','waves/sec'],[revised?'smoke-50':'smoke-50-r2','development-200','qualification-500','long-tail-50'].map(name=>{const p=read(name+'/performance.json');return[name,p.runs,p.battles,p.workers,fmt(p.wallMilliseconds/1000),fmt(p.runsPerSecond),fmt(p.wavesPerSecond)];}))+
 `\n\n资格批与长尾有并发且同时跑回归，壁钟吞吐不能直接作单机独占基准。未增加战斗搜索；只有真实战斗推进调用BattleSim，Bot策略模块无模拟器/标定模型依赖。初次旧P4 baseline smoke约459 waves/sec，本轮含完整经济审计、更多合法动作与资源检查；按上表如实比较，不把更多报告开销当作弊搜索。`);
 add('14. npm test',`\`npm.cmd test\` 实际退出码 **${tests.exitCode}**，见final-tests.log和final-test-result.json。旧P0～P4、真实动作守恒、RNG/前缀/存档、装备/阵型、Medium-v2 A-E经济场景、超额金币、核心、Boss、未来信息陷阱、新CLI分区与旧候选保护均执行。\n\n本轮不改UI，没有声称Cocos编辑器、浏览器或设备实测。入口已有的无关本地设置差异通过独立入口哈希保护解释，没有更改游戏配置或旧证据来通过测试。`);
 add('15. 结论',`**${status}**\n\n`+table(['资格门槛','结果'],Object.entries(gates).map(([k,v])=>[k,v===null?'N/A：无自然死亡，另有受控压力对照':v?'PASS':'FAIL']))+
 `\n\n机器人资格和游戏平衡是两个结论。本轮游戏平衡修改0项，没有接受或部署balance-v1，也没有开始P4-R2。自然死亡金币的零分母、当前配置通过率偏高及后期内容上限仍明确保留。\n\n冻结文件SHA：\`${decision.frozenBotSha256}\`。medium-v2 botConfigHash：\`${frozen.botConfigHashes.medium}\`。下一轮如获授权，只能使用这些冻结机器人，并启用已登记但未运行的新R2分区。`);
 let report='# P4-R1：机器人资格与未调参 Baseline\n\n'+sections.join('\n\n')+'\n';
 if(revised){
  report=report.replace(/medium-v2(?!r1b)/g,'medium-v2r1b').replace(/Medium-v2(?!r1b)/g,'Medium-v2r1b')
    .replaceAll('2201..2700','6001..6500').replaceAll('2701..2750','6501..6550').replaceAll('2199..2200','5799..5800')
    .replace('最多1个当前核心追3★','最多2个当前核心（mainTank/mainCarry）追3★')
    .replace('真实Stage6 Boss、HP8、300金','真实Stage12 Boss、HP4、300金')
    .replaceAll('pressure-fixtures-50.json','pressure-fixtures-late-critical-50.json');
  report=report.replace('](v1-diagnosis/summary.json)','](../v1-diagnosis/summary.json)');
  report=report.replace('压力夹具逐局保存',`受控死亡案例5681：初始HP4、300金、Lv7，选择all_in、储备4金，通过真实买卡、20次经验与18次刷新支出202金，以Lv8/8人口、98金入战后死亡。没有继续升级是单波经验动作上限20次，虽然再升一级的44金已经付得起；刷新也达到18次上限。保留金币原因是有限行动预算，而不是利息或阶段等级锁。阵容按公开属性与角色选出已成2★的主tank/carry并穿戴合法装备；预置弱阵容没有自然整局累积装备，仍不足以战胜后期Boss。这个极端夹具暴露的经验上限仍是限制，不能声称经济决策最优。\n\n压力夹具逐局保存`);
  const exceptions=table(['Stage','购物后金币中位','100+金波次','已满人口且策略升级目标耗尽波次'],[4,5,6,7,8].map(s=>{const e=medium.stages[s];return[s,fmt(e.shoppingEndGold.median),e.highGoldWaves,e.highGoldTargetsExhausted];}));
  report=report.replace('## 7. 死亡金币',`高金币状态必须具体解释：\n\n${exceptions}\n\n修订版不再因相对3★核心较弱的槽位无限搜不存在的目标。部分后期波次已经10人口、两个选定核心3★、无可提高阵容的2★目录目标，因此停止付费刷新。此处是**Medium策略允许目标耗尽**，并非声称游戏禁止更多非核心3★或已达绝对战斗上限。策略限制不能自动当成用户要求的“没有任何合法转化途径”，因此本报告**不以该理由放宽核心阶段高金币验收**；仍有数百金币常态时该门槛记为失败。避免无效刷新和控制闲置存款之间的策略取舍仍待解决，不能靠刷新清零来伪造通过。\n\n## 7. 死亡金币`);
  report=report.replace('# P4-R1：机器人资格与未调参 Baseline','# P4-R1：修订后机器人资格与未调参 Baseline\n\n第一批medium-v2因重放发现无目标刷新而拒绝，见[完整失败记录](../README.md)。本目录使用medium-v2r1b及全新6001..6500资格seed；第一批209份证据逐项哈希保护。smoke5501..5550、development5601..5800、long-tail6501..6550；R2预留分区未动。');
  if(!accepted)report+='\n本版本虽已冻结供复现，但未成为合格的下一轮平衡测量仪器；不得将当前冻结等同于资格接受，不能进入P4-R2。\n';
 }
 if(!accepted)report=report.replace('下一轮如获授权，只能使用这些冻结机器人，并启用已登记但未运行的新R2分区。','当前冻结只用于复现失败结果；后续须先完成新的机器人资格验收，才能考虑P4-R2，预留R2分区继续保持未使用。');
 fs.writeFileSync(path.join(dir,'README.md'),report,{flag:'wx'});
 fs.writeFileSync(path.join(dir,'decision.json'),JSON.stringify(decision,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(dir,'game-protection-after.json'),JSON.stringify({gameFiles:Object.keys(before.hashes).length,historicalFiles:Object.keys(history).length,allExact:true,gameBalanceChanges:0,
  snapshotSha256:sha(path.join(dir,'freeze/game-before.json')),historicalSnapshotSha256:sha(path.join(originalDir,'freeze/historical-before.json')),frozenBotsSha256:decision.frozenBotSha256,
  ...(revised?{rejectedR1EvidenceFiles:Object.keys(read('freeze/rejected-r1-before.json')).length,rejectedR1EvidenceExact:true}:{})},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(decision,null,2));
}
main();
