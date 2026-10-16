# P4执行与分区

先冻结现有游戏配置和全部历史证据，再实现共用策略模块及三档合法机器人。策略在50-seed smoke及公共接口合法性检查后冻结，见baseline/bot-freeze.json；游戏难度在完整未调参baseline前不改。

- Smoke：seed1..50，每档50局；Development：1..200，每档200局。
- 未调参Baseline：1..500，每档500局，真实12阶段campaign，覆盖核心Stage1..10。另做99阶段长局诊断；12阶段结束不冒充99阶段通关。
- Training：只用1..500，有限候选实验，最多20轮，每轮最多两类参数；正式资源在Validation/Holdout前不写入实验值。
- Validation：501..1000，每档500局，冻结候选后执行真正99阶段campaign。
- Holdout：1001..1250，每档250局，真正99阶段campaign；所有参数冻结后一次性执行。工具通过holdout-once.json防止重复使用。

正式报告会区分单波胜率、条件阶段完成、累计阶段完成、Boss击败率，并列Wilson95%区间与样本量。未到达波次不当作胜利或遭遇；升星分位另报未达成比例。

机器人只读当前玩家状态、静态公开单位/技能/装备与经济规则、当前敌军预览及已出现pending奖励；仅通过RunSession公共动作消费资源。策略不读取EnemyPowerModel、不调用BattleSim、不读未来商店/掉落/敌军/RNG。BattleSim只由共享运行器推进。

模拟输出固定按seed排序；时间和并行调度不进入逻辑hash。输出目录拒绝覆盖P0/P1/P2/P3证据及已有实验。最终accepted配置必须记录balanceVersion、源报告和三类seed范围；旧档沿用身份失配拒绝加载策略。
