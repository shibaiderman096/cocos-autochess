# 测试场景清理

2026-10-21，按用户“测试用的场景也删除”的授权执行。

项目和编辑器资源库现在仅保留 `assets/main.scene`（主菜单）与 `assets/floating-ruins.scene`（新版正式战斗场景）。删除 14 个测试/预览场景及各自 `.meta`，共 28 个文件；完整列表见[清单](evidence/preview-scenes-cleanup/manifest.json)。正式入口、正式场景内容、模型与 Blender 工程、游戏逻辑、数值和存档格式均未改动。

删除前将 28 个文件和 3 个需调整的测试文件备份到 [before-cleanup.zip](evidence/preview-scenes-cleanup/before-cleanup.zip)，逐文件校验压缩包内容一致。另保存原工作树状态、未暂存差异与暂存差异；没有 reset、提交或推送。

## 必要的检查维护

- P1 与参考图模型检查改为读取新版正式场景，确认固定相机、环境节点和构建注册。原有 GLB、56 中心/336 角点、材质与模式切换检查保留。
- UI 回归新增约束：整个 assets 目录只存在两个正式场景及其 meta，构建清单也只能注册这两个场景。
- 预览辅助脚本、自动化测试、模型、历史报告和历史证据保留。历史预览生成器/报告生成器依赖的场景已退役，不属于当前构建流程，不应再作为现行验收命令运行；历史报告不回写。
- 本地编辑器 `scene.json` 中两条旧预览相机视图记录仅是历史取景缓存，不是运行或构建引用，保留其原内容。

## 本轮验证

| 检查 | 实际结果 |
|---|---|
| 删除前备份 | PASS，31 个文件逐字节核验 |
| 编辑器资源库 | PASS，仅两个有效正式场景，见[编辑器清单](evidence/preview-scenes-cleanup/editor-scenes.json) |
| 资源检查 | PASS，[日志](evidence/preview-scenes-cleanup/check-resources.log) |
| TypeScript 检查 | PASS，[日志](evidence/preview-scenes-cleanup/typecheck.log) |
| P1 模型专项 | PASS，[日志](evidence/preview-scenes-cleanup/p1-tests.log) |
| 参考图模型专项 | PASS，[日志](evidence/preview-scenes-cleanup/reference-tests.log) |
| 全量测试 | PASS，72 套通过、0 失败，见[本轮日志](evidence/preview-scenes-cleanup/npm-test.log) |
| Web 构建 | PASS，[本机构建日志](evidence/preview-scenes-cleanup/build-web-local.log)。沙箱内启动 Creator 首次失败 -2147483645，保留[原日志](evidence/preview-scenes-cleanup/build-web.log)，本机重试成功 |
| 实际 Web 包场景 | PASS，仅 main 与 floating-ruins，见[包内清单](evidence/preview-scenes-cleanup/built-scenes.json) |
| 既有文件保护 | PASS，3347 个既有文件中仅删除清单内 28 个文件、修改 3 个测试文件，无额外差异，见[哈希核对](evidence/preview-scenes-cleanup/protection.json) |

本轮未重新执行浏览器交互或 Android 真机检查；之前记录的窄视口裁切/输入、外围装饰遮挡和设备性能问题仍未解决，不能以本次清理或构建成功替代验收。
