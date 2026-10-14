# 核心状态一致性审计（2026-10-14）

范围：ShopSystem、OwnedUnits、ShopSave、CardPool、EconomySystem、ShopConfig、RunSetup、BattleStage；等级校验所需的最小修改涉及 LevelSystem。

## 确认的问题、原实现证据与复现

| 风险 | 问题 | 原实现证据 | 固定复现 |
| --- | --- | --- | --- |
| 高 | 存档位置冲突及越界 | BattleStage.restoreFormation 只遍历越界 board；合法重复格不处理，bench 不检查 | 两个 bench y=0、一个 y=99、两个 board (2,2)；恢复后 5 个棋子仅有 3 个不同位置 |
| 高 | 恢复库存不守恒 | CardPool 独立加载 save.pool；ShopSystem 对 shopReserved=true 的商品直接信任；owned 未参与核对 | warrior 池设为 30，同时持有二星 warrior 和预留一张 warrior；总量恢复为 34 而非 30 |
| 中 | 可抽库存存在但商店为空 | ShopSystem.rollOne 最多重试 10 次 | 等级 3，仅二费库存剩余，rng.next 固定返回 0；五格全空 |
| 高 | 经济及等级被非有限值污染 | EconomySystem.spend 的 NaN 比较全部为 false，仍扣款并返回 true；LevelSystem 构造和 addExp 不校验有限值；shopCostRates 用 NaN 索引 | spend(NaN)、add(Infinity)、level=NaN、exp=Infinity、shopCostRates(NaN) |
| 高 | 非法费用和库存进入卡池 | CardPool 将 cost 强制断言为 Cost，并原样接收 initialState 数量 | cost=NaN 不报错；库存 Infinity、负数导致非法池状态 |
| 高 | 存档坐标及奖励字段污染 | ShopSave 坐标未验证有限值；lastReward 仅检查 breakdown.total；lastSettlement 仅检查 healthRemaining | x/y=Infinity，奖励 total=1 但 interest=Infinity、expGained=NaN |
| 高 | 满席购买合成失败不回滚 | ShopSystem.buy 先 spend、forceAdd，再使用 merged!.uid，没有事务 | 两格满席且同名一星，注入会移除棋子并返回 null/抛异常的 tryMerge；购买抛错并遗留部分修改 |
| 中 | 回合数与成长乘积溢出 | RunSetup.runRoundCount 不校验 roundsPerStage；buildRunWaves 不校验最终 statMultiplier | roundsPerStage=Infinity；stageStatGrowth=Number.MAX_VALUE，生成五阶段 |

## 最小修复及恢复策略

- 读档先依据实际棋盘尺寸修复位置，优先保留已有合法格。重复/越界棋盘单位优先移到己方空格，再到备战席；重复/越界备战单位移到空备战格。
- 按每个配置棋子的初始总库存，扣除持有基础卡数量 `3^(star-1)` 和商店预留，重建剩余卡池。旧版未预留商品在这一过程中预留一次。
- 对损坏存档，持有单位优先于商品；未知棋子、超过该棋子总库存的记录不保留。完全无合法位置的异常记录移除并返还基础卡。正常存档无需丢弃单位或商品；此策略不自动上阵备战棋子。
- 抽店使用等级原有非零概率，在有库存的费用档间重新归一化；等级概率为零的费用档仍不可抽，不改变解锁规则及同档棋子的抽取规则。
- 拒绝非法费用；库存数量钳位；金币、等级、经验、存档坐标/结算数字验证有限值及范围；回合数和最终成长乘积校验防溢出。
- 购买事务失败恢复持有对象、UID 分配、金币及商品预留；正常购买路径也处理添加/合成抛异常。

## 战斗状态审计

现有 BattleStage 使用独立 BattleSim 保存当前参战快照；战斗中购买合成只修改 owned，升星在下次重建模拟器时生效。购买后只重建备战视图，保留模拟器、驱动、事件游标及棋盘视图。拖动限制为备战席操作，不能在战斗中上阵或出售棋盘单位。结算调用 RoundFlow.settle，非 battle 阶段不会重复入账；结算先撤销正在进行的拖动，阻止迟到的出售事件。

这些路径的实际组件无渲染回归均通过，未确认新的战斗操作 Bug，未改动上述规则。

## 已执行验证

新增测试位于 tests/regression-tests.cjs，沿用实际核心模块和 BattleStage 的引擎边界替身。

- 修复前：原有 34 组通过，新增首批 7 组全部失败（退出码 1）。
- RunSetup 修复前：其新增回归失败，其余 41 组通过（退出码 1）。
- 最终 `npm test`：退出码 0；战斗单元 127/127，经济/等级/存档 56/56，商店/卡池 41/41，联动回归 42/42。
- 冒烟、UI 交互、UnitView、主菜单、公平性与卖价、关卡成长/真实 BattleSim 战斗脚本均通过。

未启动 Cocos Creator 编辑器或进行真实渲染、触摸手动验收。上述结果证明 Node 核心与组件替身测试通过，不代表引擎内视觉验收。
