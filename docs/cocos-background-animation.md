# Cocos 原生背景循环动画

2026-10-21，在当前正式浮空遗迹棋盘中接入 **17 个 Cocos AnimationClip**，可作为原生资源在 Creator 动画编辑器中继续编辑。模型变换不再依靠运行时正弦公式逐帧生成，改为 Cocos 自身插值、按独立环境时间绝对采样剪辑。保留原来的 45° 透视镜头、滚轮缩放、备战席、2D 棋子与操作层。

本轮通过 Cocos MCP 调用 Creator 原生 API 创建、序列化、导入并实际采样资源；**没有完成 Animation 面板的人工打开、时间轴拖动和关键帧修改验收**。后续工具列表中 Cocos MCP 已不可用，原生桌面 UI 控制也未提供；不将资源导入与引擎采样结果冒充面板操作证据。

## 可编辑交付与使用

- 背景预制体：`assets/resources/backgrounds/RuinsBackground.prefab`，UUID `a2e0876c-b32d-4e34-9f78-983571fd5370`。
- 剪辑目录：`assets/resources/animations/ruins-background/`，17 个 `.anim` 及 Creator 导入生成的 `.meta`。
- 预制体保留原模型的 99 节点、56 块独立静态地砖与 17 个实际 PIV。网格和材质引用既有 GLB 导入资源，没有复制或重写 GLB。
- 在 Creator 资源管理器打开上述预制体，选择一个 `PIV_*` 节点，其 Animation 组件的 Clips 和 Default Clip 已绑定同名剪辑。打开“动画”面板，在该节点选择同名剪辑，即可继续编辑位置或旋转关键帧。完成后保存剪辑/预制体，再预览游戏。此路径是使用说明，面板交互本轮仍为 NOT_RUN。
- `playOnLoad=false` 是有意设置：游戏统一管理暂停、关闭和重新进入，避免自动播放与绝对时间采样争夺变换。编辑时使用动画面板预览，不要为了游戏播放改为自动播放。
- 原始静态姿态保留在预制体中；关闭效果恢复捕获的初始 PRS。晶石剪辑在原始 Y 上额外抬升 0.12m，再叠加浮动，沿用已有环境动效的基准。

| 剪辑/枢轴 | 秒/周期 | 轨道与范围 |
|---|---:|---|
| PIV_RuneRing_00 | 18 | eulerAngles.Y：0→360°，线性 |
| PIV_RuneRing_01 | 26 | eulerAngles.Y：0→-360°，线性 |
| PIV_RuneRing_02 | 36 | eulerAngles.Y：0→360°，线性 |
| PIV_Crystal_L_0_Main / Shard | 3.5 / 3.714286 | position，幅度 0.05 / 0.057143m |
| PIV_Crystal_L_1_Main / Shard | 3.928571 / 4.142857 | position，幅度 0.064286 / 0.071429m |
| PIV_Crystal_R_0_Main / Shard | 4.357143 / 4.571429 | position，幅度 0.078571 / 0.085714m |
| PIV_Crystal_R_1_Main / Shard | 4.785714 / 5 | position，幅度 0.092857 / 0.10m |
| PIV_FloatingRock_L_00 / 01 / 02 | 6 / 6.8 / 7.6 | position + quaternion rotation |
| PIV_FloatingRock_R_00 / 01 / 02 | 8.4 / 9.2 / 10 | position + quaternion rotation |

晶石相位按 0、π/4…7π/4 错开；浮石浮动幅度 0.035～0.06m、轻微倾斜 2～3.25°，没有刚体。符文环每轨道首尾两个关键帧；浮动剪辑每轨道 65 个关键帧、64 段线性逼近。全部 Loop、speed=1、sample=60，无动画事件和嵌入播放器。旋转 0/360° 的四元数符号可能相反，但姿态等价。

`enableTrsBlending=false` 使直接采样立即写入节点，关闭后不会被混合缓存再次写回。运行时每次取得当前有效 AnimationState，以处理非激活预制体首次激活时 Cocos 重建状态的情况。正式资源严格要求 17 个剪辑完整；旧模型夹具仍可使用历史公式兼容路径，正式加载不使用该回退。

晶石呼吸光点、符文能量弧和少量环境微粒继续使用已有低成本 Graphics 叠层，**未转成动画编辑器轨道**；未修改共享 PBR 材质，也未增加纹理、灯光、物理或独立粒子发射器。

## 修改文件与保护范围

| 文件 | 用途 |
|---|---|
| `assets/resources/backgrounds/RuinsBackground.prefab` 及 `.meta` | 原生可编辑背景与 17 个 Animation 组件 |
| `assets/resources/animations/ruins-background/PIV_*.anim` 及 `.meta` | 上表全部 17 个同名剪辑，完整逐文件字节数和 SHA256 见证据清单 |
| 对应 resources 子目录 `.meta` | Creator 导入目录标识 |
| `assets/scripts/view/FloatingRuinsBoard.ts` | 加载背景预制体，严格绑定剪辑 |
| `assets/scripts/view/FloatingRuinsEnvironmentAnimator.ts` | 原生剪辑绝对采样、暂停/关闭/销毁、实际姿态叠层投影、诊断 |
| `tools/author-ruins-animation.cjs` | Creator 场景进程原生剪辑创建工具，拒绝覆盖已有剪辑 |
| `tools/assemble-ruins-animation-prefab.cjs` | 加载实际模型和剪辑，生成带原生 Prefab 元数据的背景，拒绝覆盖 |
| `tools/verify-ruins-animation.cjs` | Creator 原生 AnimationState 多周期采样校验 |
| `tests/cocos-background-animation-tests.cjs` | 资源结构与生命周期回归 |
| `tools/run-tests.ps1` | 纳入新专用测试 |
| `docs/cocos-background-animation.md`、`docs/evidence/cocos-background-animation/` | 本轮报告、日志和截图 |

三份 author/assemble/verify 工具需要在 Creator 场景进程通过 MCP 调用，参数含引擎 `cc`，不是普通 Node 命令。前两份工具用于初建，不要对已有人工作品重新生成；修改已有关键帧应在 Creator 中保存。

开始前保留 `D:/cocos/_cocos-background-animation-backup-20261021/` 中的工作树状态、既有 tracked diff 和本轮涉及的关键已有文件副本；并非整个项目文件镜像。当前工作树本来存在大量未提交文件与删除，本轮未 reset、提交或推送。

正式 `assets/floating-ruins.scene`、`BoardGeometry.ts`、`BoardProjectionAdapter.ts` 和正式参考 GLB 的 SHA256 与上一轮留存基线一致，见 `protected-comparison.json`。本轮未编辑 Blender、模型网格、战斗公式、棋子配置、经济或存档格式。原始 GLB SHA256：`657EC372A4A0A325C461E98EEEEE0C3A4D69E1C51312993D508D312626F78379`。

## 实际验收

| 检查 | 结果与证据 |
|---|---|
| Creator 原生资源创建/导入 | PASS，17 个原生 AnimationClip 与背景 Prefab；`authored-clips.json`、`asset-manifest.json` |
| Creator 实际多周期采样 | PASS，17×1,025＝17,425 次，每剪辑四个完整周期；`creator-clip-qa.json` |
| 运动误差 | 最大位置误差 0.0001203093m，最大旋转误差 0.0000683531rad；位置阈值 0.00013m、旋转阈值 0.00025rad（对历史连续公式的离散逼近校验） |
| 循环/地砖 | PASS，17 个循环端点姿态等价，56 块静态地砖 PRS 未变；与上行同一原生采样证据 |
| 资源检查 | PASS，176 张登记贴图/SpriteFrame；`resources.log` |
| TypeScript | PASS，退出 0；`typecheck.log`、`typecheck.exit.txt` |
| 完整回归 | PASS，74 suites、0 failed；`npm-test.log`、`npm-test.exit.txt` |
| 新专用测试 | PASS，17 剪辑/预制体绑定、56 静态地砖、20 次暂停/关闭/重进生命周期、激活后状态重建、缺失剪辑拒绝；包含在完整回归 |
| 网页构建 | PASS，退出 0；`build-web.log`、`build-web.exit.txt`，实测包 `assets/main/index.e74bd.js` |
| 正式网页实际消费者 | PASS，1280×720，日志模型路径 `backgrounds/RuinsBackground`，driver=`cocos-animation-clip`，clips=17，bound=17，overlays=1 |
| 网页暂停/画质/关闭 | PASS，高→低→关闭→高、暂停→继续；暂停阶段姿态完全一致；关闭后全部 17 枢轴位置和旋转与 GLB 原始基准完全一致；`browser-validation.json`、`browser-off-restore.json` |
| 网页持续运行/重进 | PASS，首轮环境时间达到 116.9329s，超过最长环三周期；菜单退出再继续后 17 剪辑/1 叠层、时间归零。接缝精确性由上述原生密集采样证明，未声称逐帧人工观察所有周期 |
| 新包实际相机投影 | PASS，6 次×392＝2,352 点，缩放 0.64～0.90、复位 0.84；最大中心误差 0.0000137945px，角点 0.0000153652px，运行时阈值仍 0.5px；`browser-console.json` |
| 自动投影检查 | PASS，完整回归含既有五档×392点检查，阈值仍 0.001px |
| 拖拽/战斗基本流程 | PASS，备战席 0 号拖到棋盘，首战伤害 175 并领取到 1-2；重进后第二战胜利、伤害 350，血条、飘字和统计可见。未覆盖所有技能特效 |
| 浏览器控制台 | 采集窗口内 warning=0、error=0；初次进入前的启动日志未捕获，重进已捕获加载与校准证据 |
| Animation 面板人工编辑/预览 | NOT_RUN，工具不可用，不能把引擎 API 采样当作编辑器面板操作 |

初次原生 QA 发现浮石四元数曲线的赋值格式不正确，已用 Creator 原生 QuatCurve 重新写入六份本轮新剪辑并复测通过；生成工具同步纠正为 `{value: Quat}`。原始失败证据 `creator-clip-qa-initial.json` 保留，最终结果为 `creator-clip-qa.json`，没有删除失败记录。

构建器日志另外含项目日志文件 EPERM、插件更新 HTTP 403 和 `BattleUI ↔ TraitPanel` 循环依赖告警，原始日志见 `creator.log` / `creator.err.log`。构建成功和网页采集窗口零告警不代表这些构建提示已解决。

## 网页截图

以下均为本轮新网页包实际截图；静态图片用于布局与状态证据，动画曲线/循环验收另见原生采样与运行时日志。

![原生背景与备战席](evidence/cocos-background-animation/01-default.jpg)

![拖拽上阵后的棋盘](evidence/cocos-background-animation/04-deployed.jpg)

![重进后第二场结算与飘字](evidence/cocos-background-animation/08-second-settlement.jpg)

另有 `02-paused.jpg`、`03-off.jpg`、`05-battle.jpg`（准备倒计时）、`06-combat.jpg`（首战结算）、`07-reentered.jpg`，文件名不表示已经捕获所有战斗技能帧。

## 成本与未完成项目

新增 17 个 Animation 组件、23 条变换轨道、17 个小型剪辑，沿用现有模型网格/材质和单个 Graphics 叠层；完整新增资源尺寸见 `asset-manifest.json`。高/低画质叠层更新分别约 30/15Hz，微粒预算 16/4，关闭为 0；变换采样随渲染更新，独立于战斗 Tick、倍速和 RNG。

截图统计层在不同战斗/准备帧显示过约 262～406 draw calls、瞬时约 52～60 FPS；这只是桌面浏览器即时观察，含棋子/UI/RT等整场景开销，不能归因于 17 个剪辑，也不能宣称移动端达标。应固定单位数、相机、分辨率，对 high/low/off 各录制至少 60s 的 CPU/GPU 帧时间、平均/P95/P99 与 draw calls，再考虑合批静态装饰、减少透明叠层及网格拆分；不得合并需要独立动画的 PIV 层级。

- **NOT_RUN**：Animation 面板人工编辑和预览；需在 Creator 中完成最后的时间轴操作验收。
- **OPEN**：904×871 窄视口裁切与输入，全局 UI 缩放策略保持现状。
- **NOT_RUN**：Android 真机性能、长时间 FPS/GPU/内存和压力测试。
- **OPEN**：当前 45° 透视镜头下所有外围模型顶点在全部运动极值/中间采样的屏幕安全范围；本轮剪辑保持原运动范围，但不能替代逐顶点复验。
- **NOT_RUN**：全部技能特效的视觉回归。基本血条、飘字、拖拽与两场结算已观察。
- **自动测试 PASS / 网页 NOT_RUN**：2D/3D 往返还原；当前正式界面已按用户要求移除 2D 模式入口，未为验收重新添加旧棋盘。

本轮可交付原生剪辑资源和网页运行接入；编辑器面板人工验收与上述遗留项尚未完成，不作为完整性能或全场景发布准入通过结论。
