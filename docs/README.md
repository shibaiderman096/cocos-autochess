# 项目导航

Cocos Creator 3.8.8 / TypeScript。入口为 `assets/main.scene`，战斗场景为 `assets/scene.scene`。本页整理当前维护入口；具体数值以运行时配置为准。

## 目录职责

| 目录 | 内容 |
| --- | --- |
| `assets/scripts/battle/` | 不依赖 Cocos 的战斗、伤害、回蓝和事件 |
| `assets/scripts/core/` | 配置、商店、卡池、存档、关卡生成、阶段奖励与 RunSession |
| `assets/scripts/ui/` | 主菜单、棋子/装备信息、统计、奖励和特殊商店 |
| `assets/scripts/view/` | 棋盘、棋子、血蓝条、特效回放、资源映射及战斗场景适配 |
| `assets/resources/config/` | 游戏实际读取的 JSON 配置 |
| `assets/resources/art/` | 运行时 PNG 与 Cocos `.meta`；原路径保持稳定 |
| `art-source/` | 美术原稿、来源、提示词及历史预览 |
| `tests/`、`tools/` | 自动回归、资源检查、模拟、构建和历史实验工具 |
| `docs/` | 规则说明、实际预览和按实验阶段保留的证据 |

`library/`、`temp/`、`.test-build/`、`build/`、`node_modules/` 等为生成物或依赖，已排除版本管理。`.meta` 与其资源一同维护；整理不通过移动或删除引擎资源来改变 UUID。历史报告和截图保留原位置，避免破坏引用。

## 常用配置和调用入口

| 内容 | 维护入口 |
| --- | --- |
| 棋子、技能、星级与定位回蓝 | `units.json`、`skills.json`、`battle.json` |
| 普通/强力野怪、第一阶段阵容、阶段布局和奖励池 | `run.json`；`RunSetup.ts`、`StageEncounters.ts`、`StageProgression.ts` |
| 装备属性及敌方装备分级 | `equipment.json`、`equipment-policy.json` |
| 棋子资源 | `view/ArtPaths.ts` 的 `UNIT_ART` → `UNIT_SPRITE` → `UnitView.ts`；`MainMenu.ts` 开局预加载 |
| 信息页每秒额外回蓝 | `ui/BattleUI.ts` → `view/ManaRegenBadge.ts`；棋盘和备战席不创建此标记 |
| 无渲染整局模拟 | `tools/run-sim.ts`、`tools/run-simulation.ts`；不是固定 3v3 的 `batch-sim.ts` |

上述配置文件均位于 `assets/resources/config/`，脚本均位于 `assets/scripts/` 下。

## 已复用的野怪素材

| 野怪 ID / 名字 | 原素材（相对 `assets/resources/`） | 射程 |
| --- | --- | --- |
| `red_guard` / 赤衣卫士 | `art/units/warrior_enemy.png` | 1 |
| `red_archer` / 赤衣弓手 | `art/units/archer_enemy.png` | 4 |
| `red_mage` / 赤衣法师 | `art/units/mage_enemy.png` | 3 |

三者属于普通野怪，沿用175生命、30攻击、10护甲/魔抗、0.75攻速、6.25%暴击率，无主动技能和法力；弓手和法师分别复用箭矢和魔法弹普攻特效。第一阶段第三关“赤衣营地”固定使用这三名野怪，后续普通野怪关也可随机抽到。野怪不进入玩家商店、卡池或棋子奖励池；末影巨龙仍保留独立强力野怪配置。

## 验证入口

在项目根目录执行：

| 命令 | 范围 |
| --- | --- |
| `npm run check:resources` | 注册贴图文件、SpriteFrame 元数据、棋子/野怪映射、技能与波次引用、三张素材的实际关卡接入 |
| `npm run test:ui` | 界面交互及异步资源模拟回归；详情保留回蓝、棋盘不创建标记、开局预加载野怪资源 |
| `npm run test:stages` | 随机开局、定位回蓝、阶段奖励/存档/库存，以及2000种子商店概率掉落 |
| `node tests/stage-reward-validation-tests.cjs` | 奖励存档字段、价值守恒与真实续局中的重复商店条目拒绝 |
| `node tests/regression-tests.cjs` | 场景适配层的商店、拖拽、结算、末帧缓冲与存档联动 |
| `npm test` | 编译及47组测试；每组均执行并汇报失败。当前玩法使用当前配置，历史波次/模型使用归档输入，保留实验材料按原哈希检查 |
| `npm run build:web` | 生成网页构建并执行构建回归；预览热更新不能代替发布构建 |

Node 界面模拟通过不等于实际预览通过；编辑器脚本诊断、浏览器操作、发布构建和设备验收分别记录。历史 P0～P4 报告对应其归档配置，不能直接作为当前内容的平衡达标证明。

## 规则与证据

- [收入、阶段布局、自动掉落与奖励](round-income-and-stage-rewards.md)
- [固定技能伤害与攻击力隔离](fixed-skill-damage-tuning.md)
- [定位双抗与少年佐助特效](role-defense-and-ninja-bolt.md)
- [近期棋子重做记录](seven-roles-rework.md)
- [存档与状态一致性审计](state-consistency-audit.md)
- [本次实际预览：三名野怪、详情回蓝、棋盘无标记](reused-monsters-detail-mana-preview.png)

本次已执行：资源检查（125种注册贴图、16个可购买棋子、8种野怪）、UI交互、阶段/回蓝/掉落测试、74项联动回归，以及编辑器 TypeScript 诊断。浏览器1280×720预览检查了赤衣营地、三张素材显示、棋子部署、信息面板切换及回蓝标记范围。

此前完整入口的旧伤害、强力野怪人数、首次施法次数及历史输入混用断言已修复：火球采用一星设定伤害210，经过40魔抗后为150；术士7次普攻配合持续回蓝施法，关闭持续回蓝时仍需8次；强力野怪独立检查单体人数及成长。没有为通过测试改动棋子数值或技能描述。最新完整测试47组通过，详情见[清理与验证记录](project-verification.md)。

## 清理模拟原始输出

`pwsh -NoProfile -File tools/clean-simulation-output.ps1` 默认只统计；加 `-Apply` 才删除。范围限于 `docs/p4-balance/`、`docs/p4r1-bot-qualification/` 的 `per-run.jsonl`、`per-wave.csv` 和 `parts/*.jsonl`，每个解析后的绝对路径均检查项目范围。删除前保存文件清单，保留汇总、冻结配置、日志和必要的小型回放样本。

本次清理335个文件，共18,746,970,935字节（约17.46GiB），[清单](simulation-output-cleanup.json)。原始记录已不在本地，旧报告中这些路径仅代表原实验出处；[seed17样本](../tests/fixtures/balance-seed17-summary.json)保留了原文件哈希与逐关动作哈希。归档目录通过 `.gitattributes` 保留原字节，避免行尾转换破坏证据哈希。
