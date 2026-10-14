# 像素风野怪素材与信息

原图为用户提供的 `source.png`（2172×724）。四只生物分别用 imagegen 提取为透明 PNG，再等比例缩小到 256×256；保留全身、武器、八足及蠹虫周围碎石。AI 提取的局部细节可能与原图略有差异。

运行目录：`assets/resources/art/units/monsters/`。配置：`assets/resources/config/run.json`。四种野怪不进入商店或共享卡池，不再使用旧红衣人形占位图及 tint。

| 名称 / ID | 图片 | 定位 | HP | 攻击 | 攻速 | 射程 | 移动 Tick/格 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 腐衣僵尸 / zombie | zombie.png | 青衣紫裤、双臂前伸，慢速近战 | 180 | 1 | 0.5 | 1 | 6 |
| 白骨弓手 / skeleton_archer | skeleton_archer.png | 木弓骷髅，后排远程 | 220 | 2 | 0.5 | 4 | 6 |
| 岩隙蠹虫 / silverfish | silverfish.png | 灰色分节甲壳，贴地近战 | 220 | 2 | 0.5 | 1 | 5 |
| 赤瞳巨蛛 / red_eye_spider | red_eye_spider.png | 深褐八足、红色眼睛，快速近战 | 300 | 3 | 0.4 | 1 | 4 |

这些数值是项目的初始营地配置，并非原图所属游戏的规则。四种均无主动技能、护甲和魔抗为 0；蜘蛛未额外添加毒或控制，蠹虫碎石为外观。每只怪的描述由 ConfigManager 保留，经 BattleStage 传到 BattleUI 详情面板。

开局三战：腐衣墓地（1 僵尸）、岩隙虫群（2 蠹虫）、赤瞳蛛巢（前排 2 蜘蛛、后排 1 骷髅弓手）。每种素材都有实际关卡消费者。保留三场营地战与后续阶段结构，战斗模拟验证初始一星战士能独自通关。

旧 `warrior_enemy.png`、`archer_enemy.png`、`mage_enemy.png` 保留作为备用，当前无单位使用。原来的史莱姆、幼狼、石灵信息已由四种真实造型替换。

提取提示词：

```text
Use case: background-extraction. Edit target: attached four-creature sprite sheet. Extract ONLY SUBJECT. Remove every other creature and the exterior background completely. Preserve the selected creature's exact pose, equipment, proportions, blocky voxel pixel-art style, original colors, lighting and details. Preserve interior dark pixels and black eye details. No redesign, no new features, no text, no ground shadow or pedestal. Center the full uncropped creature on its own square RGBA transparent canvas with about 8% margin. Output one single isolated creature ready for a 256x256 game sprite.
```

SUBJECT 分别为左侧绿皮青衣紫裤僵尸、第二只持木弓和箭的白骨骷髅、第三只带碎石与短足的灰色蠹虫、最右侧红眼深褐八足蜘蛛。

验证：`npm run test`（战斗、商店、存档、阶段成长及单位详情回归）；另检查四张图片的 RGBA、256×256、透明边界、资源路径和每种野怪的关卡引用。无渲染测试不等同于 Cocos 编辑器实机预览。

主界面提前加载全部四种野怪 SpriteFrame，完成后才允许开始或继续游戏；加载失败显示提示并阻止进入空白野怪阶段。图片通过 `UNIT_ART → UNIT_SPRITE → UnitView` 显示，详情沿用同一资源。修改素材后应重新打开预览以更新运行资源缓存。

实际预览验证：从主界面继续游戏，依次经过 1-1 僵尸、1-2 双蠹虫、1-3 双蜘蛛与后排骷髅，四种野怪图片均正常显示，浏览器控制台无警告或错误。第三场截图：`runtime-stage-preview.jpg`。前两场以初始战士实战胜利进入下一关。
