# P4-R1：修订后机器人资格与未调参 Baseline

第一批medium-v2因重放发现无目标刷新而拒绝，见[完整失败记录](../README.md)。本目录使用medium-v2r1b及全新6001..6500资格seed；第一批209份证据逐项哈希保护。smoke5501..5550、development5601..5800、long-tail6501..6550；R2预留分区未动。

## 1. 为什么Medium-v1不合格

第一次P4的正式结论仍是 **P4 FAILED / balance-v1 REJECTED**，没有部署候选。旧Validation中Stage6死亡220局，220局保留100+金，平均370.97金、Lv7.05。Stage3累计100%，Stage6约55%并非已合格的平衡结论；Strong99阶段约98%及Stage12-5可行预算上限仍属于旧实验事实。

[v1-diagnosis/summary.json](../v1-diagnosis/summary.json)的10个死亡种子逐波动作SHA、金币与旧档完全一致。seed501还差28金升8，有候补却保留391金；固定阶段目标已达7级而停止购买经验。低血时虽允许目标+1，每波最多3次/12金经验购买仍限制即时人口转化；高2★占比使部分局不再刷新，没有Boss储备窗口。

旧报告、Validation、Holdout、candidate和decision全部保持原字节。原1..1250及其他已登记P4分区不作为未见数据。初次诊断曾误读经验字段，已纠正并完整重放；`v1-diagnosis-invalid-xp`仅保留无效开发记录，不参与结论。

## 2. Medium-v2r1b修改

经济状态为save/develop/stabilize/all_in。最大有效利息储备由真实5金上限/10%利率得到50金；分阶段储备、Boss20金、Elite30金，低血再降，critical保留4金。spendableGold=max(0,gold−reserveGold)。

升级不使用固定阶段等级目标：以当前候补公开属性质量、相对阵容价值、剩余XP金价、余额与储备计算nextPopulationValue。没有可部署收益时不买经验。

刷新同时看主tank/carry的2★、最弱槽、对子、人口空位、可提升单位和少量核心3★；新卡允许为可预期的2★升级收集素材。最多2个当前核心（mainTank/mainCarry）追3★，没有全队追3★。save/develop/stabilize/all_in单波刷新上限分别为0/12/14/18，经验购买最多20次。先买眼前有用卡，再升级/刷新，并重新合法部署、穿装。每波保留mode、reserve、spendable、边际人口、coreReady、rolls和unusedGoldReason。

Weak/Strong策略与配置版本维持weak-v1/strong-v1；原始与当前源码在相同种子上的完整报告及动作SHA一致。Strong的公开估值仅使用属性/技能说明和角色，不调用标定模型；仍是粗略启发式，不声称等于真人或实测队伍战力。

## 3. 修改文件

| 文件 | 用途 |
| --- | --- |
| tools/bots/bot-configs.json | Medium-v2r1b state reserves, excess threshold, finite action bounds and marginal population constants; Weak/Strong unchanged |
| tools/bots/types.ts | Optional v2 economic policy and bot diagnostics |
| tools/bots/factory.ts | Versioned v2 validation and dispatch; original v1 remains replayable |
| tools/bots/medium-economy.ts | Public-attribute cores, population value, four economy modes |
| tools/bots/medium-v2r1b.ts | Real-action spending, upgrades, finite rolling, unused-money reasons |
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
| tests/formal-bot-tests.cjs | Expect Medium-v2r1b while retaining real actions and determinism tests |
| tests/enemy-power-tests.cjs | Protect editor-owned metadata against captured R1 entry bytes; other historical checks retained |
| tools/run-tests.ps1 | Compile audit tool and run the two new test files |

## 4. 游戏配置保护

GAME BALANCE CHANGES = **0**。入口冻结139份assets源码/配置和1110份P0～旧P4证据，结束全部SHA逐项一致。11份正式游戏JSON与旧P4拒绝决定的retainedConfigHashes一致。冻结策略及运行源共159份。

本阶段入口已经包含此前独立授权的4费4金/5费5金，R1没有再改价格、出售、经济公式、概率、卡池、属性、技能、装备、模型、敌军星级/装备政策、Boss/Elite倍率或阵型。旧候选历史重放仅在隔离进程编译旧价格，不写入正式文件。

既存Cocos自动服务设置`settings/v2/packages/information.json`与P1旧哈希不符；它不是游戏输入。本次只把该文件单独固定到R1入口哈希，历史记录和设置字节均未改写，其余游戏/模型/证据保护保持严格。

## 5. 资格数据

| Bot/版本 | 真实campaign / 新seed | Stage3累计 / Wilson95% | Stage6累计 / Wilson95% | Stage12累计 / Wilson95% |
| --- | --- | --- | --- | --- |
| weak-v1 | 12阶段 / 6001..6500 / 500局 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 254/500 = 50.8% [46.4%, 55.2%] |
| medium-v2r1b | 12阶段 / 6001..6500 / 500局 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] |
| strong-v1 | 12阶段 / 6001..6500 / 500局 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] |

Medium另用6501..6550的50局真实99阶段长尾，Stage99累计50/50 = 100.0% [92.9%, 100.0%]；无采样截断。完整逐局、逐波、逐阶段、阵容和决策SHA保存在各批目录。50-seed smoke、200-seed development先于机器人冻结；首轮smoke经济不合格的结果保留，第二轮通过后才进入development。正式500资格集合只运行一次，未根据它改策略。

这是 **Bot Qualification Baseline**，不是最终游戏平衡Baseline。新种子登记于freeze/seed-partitions.json；P4-R2 training3001..3500、validation4001..4500、holdout5001..5250未运行。

## 6. Medium经济（Stage1～12）

| Stage | 进入/离开金币中位 | 购物后金币中位 | 平均等级/人口 | 买卡/刷新/经验 每波金 | 利息 每波金 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.00/4.00 | 0.00 | 2.00/2.00 | 2.28/0.01/0.00 | 0.00 |
| 2 | 4.00/9.00 | 1.00 | 4.06/4.06 | 4.14/1.10/1.42 | 0.00 |
| 3 | 9.00/33.00 | 21.00 | 5.30/5.30 | 3.20/2.91/1.36 | 1.49 |
| 4 | 33.00/35.00 | 31.00 | 6.12/6.12 | 6.08/6.39/2.81 | 2.78 |
| 5 | 35.00/38.00 | 41.00 | 7.02/7.02 | 3.54/11.83/1.11 | 3.59 |
| 6 | 38.00/71.00 | 57.00 | 8.00/8.00 | 0.61/3.66/11.40 | 4.66 |
| 7 | 71.00/227.00 | 115.00 | 9.69/9.69 | 0.11/0.33/4.20 | 4.95 |
| 8 | 227.00/417.00 | 305.00 | 9.98/9.98 | 0.06/0.16/0.11 | 4.99 |
| 9 | 417.00/607.00 | 495.00 | 9.99/9.99 | 0.05/0.04/0.06 | 5.00 |
| 10 | 607.00/797.00 | 685.00 | 10.00/10.00 | 0.04/0.03/0.01 | 5.00 |
| 11 | 797.00/987.00 | 875.00 | 10.00/10.00 | 0.00/0.00/0.00 | 5.00 |
| 12 | 987.00/1177.00 | 1065.00 | 10.00/10.00 | 0.00/0.00/0.00 | 5.00 |

完整进入/离开、峰值、未消费、reserve/spendable、板凳、放弃的有用卡、可立即2★未买、备战席满和铁傀儡购买/上阵/tank计数见qualification-500/{weak,medium,strong}/economy.json。金币多不自动判浪费；保留储备与可支配部分分别报告。Stage99长尾后期银行增长与人口/核心/内容上限并列报告，不能以无效刷新清零美化消费。

高金币状态必须具体解释：

| Stage | 购物后金币中位 | 100+金波次 | 已满人口且策略升级目标耗尽波次 |
| --- | --- | --- | --- |
| 4 | 31.00 | 0 | 0 |
| 5 | 41.00 | 0 | 0 |
| 6 | 57.00 | 247 | 37 |
| 7 | 115.00 | 3036 | 2844 |
| 8 | 305.00 | 4901 | 4898 |

修订版不再因相对3★核心较弱的槽位无限搜不存在的目标。部分后期波次已经10人口、两个选定核心3★、无可提高阵容的2★目录目标，因此停止付费刷新。此处是**Medium策略允许目标耗尽**，并非声称游戏禁止更多非核心3★或已达绝对战斗上限。策略限制不能自动当成用户要求的“没有任何合法转化途径”，因此本报告**不以该理由放宽核心阶段高金币验收**；仍有数百金币常态时该门槛记为失败。避免无效刷新和控制闲置存款之间的策略取舍仍待解决，不能靠刷新清零来伪造通过。

## 7. 死亡金币

旧拒绝候选：Stage6死亡220/500，220/220携带100+金，平均370.97金。**旧候选难度与本轮正式配置不同，不能据此声称因果改善。**

当前正式配置的50-seed配对控制中v1死亡0局、v2死亡0局。正式资格Medium死亡0局，100+闲置死亡比例0/0 = N/A [N/A, N/A]；长尾死亡0局。没有死亡时该指标为0/0、N/A，不写成0%或宣称已经测得自然死亡金币下降。

另外50个开发seed的同局面压力夹具使用真实Stage12 Boss、HP4、300金、Lv7和同一弱板凳/上阵存档，所有规则不变，统计独立：

| 压力Bot | 局数/死亡 | 死亡且100+金 | 平均入战金币 | 平均等级/人口 | 平均转化金币 |
| --- | --- | --- | --- | --- | --- |
| v1 | 50/50 | 50 | 248.06 | 7.00/7.00 | 51.94 |
| v2 | 50/50 | 10 | 91.30 | 8.00/8.00 | 208.70 |

受控死亡案例5681：初始HP4、300金、Lv7，选择all_in、储备4金，通过真实买卡、20次经验与18次刷新支出202金，以Lv8/8人口、98金入战后死亡。没有继续升级是单波经验动作上限20次，虽然再升一级的44金已经付得起；刷新也达到18次上限。保留金币原因是有限行动预算，而不是利息或阶段等级锁。阵容按公开属性与角色选出已成2★的主tank/carry并穿戴合法装备；预置弱阵容没有自然整局累积装备，仍不足以战胜后期Boss。这个极端夹具暴露的经验上限仍是限制，不能声称经济决策最优。

压力夹具逐局保存deathGold/level/population/benchPowerProxy、全部动作与理由，见pressure-fixtures-late-critical-50.json；它不计入500自然campaign完成率。

## 8. Boss前消费

| Stage | Boss进入金均值 | Boss入战金均值 | 买卡/刷新/经验 均值 | Boss总消费 | 普通波总消费 |
| --- | --- | --- | --- | --- | --- |
| 4 | 46.11 | 21.11 | 2.69/4.68/17.94 | 25.31 | 13.24 |
| 5 | 52.47 | 29.71 | 2.29/15.50/5.12 | 22.92 | 13.81 |
| 6 | 75.97 | 55.66 | 0.93/1.79/17.82 | 20.54 | 12.07 |
| 7 | 199.09 | 198.49 | 0.06/0.34/0.26 | 0.65 | 5.29 |
| 8 | 385.72 | 385.55 | 0.21/0.08/0.00 | 0.29 | 0.32 |

Stage4～8池化Boss消费13.94金/波，普通波8.19金/波。逐Boss购物前后及分类花费来自真实动作；描述性差异不等于Boss消费的随机化因果效应。Elite与Boss使用不同储备，均只读取当前可见波类型。

## 9. 人口机会

| Stage | 配对v1金币中位 | 配对v2金币中位 | 配对v1/v2平均人口 | 资格v2结束仍可升级次数/有机会波次 |
| --- | --- | --- | --- | --- |
| 4 | 108.00 | 31.00 | 6.00/6.13 | 0/566 |
| 5 | 208.00 | 41.00 | 6.88/7.03 | 0/121 |
| 6 | 357.00 | 60.50 | 7.00/8.06 | 0/1035 |
| 7 | 502.50 | 124.00 | 7.90/9.78 | 0/350 |
| 8 | 684.00 | 314.00 | 8.00/10.00 | 0/12 |

可升级定义同时要求候补边际价值足够且能支付全段剩余XP与储备。旧诊断的粗略“有候补且买得起”和新版边际机会口径不同，未把两个不同分母的miss-rate直接当同口径改善；额外rawAffordableBenchIdle使用统一原始观察。Stage6人口不再被固定Lv7目标锁死。

## 10. 典型决策重放

| Medium-v2r1b seed | 结果 | 最低HP | 完整动作SHA | 资格动作逐波匹配 |
| --- | --- | --- | --- | --- |
| 6001 | RUN_COMPLETED | 20 | 14d952c2bb3eaf528671151fcfdf1d6d6b836735bd58ba90bcc60d264ab3dd57 | true |
| 6500 | RUN_COMPLETED | 20 | 66a33dd21e9a63198b6cda19f82ddf4630afaef821b412ea10c452fc6aa1ce22 | true |
| 6002 | RUN_COMPLETED | 20 | 33797406edd949d0e2d8357438675b481aa7c6b050210c449a8d84b8f84e7188 | true |
| 6003 | RUN_COMPLETED | 20 | 613e41c06c214479001bca20a21c3ed3a96f15aa8026df71e83b3963863810d3 | true |
| 6004 | RUN_COMPLETED | 20 | 7a9c0273026a1589979c18930dcb607f5bb1036e14d9a58590028d7206817eb1 | true |

动作层复核通过，整体资格仍需单独检查高存款门槛。seed6001在Stage6 Boss前用5金完成可见末影人升级，目标完成后停止刷新；seed6500花64金、16次真实买经验从8升9并上阵候补，没有固定Lv7锁。seed6002/6003/6004在已满10人口、两个当前核心3星、无策略允许的目录升级时不再执行旧版本的14次无效刷新。站位、装备与奖励均为真实公共动作且逐波SHA匹配。Stage8这五局仍分别保留303、354、450、467、483金，其他非核心3星在游戏规则上仍合法，故策略目标耗尽不能替代用户的无合法转化途径例外，不能据此宣布总体资格通过。五局均为自然健康幸存局；正式样本不存在Medium-v2r1b的Stage6死亡类型，未伪造该类型。另检查受控Stage12 critical死亡seed5681：300金支出202金，升8人口，以98金战败；未继续升级是20次经验行动上限，未继续刷新是18次上限，残余金币原因和该上限的局限均明确保留。

完整购买、刷新、经验、出售、站位、装备及领奖见replays/medium-v2r1b-seed*.json。资格集中Stage6死亡样本0局，缺失类型明确披露；没有通过改难度、伪造失败或只截短campaign来造样本。旧真实死亡10局在v1-diagnosis，低血真实动作压力样本在pressure-fixtures-late-critical-50.json。

## 11. 强弱排序

| Stage | Weak | Medium-v2r1b | Strong |
| --- | --- | --- | --- |
| 6 | 100.0% | 100.0% | 100.0% |
| 12 | 50.8% | 100.0% | 100.0% |

Strong≥Medium-v2r1b≥Weak检查通过。允许早期并列；本轮不以目标胜率反推敌军数值。Strong的长期通关与内容上限不会通过故意削弱Bot掩盖。铁傀儡允许按公开属性正常使用，但仍未被冒称完成P1-B标定；qualification经济文件分别记录购买、上阵和tank角色。

## 12. 确定性

| 产物 | 1 worker和4 workers一致的SHA-256 |
| --- | --- |
| medium/per-run.jsonl | 945d94f907062be4a7122ff13c662b76523de05cd0842f264a2f8ee484d909fb |
| medium/per-wave.csv | cad0f09db2f78a512b4d27f1edef1fed49503ea90d9edb6dca6ef2d73ca1daca |
| medium/per-stage.csv | b3d65cf47b11f03847cf6385d14b3e3a9aaa8ffb885a28f66417d9321c7748bb |
| medium/summary.json | 0c42f1143ee2d8407d3ca2694364a56324f557d232e0c974899eeec0d7a4b220 |
| aggregate.json | 97f000c3b0119e76ec216c270cdda2ed9969c5b37fa9b915644c5597e178e351 |

相同冻结botVersion/config/seed5799..5800，三档真实12阶段campaign，实际worker数1与4，全部14份逻辑产物SHA一致。运行时间与worker分片调度不参与逻辑SHA比较。另有Weak/Strong原始/当前完整报告相等；资格5局完整重放逐波动作SHA相等。

## 13. 性能

| 批次 | runs | waves | workers | 秒 | runs/sec | waves/sec |
| --- | --- | --- | --- | --- | --- | --- |
| smoke-50 | 50 | 4900 | 4 | 22.14 | 2.26 | 221.29 |
| development-200 | 200 | 19600 | 4 | 66.58 | 3.00 | 294.39 |
| qualification-500 | 1500 | 143837 | 4 | 409.49 | 3.66 | 351.26 |
| long-tail-50 | 50 | 48400 | 2 | 332.64 | 0.15 | 145.50 |

资格批与长尾有并发且同时跑回归，壁钟吞吐不能直接作单机独占基准。未增加战斗搜索；只有真实战斗推进调用BattleSim，Bot策略模块无模拟器/标定模型依赖。初次旧P4 baseline smoke约459 waves/sec，本轮含完整经济审计、更多合法动作与资源检查；按上表如实比较，不把更多报告开销当作弊搜索。

## 14. npm test

`npm.cmd test` 实际退出码 **0**，见final-tests.log和final-test-result.json。旧P0～P4、真实动作守恒、RNG/前缀/存档、装备/阵型、Medium-v2r1b A-E经济场景、超额金币、核心、Boss、未来信息陷阱、新CLI分区与旧候选保护均执行。

本轮不改UI，没有声称Cocos编辑器、浏览器或设备实测。入口已有的无关本地设置差异通过独立入口哈希保护解释，没有更改游戏配置或旧证据来通过测试。

## 15. 结论

**BOT QUALIFICATION FAILED**

| 资格门槛 | 结果 |
| --- | --- |
| publicActionsAndFutureInfoTraps | PASS |
| determinism | PASS |
| bossPreSpending | PASS |
| lowHpReserveAndFiniteRolls | PASS |
| coreStageGold | FAIL |
| populationOpportunities | PASS |
| stableStateInterest | PASS |
| stressIdleDeathReduction | PASS |
| naturalDeathHighGold | N/A：无自然死亡，另有受控压力对照 |
| ranking | PASS |
| qualitativeReplayReview | PASS |
| gameBytesUnchanged | PASS |
| historicalBytesUnchanged | PASS |
| fullRegression | PASS |
| weakStrongUnchanged | PASS |
| runsAndLongTail | PASS |

机器人资格和游戏平衡是两个结论。本轮游戏平衡修改0项，没有接受或部署balance-v1，也没有开始P4-R2。自然死亡金币的零分母、当前配置通过率偏高及后期内容上限仍明确保留。

冻结文件SHA：`3ac96d9d6c22d4c8105636c31cf68afc530e5a3236c3fe73a7fff07c9b9e5371`。medium-v2r1b botConfigHash：`db811c74fb3bf3d1960ab23a2bc658e315c6b27f198c6b703fb8c9b544a3d68d`。当前冻结只用于复现失败结果；后续须先完成新的机器人资格验收，才能考虑P4-R2，预留R2分区继续保持未使用。

本版本虽已冻结供复现，但未成为合格的下一轮平衡测量仪器；不得将当前冻结等同于资格接受，不能进入P4-R2。
