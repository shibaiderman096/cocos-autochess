# 正式棋盘：3D 默认动效、斜俯视、滚轮缩放与备战席

2026-10-21，Cocos Creator 3.8.8 / Blender 5.2.2 LTS。

本轮直接更新正式棋盘的运行时显示组件。`main → floating-ruins` 入口保留，没有新建测试场景。`assets/floating-ruins.scene` 与开工备份的 SHA-256 相同，模型和镜头由组件初始化。

## 交付行为

- 移除旧 2D 棋盘图片、网格底色绘制和 2D/3D 按钮。旧 `setVisualMode('2d')` 调用也不能重新开启退役背景；棋子、高亮、血条和技能仍使用原有 2D 操作层。
- 默认启用 3D、高画质、播放状态；绑定现有模型的全部 17 个枢轴。保留高/低/静态与暂停/继续。
- 固定 45° 斜俯视正交相机，继续使用 1024×768 RenderTexture。
- 鼠标置于棋盘中央可滚轮缩放，向上放大、向下缩小。界面显示约 76%～114%，默认 100%；实际父节点缩放为 0.64～0.96，默认 0.84。点击“滚轮/复位”回默认。
- 缩放统一作用于 RT、棋子、高亮、效果和输入坐标转换；全局 UI 不随棋盘缩放。侧栏、商店、页头、弹窗及拖拽中禁止改变缩放。监听器可重复启停，退出销毁时注销。
- 新增石质倒角、古铜腰带、青绿印记组成的模块化 3D 备战席。按存档槽位数实例化，默认 9 格；1/9/12 格坐标均经过自动检查。

棋盘节点从 `(0,60)` 调整到 `(0,50)`，缩放范围在浏览器检查后收紧。初版扩大视角会使后排接近顶部 UI；最终边界以实际截图验证。放大时外围拱门仍可能被页头遮住，这是装饰范围，不代表所有外围模型都已适配全部 UI。

## 投影与游戏逻辑

`BoardGeometry`、`HexMath`、Grid、战斗核心、配置数值、经济和存档格式均未编辑。保留原始 7×8 odd-r 逻辑、56 个地砖及其原始模型顶点。

历史 `BoardProjectionAdapter` 的地面契约保持不变。新增 `BoardPresentation` 把其显示平面转换至新相机：`x'=x`，`y'=y·sin(45°)/0.6`。点击反向转换后再交给原几何命中；高亮使用同一个正向转换。父节点的统一缩放由现有 `convertToNodeSpaceAR` 自动逆变换。棋子保持等比缩放，不拉伸立绘。

备战席中心由同一个 `benchGroundPoint` 生成：间隔 0.7125 米，地面 `z=(boardPixelH/2+25)/60`。3D 模块、棋子与槽位命中共用该位置。环境光芒叠层使用新相机投影，动画计时仍与战斗 Tick、倍速和 RNG 隔离。

## 模型交付和 QA

| 项目 | 实测结果 |
|---|---|
| 可编辑源 | `art-source/ruins-bench/ruins-bench.blend`，238,573 字节 |
| GLB | `assets/resources/models/ruins-bench/ruins-bench.glb`，20,712 字节 |
| 一个模块 | 3 mesh / 3 primitive / 3 共享材质 / 232 三角面 |
| 默认九格 | 2,088 三角面，最多增加 27 个模型 primitive/绘制遍数 |
| 纹理、骨骼、动画 | 均为 0；材质直接使用可导出的 PBR 参数 |
| UV | 每个 mesh 一套；QA 零面积、越界、重叠均为 0 |
| 拓扑与法线 | 无破面、非流形边、反向岛、退化面、重复点和 z-fighting 错误 |
| 变换 | scale 均为 `(1,1,1)`；GLB 重新导入尺寸与源模型一致 |
| Blender QA | `pass:true`，`errors:[]` |

接受两项 QA 警告：石座平面顶底各有一个不变形 n-gon；最低点 -0.22 米。原点刻意位于棋子站立的顶面，底部向下接入浮岛，因此不使用地面底部原点。保留可编辑 Bevel 修改器；GLB 使用实际求值后的几何。

使用 blender-core、blender-scene-setup、blender-hardsurface-modeling、blender-export-pipelines、blender-asset-qa。最初 Blender MCP 未连接；后台启动 Blender 后成功连接并执行建模、QA、导出和重新导入。初次导出检查发现跨场景带入默认 Cube，已限定活动场景重新导出，最终 GLB 仅有上述三个命名 mesh。源工程仅含 `RuinsBench` 一个场景。

![备战席材质检查](evidence/board-oblique-zoom-bench/bench-material.png)

![备战席线框检查](evidence/board-oblique-zoom-bench/bench-wire.png)

## 真实测试结果

| 检查 | 结果与证据 |
|---|---|
| `npm run check:resources` | PASS，176 张登记贴图/SpriteFrame；`resources.log` |
| `npx tsc --noEmit -p tsconfig.json` | PASS，退出 0；`typecheck.log` / `typecheck.exit.txt` |
| `npm test` | PASS，73 suites，0 failed；其中舞台回归 74 项通过；`npm-test.log` |
| 新投影专用测试 | PASS，五档缩放共 1,960 个模型中心/角点样本，最大误差 0.00001209565 px，阈值仍为 0.001 px；`board-presentation.json` |
| 输入与生命周期 | PASS，20 次监听启停/去重；拖拽锁定、侧栏/商店及弹窗过滤、无效数值、缩放上下限；同一专用测试 |
| 既有环境动画 | PASS，20 次绑定/画质/暂停/恢复/销毁测试，原历史模型契约仍通过 |
| `npm run build:web` | PASS，正式网页包实际包含新备战席 Prefab，已不包含旧棋盘 bitmap；`build-web.log` / `build-inclusion.json` |
| 最终包浏览器 | PASS，1280×720，`assets/main/index.08577.js`；不是旧包或仅编辑器截图 |
| 浏览器地砖校准 | 9 次实际相机校准，各 56 中心 + 336 角点；最大中心误差 0.00001683997 px、角点 0.00001814347 px，原 0.5 px 运行时阈值未放宽 |
| 浏览器交互 | 滚轮两端、侧栏滚轮隔离、复位、最大档拖回备战席、最小档上阵、low/off/high、暂停恢复均完成 |
| 战斗与重新进入 | 1-1 战斗、血条/护盾/伤害文字、结算宝箱、领取进入 1-2、回菜单再继续均完成；两次模型载入均 17 枢轴 + 1 叠层、9 个备战席模块 |
| 控制台 | 最终验收过程捕获的 warning / error 均为 0；`browser-console.json` |

初次全测 72 suites 通过、1 suite 失败，完整日志保留在 `npm-test-initial.log`。原因包括旧舞台替身缺少新增的 `benchPosition` 接口；更新替身投影后，回归另暴露备战席靠近出售区的问题，已移动备战席、调整显示边界并重跑全部测试。最终日志没有以旧结果代替新验收。

![默认镜头](evidence/board-oblique-zoom-bench/01-default.jpg)

![最大放大档的备战席棋子](evidence/board-oblique-zoom-bench/02-maximum-bench.jpg)

![最小缩放档](evidence/board-oblique-zoom-bench/03-minimum-bench.jpg)

![战斗中效果](evidence/board-oblique-zoom-bench/07-battle.jpg)

![再次进入后恢复默认动效](evidence/board-oblique-zoom-bench/10-reentered.jpg)

## 文件清单与保护

- 新增 `assets/scripts/view/BoardPresentation.ts` 及 meta：纯显示投影、缩放范围、共享备战席布局。
- 更新 `BoardView.ts`：取消 2D 背景创建，显示投影与逆命中，备战席坐标。
- 更新 `FloatingRuinsBoard.ts`：45° 相机、默认 3D、滚轮、复位、模块实例化与销毁、实际相机校准。
- 更新 `FloatingRuinsEnvironmentAnimator.ts`：注入新相机的叠层投影，不改运动公式。
- 更新 `BattleStage.ts`：显示原点、槽位数、备战席位置委托与拖拽锁；不改战斗和经济行为。
- 更新 `BattleUI.ts` / `ArtPaths.ts`：移除战斗旧绘制与旧棋盘贴图映射；主菜单云海背景保留。
- 新增上述 `.blend` / `.glb` / 导入 meta、`tools/build-ruins-bench.py`、`tests/board-presentation-tests.cjs`。
- 更新七个既有测试文件及 `tools/run-tests.ps1`，匹配新的正式显示契约；未改历史 GLB 测试夹具或历史证据。
- 本报告与 `docs/evidence/board-oblique-zoom-bench/`：模型检查、构建/测试日志、浏览器原始日志和十张最终截图。

开工状态、二进制 Git 差异、将编辑文件的原件和旧 2D 棋盘 PNG/meta 保留在 `D:\cocos\_board-oblique-backup-20261021`。没有 reset、提交或推送。原正式场景字节保持；检查了 17 个已存在的受保护文件差异块，没有新增变更。现用 reference-v1 `.blend` 和 `.glb` 均与本轮开工 SHA-256 相同，见 `protected-state.json`。

## 性能与未完成项

现用棋盘仍为 81 mesh / 81 primitive / 18,596 三角面；加九格备战席后几何预算为 20,684 三角面、模型 108 primitive、共 11 个材质资源。模块共享 mesh/material 资源，但未启用 GPU 实例化，不能宣称只有三个 draw call。

本机 IAB 的画面统计瞬时约 60 FPS：准备阶段约 336～408 draw call，战斗截图约 382，重新进入约 402。计数包含 UI、效果与实际绘制遍数，不能拿模型 primitive 数冒充总 draw call，也不代表低端设备或 Android 达标。后续应在目标设备记录相同阵容下 60 秒的 FPS 中位数/p95 帧耗时、总 draw call、GPU 时间，并单独比较静态/低/高画质；优先检查 UI 与相机重复提交和备战席实例化机会。

- **OPEN**：904×871 窄视口裁切/输入问题，本轮没有复验，也未更改全局 EXACT_FIT 策略。
- **NOT_RUN**：Android 真机、触控捏合、长时性能及低端 Web 设备。
- **OPEN**：放大档外围装饰会延伸到侧栏/页头下；没有宣称全装饰跨视口安全验证通过。
- **NOT_RUN**：本轮没有重新做全部运动极值下的整场景逐顶点遮挡审计；旧 P2 安全报告属于旧镜头，不能直接作为新镜头验收。

本轮请求的正式 3D、斜俯视、鼠标缩放与备战席功能可交付。后续移动端或更高密度环境美术阶段仍以窄屏输入、安全范围审计和目标设备性能为准入条件。
