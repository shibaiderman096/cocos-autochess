# 特殊商店离场与 Boss 随机宝箱

2026-10-24。

- 特殊商店点击“下一关”后，旧关卡仍隐藏普通商店卡牌、商店标题和刷新/经验控件。切关遮罩完全覆盖时切换关卡，普通商店才随新关卡恢复。
- Boss 获胜后等待点击棋盘宝箱，打开时从三类奖励中等概率抽取一种：原阶段价值的随机棋子补给、1 件普通装备、恢复 5 点玩家生命。装备直接进入背包，棋子沿用飞行及奖励仓库流程。随机结果依赖本局种子与关卡，重复点击不会多发，未开箱读档不会改变结果。
- 玩家初始生命与上限由 20 改为 100；治疗受上限约束，满血仍可能抽到生命奖励，提示“生命已满”。已有受伤生命不自动补满。
- 原已保存的棋子清单、装备四/五选一奖励保持可领取。

实现入口：`StageProgression.ts`、`RunSession.ts`、`RoundFlow.ts`、`BattleStage.ts`、`StageRewardPanel.ts`、`battle.json` 与 `run.json`。

验证：

- `tests/encounter-chest-regression-tests.cjs`：先复现特殊商店清空奖励后的普通卡牌闪现，再验证修复；两种敌人生成模式的三类奖励、读档一致性、卡池守恒、防重复领取、治疗上限和初始生命。
- `tests/stage-progression-tests.cjs`、`tests/stage-advance-ui-tests.cjs`、`tests/stage-reward-validation-tests.cjs`、`tests/expedition-portal-tests.cjs`、`tests/progression-tests.cjs`、`tests/ui-interaction-tests.cjs`、`tests/chest-reward-flight-tests.cjs`、`tests/run-session-tests.cjs` 通过。
- `tests/regression-tests.cjs`：75 项通过，0 失败。
- TypeScript 检查及资源引用检查通过。
- `tools/verify-encounter-chest-preview.cjs`：真实 Cocos 浏览器预览，独立临时存储，鼠标点击离店与三类宝箱，逐帧记录旧/新关卡商店可见性；没有浏览器脚本错误。通过受控跳关与指定战果建立场景，未验证自然通关、Web 发布构建或手机运行。

截图与逐帧记录位于 `docs/evidence/encounter-chest/`：`02-special-shop.png`、`03-next-wave-shop.png`、`05-health-opened.png`、`05-units-opened.png`、`05-equipment-opened.png` 和 `browser-acceptance.json`。
