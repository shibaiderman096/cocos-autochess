# 项目瘦身完成报告

2026-10-21。按用户分别批准的 A、B、C 类清单执行。项目工作文件由约 **7.01 GiB 降至 1.13 GiB，减少 83.8%（约 5.88 GiB）**。统计排除 `.git`，包含保留的正式 Web 包、依赖和活动编辑器数据，详见[实际体积](evidence/project-slimdown/summary.json)。项目内没有找到 `.doc` 或 `.docx` 文件。

## 实际处理

| 范围 | 完成结果 |
|---|---|
| A：明确的生成缓存 | 删除 43 个目标，原逻辑文件体积 5,210,168,435 字节：Android 构建目录、测试编译目录、Gradle/校准缓存及 39 个临时测试目录。回归重新生成的 `.test-build` 和一个临时测试目录也已清理 |
| B/C：项目外归档 | 91 个文件，1,090,091,594 字节（约 1.02 GiB），全部原哈希核对通过；包括重复工作树备份、自动备份、重复源图 ZIP、退役预览及工具、无引用 UI 图和旧模型导入信息 |
| 旧模型 | P0、beauty、P1 三个 GLB 原字节迁至 `tests/fixtures/board-models/`，继续用于历史对比；六个模型测试改用统一路径解析器，未降低阈值 |
| 现有 APK | 删除 Android 中间文件前已复制到外部归档，并与源文件核对哈希 |
| 正式包 | 重新构建；只注册 main 与 floating-ruins，模型资源仅 reference-v1，旧 GLB 和 7 张退役 UI 图已不在包内资源路径表 |

外部归档为 [D:/cocos/_project-cleanup-20261021/archive/](D:/cocos/_project-cleanup-20261021/archive/)，各文件保留原项目相对路径。旧报告引用的备份文件可在此定位。**移出项目的归档仍占 D 盘空间，不能将它计为磁盘空间释放。** Android 缓存将随后续构建重新生成，部分依赖需重新下载。

逐文件执行清单见[plan.json](evidence/project-slimdown/plan.json)，91 个归档与三个模型迁移的原哈希见[protection.json](evidence/project-slimdown/protection.json)。清理前工作树状态、暂存/未暂存差异及八个待编辑文件的备份保存在 `D:/cocos/_project-cleanup-20261021/`。最初自动审批拒绝批量操作后，先展示了具体范围，再取得用户 A/B/C 三类明确批准；随后才执行移动和删除。

## 保留及修改边界

正式场景、相机/RenderTexture 映射、现用 GLB、Blender 可编辑原件、棋盘几何、输入、战斗、经济、数值及存档格式均保持原字节。历史报告、截图、模型 QA 和仍被测试/模拟工具读取的冻结实验数据保留；活动编辑器数据、安装依赖和正式 Web 构建也保留。用途尚不明确的旧临时脚本/截图未扩大删除范围。

既有 3373 个受核对文件中，91 个归档、3 个模型迁移、8 个必要编辑符合清单，未发现额外变更；其余 3271 个保持原字节。没有 reset、提交或推送。

本轮代码/文档维护：

- `tests/board-model-path.cjs`：历史模型与当前模型的明确路径；未知模型名直接报错，无缺失回退。
- 六个 `floating-ruins*` 模型/运动测试：仅调整模型读取位置。P2 与参考图运动检查结果改写到 `temp/board-test-reports/`，防止再次运行时覆盖历史证据；本次输出另复制进本轮证据。
- `README.md`：修正正式战斗入口，加入清理记录。
- `docs/README.md`、`docs/project-slimdown-plan.md` 与本报告：记录归档定位、用户批准范围和真实结果。

## 本轮验证

| 检查 | 真实结果 |
|---|---|
| `npm run check:resources` | PASS，[日志](evidence/project-slimdown/check-resources.log) |
| `npx tsc --noEmit -p tsconfig.json` | PASS，[日志](evidence/project-slimdown/typecheck.log) |
| `npm test` | PASS，72 套、0 失败，[日志](evidence/project-slimdown/npm-test.log) |
| 七项棋盘专项 | PASS：P0、beauty、P1、reference、P2、reference 运动、生命周期；[退出码](evidence/project-slimdown/check-exits.json) |
| 模型迁移完整性 | PASS，三个 GLB 原哈希一致；当前 GLB 和 Blender 原件不变 |
| 56 格/392 点 | PASS，阈值仍为 0.001；参考模型最大误差约 0.0000124561 像素 |
| 动效回归 | PASS，17 枢轴、每枢轴 725 个相位采样，参考图模型共 3,978,800 个顶点采样；[结果](evidence/project-slimdown/motion-safety.json)。其中 1,928,584 个环样本位于岛面后方并通过遮挡几何检查，不能误读为棋子遮挡错误 |
| `npm run build:web` | PASS，使用本机 Creator，[构建日志](evidence/project-slimdown/build-web.log)、[Creator 日志](evidence/project-slimdown/creator-build.log) |
| 实际包清单 | PASS，两个正式场景、现用模型存在、退役资源路径为零，[清单](evidence/project-slimdown/built-inventory.json) |
| 编辑器场景 | PASS，仅两个有效正式场景，[清单](evidence/project-slimdown/editor-scenes.json) |
| 结构化场景引用 | PASS，解析 `__id__`、`__uuid__`、`__type__` 后检查节点与脚本元数据，[结果](evidence/project-slimdown/structured-scene-validation.json) |
| 网页实测 | PASS，实际新构建包，1280×720；拖拽、模式往返、战斗/奖励、菜单与继续游戏正常，[记录](evidence/project-slimdown/browser-summary.json) |
| 网页控制台 | 0 error、2 warn：LabelOutline.color/width 弃用提示，尚未处理；[原日志](evidence/project-slimdown/browser-console.json) |

补充诊断限制：MCP 的通用文本依赖检查返回了 26 个“缺失候选”，[原结果保留](evidence/project-slimdown/editor-dependency-diagnostic.json)。其中包含节点自身 ID、`alignCanvasWithScreen` 等属性名和压缩脚本类 ID，不能将这项扫描标为通过，也不能据此判定资源丢失。结构化检查、真实构建与浏览器结果分别列在上表。

## 实际网页截图

以下来自本轮 `build/web-desktop`，本机临时地址 `http://127.0.0.1:8767/`；检查后已关闭临时页和服务并还原浏览器视口。

![拖拽上阵后的新版棋盘](evidence/project-slimdown/02-drag-deployed.jpg)

[2D 模式](evidence/project-slimdown/03-2d-mode.jpg)、[恢复 3D](evidence/project-slimdown/04-3d-restored.jpg)、[战斗结算与血条](evidence/project-slimdown/05-battle.jpg)、[返回菜单](evidence/project-slimdown/06-return-menu.jpg)、[继续游戏后重新载入](evidence/project-slimdown/07-reentered.jpg)。

## 仍未验收的范围

- 904×871 等窄视口裁切和输入、外围装饰与 UI 的遮挡优化仍 OPEN；未调整全局 UI 缩放。
- Android 重建/真机、持续 FPS/draw call 性能仍 NOT_RUN；截图内的瞬时性能面板不能作为达标证明。
- 两条 LabelOutline 弃用提示仍 OPEN；没有扩展本轮清理去改表现逻辑。
- 这份报告证明批准清单已完成，不能证明所有动态加载路径或所有历史临时文件都已无用；保留有效测试输入与活动开发数据是有意的。
