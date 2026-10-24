# 命运初逢与商店区域复用

2026-10-23 实现及验收。

2026-10-24 更新：新增凯旋馈赠、勤学苦练、复苏之风；新局从六个奇遇中随机抽取三个供玩家选择，候选及顺序存档。旧档保持原候选及已选效果。当前数值和验收见[六选三奇遇扩充](opening-expansion.md)，下方原始三选一记录保留作历史说明。

## 行为

- 实际游戏进入 1-1 准备阶段时，底部棋子商店显示“命运初逢”三选一；按 2026-10-23 后续要求，1-1 整关禁用普通商店，1-2 自动开放；没有“展开商店”绕过入口。一局只选择一次，未选择/已选择状态均存档。后续验收见[奇遇与守灯人更新](soul-lamp-and-overdrive.md)，下方早期截图与验收记录属于调整前版本。
- **灵感迸发**：玩家每升一级获得 2 次免费刷新；购买经验、自然经验、连续升级均计入。次数可累积、跨关和读档保留，手动刷新优先消耗免费次数，金币为 0 也可使用。每关自动换店不消耗次数。
- **行旅津贴**：进入第 2 阶段起，每进入一个新阶段获得 10 金币；同阶段小关、读档、重复结算不重复发放。调试跳关只发到达阶段的奖励，不补中间跳过的阶段。
- **百战淬体**：战斗结束时，按照开战的己方持有 UID 与战斗实例 ID 对应关系，为仍存活棋子增加 50 永久最大生命。阵亡、备战和临时召唤物不获益；平局亦按存活结算。加成在星级缩放之后、装备及羁绊之前加入，重复战斗可叠加；合并时保留所有材料棋子已经积累的生命加成。
- 特殊商店自动占用底部商店窗口，5 件商品各限购一次；商品、已购买状态、扣款和背包沿用原流程。点击右侧“下一关”离店。
- 2026-10-24 更新：Boss 宝箱点击后随机获得棋子补给、1 件普通装备或恢复 5 点玩家生命，无需分类/装备选择。玩家初始与最大生命为 100。已保存的旧装备候选仍可正常领取。新验证见[商店离场与随机宝箱](encounter-chest.md)；下方类别选择截图保留为历史记录。
- 怪物棋子宝箱仍保留原直接领取及飞行动画；已有补给清单、背包与战斗核心配置保持原流程。

## 代码入口

- 数值：`assets/resources/config/run.json` 的 `openingEncounter`。
- 类型与文案：`assets/scripts/core/OpeningEncounter.ts`。
- 会话、升级、刷新、阶段收入及战后存活：`RunSession.ts`、`ShopSystem.ts`。
- 永久生命存档/合并/战斗消费：`OwnedUnits.ts`、`ShopSave.ts`、`BattleSim.ts`。
- 游戏入口显式传入 `openingEncounter: true`；原离线模拟默认维持历史规则，专用测试明确启用奇遇。奖励配置不纳入敌人配置指纹，防止仅新增开局选项导致旧档失效。

## 验收

- 全量 `tools/run-tests.ps1`：**84 suites passed, 0 failed**，详见 `evidence/opening-encounter/automated-tests.log`。
- 最终 UI 调整后重新通过 `tests/opening-encounter-tests.cjs`、`tests/ui-interaction-tests.cjs` 和 `npx tsc --noEmit -p tsconfig.json`。
- 浏览器：真实 Cocos 预览、独立临时浏览器存储、1280×720。实际鼠标点击奇遇、免费刷新、特殊商店购买、Boss 装备类别/详情/选择均通过。未操作用户浏览器存档。
- `tools/verify-opening-encounter-preview.cjs` 可复跑浏览器验收；Playwright 不在默认模块路径时设置 `ENCOUNTER_PLAYWRIGHT`，Chrome 可通过 `ENCOUNTER_CHROME` 指定。
- 浏览器脚本通过调试跳关和强制结束战斗建立奖励场景；它验证实际界面及点击消费链路，不代表完整自然游玩通关。阶段收入和存活生命的边界由专用逻辑测试覆盖。
- Web 构建曾尝试执行，Creator 进程在启动阶段退出 `-2147483645`，未产生有效新构建，不能宣称构建成功。没有 Android 构建或真机验证。

## 图片

- `evidence/opening-encounter/01-opening.png`：1-1 奇遇三选一。
- `evidence/opening-encounter/02-free-refresh.png`：升级所得 4 次免费刷新、0 金币。
- `evidence/opening-encounter/03-special-shop.png`：5 件混合商品。
- `evidence/opening-encounter/04-boss-category.png`：Boss 奖励类别。
- `evidence/opening-encounter/05-boss-equipment.png`：普通装备五选一。
- `evidence/opening-encounter/06-equipment-detail.png`：装备效果详情。
- `evidence/opening-encounter/browser-acceptance.json`：实际浏览器状态、商品/候选及错误记录。
