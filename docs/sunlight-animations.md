# 日辉绘制特效动画

本次为全部10名日辉棋子、羁绊审判和10日辉棋盘场地接入透明绘制素材。使用内置 `image_gen` 生成6张独立RGBA PNG，原图逐字节复制进项目，没有重绘或裁剪已有角色立绘。

## 素材交付

[完整提示词](../art-source/sunlight-vfx/prompts.json) · [尺寸、来源和SHA-256清单](../art-source/sunlight-vfx/asset-manifest.json)

| 素材 | 项目文件 | 用途 |
|---|---|---|
| 太阳屏障 | [sunlight_barrier.png](../assets/resources/art/fx/sunlight_barrier.png) | 护盾展开、持续呼吸和破盾前提示 |
| 日辉箭矢 | [sunlight_arrow.png](../assets/resources/art/fx/sunlight_arrow.png) | 三连箭、贯穿天枪、远程普攻与跃迁残光；原图朝右 |
| 烈阳弧光 | [sunlight_slash.png](../assets/resources/art/fx/sunlight_slash.png) | 普攻、连斩、开山、余烬圣刃；原图凸面朝右 |
| 太阳法印 | [sunlight_sigil.png](../assets/resources/art/fx/sunlight_sigil.png) | 蓄力、祷言、落点预告、命中法阵与冲击波 |
| 审判光柱 | [sunlight_judgment.png](../assets/resources/art/fx/sunlight_judgment.png) | 羁绊审判、天穹大审判；落点按图像底部10%处定位 |
| 日冕领域 | [sunlight_field.png](../assets/resources/art/fx/sunlight_field.png) | 10日辉持续场地，中心透出棋子和格线 |

所有图片带真实透明通道，法印、领域和屏障中心透明；导入元数据保留完整原图、关闭裁边和动态合图。源文件仍保存在内置工具生成目录，游戏运行只消费项目内文件。

## 十名棋子的动画

| 棋子 | 技能动画 | 实际预览 |
|---|---|---|
| 赫利昂 | 太阳屏障展开并呼吸，技能盾结束时双层冲击波 | [截图](evidence/sunlight-animations/skill-helion.png) |
| 赛芙 | 三枚定向日辉箭，第三箭更亮更大 | [截图](evidence/sunlight-animations/skill-saiph.png) |
| 布隆达 | 更宽的圣垒护盾，友军护盾使用同系图像，脚下出现太阳法印 | [截图](evidence/sunlight-animations/skill-bronda.png) |
| 凯鲁 | 跃迁起落法印、定向残光、交替展开的三连弧光斩 | [截图](evidence/sunlight-animations/skill-kaeru.png) |
| 雷昂 | 朝目标展开的大幅烈阳弧光，命中获得太阳屏障 | [截图](evidence/sunlight-animations/skill-leon.png) |
| 菲妮娅 | 三道圣刃环绕，强化普攻出现弧光，末次爆炸扩散交叉刃光 | [截图](evidence/sunlight-animations/skill-phinia.png) |
| 艾蕾娅 | 蓄力法印收拢，宽大日光天枪沿贯穿射线飞行 | [截图](evidence/sunlight-animations/skill-aurelia.png) |
| 瑟琳 | 覆盖技能范围的旋转太阳法阵、柔光光柱，祷言结束时扩散光环 | [截图](evidence/sunlight-animations/skill-celine.png) |
| 奥瑞斯 | 目标脚下出现预告法印，延迟后落下多道大审判光柱 | [截图](evidence/sunlight-animations/skill-oris.png) |
| 塞拉菲尔 | 锁定目标连续弧光，末击使用更大的弧光和法印；初次施法与击杀追击时出现跃迁残光 | [连击与追击预览](seraphiel-combo.md#实际预览) |

## 羁绊与场地

7/10日辉审判使用独立的太阳落雷光柱和双层落地法印。10档现为每秒随机选择一名敌人并立即结算（1000＋目标最大生命值10%）真实伤害和1秒眩晕；不再附加持续掉血或其短促光环。各档羁绊破盾伤害及爆炸事件已取消，棋子主动技能爆炸保留。已取消持久的头顶太阳印；奥瑞斯施法前的短暂法阵只用于预告落点，不施加任何目标状态。

10日辉开战时展开一个覆盖棋盘的日冕领域，位于棋盘格上方、棋子下方。外沿缓慢旋转并呼吸，每2秒扩散一轮光波，周围光点升起。效果持续至战斗结束，不因最初来源棋子阵亡而消失。双方同时触发只保留一套全场图像，防止重复叠亮。原先2秒的开场圆环已由持续场地替代。

[当前面板与短名称](evidence/sunlight-balance/10-trait.png) · [当前每秒审判及四星统计](evidence/sunlight-balance/10-judgment-2s.png) · [调整前战斗动画录像](evidence/sunlight-cleanup/sunlight-combat.webp)

## 接入与验证

- 表现实现：[SunlightSpriteVfx.ts](../assets/scripts/view/SunlightSpriteVfx.ts)，由正式 `BattleReplayer` 消费 `sun_pulse`、施法、普攻、跃迁、死亡与结束事件。
- 逻辑只增加技能类型、受影响棋子和连段序号等表现信息，不改伤害、护盾、控制、技能时机和随机数。永久技能盾的表现事件用0表示持续，保持事件可以JSON序列化。
- 动画全部使用回放Tick；暂停、逐帧推进和加速共用时间轴。护盾跟随携带者，消耗后停止；强化圣刃跟随增益状态停止。战斗结束、重开和销毁会清理节点，异步纹理回调不会复活旧效果。
- 临时层最多192个，纹理按路径缓存；场地层和瞬时层共用可复用节点池。法印在旋转后压扁为棋盘透视，箭矢和斩击按实际攻击向量旋转。

已运行 `sunlight-animation-tests`、`sunlight-tests`、`sunlight-ui-tests`、暗影面板回归、伤害统计、职业羁绊、旧存档显示兼容与资源检查；本次数值调整的最新结果见[验证日志](evidence/sunlight-balance/checks.log)。新增动画检查已加入正式测试入口。TypeScript诊断无错误。删除标记机制、日冕印记和结束爆炸时，通用设计校验仍有此前同类的6条错误、100条警告，详见当时的[设计校验日志](evidence/sunlight-cleanup/unit-validator.log)；本次数值调整未修改棋子技能配置。

最初接入时，固定种子1019、浏览器1280×720检查了十名棋子的技能特写、10档开战至4秒的持续场地、多道审判光柱和切换后的清理。上表中位于 `sunlight-animations` 的截图是该轮历史记录；删除印记后的技能文本见 `sunlight-cleanup`，最新羁绊说明与每秒审判统计见 `sunlight-balance`。未运行全量平衡资格验证，也未进行Android设备测试。
