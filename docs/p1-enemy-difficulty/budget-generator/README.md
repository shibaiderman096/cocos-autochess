# P1-C：战力预算与混合敌军生成器

日期：2026-10-15。新游戏默认使用 **budget-v1**；旧存档缺少生成版本时固定为 **legacy**。P1-B模型、战斗数值、原人口曲线及L0位置保持不变。已实现并验证生成、接入、存档和报告；**Stage 7/8的软性升星比例目标因预算冲突未达到**。未进入P2/P3/P4，也未验证最终通关率。

最终证据使用 **final-v2-seed12345** 与 **final-v2-seed12345-repeat**。development-10、final-seed12345、旧测试日志等保留为开发记录，不代表最终版本；最终测试日志是npm-test-final-v2.log。

## 1. 修改文件

| 文件 | 本阶段改动 |
| --- | --- |
| [assets/scripts/core/EnemyGenerationTypes.ts](D:/cocos/NewProject/assets/scripts/core/EnemyGenerationTypes.ts) | 新增WaveKind、双模式、候选、配置/诊断类型、配置验证、稳定配置身份；版本常量固定到已交付P1-B模型。 |
| [assets/scripts/core/EnemyBudget.ts](D:/cocos/NewProject/assets/scripts/core/EnemyBudget.ts) | 新增原始曲线、显式分类、联合可行阶段包络、恢复节奏、requested/effective/区间与饱和；不选单位。 |
| [assets/scripts/core/EnemyCandidates.ts](D:/cocos/NewProject/assets/scripts/core/EnemyCandidates.ts) | 新增逐单位/星级P1-B查询、稳定候选排序、费用解锁、3★配额下的精确区间。 |
| [assets/scripts/core/EnemyGenerator.ts](D:/cocos/NewProject/assets/scripts/core/EnemyGenerator.ts) | 新增初始逐槽预算构造、可负担软升星目标、单点/双点有限优化、重复软惩罚、独立enemy RNG、置信诊断。 |
| [assets/resources/config/enemy-difficulty.json](D:/cocos/NewProject/assets/resources/config/enemy-difficulty.json) | 新增budget-v1配置：增长、分类、恢复、费用解锁、星级目标、优化上限、饱和策略。 |
| [assets/scripts/core/RunSetup.ts](D:/cocos/NewProject/assets/scripts/core/RunSetup.ts) | 保留四参数legacy公共调用和原函数体；第五参数显式接入budget-v1；用完整下一阶段界限保证前缀稳定。 |
| [assets/scripts/core/RoundFlow.ts](D:/cocos/NewProject/assets/scripts/core/RoundFlow.ts) | 仅扩展WaveEnemy装备与WaveConfig生成诊断类型；结算、扣血、推进规则不变。 |
| [assets/scripts/core/RunSessionTypes.ts](D:/cocos/NewProject/assets/scripts/core/RunSessionTypes.ts) | 扩展输入依赖、模式、版本和逐波预算报告字段。 |
| [assets/scripts/core/RunSession.ts](D:/cocos/NewProject/assets/scripts/core/RunSession.ts) | 默认新模式、检查存档版本/标定哈希/配置身份、统一生成与调试扩展、装备接口透传。 |
| [assets/scripts/core/ShopSave.ts](D:/cocos/NewProject/assets/scripts/core/ShopSave.ts) | 保存生成/模型/难度版本和标定哈希；缺字段旧档保留legacy，freshSaveV2默认budget-v1。 |
| [assets/scripts/view/BattleStage.ts](D:/cocos/NewProject/assets/scripts/view/BattleStage.ts) | 实际加载enemy-power/enemy-difficulty资源，传给共享会话；新游戏/重新开始使用新规则，继续游戏遵循旧存档模式。 |
| [tools/run-simulation.ts](D:/cocos/NewProject/tools/run-simulation.ts) | 保持P0六类RunInputs不变，另加载新配置；实际会话模式、版本和生成器原始预算诊断进入报告。 |
| [tools/run-sim.ts](D:/cocos/NewProject/tools/run-sim.ts) | 新增--enemy-mode legacy/budget-v1、预算摘要；输出保护扩展到P1-A/P1-B证据目录。 |
| [tools/report-enemy-budget.ts](D:/cocos/NewProject/tools/report-enemy-budget.ts) | 新增99阶段完整生成、Stage2–10预算/组合CSV、边界、星级最低预算证明、来源哈希和独立性能输出。 |
| [tests/enemy-budget-tests.cjs](D:/cocos/NewProject/tests/enemy-budget-tests.cjs) | 新增26项：A–L要求、离散不可达证明、重复退化、模型/存档漂移拒绝、保护检查。 |
| [tests/regression-tests.cjs](D:/cocos/NewProject/tests/regression-tests.cjs) | 原67项保留；旧数值夹具显式legacy，新增2项budget-v1 Cocos适配层/真实战斗对照。 |
| [tests/run-session-tests.cjs](D:/cocos/NewProject/tests/run-session-tests.cjs) | 原12项保持其P1-A legacy规则，明确夹具模式。 |
| [tests/run-sim-cli-tests.cjs](D:/cocos/NewProject/tests/run-sim-cli-tests.cjs) | 原4项保持legacy，新增新模式、默认值与真实CLI报告确定性检查。 |
| [tests/enemy-power-tests.cjs](D:/cocos/NewProject/tests/enemy-power-tests.cjs) | 原8项保留；保护守卫仅放行本阶段明确需要改动的接入文件，旧生成和其他原字节继续检查。 |
| [tools/run-tests.ps1](D:/cocos/NewProject/tools/run-tests.ps1) | 保留全部旧套件，编译报告工具并加入预算测试，传播任何失败退出码。 |
| [package.json](D:/cocos/NewProject/package.json) | 新增report-enemy-budget命令，无新依赖。 |

四个新增core TS各带独立typescript .meta，enemy-difficulty.json带json .meta。所有P0/P1-A/P1-B报告目录、原配置、P1-B模型、BattleSim、ConfigManager、技能/属性、商店与经济未修改。开始时已有的工作区改动保留；P1-C保护检查有257个既有文件逐字节不变，另10个明确接入/测试文件允许改动。

## 2. 架构与兼容

RunSession → RunSetup.buildRunWaves → legacy原函数，或者 EnemyBudget + EnemyGenerator → EnemyPowerModel → WaveEnemy[]。RunSession将同一结果交给Cocos与run-sim；BattleSim、奖励和经济不属于生成器。

四参数buildRunWaves继续返回旧规则；会话总是显式传保存的模式。旧存档缺少字段时固定legacy，不因升级改变未来敌人。新存档记录enemyGenerationVersion、powerModelVersion、powerModelCalibrationHash、difficultyConfigVersion，以及配置身份。模型版本/标定哈希或配置身份不匹配时拒绝加载。配置身份覆盖难度、run、棋子、战斗配置、技能和装备。

候选装备字段保留但始终为空。位置只按原enemyProgression.cells顺序分配，不读取角色、玩家站位或模板enemies。旧晚期增伤/减伤仅legacy保留；budget-v1的statMultiplier=1，额外damageAmp=0、damageReduction=0。

## 3. B0来源

旧Stage 2-1实际敌军只有warrior 1★、无装备。P1-B版本为enemy-power-v1，标定哈希fb31829c87670bdba73af786d39ca99cda9aa875f1ffb609fd1e072e66e00b3d。

B0 = estimateTeamPower([{unitId: warrior, star: 1, equipment: []}]) = **106.17578444811335**。单点样本48,000、可靠性high；这不等于团队组合预测保证。正式constituents记录见summary.json。当前内容的基准与P0实际阵容完全一致；普通模式用starter优先的稳定单位顺序定位基准，候选输入顺序不会改变生成。

## 4. 真实公式与可行阶段包络

- w=budgetWaveIndex，Stage2-1为1；Stage1的3波intro原样保留，不进入模型。
- raw = B0 × 1.04^(w−1)。设本阶段第r波、长度R，t=(r−1)/(R−1)。
- effectiveWaveFactor = (1.04 / 0.94)^t。
- kindMultiplier来自配置：normal=1、elite=1.15、boss=1.35。
- pacingMultiplier = effectiveWaveFactor / kindMultiplier。
- requested = raw × kindMultiplier × pacingMultiplier。

因此requested阶段首锚点正好等于raw，末波到下一阶段首波正好回落6%。kind倍率不永久乘到下一阶段锚点，也没有再叠独立阶段+35%。超出数值范围的指数会明确报错；测试的极大w=10,000仍为有限值且正常饱和。

不能在人口地板和星级上限存在时仅逐波独立截断：下一阶段的最低价变化、人口增加，以及Boss单3★的上限都会破坏恢复。因此effective另用公开的联合可行包络求解，不冒充requested本身：

1. 每阶段首波的允许区间是本波[min,max]，与上一阶段末波[min×0.94,max×0.94]的交集。
2. 首波anchor在该交集中选取raw与上一阶段首anchor的较大值，避免低费用内容解锁导致向下跳变；不会永久乘Boss倍率。
3. 末波anchor=下一阶段首anchor/0.94；阶段内几何插值后，逐波按自身人口/星级的合法[min,max]约束。
4. requested始终保留。超上限记ABOVE_MAX_FEASIBLE，低于下限记BELOW_MIN_FEASIBLE；其他联合包络变化记STAGE_ENVELOPE_CONSTRAINT。若未来配置无交集，recoveryFeasible=false并输出诊断，不伪造恢复成功。

最终默认配置全部97个正常阶段交界都有合法交集，effective目标均回落6%。早期effective明显高于requested，是人口地板与恢复约束的结果，完整值全部可查；长期requested仍遵循原4%趋势，effective受到内容硬上限限制。

## 5. WaveKind与策略配置

Stage1=intro。Stage≥2最后一波为boss；至少5波时倒数第二为elite；其余normal。enabled/minRounds/roundFromEnd集中于配置。nominal倍率保留为1/1.15/1.35，pacing由完整包络反推。

人口严格沿原曲线min(10,1+floor((w−1)/3))。费用依次开放：Stage2允许1费、Stage4允许1–2费、Stage6允许1–3费、Stage7允许1–4费、Stage8允许1–5费。依据旧2/4/6/8内容开放节奏，在5费前专门开放原本被跳过的4费。全部低费用继续留在池内，不再整队切档。

2★候选从Stage6开放，软目标Stage6/7/8分别为1/3、2/3、1。3★沿旧内容首次出现的Stage10开放，normal=0、elite默认0、boss最多1；所有3★支付真实P1-B组合价格。

优化最多100轮；topK=3、pairTopK=6只是有限搜索的初始工程参数。预算容差5%是首要门槛，进入容差后以残差、星级目标、重复度、集中度进行有界软优化；惩罚系数是公开的初始策略配置，不宣称为已调好的平衡参数。先构造可负担的2★人数，再逐槽按剩余预算/槽位选择，之后单点替换及必要的双点邻域改良。完全单英雄队有额外软惩罚，仍允许重复单位；没有每英雄限1的硬限制。

单/双人口会完整枚举合法离散选择，能给nearest-discrete证明；更多人口若有限优化无法达标，标optimizer-limit，绝不把搜索没找到说成数学不可达。

## 6. Stage2–10实际预算

完整75个正常波的target/actual/deviation、星级/费用计数见[逐波预算表](D:/cocos/NewProject/docs/p1-enemy-difficulty/budget-generator/final-v2-seed12345/REPORT.md)、[budget-table.csv](D:/cocos/NewProject/docs/p1-enemy-difficulty/budget-generator/final-v2-seed12345/budget-table.csv)及[composition-table.csv](D:/cocos/NewProject/docs/p1-enemy-difficulty/budget-generator/final-v2-seed12345/composition-table.csv)。另3波intro使前10阶段共78波。

下表范围指该阶段首波→末波，并非阶段内极值：

| 阶段 | 人口 | requested首→末 | effective首→末 | actual首→末 | 最大误差% |
| --- | --- | --- | --- | --- | --- |
| 2 | 1→2 | 106.176→137.425 | 106.176→200.447 | 106.176→200.000 | 3.010 |
| 3 | 2→4 | 129.179→173.886 | 188.420→396.830 | 194.091→400.386 | 4.097 |
| 4 | 4→6 | 163.453→228.822 | 373.020→694.452 | 387.465→696.584 | 3.872 |
| 5 | 7→9 | 215.093→313.159 | 652.785→839.295 | 667.230→853.740 | 2.213 |
| 6 | 9→10 | 294.369→445.722 | 788.937→839.295 | 791.845→853.444 | 1.738 |
| 7 | 10→10 | 418.979→659.778 | 788.937→839.295 | 827.519→872.486 | 4.890 |
| 8 | 10→10 | 620.191→976.633 | 788.937→976.633 | 827.519→1007.388 | 4.890 |
| 9 | 10→10 | 918.035→1445.655 | 918.035→1445.655 | 962.421→1447.565 | 4.835 |
| 10 | 10→10 | 1358.916→2139.923 | 1358.916→2139.923 | 1369.009→2138.769 | 0.743 |

99阶段正式种子12345有968波，其中965个正常敌军波全部within-tolerance；最大偏差4.890%，没有被忽略的离散失败或optimizer-limit。另0、1、42、12346、uint32最大值五个种子各965波也全部通过。

## 7. Stage6–8星级与预算冲突

| 阶段 | 目标2★ | 实际2★ | 升星最低预算超出5%容差的波数 |
| --- | --- | --- | --- |
| 6 | 33.33% | 30.34% | 0/9 |
| 7 | 66.67% | 42.00% | 10/10 |
| 8 | 100.00% | 56.00% | 10/10 |

Stage6已有约1/3且1★/2★混合；Stage7/8目标未达成。每波按目标人数，用最便宜的合法1★与2★求最低总价，仍超过effective×1.05；这20波的最低价、预算与容差上限保存在summary.json.starPolicyEvidence。没有改B0、提高4%曲线、免费升星或突破3★限制来掩盖冲突。实际42%/56%还受多样性软约束影响，不能说恰好是预算能支持的最大比例。

## 8. 费用分布

统计按本阶段全部敌军槽位加权；列出1/2/3/4/5费总数。开放候选不等于强制每波出现该档。

| 阶段 | 平均费用 | 费用方差 | 1/2/3/4/5费计数 | 混费波数 |
| --- | --- | --- | --- | --- |
| 2 | 1.000 | 0.000 | 7/0/0/0/0 | 0 |
| 3 | 1.000 | 0.000 | 19/0/0/0/0 | 0 |
| 4 | 1.405 | 0.241 | 22/15/0/0/0 | 7 |
| 5 | 1.556 | 0.247 | 28/35/0/0/0 | 8 |
| 6 | 2.652 | 0.497 | 12/7/70/0/0 | 9 |
| 7 | 2.900 | 0.090 | 0/10/90/0/0 | 10 |
| 8 | 2.900 | 0.090 | 0/10/90/0/0 | 10 |
| 9 | 2.710 | 0.526 | 12/9/75/4/0 | 10 |
| 10 | 2.240 | 1.022 | 29/31/27/13/0 | 10 |

4费Stage7已进入正常候选池，正式种子首次实际生成于Stage9。5费在Stage8开放但前10阶段未被该种子选择，后期正常进入组合。Stage7/8现在为2费/3费混合且不再全队同一英雄；重复仍较多，反映当前标定低价单位与预算/星级约束，不是已完成的阵容平衡结论。

## 9. 关键边界

| 边界 | Legacy模型战力变化% | 新requested变化% | 新effective变化% | 新actual模型变化% |
| --- | --- | --- | --- | --- |
| 5→6 | 76.269 | -6.000 | -6.000 | -7.250 |
| 7→8 | 56.964 | -6.000 | -6.000 | -5.154 |
| 9→10 | 210.893 | -6.000 | -6.000 | -5.427 |

Legacy列使用同一P1-B模型的裸装单位/星级之和，**未把旧额外增伤/减伤伪装成已标定战力**。9→10另有从0到5%增伤/5%减伤的旧免费增益，单独存于boundaries.json。上述变化证明消除了整队切费/升星造成的预算断崖，不证明真实胜率同比例变化。

## 10. 饱和与模型置信度

首次暂时超上限是Stage2-2：1人口、仅1费1★池的最大估值106.176，而requested=113.249。人口增加会再次改变区间。持续超上限从Stage12-5（globalWaveId=93）开始，此后至99阶段末所有requested都超过本波合法最大值。

965波的原因统计：{"none":33,"ABOVE_MAX_FEASIBLE":878,"BELOW_MIN_FEASIBLE":40,"STAGE_ENVELOPE_CONSTRAINT":14}。maxFeasible是允许重复且受3★总配额约束的精确上界；effective按联合包络约束，并不总是独立截断到max。绝不扩人口、暗加装备、开放普通3★或加属性追指数。

actualBudget使用EnemyPowerModel.estimateTeamPower的最终查询值；所有statMultiplier=1，因为P1-B没有标定属性倍率与战力的响应关系。lowConfidenceUnits保留组合点低置信信息；estimatedBudgetConfidence一律low，并附P1-B团队MAE约13.60个百分点的限制。预算误差小不等于实际战斗强度误差小，特殊3★尤其不能作精确胜率推断。

## 11. 确定性与性能

最终同种子在两个独立进程重新生成，7份确定性产物逐字节一致。waves.json包含完整敌军和生成诊断，SHA-256为：

8487eedca0f91bf2f0353c2c565f82841e0ad21aaf544dde330849fc8d69b029

原始enemy-power.json SHA-256仍为38ba7d425fa235b528799d46e6a21a1c58ec506841fd58e15c41a64887837cb0。所有最终源码哈希和配置哈希与当前文件匹配。generationTime只在performance.json，未进入waves、报告或确定性哈希。

第一次99阶段生成270.764ms；第二次266.419ms。第一次单波测量平均0.242ms、p95 0.555ms、最大3.563ms；最多5轮优化。总耗时包含界限预计算，单波耗时只测calculate+generate。无完整队伍组合爆炸。

## 12. 前缀稳定与RNG

3阶段14波、6阶段38波，与99阶段968波的共同部分连同预算元数据完全一致，包括原先最后一个所选阶段的Boss。生成器为所有阶段使用同一个完整下一阶段界限，不以本次选择的总阶段数推导收尾。

enemy流按runSeed、globalWaveId及包含生成版本/模型版本/标定哈希/难度配置的稳定标签派生。候选按power/cost/star/unitId排序，RNG只用于限定top-K选择。额外消费1000次enemy流不会改变shop/battle/bot/formation；倒置对象字段和候选装载顺序也不会改变结果。

## 13. Legacy与旧证据保护

legacy的968波与P0 waves-before.json逐字段一致；原legacy函数体文本也与Git基线完全相同。Stage1 intro、人口曲线、L0格子顺序保持原规则。P0/P1-A/P1-B报告文件未覆盖，P1-B模型和标定输入/源码哈希未漂移。完整证明见[verification.json](D:/cocos/NewProject/docs/p1-enemy-difficulty/budget-generator/verification.json)。

## 14. 真实测试与执行命令

前置npm test和最终npm test均退出0。最终：预算26项、Cocos适配层回归69项、RunSession12项、CLI5项、EnemyPowerModel8项、标定6项，以及原战斗127、经济56、商店41、属性9和所有其他旧套件均通过。最终日志：[npm-test-final-v2.log](D:/cocos/NewProject/docs/p1-enemy-difficulty/budget-generator/npm-test-final-v2.log)；项目声明类型检查、纯TS编译和git diff --check通过。

Cocos适配层测试通过资源加载入口将新模型送入真实RunSession，比较完整敌军、动作、实际BattleSim事件、结算、版本和存档；节点边界仍是测试替身，没有声称运行过编辑器画面或真机。

可复现命令（报告输出必须选择新目录，避免覆盖旧证据）：

    npm.cmd test
    npm.cmd run run-sim -- --seed 12345 --stages 10 --enemy-mode legacy --json temp/p1c-legacy.json
    npm.cmd run run-sim -- --seed 12345 --stages 10 --enemy-mode budget-v1 --json temp/p1c-budget.json
    npm.cmd run report-enemy-budget -- --seed 12345 --output temp/p1c-report-new

MinimalBaselineBot真实整局烟测：legacy在6-2、第31波淘汰；budget-v1在10-7、第75波淘汰。未跳过死亡、未发免费资源，生成报告的全部78波不等于机器人实际活过78波。两次结果只证明基础设施可推进，不能外推正常玩家通关率或最终难度。

## 15. 尚未实现与验收边界

P2智能站位尚未实现；P3装备循环尚未实现；P4三档正式机器人和平衡尚未实现；最终85%/50%通关率尚未验证。未新增Boss特色阵型、玩家针对性站位、奖励掉落、羁绊或技能，也未自动根据输赢改敌军。

本阶段硬规则与生成/接入测试已通过；Stage7/8的软性星级目标仍有明确预算冲突，P1-B团队模型仍有预测局限。不能把当前结果表述为最终平衡已经完成。
