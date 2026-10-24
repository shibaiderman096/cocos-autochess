# 浮空棋境

Cocos Creator 3.8.8 / TypeScript 自走棋 PVE 项目。用 Creator 打开项目后，从 assets/main.scene 启动；战斗场景为 assets/floating-ruins.scene。

当前可购买棋子共 25 名，初始普通牌库包含 23 名；黑星咒术师、奥瑞斯需在特殊商店购买后解锁本局牌库。暗影、日辉各 8 名，机械先驱 7 名，星穹 4 名（可与其他阵营重叠）；另有 30 种野怪。羁绊包括这四种阵营和九种职业羁绊。名单、数值和资源以 assets/resources/config/ 中的配置及运行时映射为准。

## 开发入口

- [项目目录、配置与文档导航](docs/README.md)
- [羁绊总览](docs/traits.md)、[职业羁绊](docs/class-traits.md)
- [特殊商店解锁、名单调整与万象共鸣徽记](docs/special-shop-and-emblem.md)
- [主菜单设置、1-1 商店禁用、魂灯成长与疾咒秘铠](docs/soul-lamp-and-overdrive.md)
- [圣谕庇护、千锻玄甲与受伤层数显示](docs/defensive-equipment.md)
- 历史设计：[暗影十棋子](docs/shadow-roster-v3.md)、[日辉十棋子](docs/sunlight-roster.md)
- [塞拉菲尔连续斩击与追击](docs/seraphiel-combo.md)
- [收入、阶段与奖励规则](docs/round-income-and-stage-rewards.md)
- [五系30只野怪与替换验收](docs/fantasy-monsters.md)

战斗模拟位于 assets/scripts/battle/，保持纯 TypeScript；配置、商店、存档和关卡流程位于 assets/scripts/core/。界面、棋子显示及回放位于 ui/ 和 view/。

## 常用命令

在项目根目录安装依赖后执行：

| 命令 | 用途 |
| --- | --- |
| npm run check:resources | 运行资源及配置引用检查 |
| npm test | 编译并逐组运行测试，汇总成功和失败 |
| npm run test:ui | 界面交互模拟检查 |
| npm run test:stages | 开局、定位回蓝、阶段奖励与掉落检查 |
| npm run build:web | 通过本机 Creator 构建网页并检查产物 |
| npm run test:web | 检查已有网页构建产物 |

Android 打包入口为 tools/build-android.ps1，需要本机 Creator、JDK、Android SDK/NDK。生成的构建、依赖和编辑器缓存不提交源码仓库。

自动测试、编辑器诊断、浏览器预览、构建和设备实测分别记录。2026-10-23 最新完整测试为 92 组通过、0 组失败，两件防御装备的实际浏览器交互和场景诊断通过；范围及限制见[本轮记录](docs/defensive-equipment.md)。此前特殊商店与徽记版本的 Web 构建记录见[上一轮验收](docs/special-shop-and-emblem.md)。历史报告的通过数量不代表当前阵容的平衡资格。

## 文件维护

运行资源与其 .meta 一起维护，避免破坏 Cocos UUID。art-source/ 保留当前素材的源图、提示词和来源；docs/evidence/ 中的截图和日志按各次验收记录解释。

P0～P4 及 P4-R1 的冻结配置、汇总和哈希证据仍供测试读取，保留原字节。它们用于复现实验，不代表当前阵容的平衡资格。大型模拟原始输出的清理记录及工具见 [项目导航](docs/README.md#历史实验与生成文件)。

2026-10-21 项目瘦身：退役预览组件与重复大备份移至项目外归档，旧棋盘 GLB 改为 tests/fixtures/board-models/ 下的测试夹具，正式资源只保留现用模型。归档位置、逐文件清单和本轮验证见[瘦身报告](docs/project-slimdown.md)。
