# 命运初逢：新增三个奇遇

2026-10-24。

## 当前规则

新开局从六个奇遇中等概率、不重复抽取三个，玩家选择一个，本局持续生效。候选及顺序在生成时存档，刷新界面和读档不会重抽，也不能选择未出现的奇遇。原有三个奇遇效果保持不变。

| 新奇遇 | 效果 |
| --- | --- |
| 凯旋馈赠 | 每次战斗胜利额外获得 2 金币；失败、平局无奖励。与其他额外收入叠加，不计入本场结算前余额的利息。 |
| 勤学苦练 | 每场战斗结束额外获得 1 经验，胜、负、平局都触发；当前合计每场 3 经验，正常处理连续升级。 |
| 复苏之风 | 每次战斗胜利恢复 3 点玩家生命，最高 100；失败、平局不治疗。 |

非战斗特殊商店不触发以上奖励。所有奖励只随战斗结算发放一次；结算后读档不会重复发放。1-1 选择后仍保持整关普通商店禁用，1-2 开放，现有商店区域弹出动画继续生效。

升级前尚未选择的旧存档保留原来已经展示的三个选项；已经选择的旧存档保留原效果。没有开局奇遇的离线模拟保持原规则。

## 实现入口

- `assets/resources/config/run.json`：`victoryGold: 2`、`battleExp: 1`、`victoryHeal: 3`。
- `OpeningEncounter.ts`：六个 ID、效果文案、不重复抽样。
- `RunSession.ts`：独立种子流 `encounter / 1 / 4100`、候选校验及选择、实际战后奖励。
- `ShopSave.ts`：候选顺序和新选择存档；旧存档候选兼容。
- `BattleStage.ts`：只将当前存档中抽到的三个候选交给奇遇面板。

## 本次验证

- TypeScript 类型检查通过。
- `tests/opening-encounter-tests.cjs`：原三个奇遇、1000 个种子的唯一候选与全部 20 种组合、读档、旧存档、未展示选项拒绝、新奖励胜负平局边界、利息顺序、生命封顶、重复结算及 UI 回调检查通过。
- `tests/run-session-tests.cjs`：12 项通过；`tests/regression-tests.cjs`：75 项通过。
- `tests/ui-interaction-tests.cjs`、`tests/stage-progression-tests.cjs`、`tests/shop-dock-popup-tests.cjs` 通过。
- 真实 Cocos 浏览器预览（1280×720）：三个新奇遇均经鼠标点击选择，读档后结算，金币、经验和生命与 HUD 一致；确认三张卡片文案完整、普通商店隐藏、弹出动画和商店购买/奖励选择衔接正常，无页面运行异常。
- 浏览器使用独立临时存储、固定种子及强制结束战斗建立验证场景；不代表完整自然通关。本次未执行构建或真机验证。

复跑新增内容预览：`tools/verify-opening-expansion-preview.cjs`；完整商店弹出衔接：`tools/verify-shop-dock-popup-preview.cjs`。依赖不在默认路径时设置 `ENCOUNTER_PLAYWRIGHT`。

本地证据：`docs/evidence/opening-expansion/browser-acceptance.json`，以及 `01-new-choices.png`、`02-study-result.png`、`02-bounty-result.png`、`02-renewal-result.png`、`03-mixed-pool.png`。
