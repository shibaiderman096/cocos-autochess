# 暗影 · 半秒伤害、图文对齐与技能动画

10 暗影现在使用两个独立时钟：全体敌军每 **0.5 秒受到 100 固定真实伤害**；全体友军仍每 **1 秒获得 +20% 攻速**，最多累计 +200%。第一跳伤害在 0.5 秒，第一层攻速在 1 秒。七暗影的每秒 −2% 增伤衰减保持原时序。

`battle.json` 的 `board.intervalSeconds` 继续控制攻速，新增 `damageIntervalSeconds: 0.5` 控制伤害；旧配置未写新字段时使用原间隔。固定真实伤害仍保留护盾、不可选中、保命装备及伤害统计规则。战斗配置已改变，旧战斗存档仍受原有兼容检查保护。

羁绊卡片显示“暗影笼罩整个棋盘，侵蚀所有敌军”“被侵蚀的敌军每0.5秒受到100真实伤害”；“各效果累加”位于头部，头像上方不再显示“暗影英雄”。内嵌属性图标统一为 16×16，并按文字基线设置纵向偏移，保持行高 23；效果数值从正式配置读取。

## 十名棋子动画

| 棋子 | 动画表现 |
| --- | --- |
| 暗渊铁卫 | 护盾浮现、随棋子移动并轻微呼吸；破盾或到期时护盾消失、震荡环扩散。 |
| 玄羽夜猎 | 双层暗羽贯穿弹道与末端消散。 |
| 魇雾守灯人 | 三盏冥灯环绕施法者漂浮，领域环随移动呼吸。 |
| 影缝刺客 | 传送路径留下三个渐隐人物残影，三刀分别播放紫色斩弧。 |
| 裂魂斩将 | 朝目标方向播放宽幅紫色斩弧与扩散冲击。 |
| 幽焰刃侍 | 两缕幽焰环绕自身；强化普攻附带斩弧，第四击爆发后撤销环绕。 |
| 蚀月弩姬 | 目标处收束印记、重型处决弹道及命中扩散。 |
| 冥灯女巫 | 三盏冥灯分别下落、引爆并释放扩散黑雾。 |
| 黑星咒术师 | 连续黑星从上方坠落；结束时漩涡收束，再向外爆发。 |
| 虚痕掠杀者 | 跃迁残影、逐段斩击与虚痕收束引爆。 |

10 暗影每次半秒伤害额外触发轻薄棋盘冲击波。技能动画读取模拟 Tick，暂停冻结、单步推进及倍速均使用同一时钟。常驻效果随人物移动，死亡取消跟随效果；战斗结束、重新绑定或销毁时清理。节点池最多 160 层，复用时重置位置、缩放、角度、颜色和透明度；异步贴图回调带版本检查，避免覆盖后来复用的节点。

### 近战普攻与侵染改版

六名暗影近战（当前射程 1 格）普攻在目标身边播放短促紫色斩痕，按实际攻击向量旋转；不再使用黑雾炮弹，也适用于尚未激活羁绊时的普通攻击。远程暗影普攻保留黑雾弹。

被侵染的持续状态不再绘制地面圆环，改用三缕贴身雾丝：错开周期向上移动、左右摆动、渐隐后重新浮现。雾丝作为棋子子节点随移动跟随，以回放 Tick 驱动；未侵染和死亡时立即隐藏，后续再次侵染复用原节点。领域和其他技能的范围提示仍是独立效果。

本轮浏览器已查看 [近战普攻](evidence/shadow-melee-wisps/melee-basic.png)、[侵染雾丝相位一](evidence/shadow-melee-wisps/corruption-flow-a.png)、[相位二](evidence/shadow-melee-wisps/corruption-flow-b.png)及 [头部说明与紧凑头像](evidence/shadow-melee-wisps/trait-card.png)。[运行日志](evidence/shadow-melee-wisps/browser-logs.json)无 warn/error；新旧暗影 VFX、羁绊 UI、职业 UI、原住民 UI、既有螺旋丸 VFX 六组专项及类型检查通过。

这些动画是表现事件的消费者，不决定命中、范围或伤害。飞弹和爆发可有短暂视觉飞行/展开时间，实际伤害仍按技能事件 Tick 结算。

## 新素材

使用内置 imagegen 生成四个透明 RGBA 素材，像素原样复制到工程；未修改角色立绘或旧特效。

- `assets/resources/art/fx/shadow_barrier_v2.png`：暗影能量盾。
- `assets/resources/art/fx/shadow_lantern_v2.png`：幽魂冥灯。
- `assets/resources/art/fx/shadow_slash_v2.png`：专用紫色斩弧，原始凸刃朝下，按攻击向量旋转。
- `assets/resources/art/fx/shadow_corruption_wisp.png`：用于上升、摆动、渐隐循环的贴身雾丝。

提示词见 [prompts.json](../art-source/shadow-animations/prompts.json)、[slash-prompt.json](../art-source/shadow-animations/slash-prompt.json)、[wisp-prompt.json](../art-source/shadow-animations/wisp-prompt.json)；尺寸、透明通道和 SHA-256 见 [manifest.json](../art-source/shadow-animations/manifest.json)。

## 验证

- 暗影战斗检查通过：双方、50/100ms Tick、半秒伤害/整秒攻速独立时钟；12 秒 24 次伤害、12 次攻速；旧配置回退和非法伤害间隔拒绝。
- 新动画专项通过：全部效果类型、回放调用处的八方向、时钟冻结/推进/到期、跟随/取消、残影、池上限与复用、旧回调隔离、结束清理及透明资源。
- 原暗影 VFX、十棋子技能与羁绊 UI 检查通过。近战/雾丝改版新增六名近战的八方向、远程保留弹道、无羁绊近战、雾丝冻结/流动与隐藏复用检查；TypeScript、资源检查（148 个注册资源）及差异格式检查通过。
- 上轮全量回归 **54 组通过、9 组失败**，失败组名单与此前相同。[原始日志](evidence/shadow-animations/full-tests.log)。本轮近战/雾丝改版执行专项回归，未重复全量测试。
- 独立预览场景新增“技能特写”“下一技能”“前进0.1秒”。特写只放置一名正式棋子，初始满蓝、从 0 秒暂停开始，用实际技能事件推进。仍不创建 RunSession 或读写玩家存档。

实际浏览器证据保存在 `docs/evidence/shadow-animations/`。预览尺寸为 461×638，不能代替设备验证或完整爬塔平衡资格验证。斩击替换前的蓝色画面仅作为修正记录保留。

已逐个切换十名棋子的特写、推进并查看技能效果；最终 [浏览器日志](evidence/shadow-animations/browser-logs.json)无 warn/error。可查看 [半秒文案与对齐](evidence/shadow-animations/half-second-card.png)、[护盾](evidence/shadow-animations/01-guard-barrier.png)、[绕灯领域](evidence/shadow-animations/03-domain-lanterns.png)、[紫色重斩](evidence/shadow-animations/05-general-cleave.png)、[冥灯爆发](evidence/shadow-animations/08-witch-lantern-burst.png)、[黑星](evidence/shadow-animations/09-blackstar-fall.png)、[虚痕残影](evidence/shadow-animations/10-void-transit.png)。
