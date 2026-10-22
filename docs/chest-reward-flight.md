# 宝箱奖励棋子飞行与粒子追踪

日期：2026-10-21。Cocos Creator 3.8.8；当前正式浮空棋盘入口。新增内容仅为领奖表现。

## 实际行为

点击宝箱，沿用已有 1.1 秒开盖动画。开盖完成后，实际获得的每份棋子使用现有角色图像从箱口飞出，伴随青绿拖尾、金色环绕微粒和箱口爆散，落地时散开金色光点。每份飞行 0.98 秒，依次错开 0.13 秒，落点光点衰减 0.32 秒；两份奖励的整段飞行约 1.43 秒。

落点读取领取后的真实持有棋子：新棋子进入对应备战格；自动合成则飞向最终保留的棋子（也可在棋盘上），最后一份到达后显现并播放已有升星效果；核心保留在奖励仓库中的奖励则飞向现有仓库文字的位置。没有预测奖励、重新掷随机数或自行分配格子。

核心领取与存档先完成，随后播放表现，抵达后进入下一关。飞行期间暂时拦截重复领取、开战、重开和商店输入，暂停关卡自动前进。实际奖励已落盘，飞行中重载不会丢失或再次领取。时间使用表现层帧间隔，不读取战斗 Tick、倍速或模拟 RNG。

粒子为 Cocos UI Graphics 绘制，角色为 Sprite，与现有 2D 操作层一致；没有增加 Blender 动画、GLB、贴图、共享材质写入或物理系统。落点逐帧从实际节点转换坐标，兼容棋盘缩放。完成、停用、场景销毁均回收飞行节点并恢复接收棋子的原透明度，延迟资源回调不能复活效果。

## 本轮文件

| 文件 | 用途 |
| --- | --- |
| `assets/scripts/view/ChestRewardFlight.ts` 及 `.meta` | 飞行、粒子、落地与清理 |
| `assets/scripts/view/RewardDeliveryPlan.ts` 及 `.meta` | 根据实际领取前后快照确定落点 |
| `assets/scripts/view/ShopVisitor.ts` | 提供真实箱口投影位置 |
| `assets/scripts/view/BattleStage.ts` | 领取后调用表现，抵达后推进关卡 |
| `assets/scripts/ui/BattleUI.ts` | 暴露已有仓库显示节点 |
| `tests/chest-reward-flight-tests.cjs` | 落点、缩放跟踪、透明度、清理测试 |
| `tests/regression-tests.cjs` | 实际 Stage/RunSession 领取、保存、重入及推进测试 |
| `tests/stage-advance-ui-tests.cjs` | 补齐旧夹具的奖励列表和表现边界 |
| `tools/run-tests.ps1` | 注册新增测试组 |
| `docs/evidence/chest-reward-flight/` | 本轮真实测试日志、截图与 GIF |

原工作树已有大量未提交修改；上表只描述本轮追加功能，不将此前差异作为本轮成果。操作前备份在 `D:/cocos/_chest-reward-flight-backup-20261021/`，并追加备份修改过的旧测试夹具；未执行 reset、提交或推送。

## 校验记录

| 检查 | 结果及证据 |
| --- | --- |
| `npm run check:resources` | PASS；175 贴图/SpriteFrame、27 棋子、30 怪物；`resources.log`，退出 0 |
| `npx tsc --noEmit -p tsconfig.json` | PASS；`typecheck.log`，退出 0 |
| 专用飞行测试 | PASS；实际奖励/合成目标、仓库分支、动态落点、粒子数量上限、共同接收者、20 次清理、迟到资源回调；`flight-tests.log` |
| Stage 回归 | PASS；75 项，0 失败；`regression-final.log`；含实际领取立即保存、重复操作阻止、抵达才推进、重载不重领 |
| 关卡推进测试 | PASS；`stage-advance-final.log` |
| 首次 `npm test` | FAIL；77 组通过，1 组失败。旧 `stage-advance-ui-tests` 夹具缺少真实奖励数据 `units`，同时只抽取旧方法。保留原始 `npm-test.log` 和退出 1；已补齐夹具与新方法边界，未放宽断言 |
| 修复夹具后 `npm test` | PASS；78 组通过、0 失败，退出 0；`npm-test-final.log` 和 `npm-test-final.exit.txt` |
| `npm run build:web` | PASS；退出 0，实际生成 `build/web-desktop`，`build-web.log` 与 Creator 原始日志 |
| 保护文件 SHA256 | PASS；主场景、StageProgression、RunSession、OwnedUnits、BoardGeometry 和宝箱 GLB 六项前后完全相同；`protected-before.json` / `protected-after.json` |

自动化表现测试使用最小 Cocos 边界替身；不能代替以下真实浏览器操作。静态棋盘几何和投影实现未改动，未新增 392 点网页校准验收。

## 实际网页验证

访问本次新构建 `http://127.0.0.1:8765/`，1280×720，脚本来自 `assets/main/index.e00bc.js`。使用隔离测试存档和游戏内 Debug 菜单准备战斗，没有修改用户存档或通过隐藏状态调用跳过流程。

1. 实际完成 1-1 怪物战，点击场上的宝箱。两份角色图像从打开的箱口飞出，带拖尾进入两个真实备战格；抵达后棋子显现，进入 1-2。控制台实际记录开盖完成至飞行开始约 4ms，飞行开始至结束 1.430s。证据：`01-before.jpg`、`flight-00..16.jpg`、`02-landed.jpg`。
2. 填满九个备战位，实际完成 1-2。点击宝箱，本次奖励触发自动合成，飞向最终保留的对应棋子，落地后出现 2★，进入 1-3。飞行约 1.446s。证据：`03-full-bench.jpg`、`04-full-before-claim.jpg`、`full-flight-00..16.jpg`、`05-full-landed.jpg`。本例实际发生合成，不能视为仓库分支的网页证明。
3. 两轮领取均无浏览器 error。合成时出现已有 `LabelOutline.color/width` 弃用警告，共四条，未掩盖，见 `browser-warnings-errors.json`。时间和脚本来源见 `browser-animation-log.json`。

![实际网页领奖飞行](evidence/chest-reward-flight/reward-flight-browser.gif)

![满席合成落点](evidence/chest-reward-flight/reward-merge-browser.gif)

GIF 由原生网页截图按记录间隔合成，约每 0.29 秒采样一次，末帧停留用于查看结果；不是游戏 FPS 测量，没有生成中间帧。完整原始截图和采样时间 JSON 一并保留。

## 成本与未完成范围

新增一个 Graphics 和每份奖励一个角色 Sprite，固定数量解析微粒；每个在途角色最多 19 个圆形，箱口短时额外 14 个，落地每份最多 10 个。节点只在开播时创建，结束销毁；无逐帧节点生成和残留发射器。截图中性能面板数字仅为瞬时读数，本轮没有稳定采样或低端设备基准，不宣称 FPS/draw call 达标。

- OPEN：备战席满且无法合成时，奖励飞向仓库的真实网页流程；该分支已有专用自动化覆盖。
- NOT_RUN：Android 真机、触屏、低端设备性能、显存持续采样、飞行期间实时滚轮缩放的网页交互。动态目标追踪已由专用测试覆盖。
- OPEN：历史 904×871 窄视口裁切与输入问题，本轮未更改全局 UI 缩放。
- 构建日志仍含项目日志写入/Chromium 缓存访问权限、插件检查 403、压缩配置回退及 BattleUI/TraitPanel 循环依赖提示；构建最终完成且新 Web 包实际运行，原始诊断保留在 `creator-build.err.log`。

可交付当前 Web 领奖表现；设备与仓库分支的真实交互验收仍需补充，不作为全平台验收通过。
