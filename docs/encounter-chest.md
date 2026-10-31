# 旅行商店离场与混合宝箱

当前规则同步：2026-10-29。

- 特殊商店点击“下一关”后，旧关卡仍隐藏普通商店卡牌、商店标题和刷新/经验控件。切关遮罩完全覆盖时切换关卡，普通商店才随新关卡恢复。
- 野怪、精英、Boss 胜利后等待点击棋盘中央宝箱。基础预算 `min(30, 阶段 + 2)`，精英为基础值一半向上取整；野怪奇遇倍率独立作用。10-10 为无宝箱 Boss。
- 奖励按预算混发棋子、装备／道具和玩家生命；每点玩家生命价值 2 金币，玩家生命上限 100，满血时不参与生命候选。无法分配的余值直接发金币，一次结清，不保留装备额度。
- 棋子支持 1／2／3 星，价值 `费用 × 3^(星级−1) × 星级`，只抽取可负担且有库存的候选；2 星 1 费价值 6，3 星 5 费价值 135。卡池实际扣除的同名张数为 1／3／9。
- 装备与生命奖励使用对应飞行动画入背包或生命区域，随机结果依赖本局种子和关卡，重复点击不会多发。

| 宝箱 | 白／绿／蓝／紫／橙品质权重（%） | 1／2／3 星权重（%） |
| --- | --- | --- |
| 野怪 | 60／25／10／4／1 | 95／5／0 |
| 精英 | 25／35／25／12／3 | 80／18／2 |
| Boss | 10／20／30／25／15 | 60／30／10 |

权重固定，不随玩家等级或阶段改变；预算、库存和接收条件会过滤不可用档位，再归一化抽取。探险家宝箱另使用随层数提升的品质及星级概率，1000 层星级权重为 30／40／30，详见[当前规则](current-rules.md#探险家宝箱)。

实现入口：`StageProgression.ts`、`RunSession.ts`、`RoundFlow.ts`、`BattleStage.ts`、`StageRewardPanel.ts`、`battle.json` 与 `run.json`。

## 初次验收记录（2026-10-24，历史）

下列结果和文件名记录旧版三选一宝箱及离店修复，不表示当前混合奖励规则的验收；相关测试及预览脚本已于 2026-10-29 按用户要求全部删除。

- `tests/encounter-chest-regression-tests.cjs`：先复现特殊商店清空奖励后的普通卡牌闪现，再验证修复；两种敌人生成模式的三类奖励、读档一致性、卡池守恒、防重复领取、治疗上限和初始生命。
- `tests/stage-progression-tests.cjs`、`tests/stage-advance-ui-tests.cjs`、`tests/stage-reward-validation-tests.cjs`、`tests/expedition-portal-tests.cjs`、`tests/progression-tests.cjs`、`tests/ui-interaction-tests.cjs`、`tests/chest-reward-flight-tests.cjs`、`tests/run-session-tests.cjs` 通过。
- `tests/regression-tests.cjs`：75 项通过，0 失败。
- TypeScript 检查及资源引用检查通过。
- `tools/verify-encounter-chest-preview.cjs`：真实 Cocos 浏览器预览，独立临时存储，鼠标点击离店与三类宝箱，逐帧记录旧/新关卡商店可见性；没有浏览器脚本错误。通过受控跳关与指定战果建立场景，未验证自然通关、Web 发布构建或手机运行。

截图与逐帧记录位于 `docs/evidence/encounter-chest/`：`02-special-shop.png`、`03-next-wave-shop.png`、`05-health-opened.png`、`05-units-opened.png`、`05-equipment-opened.png` 和 `browser-acceptance.json`。
