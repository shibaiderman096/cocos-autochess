# 浮空棋境 P1：浮空遗迹静态美术升级

日期：2026-10-20。项目：`D:\cocos\NewProject`；Cocos Creator 3.8.8；Blender 5.2.2 LTS。

**结论：静态资产、独立预览接入、模型 QA 与投影检查完成；P1 完整交互验收未完成，P2 动态效果暂缓。** 浏览器后续检查被自动审批额度限制中断，不能把既有 P0/P0.5 的战斗证据算作 P1 已通过。

## 1. 起点与文件保护

先读取了 [P0](floating-ruins-p0.md)、[P0.5](floating-ruins-p0.5.md)，检查工作树和现有预览。起始 HEAD 为 `db4b4efbed30d72911d2634bed989056a75179e0`。工作树已有大量未提交内容，包括 `floating-ruins-beauty-v1` 和用户修改过的 `FloatingRuinsPreview.ts`；本轮未覆盖它们。

保存了 [起始状态](evidence/floating-ruins-p1/baseline-status.txt)、[原有差异补丁](evidence/floating-ruins-p1/baseline-working-tree.patch)、[2,976 个原有文件哈希](evidence/floating-ruins-p1/baseline-hashes.json)。[最终保护核对](evidence/floating-ruins-p1/protection-check.json)：**2,976 个文件，0 个改变，0 个丢失**。没有 reset、提交或推送。

`assets/scene.scene`、正式入口、全局 UI 缩放设置、battle 配置、战斗公式、棋子数值、经济规则、存档格式、P0/P0.5 历史证据均保持起始字节。原有 P0/beauty 预览脚本也未改动。

## 2. 模型前后对比

| 项目 | P0 原型 | P1 本轮交付 |
|---|---:|---:|
| 棋盘布局 | 7×8 odd-r，56 格 | 完全保持 |
| 原始地砖顶点/变换 | 原始契约 | 逐格比对相同 |
| 网格对象 | 68 | 167 |
| 三角面 | 2,272 | **6,760** |
| 导出材质 | 4 | **7** |
| 内嵌图集 | 0 | **2×1024²** |
| 可动部件枢轴 | 无 P1 分类 | 17 个独立命名枢轴 |
| 动画/蒙皮/形变 | 0 | 0 |

P0 数字来自未改动的历史导出报告；P1 数字来自本轮实际 GLB，不是设计估算。

P0 历史网页截图，仅作视觉参照，本轮未重新验收 P0：

![P0 历史原型](evidence/floating-ruins-p1/p0-reference-historical.png)

P1 实际 Cocos 网页预览，最终模型及材质：

![P1 静态遗迹棋盘](evidence/floating-ruins-p1/p1-preparation.png)

独立制作了古石六边形地砖、四层岩岛轮廓、断柱/残墙、两座外围拱门、碑石、四组青绿/蓝紫晶石、三层静态符文环和六块外围浮石。中央石砖保留较弱金色矿脉，主体采用深灰、古铜和青绿。没有加入粒子、动画、Bloom 或额外战斗效果。

P1 截图拍摄于预览控件从顶栏挪位之前；模型、图集和相机已是最终版本。仅 P1 自有控件随后移至左上空白区，避免触发编辑器顶部工具栏；该控件挪位版本已通过编译，**尚未获得浏览器复验**，不能把旧截图当作其点击验收证据。

## 3. 可编辑结构与导出

- 新源工程：[floating-ruins-p1.blend](../art-source/floating-ruins-p1/floating-ruins-p1.blend)，4,725,922 字节。来自追加 P0 场景后独立编辑，最终另存为正常可直接打开的 Blender 工程；P0 原件未写入。
- 运行资产：[floating-ruins-p1.glb](../assets/resources/models/floating-ruins-p1/floating-ruins-p1.glb)，3,187,244 字节，glTF 2.0 GLB、Y Up、静态、应用导出修改器、保留 extras。
- `P1_Export` 是唯一导出集合；`P1_Review` 存放镜头/灯；`P1_Reference_*` 隐藏保存参考，不导出。
- `SM_Hex_R00_C00`～`SM_Hex_R07_C06` 共 56 个独立对象。共享 7 个 `M_P1_*` 材质，部分古铜模块在源工程中链接复用网格。GLB 实际为 167 个网格、223 个 primitive；**未宣称运行时已经完成实例化合批**。
- 两张图集均随 `.blend` 打包、随 GLB 内嵌：BC=sRGB；ORM=Non-Color，G 粗糙度、B 金属度，R=1，没有宣称做了 AO 烘焙。纹理为静态图集，不依赖 Blender 程序材质运行。
- `GN_P1_RuneEllipse` 提供符文环径向缩放编辑；晶石 8、符文环 3、浮石 6 个 `PIV_*` 枢轴独立保留，无时间输入和关键帧。

制作使用 Blender MCP，以及已安装的 blender-core、scene-setup、hardsurface-modeling、geometry-nodes、export-pipelines、asset-qa，并补充 pbr-materials、retopology-uv。随后通过独立 Blender 进程重新打开保存后的工程，执行只读复验。详见 [源工程说明](../art-source/floating-ruins-p1/README.md)、[工程保存检查](evidence/floating-ruins-p1/source-project.json)、[对象/材质/图集清单](evidence/floating-ruins-p1/authoring.json)。

## 4. 模型 QA 与重新导入

已修复首轮外围承托不足、拱石连接和晶石底座间隙；石材重复条纹也已修正，并显式刷新打包图像后重新导出。

最终整场景 [原始扫描](evidence/floating-ruins-p1/qa-final-raw.json) **raw pass=false**：46 条错误均为设计中的浮空部件，不能把这个原始结果写成全绿。按 Skill 对有意悬浮部件单独检查的规则，将 113 个承托/装饰网格作为整体检查，再分别检查 54 个有意悬浮网格：

| 检查 | 实际结果 |
|---|---|
| [承托结构整体](evidence/floating-ruins-p1/qa-structural.json) | pass=true，errors=[] |
| [54 个悬浮部件逐件](evidence/floating-ruins-p1/qa-intentional-floats.json) | 全部 pass=true |
| [逐项判定](evidence/floating-ruins-p1/qa-adjudicated.json) | pass=true，未接受错误 0 |
| 同向共面重叠/z-fighting | 0 |
| 破面、退化面、零长度边、反向闭合壳、不一致法线 | 无对应错误；逐对象数字保留在原始报告 |
| UV | 全部有 UV；0 越界、0 零面积面；有意复用 atlas/trim 岛 |
| 比例 | 米制、单位缩放；地砖和原有坐标不变 |
| [最终 GLB 重新导入](evidence/floating-ruins-p1/roundtrip.json) | 167 网格、56 地砖、7 材质、17 枢轴、6,760 三角面；errors=[] |
| GLB 往返地砖中心/网格顶点 | 最大偏差均为 0 米 |

接受并保留的 172 条 warning 包括：堆叠复用 UV、模块接触处背靠背隐藏面、3 个被不透明岩岛遮住的悬浮部件、最低点 z=-2.05。UV 不是唯一光照烘焙 UV；接触面保留是为了模块可编辑，已经计入三角面预算；岛底低于棋盘平面是设计，不把整岛抬高破坏投影。详细对象名单和每项数字均保留，未隐藏原始失败报告。

材质多角度、随机对象色和线框均已实际查看：

![材质检查](evidence/floating-ruins-p1/blender-material.png)

![结构及独立零件检查，随机色不是最终材质](evidence/floating-ruins-p1/blender-parts.png)

[线框检查图](evidence/floating-ruins-p1/blender-wire.png)、[Blender 复验日志](evidence/floating-ruins-p1/qa-headless.log)、[导出报告](evidence/floating-ruins-p1/export-report.json)、[导出日志](evidence/floating-ruins-p1/export.log)。

## 5. 投影契约与安全区

沿用 `BoardGeometry` 和 `BoardProjectionAdapter`，没有重新设计坐标。固定相机 `(0,12,16)` 朝原点、正交高度 `3.84`、RenderTexture `1024×768`、100 px/m、pitch sin=0.6/cos=0.8，继续由原 Board UITransform 和 Canvas 相机映射。地砖依然以 odd-r 命名并由原命中多边形负责输入。

| 验证 | 结果 |
|---|---|
| [GLB 自动投影测试](evidence/floating-ruins-p1/projection-automated.json) | 56 中心+336 角点=392 样本；最大误差 **0.0000124561 px** |
| 原 P0 GLB 地砖对比 | 每格 translation/rotation/scale/matrix 和全部唯一顶点相同 |
| 命中检查 | 每格中心与六个角点内缩样本命中原格 |
| [真实 Cocos 相机投影](evidence/floating-ruins-p1/projection-browser.json) | 392 样本；中心最大 **0.0000173363 px**，角点最大 **0.0000186841 px**；原存档保持 |
| [外围装饰安全区](evidence/floating-ruins-p1/decoration-safe-zone.json) | 48 个装饰、472 顶点投影在棋盘包围框外，最小间隔 **20.80 px** |

安全区检查范围是 `safe_decoration` 网格顶点；岛体、环和浮石在不透明操作平面之下。所有 3D 内容先进入背景 RT，再由既有 2D 棋子、血条、UI 和 FX 层绘制，不建立 3D 点击代理。这个结构不代替尚未完成的技能实战可见性验收。

## 6. 独立 Cocos 预览与实际交互证据

新场景：[assets/floating-ruins-p1-preview.scene](../assets/floating-ruins-p1-preview.scene)，UUID `73c63a0b-1e9b-4208-a9a0-5b36c7579edc`。

新脚本：[FloatingRuinsP1Preview.ts](../assets/scripts/tools/FloatingRuinsP1Preview.ts)。复制既有预览结构，单独加载 P1 prefab，复用真实 BattleStage、BoardView、相机/环境节点和存档内存隔离。2D/3D 仍只改变背景和 3D 环境，操作高亮、单位、FX 节点保留。仅在 P1 脚本中添加只读观察日志，没有插入战斗或输入规则。

Cocos 编辑器运行时可访问 [P1 本机预览](http://localhost:7456/?scene=73c63a0b-1e9b-4208-a9a0-5b36c7579edc)。此地址依赖编辑器预览服务，不是正式 Web 包。

| 网页检查 | 本轮状态 |
|---|---|
| 1280×720 P1 模型、图集、外围装饰显示 | 已实际查看 |
| 相机 392 点校准 | 已实际通过 |
| 备战席拖拽上阵 | 已实际成功，棋子落于己方棋盘，血条/蓝条可见 |
| 2D/3D 往返 | **网页未完成**；自动测试仅证明原 BoardView 方法 10 次往返保留操作层 |
| 切回后再次拖动、详情 | **未完成** |
| P1 实际战斗到结算 | **未运行**，不复用 P0.5 的战斗通过结论 |
| P1 技能特效可见性 | **未运行** |
| 最终完整 console 错误审计 | **未完成**；初始错误/警告查询为空，不代表最终全程零错误 |
| P1 自有控件挪位后的点击复验 | **未完成**，仅编译通过 |

![实际拖拽上阵，血条蓝条在模型前方](evidence/floating-ruins-p1/p1-drag-deployed.png)

曾尝试点击顶栏切换，但编辑器顶部工具栏展开，Canvas 从 1280×720 被压成约 1280×672.76，画面比例与输入发生失配，**没有切换成功**。[失败截图](evidence/floating-ruins-p1/p1-toolbar-input-limit.png) 不是 2D 模式截图。随后只把 P1 自有控件挪到空白处，未修改全局缩放策略。

准备重新载入复验时，浏览器自动审批因 usage limit 无法完成而拒绝了 reload，并明确禁止通过其他浏览器表面或间接命令绕过。本轮没有绕过，继续完成了独立模型和构建工作。[网页验收记录及阻塞原因](evidence/floating-ruins-p1/browser-validation.json)。

## 7. 真实测试与构建结果

以下命令在最终 P1 预览代码下实际执行，原有测试入口未改：

| 命令 | 结果 | 日志 |
|---|---|---|
| `npm run check:resources` | exit 0；177 纹理/SpriteFrame、27 可用单位、30 怪物等引用检查通过 | [日志](evidence/floating-ruins-p1/check-resources.log) |
| `npx tsc --noEmit -p tsconfig.json` | exit 0，无诊断 | [日志](evidence/floating-ruins-p1/typescript.log) |
| `npm test` | exit 0；**71 suites passed，0 failed** | [完整日志](evidence/floating-ruins-p1/npm-test.log) |
| `node tests/floating-ruins-p1-tests.cjs` | 通过；392 投影、原顶点、图集尺寸、静态资产、枢轴、10 次 BoardView 模式往返等 | [日志](evidence/floating-ruins-p1/p1-tests.log) |
| `npm run build:web` | 最终 exit 0；实际编译包检查通过 | [日志](evidence/floating-ruins-p1/build-web.log)、[Creator 日志](evidence/floating-ruins-p1/creator-build.log) |

首次 Web 构建进程启动即退出，错误码 `-2147483645`，[原失败日志](evidence/floating-ruins-p1/build-web-first-attempt.log) 已保留；允许本机 Creator 正常启动后重新执行成功，最终版本也重新构建通过。没有把首次失败改记成成功。

**正式 Web 包没有 P1 预览场景。** 已读取实际构建的 main bundle 场景清单，仅有 `main.scene` 与 `scene.scene`：[产物场景清单](evidence/floating-ruins-p1/web-build-scene-inventory.json)。资源进入 resources、编译成功，都不等于生产入口已经提供 3D 模式；本轮未增加正式入口或修改 builder 场景配置。正式编译包的本轮浏览器烟测也未完成。

## 8. 性能预算

| 项目 | 实测资产数据/估算 | 判断 |
|---|---:|---|
| 三角面 | 6,760 / <30,000 | 达标，占上限约 22.5% |
| 材质 | 7 / 4～8 | 达标 |
| 图集 | 2 张 1024² | 达标 |
| GLB | 3,187,244 B，约 3.04 MiB | 记录实际体积 |
| Blender 源工程 | 4,725,922 B，约 4.51 MiB | 包含编辑结构及打包图像 |
| 网格/primitive | 167 / 223 | 仍需在目标机测合批与提交成本 |
| 图集 GPU 内存估算 | 约 10.67 MiB | 按两张 RGBA8 和完整 mip 链估算，非实测 |
| RT 附件内存估算 | 约 6 MiB | 1024×768 RGBA8+32bit depth/stencil，未计驱动开销 |
| 桌面 FPS、CPU/GPU 帧时、峰值内存 | **未测** | 不宣称性能通过 |
| Android 真机性能 | **未运行** | 继续未完成 |

223 个 primitive 是资产统计，不能等同实际 draw call；没有用三角面预算替代性能验收。[机器可读预算](evidence/floating-ruins-p1/performance-budget.json)。

## 9. 文件列表与 P2 准入

核心交付：

| 文件/目录 | 内容 |
|---|---|
| `art-source/floating-ruins-p1/floating-ruins-p1.blend` | 独立可编辑 P1 工程 |
| `art-source/floating-ruins-p1/textures/` | BC、ORM 两张图集 |
| `art-source/floating-ruins-p1/README.md` | 编辑、导出和只读 QA 方法 |
| `build_p1.py`、`refine_p1.py`、`finalize_p1.py`、`normalize_source.py`、`qa_p1.py` | 位于 P1 源工程目录；制作记录与复验辅助脚本，不建议整套重复执行 |
| `assets/resources/models/floating-ruins-p1/` 及 `.meta` | GLB 与 Cocos 导入元数据 |
| `assets/floating-ruins-p1-preview.scene` 及 `.meta` | 独立预览场景 |
| `assets/scripts/tools/FloatingRuinsP1Preview.ts` 及 `.meta` | P1 展示与只读诊断 |
| `tests/floating-ruins-p1-tests.cjs` | P1 补充测试，单独运行，不改原测试入口 |
| `tools/create-floating-ruins-p1-preview.cjs` | 防覆盖的首次预览生成器 |
| `tools/report-floating-ruins-p1.cjs` | 仅重新生成 P1 证据与清单 |
| `docs/evidence/floating-ruins-p1/` | 原始 QA、日志、截图、基线和文件哈希 |
| `docs/floating-ruins-p1.md` | 本报告 |

[完整文件列表及 SHA-256](evidence/floating-ruins-p1/file-manifest.json)、[验收摘要](evidence/floating-ruins-p1/acceptance.json)。

**P2 准入：HOLD。** 静态资产和 P2 枢轴已准备好，但以下事项尚未完成：

1. 审批服务可用后，以固定 1280×720 重新载入最终 P1 预览，完成 2D/3D 往返、切换后再次拖拽、详情、完整战斗、技能和血条可见性、最终 console 审计。
2. **P0.5 的 904×871 窄视口裁切与输入问题保持 OPEN**，本轮未修复、未复验，不能标记通过。编辑器顶部工具栏触发的比例/输入变化也有本轮失败证据。
3. **Android 真机性能保持未完成**；测量实际 draw call、帧时和内存后再决定合批、精简隐藏面或纹理压缩。
4. 正式 Web 仍无 P1 场景入口；如后续决定发布 3D 模式，应单独纳入构建场景并重新执行实际包的交互验收。

本轮交付的是可独立继续使用的静态美术成果，未将缺失的交互和设备证据写成通过。
