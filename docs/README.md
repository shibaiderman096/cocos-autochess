# 项目导航

Cocos Creator 3.8.8 / TypeScript。2026-10-29 同步：47 名可购买棋子，初始普通牌库 42 名；云珑龙姬、星环大贤者、黑星咒术师、虚痕掠杀者、奥瑞斯需旅行商店购买解锁。另有 30 种野怪、恶魔召唤物阿撒洛斯，以及七种阵营、九种职业羁绊。实际数值以运行时 JSON 配置为准。

[当前规则](current-rules.md)集中说明宝箱预算与概率、高星棋子、探险家、旅行／铁匠／幸运商店和移动端操作。较早的功能记录保留设计与验收历史，与当前规则不一致时，以当前配置及这份同步说明为准。

## 目录与维护入口

| 路径 | 用途 |
| --- | --- |
| assets/main.scene、assets/floating-ruins.scene | 主菜单与正式战斗舞台 |
| assets/scripts/battle/ | 不依赖 Cocos 的战斗、伤害、回蓝和事件 |
| assets/scripts/core/ | 配置、商店、卡池、存档、关卡生成与 RunSession |
| assets/scripts/ui/、assets/scripts/view/ | 面板、奖励、棋盘、资源映射与战斗回放 |
| assets/resources/config/ | 游戏实际读取的配置 |
| assets/resources/art/ | 运行时图片及配套 .meta |
| art-source/ | 当前素材源图、来源与提示词 |
| tools/ | 资源处理、模拟、构建及实验工具；现有测试已删除 |

配置均位于 assets/resources/config/：units.json 配棋子；skills.json 配技能；battle.json 配战斗、羁绊和定位回蓝；run.json 配开局、关卡和奖励；equipment.json、equipment-policy.json 配装备及敌方装备策略。

棋子资源从 view/ArtPaths.ts 的 UNIT_ART、UNIT_SPRITE 接入 UnitView.ts，MainMenu.ts 负责开局预加载。修改图片时同时维护 .meta，不通过随意移动资源改变 UUID。

## 当前规则与实现记录

| 内容 | 文档 |
| --- | --- |
| 当前玩法与近期更新 | [宝箱概率、高星奖励、三类商店、道具与界面](current-rules.md) |
| 羁绊系统 | [总览](traits.md)、[职业羁绊及当前成员](class-traits.md) |
| 特殊商店与装备授予羁绊 | [购买解锁、名单删除与万象共鸣徽记](special-shop-and-emblem.md) |
| 商店区域与特殊商店概率 | [弹出动画、专属棋子费用概率与验收](shop-dock-popup-and-rates.md) |
| 开局奇遇 | [九种奇遇](nine-encounters.md)、[早期扩充记录](opening-expansion.md) |
| 后续内容更新 | [主菜单设置、1-1 商店禁用、魂灯成长与疾咒秘铠](soul-lamp-and-overdrive.md) |
| 防御装备更新 | [圣谕庇护、千锻玄甲与受伤层数显示](defensive-equipment.md) |
| 战士羁绊 | [征战者与魔剑士：机制、数值与验证](warrior-traits.md) |
| 暗影 | [羁绊](shadow-trait.md)、[十棋子](shadow-roster-v3.md)、[技能动画](shadow-animations.md) |
| 日辉 | [羁绊与十棋子](sunlight-roster.md)、[技能动画](sunlight-animations.md) |
| 机械先驱 | [羁绊](mechanical-pioneer-trait.md)、[七棋子与验收](mechanical-units.md)、[技能动画](mechanical-animations.md) |
| 血魔／探险家／恶魔 | [当前羁绊与成员](traits.md)、[血魔棋子与技能](bloodfiend-roster.md)、[探险家宝箱与高星概率](current-rules.md#探险家宝箱) |
| 星穹／星铠守卫／弥露 | [星穹羁绊](astral-trait.md)、[星铠守卫与验收](star-armor-guard.md)、[弥露与两人专属特效](milu-and-astral-unit-fx.md) |
| Android 打包与提交 | [2026-10-22 ARM64 APK 与完整版本验收](android-20261022-astral.md) |
| 关卡宝箱 | [野怪／精英／Boss 固定品质与星级概率](encounter-chest.md) |
| 关卡流程 | [收入、阶段布局与奖励](round-income-and-stage-rewards.md) |
| 五系野怪 | [30只野怪、强度继承与验收](fantasy-monsters.md) |
| 战斗计时、人口与统计 | [加时、固定统计条与滚动操作](combat-hud-overtime.md) |
| 存档和库存 | [状态一致性修复记录](state-consistency-audit.md) |
| 旧名单下线 | [名单及专属素材清理](roster-removal.md) |

功能文档中的验收数量与截图属于其标注版本；后续更新以文档开头的说明及当前配置为准。2026-10-19 已清理旧名单规则、旧版根目录预览，以及失效的原住民、火影和手动推进验收材料；不再将旧完整测试通过数量列为当前验证结果。

## 检查与构建

| 命令 | 范围 |
| --- | --- |
| npm run check:resources | 贴图、SpriteFrame 元数据、棋子/野怪及配置引用 |
| npx tsc --noEmit -p tsconfig.json | 当前源码类型检查 |
| npm run build:web | 网页构建及实际构建产物检查 |

2026-10-29 伤害统计滚动调整在清理前通过 TypeScript 检查和实际浏览器预览，覆盖桌面滚轮、移动端触摸、实时刷新保留位置、列表末行与页签切换。随后按用户要求移除全部测试、夹具、运行器、预览验收脚本与 `.test-build/`，并删除 `npm test`、`test:ui`、`test:stages`、`test:web` 和 `smoke` 入口；历史文档中的相关文件名仅作当时记录。此次未构建 APK 或进行真机验证，历史完整测试计数不作为当前版本的通过结果。

## 历史实验与生成文件

p0-enemy-difficulty/、p1-enemy-difficulty/、p2-enemy-formation/、p3-equipment/、p4-balance/、p4r1-bot-qualification/ 和 shop-pricing/ 是历史实验资料，保留冻结配置、汇总、日志及哈希记录的原输入与失败结论。归档通过根目录 .gitattributes 保留原字节，不作为当前名单的平衡达标证明；清理测试后不承诺其历史测试命令仍可执行。

此前曾清理大型模拟原始输出，保留的历史实验目录按其冻结记录解释。原 `tests/fixtures/` 中的 seed17 样本随本次全部测试一并删除，其他历史报告保持原样。

library/、temp/、build/、node_modules/ 等为本地缓存、构建或依赖，已忽略。历史实验输入与结论保持原样。当前开发另起新存档，不再添加旧存档迁移或兼容测试；当前格式的保存、读取及数据校验逻辑继续保留。
