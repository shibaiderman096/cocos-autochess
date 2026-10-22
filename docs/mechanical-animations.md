# 机械先驱绘制特效动画

2026-10-19：为七名机械棋子的实际技能及超频接入透明绘制动画，保持技能数值、伤害、治疗和触发规则不变。

## 动画与战斗事件

| 棋子 / 状态 | 动画表现 | 预览证据 |
|---|---|---|
| 铆钉壁垒·堡零 | 琥珀色液压屏障展开、持续呼吸，结束后蓝色回血脉冲 | [壁垒](evidence/mechanical-animation/01-hydraulic-wall.png) |
| 涡轮拳虎机 | 朝目标方向挥出三道橙色爪痕，击杀回血时亮起修复脉冲 | [爪击](evidence/mechanical-animation/02-turbo-claw.png) |
| 弧光维修姬 | 蓝色维修球光流飞向治疗目标，目标出现维修环与光点 | [三星双目标治疗](evidence/mechanical-animation/03-repair-pulses.png) |
| 磁轨猎手·零七 | 枪口蓄能、红白电弧贯穿至实际拦截目标、命中闪光 | [蓄力](evidence/mechanical-animation/04-rail-charge.png)、[弹道](evidence/mechanical-animation/05-rail-shot.png) |
| 裂齿刃蛛 | 目标落点预警、腾空锯刃旋转、落地红色裂解冲击 | [腾空](evidence/mechanical-animation/06-spider-airborne.png)、[落地](evidence/mechanical-animation/07-spider-landing.png) |
| 熔炉行刑者 | 沿实际冲刺方向移动的炉火刃光、终点熔铸斩击与击飞 | [冲刺](evidence/mechanical-animation/08-furnace-dash.png)、[命中](evidence/mechanical-animation/09-furnace-impact.png) |
| 阿特拉斯 | 多枚蓝色导弹飞行、目标蓝白爆炸、持续橙色灼烧 | [导弹](evidence/mechanical-animation/10-atlas-missiles.png)、[爆炸](evidence/mechanical-animation/11-atlas-impact.png) |
| 机械超频 | 脚下青橙色分段齿轮旋转与呼吸，刷新时复用同一光环 | [七人超频](evidence/mechanical-animation/12-overclock-paused.png) |

## 素材与实现

使用内置 `image_gen` 绘制一张 [mechanical_skills.png](../assets/resources/art/fx/mechanical_skills.png)，1024×1536、RGBA、4列×8行，共32帧。生成原图逐字节复制至项目，未处理角色原图。第1至8行依次对应屏障、爪击、维修、磁轨、锯刃、炉火、导弹、超频。[来源、透明通道及SHA-256](evidence/mechanical-animation/asset.json)。

图集按实际透明间隔切帧：纵向边界为 `0,198,384,565,737,918,1124,1332,1536`，避免平均切行截掉火焰或带入邻行。透明背景、相邻帧交叉淡化、连续位移/旋转/缩放共同构成动画。

`ArtPaths.mechanicalSkills → BattleReplayer → MechanicalVfx` 是正式运行路径。动画读取实际 `cast / skill_impact / rail_shot / dash / missile / burn / heal / mechanical_overclock` 事件，以及蓄力、壁垒、腾空、冲刺等战斗快照。弹道终点使用实际拦截点；动画不会产生伤害或修改模拟结果。

动画只随回放时钟推进，支持暂停和倍速。层池上限160，持续状态按棋子复用；打断、死亡、状态结束、战斗结束和重新绑定均清理。阿特拉斯灼烧附着于被灼烧者，施法者死亡后仍可持续显示。

## 预览

[机械棋子预览场景](http://localhost:7456/?scene=3871a7da-1f3e-4272-a945-94688092ff13) 使用正式配置、模拟器和回放，独立于玩家存档。选棋子后点“战斗演示”“满蓝施法”，可用0.1/0.3/1/3秒步进或“播放/暂停”“1倍/2倍”观察；“结束战斗”“新战斗”检查清理。

[验收记录](evidence/mechanical-animation/validation.md) 区分自动检查与实际浏览器画面。

## 完整绘制提示词

工具：内置 `image_gen`；透明背景开启；新图生成，不引用角色图。以下为本次唯一提交的提示词：

```text
Use case: stylized-concept. Asset type: ONE production game VFX sprite atlas for a Cocos 2D autochess game, transparent background. Create a rigorously aligned 4 COLUMN by 8 ROW grid containing EXACTLY 32 animation cels, no visible grid. All cels have identical rectangular dimensions and their effect center lies at the exact center of their cell; generous transparent padding inside each cell, never overlap neighboring cells. Portrait canvas, 4:6 aspect ratio. Each row is a distinct mechanical science-fiction skill, read left to right through 4 successive stages: small anticipation ignition, energetic growing release, strongest clear impact, dissolving wisps. Consistent polished hand-painted game spell effects with sharp luminous cores and semitransparent glow, sparks, very readable small silhouettes. Row 1: amber hydraulic barrier, symmetrical angular hexagonal steel energy shield with piston-like side brackets. Row 2: orange turbo beast claw strike, THREE parallel diagonal slashing crescents, forward motion toward the RIGHT. Row 3: cyan blue repair pulse, orbital arcs with bright small energy beads and subtle medical cross in middle. Row 4: red and white magnetic rail gun discharge, long narrow horizontal beam aligned RIGHT, strong white core, red electricity. Row 5: scarlet saw-spider landing impact, serrated red circular blade slash and short radial spikes, top down ground impact. Row 6: molten furnace executioner slash, broad orange white crescent pointing RIGHT, flaming metallic fragments and heat shockwave. Row 7: blue white Atlas missile impact, concentrated central explosion with blue rocket exhaust streaks and small four-point electric stars. Row 8: overclock cyan-orange circuit ring, segmented rotating gear-like halo with small radial vents and sparks. No characters, no scenery, no floor, no labels, no numbers, no letters, no borders. Genuinely transparent pixels around each effect, not black background or painted checkerboard. Effects must be fully contained in their cells and share the same visual center so the sprite animation has no jitter.
```
