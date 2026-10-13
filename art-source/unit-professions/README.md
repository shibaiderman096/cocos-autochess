# 棋子素材检查与分配

检查范围：`assets/resources/art/units/` 的全部棋子 PNG，以及本次用户提供的四张职业 JPG。合计 13 张运行素材，分别分配到 10 种可购买棋子和 3 种开局野怪。原始 JPG 与透明 PNG 是同一素材的来源和处理版本，不重复计数。

全部 13 张运行棋子 PNG 统一为 256×256，保留透明背景、人物比例和原有素材分配。7 张新素材从 1254×1254 使用 Lanczos 等比例缩小，6 张旧素材原本已是 256×256；原始 JPG 保留原尺寸。

| 单位 | artId | 造型 | 运行素材（相对 assets/resources） |
| --- | --- | --- | --- |
| 战士 | warrior | 蓝护额、橙衣忍者 | art/units/placeholders/warrior.png |
| 弓手 | archer | 蓝衣弓箭手 | art/units/archer_ally.png |
| 法师 | mage | 火焰帽徽、火球法杖（本次图 4） | art/units/professions/mage.png |
| 斥候 | scout | 绿护目镜忍者 | art/units/placeholders/archer.png |
| 卫士 | guardian | 蓝衣剑盾卫士 | art/units/warrior_ally.png |
| 剑客 | duelist | 紫色兜帽、双刃（本次图 3） | art/units/professions/duelist.png |
| 游侠 | ranger | 绿色铠甲、弩（本次图 1） | art/units/professions/ranger.png |
| 祭司 | shaman | 白蓝长袍、双法杖（本次图 2） | art/units/professions/shaman.png |
| 术士 | sorcerer | 蓝袍、星帽、魔法杖 | art/units/mage_ally.png |
| 统领 | champion | 红衣结印忍者 | art/units/placeholders/mage.png |
| 小史莱姆 | slime | 旧红衣剑盾图 + 原有野怪 tint，临时占位 | art/units/warrior_enemy.png |
| 幼年野狼 | wolf_pup | 旧红衣弓箭图 + 原有野怪 tint，临时占位 | art/units/archer_enemy.png |
| 小石灵 | small_golem | 旧红袍法师图 + 原有野怪 tint，临时占位 | art/units/mage_enemy.png |

13 种单位各自指定一个不同的资源文件。旧红蓝图有 3 对相同造型的配色变体，仍属于不同资源；3 种野怪尚无对应的生物造型，本次只使用现有图占位。棋子的敌我阵营不取决于资源文件名的 ally/enemy 后缀，仍由阵营圈和血条区分。10 种可购买棋子取消原来的复用 tint，显示素材原色。

四张新 JPG 原件保存在当前目录；透明 PNG 保存在 `assets/resources/art/units/professions/`。使用内置 imagegen 做背景提取，删除外部白背景、灰色底座和角落文字，保留白色衣服、刀刃、装备与魔法效果。AI 处理版本细节可能与原图略有差异。正方形透明画布配合 Sprite.trim=false 保持比例。

提示词模板：下文的 SUBJECT 分别替换为 green armored crossbow ranger carrying shoulder tubes and crossbow / white and blue priest wearing a white cross hat and holding two radiant staffs / purple hooded sword fighter carrying blades / blue and orange fire wizard holding a staff with a fire orb。

```text
Use case: background-extraction. Edit target: the single provided character image (SUBJECT). Asset type: transparent full-body 2D game chess unit. Isolate the existing character and all held weapons, shoulder equipment and attached magical effects. Remove only the exterior white background, the gray oval ground pedestal underneath the feet and all exterior corner lettering. Preserve all interior white costume and weapon details (especially white priest hat, robes and white sword blades), colors, silhouette, expression, pose and bold outlines. Do not redesign or add anything. Full figure, all weapons, hair and hat uncropped, centered on a square transparent canvas. Scale the character so its full figure occupies approximately 88% of canvas height with feet aligned near 92% of canvas height. No new shadow or base: game draws its own ground ring. Output genuine RGBA transparency, not white or checkerboard.
```

所有展示入口通过 UNIT_SPRITE 加载 UNIT_ART 的资源：棋盘和备战席由 UnitView 消费，商店及详情由 BattleUI 消费。单位配置和 run.json 的野怪配置分别用独立 artId；单位数值、技能、费用、商店概率和存档结构保持原值。

验收：配置中的 13 个 artId 必须全部有 SpriteFrame，13 条路径不得重复，资源目录不得有未分配棋子图；运行 `npm run test` 和 Cocos TypeScript 诊断，实际预览商店、备战席及详情面板的素材。
