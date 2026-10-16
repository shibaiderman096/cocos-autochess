# P1-B：EnemyPowerModel 交付说明

本阶段只增加离线战力标定、纯 TS 查询模型及其证据。当前敌军生成、费用/星级节奏、布阵、技能、装备效果、商店和经济公式保持 P0/P1-A 状态。新模型没有接入 BattleStage、RunSession 或 RunSetup。

## 1. 修改文件

| 文件 | 用途 |
| --- | --- |
| [EnemyPowerTypes.ts](D:/cocos/NewProject/assets/scripts/core/EnemyPowerTypes.ts) | 模型、单位/星级/装备组合、环境、置信度、查询结果类型。 |
| [EnemyPowerModel.ts](D:/cocos/NewProject/assets/scripts/core/EnemyPowerModel.ts) | 纯 TS `estimateUnitPower`、`estimateTeamPower`、胜率映射、输入/模型检查、显式低置信 fallback。 |
| [enemy-power.json](D:/cocos/NewProject/assets/resources/config/enemy-power.json) | 正式标定导出的版本化运行时数据；不包含几百万场原始记录。 |
| 上述两个 TS 和一个 JSON 的 `.meta` | Cocos 导入元数据。 |
| [fixtures.ts](D:/cocos/NewProject/tools/power-calibration/fixtures.ts) | 全矩阵、合法位置、分析标签、小阵容及特殊3★验证夹具。 |
| [sampling.ts](D:/cocos/NewProject/tools/power-calibration/sampling.ts) | 真实 BattleSim + CombatStatistics 采样、可复现朝向/距离、源码配置哈希和完整性校验缓存。 |
| [fitting.ts](D:/cocos/NewProject/tools/power-calibration/fitting.ts) | 按seed划分与聚类汇总、带边界的联合拟合、个体/星级/装备估值、置信度、模型哈希。 |
| [report.ts](D:/cocos/NewProject/tools/power-calibration/report.ts) | 独立验证、星级/装备/阵容误差、费用趋势和异常报告。 |
| [calibrate-enemy-power.ts](D:/cocos/NewProject/tools/calibrate-enemy-power.ts) | 分模式 CLI、输出与旧证据保护、性能记录；仅 full 导出运行时模型。 |
| [enemy-power-tests.cjs](D:/cocos/NewProject/tests/enemy-power-tests.cjs) | 查询、环境、输入错误、缺数据、组合 fallback、团队求和、非单调诊断及旧数据保护。 |
| [power-calibration-tests.cjs](D:/cocos/NewProject/tests/power-calibration-tests.cjs) | 计划/位置、采样确定性、独立分区、缓存失效/损坏恢复、拟合边界及验证不泄漏。 |
| [package.json](D:/cocos/NewProject/package.json) | 增加 `calibrate-power`，复用已有 tsx，无新增依赖。 |
| [run-tests.ps1](D:/cocos/NewProject/tools/run-tests.ps1) | 编译新工具并运行新测试，不移除或降低旧测试。 |
| 本目录 | P1-B 的计划、smoke、正式标定、复跑、源数据保护和验证证据。 |

不修改任何已有 `assets/scripts` 文件或原配置文件。P0和P1-A报告目录保持原字节；开始时已有的设置与其他工作区改动保留。

## 2. 方法、矩阵及测量定义

先复核两阶段报告和实际 ConfigManager.scaleUnit、BattleSim、CombatStatistics、15名棋子、全部技能与4件装备，再重新执行 P1-A 现有测试。前置完整测试输出为 `preflight-tests.log`，退出码0。

初始矩阵967组，20种子 smoke 实跑77,360场。发现特殊3★可能在单挑中出现效果截断，于是加4组5v5专题验证，最终矩阵为：

| 模式 | 组数 | 500种子的对战数 |
| --- | --- | --- |
| mirror | 165 | 330,000 |
| unit | 210 | 420,000 |
| star | 45 | 90,000 |
| equipment：单件 | 180 | 360,000 |
| equipment：两/三件 | 300 | 600,000 |
| team | 71 | 142,000 |
| 合计 | 971 | 1,942,000 |

每seed固定执行换边×实例顺序4个版本；距离按seed偏移轮换close/medium/far，500个seed不是每个距离各500个seed。单挑位置为 `(3,3)/(3,4)`、`(1,2)/(5,5)`、`(0,0)/(6,7)`；团队另用三套合法半场布局，全部通过格子检查。没有改实际敌军布阵。

镜像覆盖全部单位1★/2★，无装备及全部4件单装备；另含全部单位3★无装备。跨单位覆盖所有同星1★/2★单位配对。星级测试每单位1→2、2→3、1→3；单装备测全部单位×全部星级×4件。多装备测全部单位1★/2★×10套含重复装备的组合，包含0/1/2/3件对照。

阵容包括2v2、3v3、5v5，覆盖前后排、双近战、双远程、AoE、控制、自疗、刺客传送；额外包含末影人3★、鼬3★和小樱3★专题。自疗不冒充团队辅助，未添加不存在的技能。

主要观测是实战资源比代理量：

```text
logRatio = 0.5 × log((初始生命A + 实际治疗A) / (初始生命B + 实际治疗B))
         + 0.5 × log((实际造成伤害A + 1) / (实际造成伤害B + 1))
```

共享战斗时长在DPS比值中相消；+1生命只平滑零伤害观测。对这些对数比联合拟合，采用固定锚点、ridge=0.001、最多4000次坐标下降、变化阈值1e-9，记录残差、收敛与边界。没有使用费用排序或1.8/3.24硬约束，也没有把单次胜率直接乘成价格。另用训练集胜负平拟合 logistic 胜率映射，斜率有0.05～20边界并报告是否触界。

**这个代理量是可解释、可复测的近似，不是可唯一识别的“真实战力”。** 同时记录胜/负/平、实际伤害/承伤/治疗、生命比例、时长、伤害类型、施法、传送、护盾和施加眩晕秒数。现有事件不足以准确归因每一笔技能伤害或实际阻止行动时长，本阶段没有改写战斗统计。

## 3. 独立验证、置信度及适用范围

正式训练使用seed 1～400；验证使用401～500。同一 matchup+seed 的全部朝向留在同一分区，验证样本不进入个体估值、归一化、环境拟合或胜率斜率拟合。团队数据不用于拟合个体之和；它用于检查这种求和模型的局限。

置信区间按seed对四朝向聚类计算。`sampleCount`是对战数，`independentSeeds`是独立训练种子数。每个组合点分别保存全局与close/medium/far的置信元数据，查询具体环境时使用该环境自己的样本量与残差；不会借用全局400种子的覆盖。费用基线、个体修正及星级因子也保存支持记录。high/medium/low是覆盖与残差的可靠性分级，**不是估值的95%后验区间**。5费仅一名身份、所有3★、强距离敏感、零伤害删失或大残差保持low；单对手装备比较最高medium。装备全局聚合值只作低置信fallback，优先查单位×星级的实测点。

镜像交换后的A/B对称主要验证采样配对。仍单独检查先实例化score及其区间，不把对称配对当成模拟器绝对公平证明；165项区间未做多重比较校正，不因小样本偏差改战斗规则。

费用价值取每档实际估值中位数，允许不随费用递增。星级、负装备边际、强协同、队伍预测反例全部暴露，不人工排成设计意图。已测组合保存组合估值；未测组合明确走相加fallback并标low。3★多装备没有穷举。

## 4. 命令与产物

```powershell
Set-Location D:\cocos\NewProject
npm.cmd run calibrate-power -- --plan
npm.cmd run calibrate-power -- --mode mirror --seed-start 1 --seed-count 20 --output temp/power-mirror
npm.cmd run calibrate-power -- --mode full --seed-start 1 --seed-count 20 --no-cache --output temp/power-smoke
npm.cmd run calibrate-power -- --mode full --seed-start 1 --seed-count 500 --output temp/power-formal
```

支持 `mirror/unit/star/equipment/team/full`，`--seeds` 是 `--seed-count` 的别名。默认20种子；最少15种子保证三个环境的训练和验证分区都有样本。`--model-output` 仅full可用；本次正式输出为 `assets/resources/config/enemy-power.json`。

缓存默认在忽略的 `temp/power-calibration-cache`。key包含双方单位/星级/装备、全部位置布局、朝向协议、种子区间、源码/配置哈希和标定版本；粒度为一个matchup的完整seed区间。配置、源码、位置或seed集合变化会失效。缓存带内容摘要与seed/位置检查，损坏时重新模拟并计数。原始逐seed数据压缩留在缓存，正式报告仅保存分组统计。

每次输出：

- `enemy-power.json`：小型运行时模型；全局费用基线、个体因子、星级因子、单位/星级/装备组合点、环境估值与可靠性。
- `observations.json`：逐matchup、分训练/验证/环境的真实统计。
- `validation.json`：独立验证误差、Brier、胜负准确率、概率校准、最差单位/阵容与近等战力反例。
- `analysis.json`：费用逆序、个体高估/低估、星级异常、装备边际与协同、镜像偏差及置信分布。
- `fit.json`：拟合参数、残差、迭代、收敛和边界。
- `provenance.json`、`output-hashes.json`：源码/配置哈希、版本、seed分区、样本量及确定性产物哈希。
- `performance.json`：实际新跑场数、缓存命中、各模式场数和实际耗时；这些执行信息不参与确定性哈希。
- `REPORT.md`：对应实跑结果生成的可读报告。

输出路径禁止覆盖P0/P1-A目录。不同实验用不同子目录，保留初始smoke与增加3★专题后的smoke。

## 5. 查询 API 与缺失数据

```ts
const model = new EnemyPowerModel(data, {
  configHash: expectedConfigHash,
  sourceHash: expectedSourceHash,
});
const unit = model.estimateUnitPower({
  unitId: 'mage', star: 2, equipment: ['guinsoo'], environment: 'far',
});
const team = model.estimateTeamPower([
  { unitId: 'warrior', star: 2 },
  { unitId: 'mage', star: 2, equipment: ['guinsoo'] },
]);
```

返回 `power/confidence/sampleCount/diagnostics/method`。已测组合直接读取；未测组合使用已测单装边际相加，明确诊断且low。缺星级使用该单位/费用基线与全局星级参考，并诊断。未知单位必须由调用方明确提供合法cost才能用费用baseline；否则报错。未知装备从部分估值中排除并明确标记，不能把它当成已定价。非法星级、空队伍、超过10人、超过3件装备和模型哈希不匹配均报错，不返回0或静默借用无关棋子。

`estimateTeamPower` 的method与置信标签表示其个体分量的覆盖情况，**不表示该完整阵容已实测或具有相同预测精度**。团队相互作用和当前BattleStage固定敌军先分配ID的条件，需要后续使用时单独考虑。`winProbability`采用胜+半平的score约定，不等于剔除平局后的条件胜率。

## 6. 正式结果与验证证据

最终结果见 [final-500/REPORT.md](D:/cocos/NewProject/docs/p1-enemy-difficulty/power-calibration/final-500/REPORT.md)，完整分组与异常在同目录JSON中；验收证据见 [verification.json](D:/cocos/NewProject/docs/p1-enemy-difficulty/power-calibration/verification.json)。此前formal-500目录保留为开发记录。补充环境及派生值置信元数据后，最终版本重新执行500种子全矩阵；原始观测逐字节相同，所有全局/环境战力数值完全相同，改变的是置信元数据和对应源码/模型哈希。

正式模型有525个单位×星级×装备组合点，4组拟合均在849次迭代内收敛，无数值边界命中；全局对数资源比RMSE约0.02794。胜率映射斜率达到上界20，模型已保存适用范围警告。

| 费用 | 实际身份数 | 费用baseline（中位数） | 档内个体均值 |
| --- | --- | --- | --- |
| 1 | 4 | 100.00 | 100.10 |
| 2 | 5 | 138.52 | 127.74 |
| 3 | 3 | 116.89 | 128.62 |
| 4 | 2 | 140.34 | 140.34 |
| 5 | 1 | 181.69 | 181.69 |

3费**中位数**低于2费；按各档**均值**未出现逆序。这两个统计量不能混为一谈。个体修正、P2/P1、P3/P2、P3/P1全表在正式REPORT中；全局星级因子中位数为1 / 1.73571 / 3.10822，没有人工改回1.8/3.24。

以费用中位数为参照，统领个体修正1.7741、佐助1.2990；法师0.5270、祭司0.6732、鼬0.7010。它们反映当前单挑代理量下的个体差异，不能直接把AoE/控制在团队内的价值按这个排名定论。正向/负向各只有6名严格偏离中位数的单位，全部列出，没有凑足10个。

末影人3★/1★拟合比为5.67788，2★/1★为1.82631，3★/2★为3.10893；保留额外5000生命、50倍强化攻击及永久强化的真实效果。裸装星级非单调条目为0，但所有3★仍标low。

| 装备 | 1★跨单位边际中位数 | 相对收益中位数 | 聚合置信度 |
| --- | --- | --- | --- |
| 鬼索 | +25.66 power | +21.29% | low |
| 不死图腾 | +19.00 | +16.68% | low |
| 珠光护手 | +10.40 | +7.51% | low |
| 无尽之刃 | +18.09 | +17.11% | low |

这些聚合数值不替代单位×星级单装点。实测单装负边际为0；组合不能简单相加：法师1★三鬼索的组合拟合值118.82，相加估计164.25，高估38.24%。完整300组协同误差排序见analysis.json。

525个点的置信标签：high 28、medium 392、low 105。费用/全局星级等派生值的支持样本与来源另列于 `value-confidence.json`；它们与具体组合点不是同一种证据覆盖。

### 独立验证结果与反例

| 数据层 | 验证场数 | score平均绝对误差 | 有胜负对战的预测方向准确率 |
| --- | --- | --- | --- |
| 跨单位矩阵 | 84,000 | 4.40个百分点 | 96.90% |
| 星级 | 18,000 | 约0.001个百分点 | 100% |
| 单装 | 72,000 | 8.95个百分点 | 98.66% |
| 多装 | 120,000 | 0.63个百分点 | 100% |
| 所有单挑合计 | 294,000 | 3.71个百分点 | 98.79% |
| 阵容 | 28,400 | 13.60个百分点 | 84.42% |

总体指标受较容易的同单位升星/装备对照影响，不能只报98.79%而隐藏跨单位、单装备和阵容误差。close/medium/far分别验证的数据也在verification.json；环境具体点并未消除团队相互作用，团队环境级误差约17.6～19.3个百分点。

预测power比值0.95～1.05的验证队伍有15组，其中5组实际score≤0.1或≥0.9。更严重的特殊3★反例：

| 阵容 | 预测power A/B | 预测score A | 验证score A |
| --- | --- | --- | --- |
| 3★末影人+4名1★护卫，对5名3★混合队 | 1432.01 / 2055.82 | 0.0723% | 100% |
| 同一末影人队，对5名2★末影人 | 1432.01 / 1659.13 | 5.0007% | 100% |
| 常规前后排队，对全远程队 | 881.75 / 983.86 | 10.0521% | 89.5% |

这些验证样本没有回填训练或用来调高特殊单位数值。**标定工具与查询接口已完成，但当前v1不能作为无条件可靠的团队预算标尺，特殊3★尤其需要后续团队层标定。** 不能靠放宽属性倍率掩盖反例。

### 镜像顺序偏差复现

平衡换边后的阵营score差为0；先实例化score最大偏差为0.34，165组中114组的先实例化区间不含0.5且偏差超过0.05。未做多重比较校正，但最强反例已用事件追踪解释：seed401的3★鼬中距离，ID2在Tick7首攻、ID1在Tick8首攻；远距离为Tick19/20；近距离双方Tick1同步攻击并平局。交换两边仍是ID2先攻。

原因是现有按ID遍历中的移动先改变距离，后处理单位能在同Tick看到已进入射程的目标；它不否定已有同时致命攻击测试，却会造成接敌先手机会差异。6场独立追踪在 `mirror-order-evidence.json`，不参与拟合或验证。没有修改战斗规则。

### 场数、缓存与性能

| 运行 | 新执行BattleSim | 复用缓存代表的场数 | 实际秒数 |
| --- | --- | --- | --- |
| 初始967组 smoke | 77,360 | 0 | 9.94 |
| 补充专题后 smoke | 77,680 | 0 | 10.32 |
| 同源禁用缓存 smoke复跑 | 77,680 | 0 | 11.10 |
| 正式500种子 | 1,942,000 | 0 | 262.31 |
| 同源正式复跑 | 0 | 1,942,000 | 21.54 |
| 最终置信元数据版smoke | 77,680 | 0 | 10.80 |
| 最终版禁用缓存smoke复跑 | 77,680 | 0 | 11.17 |
| 最终版500种子 | 1,942,000 | 0 | 273.30 |
| 最终版同源缓存复跑 | 0 | 1,942,000 | 22.52 |

全部开发与最终标定运行合计新执行 **4,272,080场**，两次缓存复跑合计复用3,884,000场；另有6场镜像顺序诊断。最终版单次正式运行实跑1,942,000场。单元/回归测试夹具另计，不伪装成标定样本。`cacheHits`以复用的对战场数统计，不是缓存文件读取次数；最终复跑读取971个匹配文件，未重新跑194.2万场。

### 确定性、保护和测试

最终源码的两次独立禁用缓存smoke，7份确定性产物逐字节一致。最终500种子原跑与缓存复跑的7份产物也逐字节一致；模型文件SHA-256为：

```text
38ba7d425fa235b528799d46e6a21a1c58ec506841fd58e15c41a64887837cb0
```

模型内calibrationHash为 `fb31829c87670bdba73af786d39ca99cda9aa875f1ffb609fd1e072e66e00b3d`；它包含模型语义和实验协议，和文件字节SHA含义不同。生产路径的JSON与最终产物完全相同；源码/配置哈希与当前文件匹配。

142个受保护文件逐字节未变；全部968波旧生成结果与P0档案完全相同。最终 `npm.cmd test` **退出码0**：原战斗127、经济56、商店41、联动回归67、战斗属性9、RunSession12、run-sim CLI4，以及新增EnemyPowerModel8、标定6项均通过；其余原技能/装备/交互/冒烟套件保留并通过。项目声明类型检查及纯TS编译通过，`git diff --check`通过。

测试包括：模型非法输入、缺失数据与装备fallback、环境置信覆盖和旧模型元数据降级、团队求和、非单调诊断、全矩阵位置合法性、采样确定性、源码/配置/位置/seed缓存失效、损坏恢复、拟合有限终止、验证样本不影响拟合参数，以及旧968波与旧证据保护。最终日志见 `npm-test-final.log`；`npm-test.log`保留此前版本测试。

## 7. 尚未实现

P1-C预算生成、智能布阵、Boss/Elite实际规则、玩家装备奖励、自动平衡、正式三档机器人均未实现。模型不改变当前游戏难度，也不能把最小机器人或少量标定阵容当作正常玩家体验。仅通过离线模拟与自动测试，不声称运行过编辑器画面或真机。
