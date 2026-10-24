# 项目导航

Cocos Creator 3.8.8 / TypeScript。当前有 25 名可购买棋子，初始普通牌库 23 名；黑星咒术师、奥瑞斯在特殊商店购买后解锁本局牌库。暗影、日辉各 8 名，机械先驱 7 名，星穹 4 名（与原阵营可重叠）；另有 30 种野怪。实际数值以运行时 JSON 配置为准。

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
| tests/、tools/ | 回归检查、模拟、构建及实验工具 |

配置均位于 assets/resources/config/：units.json 配棋子；skills.json 配技能；battle.json 配战斗、羁绊和定位回蓝；run.json 配开局、关卡和奖励；equipment.json、equipment-policy.json 配装备及敌方装备策略。

棋子资源从 view/ArtPaths.ts 的 UNIT_ART、UNIT_SPRITE 接入 UnitView.ts，MainMenu.ts 负责开局预加载。修改图片时同时维护 .meta，不通过随意移动资源改变 UUID。

## 当前规则与实现记录

| 内容 | 文档 |
| --- | --- |
| 羁绊系统 | [总览](traits.md)、[职业羁绊及当前成员](class-traits.md) |
| 特殊商店与装备授予羁绊 | [购买解锁、名单删除与万象共鸣徽记](special-shop-and-emblem.md) |
| 商店区域与特殊商店概率 | [弹出动画、专属棋子费用概率与验收](shop-dock-popup-and-rates.md) |
| 开局奇遇扩充 | [六个奇遇随机三选一、新增金币／经验／治疗及验收](opening-expansion.md) |
| 后续内容更新 | [主菜单设置、1-1 商店禁用、魂灯成长与疾咒秘铠](soul-lamp-and-overdrive.md) |
| 防御装备更新 | [圣谕庇护、千锻玄甲与受伤层数显示](defensive-equipment.md) |
| 战士羁绊 | [征战者与魔剑士：机制、数值与验证](warrior-traits.md) |
| 暗影 | [羁绊](shadow-trait.md)、[十棋子](shadow-roster-v3.md)、[技能动画](shadow-animations.md) |
| 日辉 | [羁绊与十棋子](sunlight-roster.md)、[技能动画](sunlight-animations.md) |
| 机械先驱 | [羁绊](mechanical-pioneer-trait.md)、[七棋子与验收](mechanical-units.md)、[技能动画](mechanical-animations.md) |
| 星穹／星铠守卫／弥露 | [星穹羁绊](astral-trait.md)、[星铠守卫与验收](star-armor-guard.md)、[弥露与两人专属特效](milu-and-astral-unit-fx.md) |
| Android 打包与提交 | [2026-10-22 ARM64 APK 与完整版本验收](android-20261022-astral.md) |
| 塞拉菲尔 | [连击、末击与击杀追击](seraphiel-combo.md) |
| 关卡流程 | [收入、阶段布局与奖励](round-income-and-stage-rewards.md) |
| 五系野怪 | [30只野怪、强度继承与验收](fantasy-monsters.md) |
| 战斗计时与人口提示 | [加时与界面规则](combat-hud-overtime.md) |
| 存档和库存 | [状态一致性修复记录](state-consistency-audit.md) |
| 旧名单下线 | [名单及专属素材清理](roster-removal.md) |

功能文档中的验收数量与截图属于其标注版本；后续更新以文档开头的说明及当前配置为准。2026-10-19 已清理旧名单规则、旧版根目录预览，以及失效的原住民、火影和手动推进验收材料；不再将旧完整测试通过数量列为当前验证结果。

## 检查与构建

| 命令 | 范围 |
| --- | --- |
| npm run check:resources | 贴图、SpriteFrame 元数据、棋子/野怪及配置引用 |
| npm run test:ui | 界面交互及异步资源模拟 |
| npm run test:stages | 随机开局、定位回蓝、阶段奖励、存档及掉落概率 |
| node tests/stage-reward-validation-tests.cjs | 奖励存档、价值守恒及重复商品拒绝 |
| node tests/regression-tests.cjs | 场景适配层的商店、拖拽、结算及存档联动 |
| npm test | 编译与全部套件执行，逐组汇总失败 |
| npm run build:web | 网页构建及实际构建产物检查 |

2026-10-23 最新完整入口 92 组通过、0 组失败，两件防御装备的实际浏览器交互和场景诊断通过，见[本轮验收](defensive-equipment.md)。此前特殊商店与徽记版本的 Web 构建记录见[上一轮验收](special-shop-and-emblem.md)。Node 组件替身、编辑器诊断、浏览器预览、发布构建和设备实测分别验收。

## 历史实验与生成文件

p0-enemy-difficulty/、p1-enemy-difficulty/、p2-enemy-formation/、p3-equipment/、p4-balance/、p4r1-bot-qualification/ 和 shop-pricing/ 是历史实验资料。其中冻结配置、汇总、日志及哈希记录仍被测试或模拟工具消费，保留原输入与失败结论。归档通过根目录 .gitattributes 保留原字节，不作为当前名单的平衡达标证明。

[原始输出清单](simulation-output-cleanup.json)记录此前删除的 335 份大型模拟输出，共约 17.46 GiB；[seed17 样本](../tests/fixtures/balance-seed17-summary.json)保留原文件与逐关动作哈希。这份清单也供归档完整性检查使用。

模拟清理工具 tools/clean-simulation-output.ps1 默认仅统计，加 -Apply 才删除限定目录中的 per-run.jsonl、per-wave.csv 和 parts/*.jsonl；保留冻结配置、汇总及必要样本。

.test-build/ 可由测试入口重新生成。library/、temp/、build/、node_modules/ 等为本地缓存、构建或依赖，已忽略。2026-10-21 经用户按 A/B/C 类确认后，清理了明确列出的 Android/测试缓存、退役预览及重复大备份，保留活动编辑器数据、冻结输入与有效源文件；见[瘦身报告](project-slimdown.md)及[操作清单](project-slimdown-plan.md)。历史报告中已移出的备份可按原相对路径在报告所列外部归档中查找，历史结论保持原样。
