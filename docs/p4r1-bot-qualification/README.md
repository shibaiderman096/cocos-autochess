# P4-R1：机器人资格与未调参 Baseline

## 1. 为什么Medium-v1不合格

第一次P4的正式结论仍是 **P4 FAILED / balance-v1 REJECTED**，没有部署候选。旧Validation中Stage6死亡220局，220局保留100+金，平均370.97金、Lv7.05。Stage3累计100%，Stage6约55%并非已合格的平衡结论；Strong99阶段约98%及Stage12-5可行预算上限仍属于旧实验事实。

[v1-diagnosis/summary.json](v1-diagnosis/summary.json)的10个死亡种子逐波动作SHA、金币与旧档完全一致。seed501还差28金升8，有候补却保留391金；固定阶段目标已达7级而停止购买经验。低血时虽允许目标+1，每波最多3次/12金经验购买仍限制即时人口转化；高2★占比使部分局不再刷新，没有Boss储备窗口。

旧报告、Validation、Holdout、candidate和decision全部保持原字节。原1..1250及其他已登记P4分区不作为未见数据。初次诊断曾误读经验字段，已纠正并完整重放；`v1-diagnosis-invalid-xp`仅保留无效开发记录，不参与结论。

## 2. Medium-v2修改

经济状态为save/develop/stabilize/all_in。最大有效利息储备由真实5金上限/10%利率得到50金；分阶段储备、Boss20金、Elite30金，低血再降，critical保留4金。spendableGold=max(0,gold−reserveGold)。

升级不使用固定阶段等级目标：以当前候补公开属性质量、相对阵容价值、剩余XP金价、余额与储备计算nextPopulationValue。没有可部署收益时不买经验。

刷新同时看主tank/carry的2★、最弱槽、对子、人口空位、可提升单位和少量核心3★；新卡允许为可预期的2★升级收集素材。最多1个当前核心追3★，没有全队追3★。save/develop/stabilize/all_in单波刷新上限分别为0/12/14/18，经验购买最多20次。先买眼前有用卡，再升级/刷新，并重新合法部署、穿装。每波保留mode、reserve、spendable、边际人口、coreReady、rolls和unusedGoldReason。

Weak/Strong策略与配置版本维持weak-v1/strong-v1；原始与当前源码在相同种子上的完整报告及动作SHA一致。Strong的公开估值仅使用属性/技能说明和角色，不调用标定模型；仍是粗略启发式，不声称等于真人或实测队伍战力。

## 3. 修改文件

| 文件 | 用途 |
| --- | --- |
| tools/bots/bot-configs.json | Medium-v2 state reserves, excess threshold, finite action bounds and marginal population constants; Weak/Strong unchanged |
| tools/bots/types.ts | Optional v2 economic policy and bot diagnostics |
| tools/bots/factory.ts | Versioned v2 validation and dispatch; original v1 remains replayable |
| tools/bots/medium-economy.ts | Public-attribute cores, population value, four economy modes |
| tools/bots/medium-v2.ts | Real-action spending, upgrades, finite rolling, unused-money reasons |
| tools/bots/shop-policy.ts | Optional v2 reserve/core policy and projected 2-star upgrades; v1 default branch preserved |
| tools/run-simulation.ts | Optional per-wave action economy observation and bot decision diagnostics |
| tools/balance-sim.ts | Separate R1 partitions, frozen game/source checks, 500-run qualification lock and old evidence protection |
| tools/balance/metrics.ts | Persist per-wave bot economy fields |
| tools/balance/bot-economy-metrics.ts | Preparation snapshots, opportunities, peaks, iron-golem transactions |
| tools/balance/audit-bot-economy.ts | Streaming Weak/Medium/Strong stage, Boss, death and opportunity report |
| tools/balance/capture-qualification.cjs | Capture exact game/history bytes, old bot source, seed reservations and pre-existing editor metadata drift |
| tools/balance/replay-v1-economy.cjs | Ten exact historical Stage6 death replays with isolated old prices/source |
| tools/balance/freeze-qualification-bots.cjs | Freeze bots after smoke/development economic gates |
| tools/balance/verify-legacy-bots.cjs | Old/current Weak and Strong full-report/action equality |
| tools/balance/verify-qualification-determinism.cjs | Real one/four worker SHA comparison |
| tools/balance/pressure-test-bot-economy.cjs | Matched controlled Boss stress fixtures, separate from natural campaigns |
| tools/balance/review-qualification-replays.cjs | Five full current qualification decision replays |
| tools/balance/report-bot-qualification.cjs | This 15-section evidence report and protected-source decision |
| tests/medium-economy-tests.cjs | Real-action A-E scenarios, excess/core tests, information traps and entry freeze protection |
| tests/qualification-cli-tests.cjs | Reject old/reserved seeds, candidate/formation override, partial qualification and evidence overwrite |
| tests/formal-bot-tests.cjs | Expect Medium-v2 while retaining real actions and determinism tests |
| tests/enemy-power-tests.cjs | Protect editor-owned metadata against captured R1 entry bytes; other historical checks retained |
| tools/run-tests.ps1 | Compile audit tool and run the two new test files |

## 4. 游戏配置保护

GAME BALANCE CHANGES = **0**。入口冻结139份assets源码/配置和1110份P0～旧P4证据，结束全部SHA逐项一致。11份正式游戏JSON与旧P4拒绝决定的retainedConfigHashes一致。冻结策略及运行源共159份。

本阶段入口已经包含此前独立授权的4费4金/5费5金，R1没有再改价格、出售、经济公式、概率、卡池、属性、技能、装备、模型、敌军星级/装备政策、Boss/Elite倍率或阵型。旧候选历史重放仅在隔离进程编译旧价格，不写入正式文件。

既存Cocos自动服务设置`settings/v2/packages/information.json`与P1旧哈希不符；它不是游戏输入。本次只把该文件单独固定到R1入口哈希，历史记录和设置字节均未改写，其余游戏/模型/证据保护保持严格。

## 5. 资格数据

| Bot/版本 | 真实campaign / 新seed | Stage3累计 / Wilson95% | Stage6累计 / Wilson95% | Stage12累计 / Wilson95% |
| --- | --- | --- | --- | --- |
| weak-v1 | 12阶段 / 2201..2700 / 500局 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 285/500 = 57.0% [52.6%, 61.3%] |
| medium-v2 | 12阶段 / 2201..2700 / 500局 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] |
| strong-v1 | 12阶段 / 2201..2700 / 500局 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] |

Medium另用2701..2750的50局真实99阶段长尾，Stage99累计50/50 = 100.0% [92.9%, 100.0%]；无采样截断。完整逐局、逐波、逐阶段、阵容和决策SHA保存在各批目录。50-seed smoke、200-seed development先于机器人冻结；首轮smoke经济不合格的结果保留，第二轮通过后才进入development。正式500资格集合只运行一次，未根据它改策略。

这是 **Bot Qualification Baseline**，不是最终游戏平衡Baseline。新种子登记于freeze/seed-partitions.json；P4-R2 training3001..3500、validation4001..4500、holdout5001..5250未运行。

## 6. Medium经济（Stage1～12）

| Stage | 进入/离开金币中位 | 购物后金币中位 | 平均等级/人口 | 买卡/刷新/经验 每波金 | 利息 每波金 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.00/4.00 | 0.00 | 2.00/2.00 | 2.28/0.00/0.00 | 0.00 |
| 2 | 4.00/9.00 | 1.00 | 4.06/4.06 | 4.21/1.05/1.41 | 0.00 |
| 3 | 9.00/33.00 | 21.00 | 5.32/5.32 | 3.13/2.92/1.41 | 1.49 |
| 4 | 33.00/35.00 | 31.00 | 6.12/6.12 | 4.22/7.90/2.82 | 2.79 |
| 5 | 35.00/39.00 | 41.00 | 7.05/7.05 | 2.28/11.74/1.85 | 3.67 |
| 6 | 39.00/49.00 | 52.00 | 8.06/8.06 | 0.39/10.21/7.91 | 4.51 |
| 7 | 49.00/49.00 | 51.00 | 9.03/9.03 | 0.02/16.65/2.37 | 4.55 |
| 8 | 49.00/37.00 | 52.00 | 9.49/9.49 | 0.00/15.38/1.78 | 4.57 |
| 9 | 37.00/97.00 | 82.00 | 9.99/9.99 | 0.00/15.52/0.01 | 4.87 |
| 10 | 97.00/87.00 | 86.00 | 9.99/9.99 | 0.00/19.07/0.02 | 5.00 |
| 11 | 87.00/101.00 | 86.00 | 10.00/10.00 | 0.00/18.46/0.00 | 5.00 |
| 12 | 101.00/91.00 | 86.00 | 10.00/10.00 | 0.00/19.98/0.00 | 5.00 |

完整进入/离开、峰值、未消费、reserve/spendable、板凳、放弃的有用卡、可立即2★未买、备战席满和铁傀儡购买/上阵/tank计数见qualification-500/{weak,medium,strong}/economy.json。金币多不自动判浪费；保留储备与可支配部分分别报告。Stage99长尾后期银行增长与人口/核心/内容上限并列报告，不能以无效刷新清零美化消费。

## 7. 死亡金币

旧拒绝候选：Stage6死亡220/500，220/220携带100+金，平均370.97金。**旧候选难度与本轮正式配置不同，不能据此声称因果改善。**

当前正式配置的50-seed配对控制中v1死亡0局、v2死亡0局。正式资格Medium死亡0局，100+闲置死亡比例0/0 = N/A [N/A, N/A]；长尾死亡0局。没有死亡时该指标为0/0、N/A，不写成0%或宣称已经测得自然死亡金币下降。

另外50个开发seed的同局面压力夹具使用真实Stage6 Boss、HP8、300金、Lv7和同一弱板凳/上阵存档，所有规则不变，统计独立：

| 压力Bot | 局数/死亡 | 死亡且100+金 | 平均入战金币 | 平均等级/人口 | 平均转化金币 |
| --- | --- | --- | --- | --- | --- |
| v1 | 50/0 | 0 | 261.86 | 7.00/7.00 | 38.14 |
| v2 | 50/0 | 0 | 120.10 | 8.00/8.00 | 179.90 |

压力夹具逐局保存deathGold/level/population/benchPowerProxy、全部动作与理由，见pressure-fixtures-50.json；它不计入500自然campaign完成率。

## 8. Boss前消费

| Stage | Boss进入金均值 | Boss入战金均值 | 买卡/刷新/经验 均值 | Boss总消费 | 普通波总消费 |
| --- | --- | --- | --- | --- | --- |
| 4 | 46.05 | 21.19 | 1.92/4.99/18.02 | 24.94 | 12.83 |
| 5 | 56.25 | 32.92 | 1.60/12.67/9.08 | 23.35 | 13.30 |
| 6 | 61.79 | 33.04 | 0.40/22.99/5.42 | 28.80 | 14.57 |
| 7 | 56.09 | 28.50 | 0.00/27.46/0.13 | 27.59 | 16.32 |
| 8 | 70.14 | 42.20 | 0.00/27.94/0.00 | 27.94 | 13.67 |

Stage4～8池化Boss消费26.52金/波，普通波14.29金/波。逐Boss购物前后及分类花费来自真实动作；描述性差异不等于Boss消费的随机化因果效应。Elite与Boss使用不同储备，均只读取当前可见波类型。

## 9. 人口机会

| Stage | 配对v1金币中位 | 配对v2金币中位 | 配对v1/v2平均人口 | 资格v2结束仍可升级次数/有机会波次 |
| --- | --- | --- | --- | --- |
| 4 | 111.00 | 31.00 | 6.00/6.13 | 0/565 |
| 5 | 209.00 | 41.00 | 6.88/7.06 | 0/183 |
| 6 | 359.50 | 52.00 | 7.00/8.08 | 0/752 |
| 7 | 504.50 | 51.00 | 7.90/9.04 | 0/262 |
| 8 | 684.00 | 52.00 | 8.00/9.47 | 0/312 |

可升级定义同时要求候补边际价值足够且能支付全段剩余XP与储备。旧诊断的粗略“有候补且买得起”和新版边际机会口径不同，未把两个不同分母的miss-rate直接当同口径改善；额外rawAffordableBenchIdle使用统一原始观察。Stage6人口不再被固定Lv7目标锁死。

## 10. 典型决策重放

| Medium-v2 seed | 结果 | 最低HP | 完整动作SHA | 资格动作逐波匹配 |
| --- | --- | --- | --- | --- |
| 2201 | RUN_COMPLETED | 20 | 0f92f8fb661c2841ebf1ea829575d262a02f546be793f7322dc17419192652bf | true |
| 2700 | RUN_COMPLETED | 20 | 151d3edfb8fb63cb6a42a7c433650a4f8e818cd9f641b7821eff39c207a47775 | true |
| 2202 | RUN_COMPLETED | 20 | 0ec1e2343292bbea298b8bb421fb10842653984140d1d715a984e7f8a4b04fcf | true |
| 2203 | RUN_COMPLETED | 20 | 616e3b38d54cf3c49629547d4e18c43790d3d9f0797095c64b22bd4709306c5b | true |
| 2204 | RUN_COMPLETED | 20 | 7f17288d7a852d15039254a5910e91a1dfc42f3b935ec08ad165350bddcf96d2 | true |

未通过定性重放资格。seed2201/2700/2204在Stage6 Boss前主carry已3星、tank已2星、没有对子或catalogUpgrade时，仍因weakSlot相对3星carry的比例触发14次刷新，28金没有形成任何买卡或经验收益。当前基线过于容易使这些行为没有导致死亡，不能用100%完成率或低金币中位数掩盖测量工具缺陷。seed2202/2203保留80至84金是可解释的：升人口需68金且Boss储备20金，当前还不足88金，没有立刻升级并非固定阶段锁。五局全健康且Stage6死亡类型缺失已披露；10个历史死亡和单独低血压力夹具均保留。此medium-v2候选拒绝，需修复刷新目标并另用未使用资格seed，不能覆盖本批数据。

完整购买、刷新、经验、出售、站位、装备及领奖见replays/medium-v2-seed*.json。资格集中Stage6死亡样本0局，缺失类型明确披露；没有通过改难度、伪造失败或只截短campaign来造样本。旧真实死亡10局在v1-diagnosis，低血真实动作压力样本在pressure-fixtures-50.json。

## 11. 强弱排序

| Stage | Weak | Medium-v2 | Strong |
| --- | --- | --- | --- |
| 6 | 100.0% | 100.0% | 100.0% |
| 12 | 57.0% | 100.0% | 100.0% |

Strong≥Medium-v2≥Weak检查通过。允许早期并列；本轮不以目标胜率反推敌军数值。Strong的长期通关与内容上限不会通过故意削弱Bot掩盖。铁傀儡允许按公开属性正常使用，但仍未被冒称完成P1-B标定；qualification经济文件分别记录购买、上阵和tank角色。

## 12. 确定性

| 产物 | 1 worker和4 workers一致的SHA-256 |
| --- | --- |
| medium/per-run.jsonl | df8b124acfe8fa107984adcb519e924d3c343a67966ddd6ffdb8b44541564fba |
| medium/per-wave.csv | 4c893e0d88fbf7d22a8f00da81afb1f693202d466cca104a6777169087023e6d |
| medium/per-stage.csv | 938d529953dd433f9440eacf8fe4339610efbab9cc83bc9150a58e792cbef077 |
| medium/summary.json | 93266f16a34b59f99e3dd5b7d3108759370cd3929673475213bbebfc62011c5d |
| aggregate.json | ed3004f524dca5241205d1665b7baef460d6beed6333ee894640681697e4d4fb |

相同冻结botVersion/config/seed2199..2200，三档真实12阶段campaign，实际worker数1与4，全部14份逻辑产物SHA一致。运行时间与worker分片调度不参与逻辑SHA比较。另有Weak/Strong原始/当前完整报告相等；资格5局完整重放逐波动作SHA相等。

## 13. 性能

| 批次 | runs | waves | workers | 秒 | runs/sec | waves/sec |
| --- | --- | --- | --- | --- | --- | --- |
| smoke-50-r2 | 50 | 4900 | 4 | 22.32 | 2.24 | 219.58 |
| development-200 | 200 | 19600 | 4 | 100.52 | 1.99 | 194.98 |
| qualification-500 | 1500 | 144315 | 4 | 505.76 | 2.97 | 285.34 |
| long-tail-50 | 50 | 48400 | 2 | 608.72 | 0.08 | 79.51 |

资格批与长尾有并发且同时跑回归，壁钟吞吐不能直接作单机独占基准。未增加战斗搜索；只有真实战斗推进调用BattleSim，Bot策略模块无模拟器/标定模型依赖。初次旧P4 baseline smoke约459 waves/sec，本轮含完整经济审计、更多合法动作与资源检查；按上表如实比较，不把更多报告开销当作弊搜索。

## 14. npm test

`npm.cmd test` 实际退出码 **0**，见final-tests.log和final-test-result.json。旧P0～P4、真实动作守恒、RNG/前缀/存档、装备/阵型、Medium-v2 A-E经济场景、超额金币、核心、Boss、未来信息陷阱、新CLI分区与旧候选保护均执行。

本轮不改UI，没有声称Cocos编辑器、浏览器或设备实测。入口已有的无关本地设置差异通过独立入口哈希保护解释，没有更改游戏配置或旧证据来通过测试。

## 15. 结论

**BOT QUALIFICATION FAILED**

| 资格门槛 | 结果 |
| --- | --- |
| publicActionsAndFutureInfoTraps | PASS |
| determinism | PASS |
| bossPreSpending | PASS |
| lowHpReserveAndFiniteRolls | PASS |
| coreStageGold | PASS |
| populationOpportunities | PASS |
| stableStateInterest | PASS |
| stressIdleDeathReduction | FAIL |
| naturalDeathHighGold | N/A：无自然死亡，另有受控压力对照 |
| ranking | PASS |
| qualitativeReplayReview | FAIL |
| gameBytesUnchanged | PASS |
| historicalBytesUnchanged | PASS |
| fullRegression | PASS |
| weakStrongUnchanged | PASS |
| runsAndLongTail | PASS |

机器人资格和游戏平衡是两个结论。本轮游戏平衡修改0项，没有接受或部署balance-v1，也没有开始P4-R2。自然死亡金币的零分母、当前配置通过率偏高及后期内容上限仍明确保留。

冻结文件SHA：`a2d584e6e21994708152611451ed1350a545cba0a8a825bcac979e27b5d90616`。medium-v2 botConfigHash：`bd0d770c1819c9e6a4a363179b02bd1cf65a1506fe07403289f2cc61a7b3677c`。下一轮如获授权，只能使用这些冻结机器人，并启用已登记但未运行的新R2分区。
