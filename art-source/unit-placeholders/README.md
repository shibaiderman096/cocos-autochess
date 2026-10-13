# 占位棋子素材

用户提供的三张 JPG 保存在此目录。使用内置 imagegen 做透明背景提取，运行版本在 `assets/resources/art/units/placeholders/`。

| 原图 | 运行素材 | 基础类型 |
| --- | --- | --- |
| warrior.jpg（蓝护额、张嘴） | warrior.png | 战士 |
| mage.jpg（红衣、结印） | mage.png | 统领 |
| archer.jpg（绿护目镜） | archer.png | 斥候 |

人物文件名保留最初导入时的命名，实际分配由 ArtPaths.ts 的 UNIT_ART 和单位配置中的 artId 决定。每种单位使用独立资源，取消可购买棋子原先用来区分复用素材的 tint。敌我使用同一人物图，通过阵营底圈和血条颜色区分。战场、备战席、商店、详情面板统一加载。完整分配表见 ../unit-professions/README.md。

透明底版本为 AI 处理结果，细节可能与原图略有差异。统一正方形画布，在 Sprite 上关闭 trim，避免人物被拉宽。

处理提示词（每张分别使用）：

```text
Use case: background-extraction. Edit target: the attached single character image. Asset type: transparent 2D placeholder chess unit sprite for a game. Remove ONLY the white background and output a genuine RGBA transparent background. Preserve exactly the original chibi character, face, pose, hair, costume colors, black outlines, headband emblem and all details. Do not redraw, reinterpret, add shadows, text, props or any other objects. Keep the full character from top of hair to feet without cropping. Center the full character on a square canvas with a small transparent margin; keep its original proportions. This is a cutout, no redesign.
```

验收：在 Cocos Creator 中预览 battle 场景，确认棋盘和备战席人物没有白底，商店和详情使用相同人物图，敌我阵营圈及血条仍能区分。
