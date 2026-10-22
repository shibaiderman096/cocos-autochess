# 浮空棋境：2.5D 浮空遗迹棋盘 P0

验收日期：2026-10-20。环境：Cocos Creator 3.8.8、Blender 5.2.2、Windows 网页预览。

已完成静态模型、独立预览、投影适配、模式切换与网页交互验证。仓库全量测试尚未全绿：69 个原有套件中 55 个通过、14 个失败；新增 P0 测试通过。

## 入口与操作

- 在 Creator 打开 `assets/floating-ruins-preview.scene` 后运行网页预览。
- 当前编辑器服务运行时可访问 [独立预览](http://localhost:7456/?scene=09ea902d-5d19-4527-b876-f6f994de5daa)。需保持 Creator 和项目预览服务开启。
- 顶部“切换 2D / 3D”恢复原背景或显示静态模型。“56格校准”显示实际命中边界、中心十字及原操作高亮的射程示例；再次点击关闭。
- 使用原备战席拖拽及“开始战斗”按钮。预览在真实 BattleStage 启动前隔离两代游戏存档键，使用内存存档；刷新后重新开始。
- 原 `assets/scene.scene` 和默认启动场景未替换。3D 模式默认只在独立预览启用。

## 读取结果与实现边界

已读取 `battle.json`、`BoardView.ts`、`BoardGeometry.ts`、`HexMath.ts`、`BattleStage.ts` 和 `scene.scene`。

实际棋盘是 7 列 × 8 行，己方行为 0–3，采用 odd-r 点顶六边形。BattleStage 初始化尺寸 48，并把 Board 放在 Canvas 局部坐标 `(0,60)`。BoardGeometry 在奇偶行错位基础上继续做横向收缩及纵向 0.6 压缩；因此模型使用实际投影后的六边形，而非另建一套规则六边形近似。

BoardView 的原画 `arenaArt`、地面 `boardGrid` 和操作 `dragHighlight` 分开绘制。单位、备战席和 `fx` 是 Board 子节点，Canvas 还有独立 `arenaBackdrop` 及原 BattleUI。新增 BoardView.setVisualMode 仅控制前两个背景节点。预览另行管理 arenaBackdrop 与自己的 3D 表面，保持原输入坐标转换、寻路、战斗和单位渲染。

3D 相机渲染到 1024×768 RenderTexture，再由位于 Board 底层的 Sprite 显示；原 UI 相机继续渲染 2D 单位、操作高亮和特效。这让 3D 模型处于原操作层下方，不参与拾取。独立预览使用 SHOW_ALL 保证完整 HUD 可见。

投影约定：100 像素/米；3D 相机位于 `(0,12,16)` 朝向原点，正交半高 3.84；pitchSin=0.6、pitchCos=0.8。BoardProjectionAdapter 从实际 BoardGeometry 输出中心和六角边界，映射至 Cocos `(x,y,z)=(screenX/100,0,-screenY/60)`。Blender 使用 Z 向上，导出 GLB 转为 Cocos Y 向上。

这套静态校准依赖当前尺寸与相机角度。更改棋盘尺寸、镜头倾角或模型地面高度时必须重新生成和校准。

## 交付文件

| 文件/目录 | 用途 |
| --- | --- |
| `art-source/floating-ruins-p0/floating-ruins-p0.blend` | Blender 源场景及可编辑节点组 |
| `assets/resources/models/floating-ruins-p0/floating-ruins-p0.glb` | Cocos 实际加载的模型，含对应导入 meta |
| `assets/floating-ruins-preview.scene`、`.meta` | 独立预览场景、3D 相机和环境节点 |
| `assets/scripts/view/BoardProjectionAdapter.ts`、`.meta` | 纯 TypeScript 投影适配和命名清单 |
| `assets/scripts/tools/FloatingRuinsPreview.ts`、`.meta` | 模型加载、环境、切换、校准、预览存档隔离 |
| `assets/scripts/view/BoardView.ts` | 小范围增加视觉模式接口 |
| `settings/v2/packages/engine.json` | 启用必要的 3D 引擎模块，保留原模块 |
| `art-source/floating-ruins-p0/board-layout.json` | 56 格中心、多边形及三维坐标清单 |
| `art-source/floating-ruins-p0/build_floating_ruins.py` | Blender 建模脚本 |
| `art-source/floating-ruins-p0/qa_and_export.py` | 模型 QA、源文件保存及 GLB 导出 |
| `art-source/floating-ruins-p0/foundation-geometry-nodes.json` | 基座 Geometry Nodes 的参数与结构记录 |
| `art-source/floating-ruins-p0/start_blender_bridge.py` | 本地 Blender MCP 启动辅助 |
| `tools/floating-ruins-manifest.cjs` | 从生产 BoardGeometry 生成坐标清单 |
| `tools/create-floating-ruins-preview.cjs` | 创建独立场景，拒绝覆盖已有场景 |
| `tools/run-floating-ruins-regression.ps1` | 对原有测试套件逐项运行并保留日志 |
| `tests/floating-ruins-tests.cjs` | 真实 GLB 投影、命中、模式切换和模型 QA 验证 |
| `docs/evidence/floating-ruins-p0/` | 截图、测试、QA、导出及保护检查证据 |

核心文件的尺寸和 SHA-256 见 [file-manifest.json](evidence/floating-ruins-p0/file-manifest.json)。相关资源目录另包含 Creator 自动生成的 `.meta`。

## 模型规格与 QA

- 56 个独立地砖：`SM_Hex_R00_C00` 至 `SM_Hex_R07_C06`，另有浮空基座、下部承台、6 根残柱、4 段矮墙。
- 导出总计 68 个网格、4 个基础材质、2,272 个三角形；整体尺寸约 7.56×6.24×1.77 米（Blender XYZ）。
- 基座使用 Geometry Nodes 的 Position → Vector Math Multiply → Set Position，并暴露 Footprint 参数；GLB 烘焙计算后的网格。
- 使用简单石材色块、粗糙度与单段倒角；没有贴图、粒子、动画、骨骼、蒙皮或导出扩展。
- 已做正面、侧面、顶面、三分之四材质观察及顶面/三分之四线框观察。
- [model-qa.json](evidence/floating-ruins-p0/model-qa.json)：通过，errors 为空。检查包含退化面、非流形、法线、重复顶点、尺度、重叠/穿插、悬空零件及 UV 等。
- 唯一接受的警告：最低点 Z=-1.12，未落在 Z=0 地面。这里 Z=0 是棋子接触面，下方正是浮空承台，故保留该警告，不移动整体原点。
- [scene-audit.json](evidence/floating-ruins-p0/scene-audit.json)：无场景问题，米制单位；[export-report.json](evidence/floating-ruins-p0/export-report.json) 确认无默认 Cube、动画和蒙皮。

## 测试结果

| 检查 | 结果与证据 |
| --- | --- |
| GLB 离线投影 | 56 中心 + 336 边界顶点，共 392 样本；最大误差 0.00001246px；[报告](evidence/floating-ruins-p0/alignment-offline.json) |
| 网页实际相机投影 | 从 Cocos 导入网格读取顶点，通过 3D 与 Canvas 相机计算；392 样本全部通过，最大误差 0.00001546px；[逐格报告](evidence/floating-ruins-p0/alignment-browser.json) |
| 命中多边形 | 所有中心及向中心微缩的 336 个角点都返回对应格子；继续使用 BoardGeometry.cellAt |
| 模式切换 | 自动运行 10 个往返周期，验证仅旧背景显隐，操作层/单位/fx 保持激活；网页手动往返切换通过 |
| 操作高亮 | 网页校准按钮调用原 highlightTarget，目标绿框和攻击范围显示在 3D 地面上；独立拖拽射程测试通过 |
| 实际拖拽 | 通过原触摸路径从备战席上阵，2D 单位落在地砖中心，羁绊面板更新；见 browser-deployed.png |
| 网页战斗 | 原开始按钮进入准备并完成战斗至结算，伤害统计 175，原宝箱仍可见；见 browser-battle-start.png、browser-settlement.png。未逐帧捕获瞬时战斗特效 |
| 存档隔离 | 启动后及战斗结算后，原 v1/v2 存档内容均未变化；[战斗后报告](evidence/floating-ruins-p0/alignment-after-battle.json) |
| TypeScript | `npx tsc --noEmit -p tsconfig.json` 通过；typecheck.log |
| Creator 场景检查 | validate_scene 通过，TypeScript 0 错误；[报告](evidence/floating-ruins-p0/scene-validation.json)。这是编辑场景检查，与网页实测分别记录 |
| 网页错误 | 最终验证窗口没有捕获到 console error；browser-errors-final.json |
| 保护文件 | 原 scene、BattleStage、BoardGeometry、战斗脚本和配置等 26 个文件，前后 SHA-256 全部相同；protected-before.json、protected-after.json |
| 原测试套件 | 69 项中 55 通过、14 失败；[完整结果](evidence/floating-ruins-p0/regression-suites.json)，每项保留独立日志 |
| 标准 npm test | 改动前后均在资源检查报同一错误：缺少 `art/fx/sunlight_slash/spriteFrame`，没有宣称全量通过；regression-before.log、regression-after.log |

逐套件运行用于绕过资源检查的提前退出、取得诊断覆盖，不代表修复或放宽了标准测试入口。未更改原测试脚本和断言。

### 14 个失败套件

| 套件 | 首个主要失败 |
| --- | --- |
| unit-tests.js | 找不到旧角色配置 warrior |
| regression-tests.cjs | 独立 Node 环境找不到 cc |
| ui-interaction-tests.cjs | 原 UI 位置预期 60，实际 88 |
| shadow-vfx-tests.cjs | 未定义对象访问 |
| sunlight-animation-tests.cjs | 原动画断言失败 |
| progression-tests.cjs | 进度/奖励数值断言失败，实际 27 |
| skill-crit-equipment-tests.cjs | 找不到旧角色配置 young_sasuke |
| run-session-tests.cjs | null 对象读取 run |
| run-sim-cli-tests.cjs | 难度预期断言失败，实际 normal |
| power-calibration-tests.cjs | 原装备机制审计断言失败 |
| enemy-budget-tests.cjs | 未知角色缺少有效费用 |
| p3-equipment-tests.cjs | 原角色标签断言失败 |
| formal-bot-tests.cjs | null 对象读取 run |
| medium-economy-tests.cjs | 经济策略断言失败，实际 develop |

上述失败未在本轮修复。仅标准资源检查有改动前后双份基线，其他 14 项未逐项建立改动前运行对照，因此不把它们全部判定为已证明的历史失败。

## 预览截图

![网页 3D 静态原型](evidence/floating-ruins-p0/browser-3d.png)

![56格校准及原操作高亮](evidence/floating-ruins-p0/browser-calibration.png)

![原触摸路径完成上阵](evidence/floating-ruins-p0/browser-deployed.png)

![原战斗流程完成结算](evidence/floating-ruins-p0/browser-settlement.png)

![Blender 多视角](evidence/floating-ruins-p0/model-review.png)

![Blender 线框](evidence/floating-ruins-p0/model-wireframe.png)

另有 browser-2d.png，证明原画模式恢复。

## 待解决问题

1. 标准资源检查与 14 个失败套件仍待单独修复；不修改游戏数值来迎合旧断言。
2. 当前是固定镜头、静态色块的 P0；尚未进行移动端 draw call、内存、帧率或安装实机验收。68 个网格与多材质分段后续可评估静态合批。
3. 3D 地面不会参与输入、遮挡、深度排序或物理。2D 单位和特效统一覆盖其上；若以后加入高墙、镜头移动或单位走到遗迹后方，需要另设计遮挡方案。
4. 本轮仅保留原战斗特效通路并验证战斗到结算；没有逐个技能的网页视觉回归截图。
5. 若坐标规则、7×8 尺寸、48 格尺寸或镜头参数改变，必须重新生成模型并重跑 392 点校准。

本轮没有改动已有角色数值、存档格式或战斗核心逻辑，也没有新增粒子或动画。
