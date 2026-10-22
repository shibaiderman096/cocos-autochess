# 浮空棋境 P2：浮空遗迹环境循环动效

日期：2026-10-20。项目 `D:\cocos\NewProject`，Cocos Creator 3.8.8。

**交付状态：独立 P2 环境动效与网页预览已实现；P3 准入 HOLD。** 本次新写控制器和预览，没有修改 P1 模型、正式入口、游戏配置、战斗公式、经济或存档格式。Android、真实 draw call/FPS、窄视口修复及正式包 P2 入口仍未完成。附图只作为晶石、符文气氛参考，没有按图重新设计棋盘。

## 1. 起点、备份与保护

已读取 P0、P0.5、P1 报告、当前 P1 GLB 节点、独立预览和投影实现。P1 历史准入为 HOLD；本次依据用户明确的新 P2 请求交付独立动效，未将旧 HOLD 改成通过。

起点 HEAD 为 `db4b4efbed30d72911d2634bed989056a75179e0`，工作树原有大量未提交内容。保存了 status、HEAD、工作区/索引补丁、3,056 个原有文件的路径/大小/SHA-256 和完整归档。

- 有效备份：[worktree-snapshot-complete.tar](evidence/floating-ruins-p2/worktree-snapshot-complete.tar)，769,986,560 B；归档重新打开后，**全部 3,056 个条目逐一核对 SHA-256**。[备份结果](evidence/floating-ruins-p2/backup-complete-result.json)。不包含 ignored 的 node_modules、library、temp、build 和 Git 内部数据库。
- Windows tar 首次遇到中文路径转换错误，失败归档 `worktree-snapshot.tar` 仅保留诊断，**不是有效备份**。随后使用 UTF-8 PAX 归档完成备份，未覆盖用户文件。
- [起点哈希](evidence/floating-ruins-p2/baseline-hashes.json)、[最终保护报告](evidence/floating-ruins-p2/protection.json)：3,056 个原有文件变化 **0**。包括正式 `assets/scene.scene`、BoardGeometry、BoardProjectionAdapter、HexMath、Grid、BattleStage、P0/P0.5/P1 文档/模型/证据和所有原配置。
- 没有 reset、提交、推送或修改全局 UI 缩放配置。

## 2. 实际模型与绑定

直接解析 `assets/resources/models/floating-ruins-p1/floating-ruins-p1.glb` 的 glTF JSON、顶点、索引和层级；没有凭空拼接 PIV 名称。绑定表生成自真实节点，运行时要求全部 17 个唯一存在、非空，验证完整后才开始动画；缺失、重复或多余 PIV 会拒绝绑定。

GLB SHA-256：`36ac5159f66f8cb7bfec7c77495d6486add4094ad478b5931e27a99304046865`。

| 分组 | 真实节点 | 周期（秒） | 振幅 / 方向 |
|---|---|---:|---|
| 环 | `PIV_RuneRing_00` | 18 | local Y 正向匀速 |
| 环 | `PIV_RuneRing_01` | 26 | local Y 反向匀速 |
| 环 | `PIV_RuneRing_02` | 36 | local Y 正向匀速 |
| 晶石 | `PIV_Crystal_L_0_Main` | 3.500000 | ±0.050000 m |
| 晶石 | `PIV_Crystal_L_0_Shard` | 3.714286 | ±0.057143 m |
| 晶石 | `PIV_Crystal_L_1_Main` | 3.928571 | ±0.064286 m |
| 晶石 | `PIV_Crystal_L_1_Shard` | 4.142857 | ±0.071429 m |
| 晶石 | `PIV_Crystal_R_0_Main` | 4.357143 | ±0.078571 m |
| 晶石 | `PIV_Crystal_R_0_Shard` | 4.571429 | ±0.085714 m |
| 晶石 | `PIV_Crystal_R_1_Main` | 4.785714 | ±0.092857 m |
| 晶石 | `PIV_Crystal_R_1_Shard` | 5.000000 | ±0.100000 m |
| 浮石 | `PIV_FloatingRock_L_00` | 6.0 | ±0.035 m，X/Z ±2° |
| 浮石 | `PIV_FloatingRock_L_01` | 6.8 | ±0.040 m，X/Z ±2.25° |
| 浮石 | `PIV_FloatingRock_L_02` | 7.6 | ±0.045 m，X/Z ±2.5° |
| 浮石 | `PIV_FloatingRock_R_00` | 8.4 | ±0.050 m，X/Z ±2.75° |
| 浮石 | `PIV_FloatingRock_R_01` | 9.2 | ±0.055 m，X/Z ±3° |
| 浮石 | `PIV_FloatingRock_R_02` | 10.0 | ±0.060 m，X/Z ±3.25° |

表中小数为显示舍入，代码及[精确参数](evidence/floating-ruins-p2/animation-parameters.json)保留完整精度。晶石依次相差 π/4 相位，浮石依次相差 π/3。晶石原点确在底部；浮石原点位于网格内部，不能把两组都当作底部原点。三个环以椭圆中心为原点，旋转轴为 glTF/Cocos Y，半径直接取各自导出网格：约 3.92×2.48、3.87×2.40、3.81×2.32 m。[真实节点、索引和初始变换](evidence/floating-ruins-p2/actual-glb-bindings.json)、[顶点边界与枢轴检查](evidence/floating-ruins-p2/p2-tests-result.json)。

## 3. 动画、材质和生命周期

`FloatingRuinsEnvironmentAnimator` 独立拥有 17 个绑定和一个 `floatingRuinsP2Overlay` 节点。绑定前先恢复旧状态、移除旧叠层，再捕获实际初始 local position/quaternion/scale。每帧从这份基准和绝对时间重新计算位置、四元数和缩放；没有读取当前变换再追加位移/旋转。

- 环角度为 `±2π × ((t % period) / period)`；没有缓入缓出。跨缝四元数可能变号，旋转结果连续，测试比较的是等价姿态。
- 晶石在初始位置上增加 `0.12 + amplitude × sin(...)` 米高度。0.12 m 为固定抬升，防止底部穿入原基座，关闭后仍精确恢复原位。光芒呼吸权重为 0.22～0.34，对应中心点 8-bit alpha 22～34，外层更低；没有修改 PBR 发光参数、增加实际灯光或开启 bloom。
- 浮石 Y 浮动，local X/Z 用正弦/余弦产生小角度四元数，再乘初始四元数；无刚体、Tween、动画资源或物理依赖。
- 时间来自 `performance.now()` 单调时钟，控制器忽略战斗 dt、Tick、倍速和 RNG。暂停冻结当前姿态；2D、off、禁用和销毁会恢复基准并清除叠层。恢复播放后从暂停的环境时间继续。
- `dispose()` 幂等，恢复 TRS、清空 Graphics、立即摘除旧叠层并销毁。`onDisable/onDestroy` 均负责还原。没有注册全局事件、定时器或粒子发射器，重新绑定不会叠加监听或残留粒子。

能量流是各环平面的短弧采样点，流动周期 7 秒；微粒为固定索引、解析轨迹、渐隐后循环的少量光点。二者与晶石光晕共用一个 Cocos Graphics 叠层，置于 Board 子节点索引 1，RT 背景索引 0，原高亮、单位、血条和技能特效仍在其上。叠层无输入监听。

| 画质 | 模型动画 | 光晕 / 能量流 | 环境光点 | 叠层刷新 |
|---|---|---|---:|---:|
| high | 17 PIV，按正常渲染帧更新 | 双层光晕，环每次 16 点 | 16 | ≤30 Hz |
| low | 相同周期与幅度 | 减层光晕，环每次 6 点 | 4 | ≤15 Hz |
| off | 恢复初始 TRS | 清空并隐藏 | 0 | 0 |

low/off 不会降低 P1 静态网格的提交成本，不能将此表当作整场景 LOD 或性能达标证明。

没有新增自定义 Effect、贴图或 PBR MaterialInstance，没有调用共享材质写入接口。Graphics 使用引擎内置绘制材质。此选择基于 Cocos 官方[材质实例说明](https://docs.cocos.com/creator/3.8/manual/en/material-system/material-script.html)、[Graphics](https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/graphics.html)和[生命周期](https://docs.cocos.com/creator/3.8/manual/en/scripting/life-cycle-callbacks.html)，已通过 Context7 核对；没有依赖 Blender 程序节点导出运行时动画参数。

## 4. 投影和运动安全

保持原相机 `(0,12,16)`、正交 orthoHeight=3.84、1024×768 RenderTexture、100 px/m、pitch sin=0.6/cos=0.8。7×8 odd-r、56 块地砖、336 角点、56 中心以及 2D 拾取路径均未改动。

- 离线 392 点最大误差 **0.0000124561 px**，阈值仍为 **0.001 px**。P2 专用测试在本轮重新解析实际 P1/P0 GLB，逐块比较原顶点与变换，未使用旧 P1 测试结果替代。
- 真实浏览器最终完整动效验收中，17 次实际相机校准均为 56 格 /392 点；最大中心误差 **0.0000115575 px**，最大角点误差 **0.0000124561 px**，原 **0.5 px** 阈值未放宽。[浏览器结果](evidence/floating-ruins-p2/browser-verification.json)。
- 最初开发版在重设预览分辨率的首帧立即取相机矩阵，曾报约 **123.367 px** 顶点误差；0.2 秒后稳定值约 0.000019 px。失败保存在 `browser-initial-console.json` / `browser-first-run-console.json`。修复为等待原定延迟校准完成后再周期复查，最终版本没有用放宽阈值掩盖启动误差。

动态 QA 每个枢轴采样 **725 个周期姿态**，包括 0.5° 相位间隔、完整周期边界及相位对应的正弦极值，合计 **4,048,400 个实际顶点姿态**。检查区域为 Board-local `x∈[-335,335]、y∈[-180,180]`，比原棋盘 X 范围约 [-328.979,324.489] 更宽。

- 晶石、浮石的所有采样均在操作矩形之外。晶石 X 固定、浮石全旋转包围球也在矩形外，补充证明采样之间的横向安全。
- 三层椭圆环旋转后，部分投影会进入矩形，不能谎称所有环顶点一直在矩形外。这些顶点始终低于真实 `SM_Island_Crown` 顶面，沿实际相机方向求交后被不透明岛面遮挡；约 192.86 万个相关顶点样本通过。
- 另将真实岛面三角形投影并裁剪到矩形，核对三角形无面积重叠且总覆盖面积为 241,200 px²，证明操作矩形连续被顶面覆盖；不是只检查静态姿态或只依赖离散采样。
- 光晕、能量流和微粒的每个绘制圆均检查完整半径：`abs(x)-r≥350`、`abs(x)+r≤412`、`abs(y)+r≤185`。不会在棋盘操作矩形、中央备战席或底部商店上绘制。原 UI/单位层又在叠层上方，外围装饰不会盖住血条/UI。

完整动态边界、初始 TRS、网格局部边界和连续安全检查在 [p2-tests-result.json](evidence/floating-ruins-p2/p2-tests-result.json)。

## 5. 实际网页验收与截图

独立场景 `assets/floating-ruins-p2-preview.scene`，UUID `8b415155-005b-403b-8f11-585885587c72`。通过 Cocos MCP 导入、打开；浏览器实际运行 `http://localhost:7456/?scene=8b415155-005b-403b-8f11-585885587c72`。验收固定 **1280×720**，结束后复原临时浏览器尺寸。预览继承已有独立存档沙箱，没有修改原保存格式。

完整运动轮从 15:09:10 UTC 开始，观测 **126.0111 秒有效环境时间**，三层环分别至少完成 **7 /4 /3 圈**。272 个实际枢轴姿态记录逐一与绝对时间公式比较，最大数值差约 **2.22e-16**。期间实际暂停 63.593 秒，环境时间变化为 0；不是通过快进战斗或伪造时间跨过循环。

实际操作：high→low→off→high；off 时全部 17 个位置和旋转与 GLB 初始值精确相等；暂停/继续；2D→3D 往返；拖拽上阵后切换模式并再次拖到另一格；真实开始战斗、造成 175 伤害并进入结算；三次重新绑定，每次 bound=17、overlay=1。已多次重新载入独立预览。原存档检查保持 true，最终运动轮 console **error=0、warning=0**。

运行日志观察到 `floatText` 与 `sunlightSpriteVfx` 在 3D 模式下激活，单位/fx 层均 active；血条和单位在截图中可见。没有逐帧穷举所有技能的瞬时特效，也没有进行所有阵容的战斗验收。

最后仅将预览工具按钮从羁绊面板移至左上空白区。初次移得过高，点击触发了 Creator 自动隐藏顶栏，失败证据保存在 `browser-toolbar-smoke-*` 和 `*-toolbar-attempt.jpg`；y=50 的尝试也仍会触发顶栏。最终使用 y=104 的单行布局，位于顶栏触发范围与羁绊面板之间，实际重新点击模式/画质/暂停按钮均未展开网页顶栏。重新构建并复查；126 秒运动轮的控制器、参数和投影代码未因此改变。较早截图保留旧工具面板位置，最终展示以不含 `toolbar-attempt` 的 `browser-delivery-*.jpg` 为准。

![最终 P2 网页预览](evidence/floating-ruins-p2/browser-delivery-final.jpg)

![模式切换后再次拖拽](evidence/floating-ruins-p2/browser-final-3d-drag.jpg)

![真实战斗结算，单位和血条可见](evidence/floating-ruins-p2/browser-battle-progress.jpg)

![最终布局的实际 392 点校准](evidence/floating-ruins-p2/browser-delivery-calibration.jpg)

原始日志：[完整运动轮](evidence/floating-ruins-p2/browser-final-all-console.json)、[自动证据核对](evidence/floating-ruins-p2/browser-verification.log)、[最终工具布局复验](evidence/floating-ruins-p2/browser-delivery-verification.json)、[截图目录及尺寸](evidence/floating-ruins-p2/screenshot-inventory.json)。最终工具布局另完成模式/画质/暂停、拖拽、重绑及 6 次 392 点校准，error=0，角点误差上限保持约 0.0000124561 px。截图工具实际返回 JPEG，文件使用 `.jpg`，没有改绘截图内容。

## 6. 新执行的命令与模型检查

| 项目 | 实际结果 | 本轮日志 |
|---|---|---|
| `npm run check:resources` | PASS，exit 0 | [资源检查](evidence/floating-ruins-p2/check-resources.log) |
| `npx tsc --noEmit -p tsconfig.json` | PASS，最终交付版 exit 0 | [TypeScript](evidence/floating-ruins-p2/typescript-ui-final.log) |
| `npm test` | PASS，**71 suites passed /0 failed**，exit 0 | [完整回归](evidence/floating-ruins-p2/npm-test.log) |
| `npm run build:web` | 最终交付版 PASS，exit 0；真实编译包回归也通过 | [构建](evidence/floating-ruins-p2/build-web-ui-final.log) |
| `node tests/floating-ruins-p2-tests.cjs` | PASS，17 枢轴/周期/极值/连续安全/20 轮生命周期/TRS/共享材质/392 点 | [P2 测试](evidence/floating-ruins-p2/p2-tests-certified.log) |
| `node tools/verify-floating-ruins-p2-browser.cjs` | PASS，解析本轮真实浏览器记录 | [浏览器核对](evidence/floating-ruins-p2/browser-verification.json) |
| P1 实际 GLB 新检查 | PASS，6,760 三角面、167 网格、223 primitive、7 材质、2 张 1024² 内嵌纹理，UV/法线属性齐全 | [模型检查](evidence/floating-ruins-p2/model-check.json) |
| Blender 现场 QA /重新导出 | **NOT_RUN**，本次没有修改模型、UV、法线、材质或源工程 | 复用原件，不将旧 Blender QA 冒充本轮现场检查 |

首次常规 Web 构建进程退出 `-2147483645`，[失败日志](evidence/floating-ruins-p2/build-web.log)保留。经正常审批允许本机 Creator 启动后重试成功，再对最终交付版重新构建，没有绕过浏览器或执行审批限制。第一次 P2 测试误将浮石也当成底部原点，失败保存在 `p2-tests-first.log`；按真实浮石内部原点纠正测试后通过，未改模型或投影阈值。

生命周期测试执行真实控制器代码，在引擎边界使用测试替身，覆盖 off/2D/disable/destroy/rebind 的 TRS 和节点清理；它不能证明真实 GPU 内存已回收。实际浏览器另覆盖重新绑定、模式/画质、暂停和多次载入；完整引擎场景销毁后的 GPU 内存稳定性尚未做仪器测量。

**正式 Web 包仍不包含 P2 场景。** 已读取实际 main bundle 的场景清单，只有 `main.scene` 和 `scene.scene`：[本轮产物场景清单](evidence/floating-ruins-p2/web-build-scene-inventory.json)。编译包含脚本/resources 不等于独立场景已纳入发布入口；本轮没有修改 builder 或正式入口。P2 的实机网页检查指 Creator 提供的真实 Web 预览，不是 Android 真机，也不是正式发布包的 P2 场景。

## 7. 渲染成本与可测量建议

P1 几何仅 6,760 三角面，但 **167 网格 /223 primitive** 可能带来较高的 CPU 提交和材质切换成本。环的多块符文属于各自枢轴后代，旋转时还会更新后代世界变换。P2 没有为了动效复制模型、创建 PBR 材质实例或贴图；增加一个 Graphics 节点及最多 16 个解析光点。

223 是资产 primitive 数，**不是测得的 draw call**；实际提交受管线、剔除、合批和额外 pass 影响。固定 RT 为 1024×768，需要先渲染 3D，再叠合 2D 操作层。两张 RGBA8 1024² 带完整 mip 链约 10.67 MiB、RT 颜色+32-bit 深度/模板约 6 MiB，均为格式预算估算，未计驱动分配且不是实测内存。

| 测量项 | 状态 /建议 |
|---|---|
| 浏览器真实 FPS /draw call /CPU-GPU p95 /峰值内存 | **NOT_RUN**，不宣称达标 |
| Android 目标机 | **NOT_RUN**，没有设备运行证据 |
| 对比方法 | 同一相机/视口/棋子/战斗输入；预热 10 秒后 high、low、off 各测 60 秒，至少三轮，记录中位数和 p95 |
| 暂定性能目标 | 桌面 60 FPS（16.67 ms），较弱设备 30 FPS（33.33 ms）；high 相对 off 的叠层新增提交建议 ≤4、CPU p95 增量 ≤1 ms；这是待测目标 |
| 后续优化条件 | 先定位实际提交瓶颈；优先合批同材质静态外围装饰，保留 56 格身份/投影以及全部 17 个 PIV；禁止将不同动画枢轴的后代合成一个刚体网格 |

[机器可读预算与测量方案](evidence/floating-ruins-p2/performance-budget.json)。没有用浏览器持续运行或资产三角面预算代替帧率测量。

## 8. 文件列表与复验

| 新文件 | 用途 |
|---|---|
| `assets/scripts/view/FloatingRuinsMotion.ts` + `.meta` | 无引擎依赖的绝对周期函数、四元数和叠层安全范围 |
| `assets/scripts/view/FloatingRuinsP2Bindings.ts` + `.meta` | 实际 P1 GLB 名称、模型哈希和精确参数 |
| `assets/scripts/view/FloatingRuinsEnvironmentAnimator.ts` + `.meta` | 独立控制器、解析光点/能量流、还原与清理 |
| `assets/scripts/tools/FloatingRuinsP2Preview.ts` + `.meta` | 真实战斗场景副本的 P2 接入、工具按钮与只读诊断 |
| `assets/floating-ruins-p2-preview.scene` + `.meta` | 独立场景，不覆盖 `assets/scene.scene` |
| `tests/floating-ruins-p2-tests.cjs` | P2 专用逻辑、真实 GLB 动态安全、生命周期和原投影回归 |
| `tools/floating-ruins-p2-glb.cjs` | GLB 顶点/索引读取 |
| `tools/create-floating-ruins-p2.cjs` | 首次预览与绑定表生成辅助，拒绝覆盖已有 P2 文件；最终预览有后续人工代码修订，不应对当前目录重跑 |
| `tools/floating-ruins-p2-backup.py` | UTF-8 归档与逐文件校验 |
| `tools/verify-floating-ruins-p2-browser.cjs` | 只读分析本轮浏览器原始证据 |
| `tools/report-floating-ruins-p2.cjs` | 重查原文件保护、实际包场景、资产预算和文件清单 |
| `docs/evidence/floating-ruins-p2/` | 新备份、QA、命令日志、浏览器记录、截图和报告；有效备份约 734 MiB |
| `docs/floating-ruins-p2.md` | 本报告 |

[完整新文件列表与 SHA-256](evidence/floating-ruins-p2/file-manifest.json)。P1 `.blend`、GLB 和证据复用原件，不另存无实际模型变化的 P2 Blender 工程。

复验从项目根执行上述四条标准命令，再运行：

```powershell
node tests/floating-ruins-p2-tests.cjs
node tools/verify-floating-ruins-p2-browser.cjs
node tools/report-floating-ruins-p2.cjs
```

后两条读取已保存的浏览器证据/当前包；**不会自动重跑浏览器验收**。如控制器、模型或投影改变，需重新采集真实浏览器记录。首次生成器会拒绝覆盖当前交付文件，不应当作复验命令。

## 9. 未完成项目与 P3 准入

| 项目 | 状态 | 后续门槛 |
|---|---|---|
| 固定桌面视口 P2 功能与 392 点投影 | PASS | 新运动/相机/模型改动后继续复验 |
| 904×871 窄视口裁切与输入 | **OPEN** | 保留 P0.5 问题；本轮未修全局缩放，也没有专项宣称该尺寸通过 |
| 本轮窗口改变后的裁切 | **OPEN** | 实际默认窗口变为 467×654 后出现裁切，另存 [截图](evidence/floating-ruins-p2/browser-resize-crop-open.jpg)；不能混称为 904×871 的专项复现 |
| Android 显示、输入和性能 | **NOT_RUN** | 目标设备安装、持续运行和量化指标 |
| 真正 draw call/FPS/内存 | **NOT_RUN** | 按 high/low/off 方案采样再决定合批 |
| 正式 Web 包的 P2 场景入口 | **OPEN** | 独立确定发布入口/场景清单，再执行实际包交互验收 |
| 全技能瞬时特效/全部阵容 | **NOT_RUN（完整覆盖）** | 当前只覆盖实际一场战斗和日辉特效激活，不外推全部角色 |
| 真实场景反复销毁后的 GPU 内存回落 | **NOT_RUN（仪器测量）** | 增加真实场景往返及资源快照；现有 dispose/重绑测试不能替代 |

**P3 准入结论：HOLD。** P2 独立动效可以继续使用和评审；在解决或正式隔离窄视口、明确发布场景、完成目标设备与渲染成本测量前，不建议扩充大规模粒子、动画材质或更重的后处理。没有将未运行项目包装为通过，也没有更改 P0/P0.5/P1 历史证据。
