# 浮空棋境

Cocos Creator 3.8.8 / TypeScript 自走棋 PVE 项目。用 Creator 打开项目后，从 assets/main.scene 启动；战斗场景为 assets/floating-ruins.scene。

截至 2026-10-31（alpha1.0），当前可购买棋子共 50 名，初始普通牌库包含 43 名；冥焰战铠、幽蓝誓刃、云珑龙姬、星环大贤者、黑星咒术师、虚痕掠杀者、奥瑞斯需在旅行商店购买后解锁本局牌库。另有 30 种野怪，以及恶魔羁绊召唤物炼狱魔君·阿撒洛斯。羁绊包含七种阵营和九种职业。名单、数值和资源以 assets/resources/config/ 中的配置及运行时映射为准。

## 开发入口

- [项目目录、配置与文档导航](docs/README.md)
- [当前规则：宝箱概率、高星奖励、三类旅行商店与界面操作](docs/current-rules.md)
- [羁绊总览](docs/traits.md)、[职业羁绊](docs/class-traits.md)
- [特殊商店解锁、名单调整与万象共鸣徽记](docs/special-shop-and-emblem.md)
- [主菜单设置、1-1 商店禁用、魂灯成长与疾咒秘铠](docs/soul-lamp-and-overdrive.md)
- [圣谕庇护、千锻玄甲与受伤层数显示](docs/defensive-equipment.md)
- 历史设计：[暗影十棋子](docs/shadow-roster-v3.md)、[日辉十棋子](docs/sunlight-roster.md)
- [血魔棋子与技能](docs/bloodfiend-roster.md)
- [战斗界面、固定统计条与上下滚动](docs/combat-hud-overtime.md)
- [收入、阶段与奖励规则](docs/round-income-and-stage-rewards.md)
- [五系30只野怪与替换验收](docs/fantasy-monsters.md)

战斗模拟位于 assets/scripts/battle/，保持纯 TypeScript；配置、商店、存档和关卡流程位于 assets/scripts/core/。界面、棋子显示及回放位于 ui/ 和 view/。

## 常用命令

在项目根目录安装依赖后执行：

| 命令 | 用途 |
| --- | --- |
| npm run check:resources | 运行资源及配置引用检查 |
| npx tsc --noEmit -p tsconfig.json | 类型检查 |
| npm run build:web | 通过本机 Creator 构建网页并检查产物 |

Android 打包入口为 tools/build-android.ps1，需要本机 Creator、JDK、Android SDK/NDK。生成的构建、依赖和编辑器缓存不提交源码仓库。2026-10-29 按用户要求删除现有全部测试、夹具、预览验收脚本及测试命令，保留类型、资源与打包检查。

自动测试、编辑器诊断、浏览器预览、构建和设备实测分别记录。2026-10-29 伤害统计列表通过 TypeScript 检查、桌面滚轮和移动端触摸浏览器预览；没有将这次界面改动重新打包或做真机验收。检查入口见[当前规则](docs/current-rules.md#检查入口与验收边界)。历史报告的通过数量不代表当前完整回归或阵容平衡资格。

## 文件维护

运行资源与其 .meta 一起维护，避免破坏 Cocos UUID。art-source/ 保留当前素材的源图、提示词和来源；docs/evidence/ 中的截图和日志按各次验收记录解释。

P0～P4 及 P4-R1 的冻结配置、汇总和哈希证据保留为历史实验资料，不代表当前阵容的平衡资格。大型模拟原始输出的清理记录见 [项目导航](docs/README.md#历史实验与生成文件)。

旧版实验和素材整理记录按其原始版本解释；当前开发使用新存档，不再维护或测试旧存档迁移。
