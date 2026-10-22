# 新版遗迹棋盘接入正式场景

2026-10-21。按用户“将主场景切换，删除旧场景”的授权，将参考图版接为正式战斗场景。原来仅制作独立预览的限制在本轮正式入口替换范围内解除。

## 实际入口与删除范围

- 正式流程：`main.scene` 主菜单 → `floating-ruins.scene` 新棋盘 → 返回主菜单。保留阶段选择、开始/继续游戏，不跳过正常开局流程。
- 新正式战斗场景：`assets/floating-ruins.scene`，UUID `a0d4eec6-a9f6-4ac4-8a92-d0ebcca31aa1`。编辑器已打开此场景。
- 删除旧正式战斗场景 `assets/scene.scene` 及 `.meta`；资源库查询其旧 UUID 返回 null。
- `settings/v2/packages/builder.json` 注册新场景，移除旧场景，启动场景仍为主菜单；本地预览起始场景也改为主菜单。Android 构建脚本复用此公共场景清单，但本轮没有构建或运行 Android。
- 保留 P0/P1/P2/参考图专项预览及其他角色预览，供回归与历史对照；本轮没有删除模型、Blender 原件、旧证据或无关场景。

## 正式表现组件与必要修复

新增 `assets/scripts/view/FloatingRuinsBoard.ts`，从参考预览提取正式表现：载入新 GLB、固定相机/1024×768 RenderTexture、2D/3D 切换、高/低/静态画质及动画暂停。使用实际游戏存档，没有预览的 localStorage 代理、临时存档空间、全局分辨率策略修改、校准按钮或重新绑定按钮。392 点校准记录在控制台，正常界面不显示校准数值。

真实网页返回时曾出现空节点访问和重复销毁，保留[失败控制台](evidence/floating-ruins-main-switch/scene-exit-failure-console.json)。原因是子节点已被引擎销毁，Canvas 组件随后再次访问/销毁它们。修复正式表现组件与共享环境控制器的失效节点处理，并在 `BattleUI.onDestroy` 中检查背景是否仍有效；第一次修复残留的[背景重复销毁警告](evidence/floating-ruins-main-switch/scene-exit-first-fix-warning.json)也保留。新增生命周期回归覆盖空节点、先销毁的子节点、已排队销毁资源及重复清理；复用 P2 的 20 轮模式/画质/暂停/重绑/TRS 恢复检查，针对本版实际 GLB 执行，不调用历史证据写入器。

没有修改棋盘几何、HexMath、Grid、战斗模拟、棋子/装备/经济数值或存档格式。模型与 Blender 文件沿用上一版，没有重新导出。

## 文件

| 路径 | 本轮变化 |
|---|---|
| `assets/floating-ruins.scene` 与 `.meta` | 新正式战斗场景 |
| `assets/scripts/view/FloatingRuinsBoard.ts` 与 `.meta` | 新正式表现组件 |
| `assets/scripts/ui/MainMenu.ts` | 新开局和继续游戏路由改到新版 |
| `settings/v2/packages/builder.json` | 替换正式构建中的战斗场景 |
| `profiles/v2/packages/preview.json` | 本地预览从主菜单开始 |
| `assets/scripts/view/FloatingRuinsEnvironmentAnimator.ts` | 子节点已销毁时安全清理 |
| `assets/scripts/ui/BattleUI.ts` | 背景已销毁/排队时避免重复销毁 |
| `tests/ui-interaction-tests.cjs` | 正式入口/场景引用及背景清理回归 |
| `tests/floating-ruins-scene-lifecycle-tests.cjs` | 新版 GLB 与真实组件的生命周期边界回归 |
| `tools/run-tests.ps1` | 注册新增套件 |
| `tools/report-floating-ruins-main-switch.py` | 备份、变更范围、构建场景与交付清单复核 |
| `assets/scene.scene` 与 `.meta` | 从项目删除；精确内容已备份 |

## 验证与真实日志

| 检查 | 结果 |
|---|---|
| `npm run check:resources` | PASS，[日志](evidence/floating-ruins-main-switch/check-resources.log) |
| `npx tsc --noEmit -p tsconfig.json` | PASS，清理修复后重跑，[日志](evidence/floating-ruins-main-switch/typecheck-final.log) |
| `npm test` | PASS，新增套件后 72 套通过、0 失败，[日志](evidence/floating-ruins-main-switch/npm-test-final.log)。最后背景清理修订后再次单独运行 UI 与生命周期套件均通过，[结果](evidence/floating-ruins-main-switch/fix-check-exits.json) |
| 正式入口和 UI 定向回归 | PASS，[最终日志](evidence/floating-ruins-main-switch/ui-tests-final.log) |
| 组件销毁与新模型 20 轮生命周期 | PASS，[日志](evidence/floating-ruins-main-switch/lifecycle-tests.log) |
| `npm run build:web` | PASS，最终包[日志](evidence/floating-ruins-main-switch/build-web-verified.log)。第一次沙箱内启动失败 -2147483645，保留[失败日志](evidence/floating-ruins-main-switch/build-web.log)；经本机执行授权后成功构建，清理修复后再次构建成功 |
| 实际 Web 场景清单 | PASS，[构建清单](evidence/floating-ruins-main-switch/built-scenes.json) 仅包含主菜单与新正式棋盘，已无旧 `scene.scene` |

Web 交互使用实际 `build/web-desktop` 包，经本机独立测试地址 `http://127.0.0.1:8767/` 提供；不是 Creator 专项预览冒充正式包。1280×720 验收，见[网页最终记录](evidence/floating-ruins-main-switch/browser-summary.json)。

最终清理修复后的实际包完成“同版本继续 → 新棋盘 → 返回主菜单 → 再次继续 → 新棋盘”。两次载入均为 56 中心+336角点、392 点 PASS，最大角点误差 `0.0000124560881371 px`，原 `<0.5 px` 阈值保持；两次均绑定17枢轴、一个环境叠层。该次记录控制台 error/warn 为0，见[最终控制台](evidence/floating-ruins-main-switch/browser-final-console.json)。单位仍在先前拖拽的棋盘位置。临时浏览器尺寸已恢复，测试页已关闭。

![正式包新版棋盘](evidence/floating-ruins-main-switch/build-verified-reentry.png)

[正式主菜单](evidence/floating-ruins-main-switch/build-menu.png)、[拖拽上阵](evidence/floating-ruins-main-switch/build-drag.png)、[2D 切换](evidence/floating-ruins-main-switch/build-2d.png)。最后修复前的截图保留其真实状态；最终往返验收截图和控制台单独命名。

[最终包首次载入](evidence/floating-ruins-main-switch/build-verified-board.png)、[最终包返回主菜单](evidence/floating-ruins-main-switch/build-verified-return-menu.png)、[最终包再次进入](evidence/floating-ruins-main-switch/build-verified-reentry.png)。本轮没有在最终包中重新打一整场战斗；不将上一轮战斗结果当成本次新验收。

## 备份与保护

当前工作树已有大量用户未提交文件。本轮先记录 [状态](evidence/floating-ruins-main-switch/before-status.txt)、工作树/暂存区差异和 3,284 个存在文件的哈希，再将删除与修改前的目标文件存入 [before-switch.zip](evidence/floating-ruins-main-switch/before-switch.zip)，追加必要清理修复前的原文件，逐件核验。旧场景可以从归档恢复其原内容与 UUID。

[最终保护结果](evidence/floating-ruins-main-switch/protection.json)：6 个原文件按本轮范围修改，2 个旧场景文件按授权删除，意外变化为0；[11 个备份文件核验](evidence/floating-ruins-main-switch/backup-verification.json)通过，[文件哈希清单](evidence/floating-ruins-main-switch/delivery-files.json)。本地 profiles 设置不在 Git 文件基线中，单独纳入修改前备份。没有 reset、提交或推送。上一轮 P1 原 `.blend` 的保存变更仍是历史 OPEN，本轮按开始时状态保留，没有自动恢复它，也没有回写旧报告或旧证据。

## 未完成与限制

- **OPEN：旧浏览器存档配置不兼容。** 原 localhost:7456 中点击继续游戏报 `Saved enemy difficulty configuration mismatch`，来自现有 `RunSession` 的战斗配置身份检查。保存[报错截图](evidence/floating-ruins-main-switch/legacy-save-error.png)与[控制台](evidence/floating-ruins-main-switch/legacy-save-console.json)，没有清空原存档或放宽兼容检查。新开局与同版本继续流程在独立测试地址验证。
- **OPEN：外围建筑仍被原 UI 遮挡，904×871 窄视口裁切/输入仍未解决。** 本轮没有调整全局 UI 缩放、棋盘坐标或固定镜头。
- **NOT_RUN：Android、持续性能采样、全角色/技能压力和窄视口完整验收。** 调试包截图中的单帧统计不代表移动设备达标或持续性能结论。
- 切换正式场景不等于上一轮全部美术/P2/P3 验收通过；以上 OPEN 项保留。

场景管理与生命周期处理参考 [Creator 3.8 场景管理](https://docs.cocos.com/creator/3.8/manual/en/scripting/scene-managing.html)、[创建和销毁节点](https://docs.cocos.com/creator/3.8/manual/en/scripting/create-destroy.html)。
