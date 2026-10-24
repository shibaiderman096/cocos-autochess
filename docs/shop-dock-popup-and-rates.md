# 商店占用面板弹出动画与特殊商店概率

2026-10-24。棋子范围按本次用户确认：特殊商店仍只出售专属棋子。

## 行为

- 特殊商店商品价格：普通装备 6 金币、转职装备（万象共鸣徽记）10 金币；旧档的 3／8 金币报价在读取时更新为 6／10，商品及购买状态保留、不补扣金币。价格调整不会导致旧战役档案失效。
- 开局奇遇、特殊商店、原装备选择奖励、徽记羁绊选择占用底部商店时，播放 0.28 秒的上移、缩放及淡入动画，最终保持原面板尺寸和坐标。购买或刷新重建节点时沿用动画进度，同一内容不会重复弹出；关闭和销毁时停止动画，防止更新已销毁节点。
- 特殊商店每一格共用普通商店的 `shopCostRates` 与 `rollShopCost`，按进入时的当前等级与可抽库存计算费用概率。该费用档有未售罄的专属棋子才显示棋子；否则显示装备，不把唯一的 5 费档重新归一化为 100%。普通棋子不进入特殊商店。
- 当前专属棋子黑星咒术师、奥瑞斯均为 5 费：1～6 级为 0%，7/8/9/10 级每格分别为 1%/3%/15%/25%。其他费用档显示装备。
- 棋子同名可重复，与普通商店一致；每格各限购一次，商品数量不超过可用库存。装备继续保持不同。购买的扣款、获得一张、成功后本局解锁、备战席满后入仓、存档与新局重置保持原流程。已保存的商品不重抽。

## 入口

- `assets/scripts/ui/ShopDockPopup.ts`：统一动画、进度复用与清理；`BattleUI.ts`、`StageRewardPanel.ts` 为消费者。
- `assets/scripts/core/ShopConfig.ts`：共用费用抽取；`ShopSystem.ts`、`StageProgression.ts` 为普通与特殊商店消费者。
- `BattleStage.ts`：羁绊面板刷新时保留当前动画状态，并在销毁时清理。

## 验证

- `tests/special-shop-rate-tests.cjs`：10 个等级各 2,000 个种子、10,000 格，总计 100,000 格。按同一费用掷点逐格核对普通商店概率；验证零概率、专属名单、费用档耗尽、同名商品、存档和实际扣池。
- `tests/shop-dock-popup-tests.cjs`：动画中途重建节点继续同一进度、首次进入、新内容进入、关闭清理和禁止访问旧节点。
- `tests/special-shop-unlock-tests.cjs`、`tests/ui-interaction-tests.cjs`、`tests/opening-encounter-tests.cjs`、`tests/stage-progression-tests.cjs`、`tests/stage-reward-validation-tests.cjs`、`tests/soul-lamp-and-overdrive-tests.cjs` 通过。
- 普通商店 127 项、主回归 75 项、RunSession 12 项通过；TypeScript 与资源引用检查通过。
- `tools/verify-shop-dock-popup-preview.cjs`：实际 Cocos 浏览器预览，逐帧观察四种面板的中间位移、缩放和透明度；在动画中每 35 毫秒刷新界面，进度仍连续。鼠标选择奇遇、购买专属棋子、领取装备、选择羁绊均通过；普通商店无重叠显示，浏览器脚本错误 0。
- 预览通过受控跳关和旧装备奖励夹具建立场景，未进行自然通关、发布构建或真机验证。

截图与结构化逐帧结果：`docs/evidence/shop-dock-popup/`。`02-merchant-entering.png` 为动画途中，`03-merchant-purchased.png` 为购买后，`04-trait-choice.png` 为羁绊面板；`browser-acceptance.json` 包含原始采样。

引擎用法已通过 Context7 查询 Cocos Creator 3.8 官方 Tween 文档，动画关闭采用按目标停止，不停止其他界面动画。
