# P4：机器人、整局平衡与有限调参验收

**当前验收未通过，P4不能宣布完成。** 三档策略代码、真实公共动作审计、批量工具、独立Validation/Holdout和回归已落地；Medium经济策略的正常玩家代表性仍有缺陷，20轮搜索也未满足Stage3目标，未将失败候选写入正式难度资源。详见第13节的拒绝记录。

所有完成率均以阶段末波结算后HP>0为完成，允许末波战败但存活。单波胜率、条件阶段完成率、累计完成率及Boss击败率分别统计；主要比例为Wilson95%区间。未到达波次不计为遭遇。

## 1. 三档机器人设计

| 机器人/版本 | 经济与搜卡 | 升级/升星 | 布阵 | 装备/奖励 |
| --- | --- | --- | --- | --- |
| Weak / weak-v1 | 不保利息，5波最多刷新1次，优先现成合成 | 少量买经验，保留便宜核心；并非随机自杀 | 基本前后排 | 第一件大致可用奖励、第一名适配单位 |
| Medium / medium-v1 | 从真实利息规则计算10..50储备；低HP花储备，有限刷新 | 追关键2★，人口不足且有候补时买经验，保留1个核心追3★ | 角色分排、基础分散 | 按角色与空缺选择、穿戴 |
| Strong / strong-v1 | 更多即时边际价值与有限搜卡，低HP更早消费 | 更积极补人口/关键2★；仅2个核心可追3★ | 当前预览刺客/AoE/侧翼反应 | 核心carry/tank与组合协同、合法转移装备 |

共用 [../../tools/bots/heuristic-bot.ts](../../tools/bots/heuristic-bot.ts)，拆分economy/shop/roster/formation/equipment；升级与奖励逻辑分别归入经济和装备模块。策略配置与源文件SHA在[baseline/bot-freeze.json](baseline/bot-freeze.json)；正式报告逐局保留botVersion、botConfigHash、每波决策SHA、真实敌我阵容与指标。Bot不调用BattleSim搜索。

## 2. 机器人合法性

RunSession.botPort仅有observe/act；静态公开目录与当前敌军预览冻结，玩家快照分离。没有未来商店、奖励、敌军、子系统RNG或模型接口。策略只通过真实购买、付费刷新/经验、移动、卖出、穿戴、卸下和领奖动作改变状态。原playerPort与Minimal夹具保留。

逐动作审计非负金币、UID、棋盘/人口/备战席/装备槽、卡池+保留商店+owned基础卡总守恒；装备只有成功领奖增加1，其余动作守恒。Smoke、Development及全部大批次无流程错误/失败动作。测试另有未来敌军getter陷阱、禁止依赖扫描、3/6/99完整决策共同前缀和同seed重放。玩家原公共state包含runSeed，但策略既不读取也不派生未来RNG；不以隐藏卡池/标定战力估值。

## 3. Baseline

先冻结11份配置、真实经济/商店规则、原源码与P0–P3证据（[baseline/frozen.json](baseline/frozen.json)），再实现并冻结策略，50-seed Smoke→200-seed Development→500-seed未调参Baseline之后才开始搜索。Baseline为各500局seed1..500、真实12阶段campaign；另有各20局99阶段诊断，不能把12阶段完成写成99通关。

| 机器人 | Stage3累计 | Stage6累计 | Stage12累计 |
| --- | --- | --- | --- |
| weak | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 262/500 = 52.4% [48.0%, 56.7%] |
| medium | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] |
| strong | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] |

Stage1..10的三档完整基线表见[baseline/README.md](baseline/README.md)。Baseline Medium/Strong各20局长尾全部通关99，说明原配置确有无尽内容上限。

## 4. Medium核心结果

| 分区 | 种子/样本 | Stage3累计 / 95%CI | Stage6累计 / 95%CI |
| --- | --- | --- | --- |
| Training确认 | 1..500 / 500 | 500/500 = 100.0% [99.2%, 100.0%] | 269/500 = 53.8% [49.4%, 58.1%] |
| Validation（最终独立结论） | 501..1000 / 500 | 500/500 = 100.0% [99.2%, 100.0%] | 278/500 = 55.6% [51.2%, 59.9%] |
| Holdout（冻结后仅一次） | 1001..1250 / 250 | 250/250 = 100.0% [98.5%, 100.0%] | 141/250 = 56.4% [50.2%, 62.4%] |

Stage3目标80%..90%，Stage6目标45%..55%。Stage3的100%累计存活不是100%单波/Boss获胜；即使Boss失利也可保留HP。训练20轮都没有改变这个事实，不能声称“已调好”。

## 5. Weak/Strong对比

| 分区 | 机器人 | Stage3 | Stage6 | Stage99 |
| --- | --- | --- | --- | --- |
| Validation | weak | 500/500 = 100.0% [99.2%, 100.0%] | 10/500 = 2.0% [1.1%, 3.6%] | 0/500 = 0.0% [0.0%, 0.8%] |
| Validation | medium | 500/500 = 100.0% [99.2%, 100.0%] | 278/500 = 55.6% [51.2%, 59.9%] | 230/500 = 46.0% [41.7%, 50.4%] |
| Validation | strong | 500/500 = 100.0% [99.2%, 100.0%] | 499/500 = 99.8% [98.9%, 100.0%] | 490/500 = 98.0% [96.4%, 98.9%] |
| Holdout | weak | 250/250 = 100.0% [98.5%, 100.0%] | 8/250 = 3.2% [1.6%, 6.2%] | 3/250 = 1.2% [0.4%, 3.5%] |
| Holdout | medium | 250/250 = 100.0% [98.5%, 100.0%] | 141/250 = 56.4% [50.2%, 62.4%] | 116/250 = 46.4% [40.3%, 52.6%] |
| Holdout | strong | 250/250 = 100.0% [98.5%, 100.0%] | 248/250 = 99.2% [97.1%, 99.8%] | 246/250 = 98.4% [96.0%, 99.4%] |

按Stage6/12/99检查Strong≥Medium≥Weak；早期三者100%并列，区分度不足。Strong远高于Medium，但99阶段通过仍过高，不能将这种上限解释为理想最终难度。

## 6. 每阶段数据

Validation Medium核心及长尾代表点如下；全部99阶段、三档均有逐波/逐阶段CSV与summary.json，包含HP、金币、等级、人口、星级和装备。

| Stage | 进入 | 完成 | 条件完成 / CI | 累计完成 / CI | 入阶段HP | 购物后金币 | 等级 | 人口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 500 | 500 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 | 0.06 | 2.00 | 2.00 |
| 2 | 500 | 500 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 | 5.73 | 3.76 | 3.75 |
| 3 | 500 | 500 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 | 37.95 | 5.00 | 5.00 |
| 4 | 500 | 500 | 500/500 = 100.0% [99.2%, 100.0%] | 500/500 = 100.0% [99.2%, 100.0%] | 19.49 | 108.26 | 6.00 | 6.00 |
| 5 | 500 | 498 | 498/500 = 99.6% [98.6%, 99.9%] | 498/500 = 99.6% [98.6%, 99.9%] | 19.42 | 204.45 | 6.88 | 6.88 |
| 6 | 498 | 278 | 278/498 = 55.8% [51.4%, 60.1%] | 278/500 = 55.6% [51.2%, 59.9%] | 19.04 | 342.94 | 7.01 | 7.01 |
| 7 | 278 | 250 | 250/278 = 89.9% [85.8%, 92.9%] | 250/500 = 50.0% [45.6%, 54.4%] | 11.72 | 465.25 | 7.95 | 7.95 |
| 8 | 250 | 230 | 230/250 = 92.0% [88.0%, 94.8%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.93 | 617.23 | 8.16 | 8.16 |
| 9 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 755.50 | 8.98 | 8.98 |
| 10 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 918.92 | 9.20 | 9.20 |
| 11 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 1064.49 | 9.84 | 9.84 |
| 12 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 1229.36 | 10.00 | 10.00 |
| 25 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 3394.10 | 10.00 | 10.00 |
| 50 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 7557.15 | 10.00 | 10.00 |
| 99 | 230 | 230 | 230/230 = 100.0% [98.4%, 100.0%] | 230/500 = 46.0% [41.7%, 50.4%] | 11.40 | 15716.71 | 10.00 | 10.00 |

[validation/runs-500/weak/per-stage.csv](validation/runs-500/weak/per-stage.csv) · [validation/runs-500/weak/per-wave.csv](validation/runs-500/weak/per-wave.csv) · [validation/runs-500/weak/per-run.jsonl](validation/runs-500/weak/per-run.jsonl)

[validation/runs-500/medium/per-stage.csv](validation/runs-500/medium/per-stage.csv) · [validation/runs-500/medium/per-wave.csv](validation/runs-500/medium/per-wave.csv) · [validation/runs-500/medium/per-run.jsonl](validation/runs-500/medium/per-run.jsonl)

[validation/runs-500/strong/per-stage.csv](validation/runs-500/strong/per-stage.csv) · [validation/runs-500/strong/per-wave.csv](validation/runs-500/strong/per-wave.csv) · [validation/runs-500/strong/per-run.jsonl](validation/runs-500/strong/per-run.jsonl)

每波还保存购物前/后金币、利息、刷新/经验/买卡花费、战斗时长、敌存活数、HP前后、库存/已装备、主carry/tank、失败上下文、敌军预算/阵型/模板。主carry/tank按当波公开属性启发式排名，不保证全局固定UID；formationChanges计战前已有单位位置变化，新上场体现在阵容。死亡分布见各summary.failureDistribution和逐局deathContext。

**经济资格问题：** Validation Medium在Stage6死亡220局，全部220局入战仍有100+金币，平均370.97金，平均等级7.05。固定阶段等级目标限制买经验，刷新规则又把高2★比例视作足够强，富余收入因此长期闲置；低HP触发消费在大额Boss伤害前可能来不及。详细种子与入战状态见[analysis/medium-economy-validation.json](analysis/medium-economy-validation.json)。这说明淘汰并非只由敌军难度决定，当前Medium还不能视作已验收的正常玩家代理，不能只削敌军凑50%。本轮保持冻结；后续应先修订并升级botVersion，重新建立未调参基线和未使用的验证分区，再恢复难度调优。

## 7. 升星

| Validation机器人 | 首次2★ P25/中位/P75 | 达成/总局 | 首次3★ P25/中位/P75 | 达成/总局 | 首次主carry2★中位 |
| --- | --- | --- | --- | --- | --- |
| weak | 2.0/3.0/3.0 | 500/500 | 8.0/10.0/14.0 | 327/500 | 3.0 |
| medium | 2.0/3.0/3.0 | 500/500 | 24.0/27.0/29.0 | 452/500 | 3.0 |
| strong | 2.0/3.0/3.0 | 500/500 | 20.0/23.0/25.0 | 500/500 | 3.0 |

时间为global waveId，仅达成者的分位；未达成/先死亡是删失，不能据此宣称全体玩家的3★中位时间。

| 机器人 Stage5 | 平均1★/2★/3★上阵 | 主carry1★/2★/3★观测数 | 主carry≥2★观测占比 |
| --- | --- | --- | --- |
| weak | 0.24/4.45/1.31 | 0/1712/1234 | 100.0% |
| medium | 0.89/5.58/0.41 | 0/3943/56 | 100.0% |
| strong | 0.47/5.49/1.04 | 0/2509/1491 | 100.0% |

“Stage5主力通常2★”对本组启发式机器人得到支持，首次2★实际早在开局合成；Weak便宜3★可能比Medium更早，单看首次3★不等于整局策略更强。

## 8. 装备

| Validation Medium Stage | 平均玩家总装备 | 平均敌军总装备 | 库存 | carry/tank装备 | 提供/领取 | advanced/special已选 |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 0.10 | 0.00 | 0.00 | 0.07/0.00 | 754/754 | 754/0 |
| 3 | 1.59 | 0.33 | 0.00 | 0.73/0.00 | 692/692 | 692/0 |
| 5 | 4.44 | 0.25 | 0.00 | 1.41/0.24 | 711/711 | 711/0 |
| 6 | 5.93 | 0.39 | 0.00 | 1.63/0.37 | 183/183 | 183/0 |
| 8 | 8.50 | 0.38 | 0.00 | 0.88/0.68 | 334/334 | 205/129 |
| 12 | 14.53 | 0.50 | 0.00 | 0.10/1.39 | 352/352 | 235/117 |
| 50 | 71.74 | 0.50 | 37.33 | 3.00/3.00 | 339/339 | 211/128 |
| 99 | 145.47 | 0.50 | 111.06 | 3.00/3.00 | 351/351 | 247/104 |

玩家累计库存与敌军“当前波”装备不是同一口径；玩家上阵/穿戴明细在逐波数据，不能仅用总件数推断战斗强度。前期仍是真实2选1 advanced fallback，未伪造basic。当前早期存活过高与装备成长并存，但没有随机化装备对照，不能断言advanced奖励就是唯一原因。建议补充真正basic内容并单独测量，保持现有装备效果不改。

奖励后下一波胜率仅相关诊断：| Medium Validation | 获胜 / CI |
| --- | --- |
| 前波领奖 | 34972/35073 = 99.7% [99.7%, 99.8%] |
| 前波未领奖 | 196500/197416 = 99.5% [99.5%, 99.6%] |

分组混杂阶段、剩余HP、既有战力与生存者筛选，不作因果解释。敌军继续仅用4件已标定装备；6件未标定装备未加入敌军白名单，逐波审计未发现越界。

## 9. 关键难度波与Formation

| Validation Medium波次 | 类型 | 遭遇/胜率CI | 平均/中位掉血 | 入波HP | 敌存活数 | 标记 |
| --- | --- | --- | --- | --- | --- | --- |
| 6-9 | boss | 62/383 = 16.2% [12.8%, 20.2%] | 7.50/8.00 | 16.01 | 4.47 | WIN_RATE_DROP_GT_15PP,HP_LOSS_DOUBLED,DEATH_RATE_GT_15PCT |
| 6-8 | elite | 249/430 = 57.9% [53.2%, 62.5%] | 3.34/0.00 | 17.60 | 1.92 | WIN_RATE_DROP_GT_15PP,HP_LOSS_DOUBLED |
| 6-4 | normal | 418/490 = 85.3% [81.9%, 88.2%] | 1.04/0.00 | 18.93 | 0.57 | HP_LOSS_DOUBLED |

这些是相邻暴露样本的异常标记，不是自动因果判断；Boss/Elite峰值与生存筛选需分开解释。完整异常、入Boss状态、时长、预算、星级及装备见summary.waves/anomalies和逐局阵容。Stage3/6逐波单位频数和死亡类型见[accepted/diagnostics.json](accepted/diagnostics.json)。

Stage3逐波诊断（Validation Medium）：

| 波 | 胜率CI | 入波HP / 平均掉血 | requested / effective / actual | 玩家等级 / 2★数 | 敌2★数 / 装备 |
| --- | --- | --- | --- | --- | --- |
| 3-1 | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 / 0.00 | 860.04 / 199.61 / 199.82 | 4.98 / 4.11 | 1.00 / 0.00 |
| 3-2 | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 / 0.00 | 917.98 / 285.34 / 291.00 | 5.00 / 4.30 | 1.00 / 0.00 |
| 3-3 | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 / 0.00 | 979.82 / 407.89 / 404.14 | 5.00 / 4.44 | 1.00 / 0.00 |
| 3-4 | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 / 0.00 | 1045.83 / 583.08 / 584.26 | 5.00 / 4.50 | 1.00 / 0.00 |
| 3-5 | 500/500 = 100.0% [99.2%, 100.0%] | 20.00 / 0.00 | 1116.29 / 833.51 / 835.85 | 5.00 / 4.58 | 1.00 / 1.00 |
| 3-6 | 445/500 = 89.0% [86.0%, 91.5%] | 20.00 / 0.51 | 1191.49 / 1191.49 / 1178.02 | 5.00 / 4.63 | 2.00 / 1.00 |

Stage3首波仍受上一阶段可恢复锚点约束，普通波消耗很少；到Boss前HP充足，Boss战败率无法直接转成累计淘汰率。Stage6则已接近全人口，高预算生成器明显集中选择champion 9.00名/场，duelist 1.00名/场；该Boss敌2★均值8.00、玩家等级均值7.02、实际预算3391.57、入波HP16.01、平均掉血7.50。这是预算、重复强单位和人口/星级阈值共同出现的证据，不能把单兵标定总和当成整队胜率保证。单位基础属性不在本轮修改白名单内。

| Stage | 普通胜率 / 掉血 | Elite胜率 / 掉血 | Boss胜率 / 掉血 |
| --- | --- | --- | --- |
| 3 | 2000/2000 = 100.0% [99.8%, 100.0%] / 0.00 | 500/500 = 100.0% [99.2%, 100.0%] / 0.00 | 445/500 = 89.0% [86.0%, 91.5%] / 0.51 |
| 5 | 2993/3000 = 99.8% [99.5%, 99.9%] / 0.01 | 479/500 = 95.8% [93.7%, 97.2%] / 0.23 | 484/499 = 97.0% [95.1%, 98.2%] / 0.18 |
| 6 | 3095/3389 = 91.3% [90.3%, 92.2%] / 0.56 | 249/430 = 57.9% [53.2%, 62.5%] / 3.34 | 62/383 = 16.2% [12.8%, 20.2%] / 7.50 |
| 7 | 2013/2058 = 97.8% [97.1%, 98.4%] / 0.11 | 248/251 = 98.8% [96.5%, 99.6%] / 0.08 | 246/251 = 98.0% [95.4%, 99.1%] / 0.13 |
| 8 | 1923/1961 = 98.1% [97.4%, 98.6%] / 0.12 | 220/237 = 92.8% [88.8%, 95.5%] / 0.45 | 227/230 = 98.7% [96.2%, 99.6%] / 0.08 |

Elite/Boss并非在每阶段都严格更难：阶段内玩家升人口与装备，敌预算又开始受可行上限约束，可使Stage7/8后段精英/Boss胜率反而回升；数据保留这类异常，不借修改名义倍率隐藏。普通波池化区间只作描述（同局多波相关），单波及每阶段完成率各seed一票，是主要统计口径。

| 边界 | 前阶段Boss胜率CI / 掉血 | 后阶段首波胜率CI / 掉血 |
| --- | --- | --- |
| 5→6 | 484/499 = 97.0% [95.1%, 98.2%] / 0.18 | 496/498 = 99.6% [98.5%, 99.9%] / 0.02 |
| 7→8 | 246/251 = 98.0% [95.4%, 99.1%] / 0.13 | 246/250 = 98.4% [96.0%, 99.4%] / 0.12 |
| 9→10 | 230/230 = 100.0% [98.4%, 100.0%] / 0.00 | 230/230 = 100.0% [98.4%, 100.0%] / 0.00 |

条件阶段完成率下降>15pp：Stage6下降43.8%，本阶段278/498 = 55.8% [51.4%, 60.1%]。预算连续不保证玩法连续，解锁、合成强度、入波HP和阵型会共同形成阈值。

P2配对实验保持候选/机器人不变，只变Formation覆盖；delta为auto减指定级别：

| 对照 | 配对seed数 | Stage6 delta / paired95% | Stage12 delta / paired95% |
| --- | --- | --- | --- |
| L0→auto | 200 | -20.0% [-26.1%, -13.9%] | -22.0% [-28.5%, -15.5%] |
| L1→auto | 50 | 4.0% [-7.1%, 15.1%] | 6.0% [-4.3%, 16.3%] |
| L2→auto | 50 | -4.0% [-16.5%, 8.5%] | 6.0% [-5.8%, 17.8%] |
| L3→auto | 50 | -6.0% [-19.0%, 7.0%] | 4.0% [-8.5%, 16.5%] |

L0使用200对，L1/L2/L3各50对；差值区间为配对均值差的正态近似95%，不是Wilson单率区间。auto相对L0存在明显难度贡献，其他级别小样本区间宽，不按噪声调P2权重。这是Medium的整局策略对照；战果变化会继续改变收入、奖励与阵容，不能称固定玩家站位的单波因果隔离。本次未关闭L3、未调整cover/spacing/counter权重。逐波配对仅统计双方都到达的波，避免把未遭遇当战败。

## 10. Stage7/8结论

| 阶段 | 配置2★软目标（原值保留） | Baseline实际敌2★ | 候选Validation实际敌2★ | 候选条件完成CI |
| --- | --- | --- | --- | --- |
| 6 | 33.3% | 30.3% | 46.0% | 278/498 = 55.8% [51.4%, 60.1%] |
| 7 | 66.7% | 40.0% | 80.9% | 250/278 = 89.9% [85.8%, 92.9%] |
| 8 | 100.0% | 55.0% | 100.0% | 230/250 = 92.0% [88.0%, 94.8%] |

当前源码的软目标本来就是1/3、2/3、100%；用户背景提到约30%/42%/56%更接近旧生成结果，不能冒称本次把目标调到这些值。候选仅提前Stage3的2★/3费解锁，提高预算后实际星级更接近目标。此轮不再提高Stage7/8软目标；需要先修复Stage3与Stage6阈值，幸存者后期过强也不能简单推导应继续抬高早期难度。

## 11. Stage12+饱和

| Validation Medium波 | 遭遇 | requested均值 | effective均值 | actual均值 | 胜率CI |
| --- | --- | --- | --- | --- | --- |
| 12-5 | 230 | 3.6369e+4 | 3599.39 | 3571.28 | 230/230 = 100.0% [98.4%, 100.0%] |
| 13-1 | 230 | 4.5184e+4 | 3599.39 | 3571.28 | 230/230 = 100.0% [98.4%, 100.0%] |
| 25-1 | 230 | 8.8908e+6 | 3599.39 | 3571.28 | 230/230 = 100.0% [98.4%, 100.0%] |
| 50-1 | 230 | 5.3458e+11 | 3599.39 | 3571.28 | 230/230 = 100.0% [98.4%, 100.0%] |
| 99-1 | 230 | 1.2445e+21 | 3599.39 | 3571.28 | 230/230 = 100.0% [98.4%, 100.0%] |

固定人口10、费用/星级/装备硬上限最终使有效预算饱和，requested继续增长不代表实际变强。这里并非“正常玩家到不了Stage12”：独立样本中有相当比例Medium与绝大多数Strong到达并持续通关，属于真实无尽内容上限，仍需后续设计。优先独立立项新增后期内容或有明确封顶的prestige/更多3★/装备方案；不恢复旧5%无限增伤减伤。本次仅报告，不暗改战斗公式或内容池。

相同seed12345的纯生成探针（0次BattleSim）确认：原配置持续ABOVE_MAX_FEASIBLE从Stage12-5开始，候选提前到Stage7-3；候选没有修复上限，反而更早触顶。完整requested/effective/actual/max见[analysis/saturation-shape.json](analysis/saturation-shape.json)。

| 独立分区 | 机器人 | 完成Stage8 | 完成Stage12 | 完成Stage99 |
| --- | --- | --- | --- | --- |
| Validation | medium | 230 | 230 | 230 |
| Validation | strong | 490 | 490 | 490 |
| Holdout | medium | 116 | 116 | 116 |
| Holdout | strong | 246 | 246 | 246 |

## 12. 调参历史

20轮均为Medium seed1..100、真实6阶段campaign；之后最优训练候选用1..500三档12阶段确认。前16轮只调预算/统一早期解锁两类，后4轮有记录地测试阶段内指数形状，首尾锚点、恢复、人口不变。搜索边界和后续细分说明见[training/search-v1/bounds.json](training/search-v1/bounds.json)、[training/search-v1/ramp-bounds-extension.json](training/search-v1/ramp-bounds-extension.json)。Stage3均100%说明这20个候选未解决问题，不是对整个设计空间的不可能性证明。

| 参数 | min/max/step | 作用 |
| --- | --- | --- |
| budgetScale | 1 / 12 / .25 | 相对实测B0的静态请求规模，B0本身不重标定 |
| growthRate | 1.02 / 1.06 / .005→.0025 | 在原区间内细分，记录扩展 |
| earlyChallengeStage | 3 / 6 / 1 | 同一包提前2★与3费解锁 |
| stageRampExponent | .25 / 1 / .05 | 最后4轮阶段内预算形状，未改首尾锚点 |
| 轮次 | before → after (scale,growth,unlock,ramp) | Stage3 / Stage6 | 目标函数 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | {"budgetScale":1,"growthRate":1.04,"earlyChallengeStage":6,"stageRampExponent":1} → {"budgetScale":3,"growthRate":1.04,"earlyChallengeStage":3} | 100.0% / 100.0% | 0.27250 | Coarse bounded budget scan with one coherent early-unlock package; first two parameter classes only. |
| 2 | {"budgetScale":3,"growthRate":1.04,"earlyChallengeStage":3} → {"budgetScale":5,"growthRate":1.04,"earlyChallengeStage":3} | 100.0% / 100.0% | 0.27250 | Coarse bounded budget scan with one coherent early-unlock package; first two parameter classes only. |
| 3 | {"budgetScale":5,"growthRate":1.04,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.04,"earlyChallengeStage":3} | 100.0% / 75.0% | 0.08600 | Coarse bounded budget scan with one coherent early-unlock package; first two parameter classes only. |
| 4 | {"budgetScale":7,"growthRate":1.04,"earlyChallengeStage":3} → {"budgetScale":9,"growthRate":1.04,"earlyChallengeStage":3} | 100.0% / 22.0% | 0.10343 | Coarse bounded budget scan with one coherent early-unlock package; first two parameter classes only. |
| 5 | {"budgetScale":9,"growthRate":1.04,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.02,"earlyChallengeStage":3} | 100.0% / 100.0% | 0.27250 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 6 | {"budgetScale":7,"growthRate":1.02,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.025,"earlyChallengeStage":3} | 100.0% / 100.0% | 0.27250 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 7 | {"budgetScale":7,"growthRate":1.025,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.03,"earlyChallengeStage":3} | 100.0% / 100.0% | 0.27250 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 8 | {"budgetScale":7,"growthRate":1.03,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.035,"earlyChallengeStage":3} | 100.0% / 97.0% | 0.24340 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 9 | {"budgetScale":7,"growthRate":1.035,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.045,"earlyChallengeStage":3} | 100.0% / 36.0% | 0.05983 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 10 | {"budgetScale":7,"growthRate":1.045,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.05,"earlyChallengeStage":3} | 100.0% / 24.0% | 0.10983 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 11 | {"budgetScale":7,"growthRate":1.05,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.055,"earlyChallengeStage":3} | 100.0% / 14.0% | 0.15829 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 12 | {"budgetScale":7,"growthRate":1.055,"earlyChallengeStage":3} → {"budgetScale":7,"growthRate":1.06,"earlyChallengeStage":3} | 100.0% / 16.0% | 0.14095 | Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged. |
| 13 | {"budgetScale":7,"growthRate":1.06,"earlyChallengeStage":3} → {"budgetScale":6.5,"growthRate":1.045,"earlyChallengeStage":3} | 100.0% / 53.0% | 0.03268 | Local quarter-step scale refinement on training seeds only. |
| 14 | {"budgetScale":6.5,"growthRate":1.045,"earlyChallengeStage":3} → {"budgetScale":6.75,"growthRate":1.045,"earlyChallengeStage":3} | 100.0% / 42.0% | 0.04501 | Local quarter-step scale refinement on training seeds only. |
| 15 | {"budgetScale":6.75,"growthRate":1.045,"earlyChallengeStage":3} → {"budgetScale":7.25,"growthRate":1.045,"earlyChallengeStage":3} | 100.0% / 28.0% | 0.09512 | Local quarter-step scale refinement on training seeds only. |
| 16 | {"budgetScale":7.25,"growthRate":1.045,"earlyChallengeStage":3} → {"budgetScale":7.5,"growthRate":1.045,"earlyChallengeStage":3} | 100.0% / 26.0% | 0.09013 | Local quarter-step scale refinement on training seeds only. |
| 17 | {"budgetScale":7.5,"growthRate":1.045,"earlyChallengeStage":3} → {"budgetScale":9,"growthRate":1.03,"earlyChallengeStage":3,"stageRampExponent":0.3} | 100.0% / 77.0% | 0.09560 | Budget shape test after documented 16-trial Stage3 plateau; higher scale is paired with gentler growth. |
| 18 | {"budgetScale":9,"growthRate":1.03,"earlyChallengeStage":3,"stageRampExponent":0.3} → {"budgetScale":9,"growthRate":1.03,"earlyChallengeStage":3,"stageRampExponent":0.4} | 100.0% / 74.0% | 0.08131 | Paired shape sensitivity only, all other parameters equal. |
| 19 | {"budgetScale":9,"growthRate":1.03,"earlyChallengeStage":3,"stageRampExponent":0.4} → {"budgetScale":9,"growthRate":1.03,"earlyChallengeStage":3,"stageRampExponent":0.25} | 100.0% / 76.0% | 0.09042 | Training-only bracket refinement of Stage3 target. |
| 20 | {"budgetScale":9,"growthRate":1.03,"earlyChallengeStage":3,"stageRampExponent":0.25} → {"budgetScale":9,"growthRate":1.035,"earlyChallengeStage":3,"stageRampExponent":0.4} | 100.0% / 33.0% | 0.06661 | Final allowed trial changes growth only to adjust Stage6, keeping the measured Stage3 envelope shape. |

目标函数含3/6阶段误差、条件阶段断崖、异常普通波掉血；函数提供三档排序惩罚，但20轮细扫仅Medium，因此排序项当时不可用。500-seed三档确认另验排序，不隐称每轮都优化过Strong/Weak。量纲一致的排序与合理性是接受门槛。最优为第13轮；growth用于后半程挑战，scale/早解锁用于突破原前期费用星级可行上限；Boss/Elite名义倍率在原pacing中代数抵消，不能把无效旋钮当成有效贡献；装备与Formation保持原样，避免同时改五个系统。

## 13. 最终accepted配置

**本轮没有通过验收的新accepted数值配置。** [accepted/decision.json](accepted/decision.json)保存正式拒绝决定，candidate balance-v1仅实验身份，正式资源保留p3-baseline原值。[freeze/candidate.json](freeze/candidate.json)是冻结失败候选，不能当生产推荐。

候选实际差异：growth 1.04→1.045；新增静态budgetScale 6.5；2★解锁6→3；Stage3新增maxCost3并使后续费用上限不下降；Stage3新增1/3软目标；balanceVersion=balance-v1。第13轮没有stageRampExponent（默认1），最后4轮的形状实验没有入选。全部正式数值修改：**0项**。新增源码能力只有可选预算控制、版本拒绝、公共Bot观察与批量/报告工具；默认968波历史结果仍通过原P3断言。

拒绝原因：

- Medium基准策略资格不足：Stage6死亡220局，其中220局入战仍有100+金币，固定等级目标造成过度囤积
- Validation Medium Stage3不在80%..90%区间
- Validation Medium Stage6不在45%..55%区间
- Validation Strong仍有至少90%通关99阶段，无尽上限未解决
- Holdout Medium Stage3不在80%..90%区间
- Holdout Medium Stage6不在45%..55%区间
- Holdout Strong仍有至少90%通关99阶段，无尽上限未解决

旧存档不能静默切换：已绑定p3-baseline存档加载balance-v1明确拒绝；同版本配置身份改变也拒绝；真正未绑定的新局才允许绑定，显式未知balance版本即使未开战也拒绝。已通过保存/恢复/版本/身份专项测试。由于未发布新数值，原存档保留原配置语义。

## 14. Validation

独立501..1000，每档500局，全部使用真正99阶段campaign，无采样截断。冻结配置SHA-256：`a055010c3dfcd7e608eccd4c3678b29afad8150ffdcaef3da27c6b3bb0d46165`。运行源文件也锁定SHA；CLI对源身份变化拒绝继续。Validation在训练与参数冻结后才打开，未根据它修改策略或游戏数值。原始数据与来源见[validation/runs-500/provenance.json](validation/runs-500/provenance.json)和[validation/runs-500/manifest.json](validation/runs-500/manifest.json)。

## 15. Holdout

1001..1250，每档250局，冻结后仅一次，真正99阶段campaign；排他锁在[holdout-once.json](holdout-once.json)，结果见[holdout/runs-250/aggregate.json](holdout/runs-250/aggregate.json)。Holdout之后没有改参数、机器人或运行代码。不得再以本批seed调下一轮；新的实验须另立版本与未用seed。当前以失败结果作拒绝记录，没有用holdout选另一个候选。

## 16. 确定性

同一冻结候选、各机器人seed1..50、12阶段campaign独立执行两次（1进程与2进程），聚合与逐局、逐波、逐阶段逻辑文件SHA全部一致；同时覆盖重复执行和并行一致性。耗时/调度不进入逻辑身份。3/6/99共同前缀另由完整RunSession测试检查。

| 文件 | SHA-256（两次一致） |
| --- | --- |
| aggregate.json | c147d3f40c2a65bf1d16c7cdfc0468899841ac6616a0a624bc6e0ebb9025400f |
| weak/per-run.jsonl | 852d47956ab8096aeb2c7771a7f49699479f0733e652c2f95b6f58aea157bab3 |
| medium/per-run.jsonl | 9878c22bef2ffbca0b235d495d7319acbdac9c1e951d56590d5d3219179aeea1 |
| strong/per-run.jsonl | 3b93387f37abb3a63e894680bbe185fc705992c311f21a238cb99cf477818da4 |

完整哈希见[determinism/comparison.json](determinism/comparison.json)。报告原始数据SHA也保存在每批manifest；策略源SHA、配置身份、冻结源与分区都可追溯。环境：Node v24.15.0，Windows x64，纯TS运行器，无Cocos Node/UI/图片。

另有[replay/medium-seed17-full.json](replay/medium-seed17-full.json)保存训练seed17的完整本局购买/刷新/经验/移动/装备/领奖动作正文；其38波动作SHA逐一匹配批量数据，见[replay/comparison.json](replay/comparison.json)。training-only重放工具不允许使用Holdout种子。

## 17. 性能

有performance.json的P4批次合计 **8770局 / 1593883次真实BattleSim**，累计各批报告wall time 4489.6秒。此数含基线、搜索、对照、复跑；不含单元测试内部模拟与生成器纯预算探针，不把这些无计数运行冒称已计入。部分批次并行重叠，累计wall不能当本次实际经过时间；早期工具记录worker阶段，正式Validation/Holdout还含报告合并时间。

另有上述完整动作复现1局/38次BattleSim（未单独测wall）；所有已保存批量与复现合计8771局/1593921次BattleSim，仍不包含单元测试内部模拟。

| 批次 | 局数 | BattleSim | 进程 | wall秒 | runs/s | waves/s |
| --- | --- | --- | --- | --- | --- | --- |
| baseline/endless-20 | 60 | 49253 | 2 | 241.5 | 0.25 | 204.0 |
| baseline/runs-500 | 1500 | 143987 | 4 | 316.0 | 4.75 | 455.7 |
| determinism/parallel-50 | 150 | 9646 | 2 | 57.9 | 2.59 | 166.5 |
| determinism/single-50 | 150 | 9646 | 1 | 103.9 | 1.44 | 92.9 |
| development-200 | 600 | 57597 | 4 | 132.9 | 4.52 | 433.4 |
| formation/L0 | 200 | 16130 | 2 | 78.5 | 2.55 | 205.4 |
| formation/L1 | 50 | 3206 | 2 | 18.5 | 2.70 | 173.2 |
| formation/L2 | 50 | 3222 | 2 | 18.4 | 2.72 | 175.5 |
| formation/L3 | 50 | 3310 | 2 | 18.6 | 2.68 | 177.5 |
| holdout/runs-250 | 750 | 365506 | 12 | 655.3 | 1.14 | 557.7 |
| smoke-50 | 150 | 14435 | 4 | 31.4 | 4.77 | 459.3 |
| training/confirmation-500 | 1500 | 94097 | 4 | 259.4 | 5.78 | 362.7 |
| training/endless-20 | 60 | 29963 | 2 | 162.4 | 0.37 | 184.5 |
| validation/runs-500 | 1500 | 721880 | 4 | 2257.2 | 0.66 | 319.8 |

20轮搜索的逐轮性能和全部批次清单在[accepted/performance.json](accepted/performance.json)。多进程按seed分区，各机器人逐局按seed稳定合并；99阶段报告采用流式读取，内存不保留全部阵容，全部逐波指标与上阵阵容仍落盘；批量文件不保留全量BattleEvent或逐动作正文，保留决策SHA，可用相同版本与seed的单局报告复现深查。

## 18. npm test

最终 `npm.cmd test` **exit 0**，真实日志：[final-tests.log](final-tests.log)，退出身份：[final-test-result.json](final-test-result.json)。P0–P3守卫、确定性、RNG隔离、前缀、存档、pending奖励、预算≤5%、Formation、装备效果全部通过；新Formal Bot 8项、balance CLI 2项、P4平衡6项通过。P3仅对EnemyBudget可选扩展作明确兼容声明，原968波证据和断言未替换。最早一次P3源文件哈希守卫失败已保留在regression-before-validation.log，不隐藏。

这是无UI的纯逻辑验收，本阶段未改界面；未将其宣称为编辑器/浏览器/设备验收。

## 19. 尚存问题与复现

1. Stage3双目标失败，Stage6仍有玩法阈值；有限20轮耗尽，没有扩大搜索或拿Validation/Holdout继续试参数。下一轮应单独设计早期预算/可行上限与阶段过渡，并换全新seed分区。
2. Medium在大量存款下停留7人口，正常玩家代表性尚不合格，不能拿它的约50%淘汰当合格平衡证明；应先以新版Bot修复富余金币/人口决策，再重新冻结策略、重跑Baseline。三档只是启发式策略，不等同真实人群，公共属性估值也不等于真实组队战力。
3. 成本/星级/装备内容上限让后期幸存者长期不再死亡，Strong99阶段过高；不能恢复旧无限加伤/减伤来掩盖。
4. 六件玩家奖励装备仍无P1-B标定、敌军禁用；铁傀儡无正式标定，当前仍low-confidence cost fallback，不升级为high。Validation实际使用次数见下表，不能因fallback有数值就认为平衡可信。
5. 装备奖励相关性有阶段与存活偏差；advanced fallback的因果强度未被隔离测量。Formation L1/L2/L3对照只有50对，区间较宽。
6. 单位/技能/装备效果、经济/卡池/P2权重/P1-B模型均未自动篡改；本轮不是一个成功发布的balance-v1。

铁傀儡专项记录：[accepted/iron-golem.md](accepted/iron-golem.md)，另列Validation/Holdout的上阵与敌军暴露情况。

| Validation机器人 | 铁傀儡上阵局数/500 | 玩家波次 | 敌军波次 | carry/tank观测次数 |
| --- | --- | --- | --- | --- |
| weak | 149 | 1113 | 0 | 226 |
| medium | 490 | 222340 | 0 | 50866 |
| strong | 500 | 462894 | 0 | 237147 |

可复现命令（在项目根目录运行，输出必须换新目录）：

```powershell
npm.cmd run balance-sim -- --bot all --seed-start 501 --seed-count 500 --stages 99 --workers 4 --partition validation --config docs/p4-balance/freeze/candidate.json --output docs/p4-balance/replay-validation-new
node --require tsx/cjs tools/balance/replay-run.ts --bot medium --seed 17 --stages 99 --config docs/p4-balance/freeze/candidate.json --json temp/candidate-medium17-new.json
npm.cmd run run-sim -- --bot medium --seed 17 --stages 99 --json temp/p3-medium17-new.json
npm.cmd test
```

第二条保存冻结候选的完整训练动作，第三条使用当前保留的正式P3配置。Holdout不能再次作为新实验使用；原始数据可重新聚合。自动搜索入口 `npm.cmd run tune-balance` 会拒绝覆盖已存在搜索，20轮过程和补充4轮脚本均已保留；不通过删除锁重跑。
