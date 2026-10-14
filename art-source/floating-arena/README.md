# 悬空竞技场分层素材

来源：用户提供的 `source.png`，1536×1024。使用内置 imagegen 分别提取/修补为三层，再按运行尺寸缩放。保留原图；AI 重建了被遮挡的天空和移除前排槽位后的石台，细节可能与原图略有差异。

| 素材 | 运行资源（相对 assets/resources） | 尺寸 | 用途 |
| --- | --- | --- | --- |
| 透明悬空棋盘 | art/arena/floating_board.png | 1024×683 RGBA | BoardView 的 arenaArt 层，保留石地、花草、围墙、旗帜、火盆与岛体 |
| 天空背景 | art/arena/sky_background.png | 1536×864 RGB | BattleUI 与 MainMenu 的最底层背景 |
| 独立备战槽框 | art/arena/bench_slot.png | 256×256 RGBA | M2_UI_SPRITE.bench_slot，经 setUISkin 在9个备战位重复使用 |

棋盘层显示在 boardGrid 下方，棋子和特效在格线之上。图像加载后格子改为半透明，露出原图地面；未加载时保留矢量棋盘。棋盘逻辑、7×8格子的投影和点击区域不变。棋盘图显示尺寸1024×683，在BoardView中偏移(0,-28)，使有效地面对齐现有格子。

原图前排8槽已从棋盘层移除，独立槽框按现有容量重复9次；保留现有62×50槽框、68像素间隔及拖放区域。图像两侧槽位属于装饰，没有额外游戏容量。旧 art/ui_m2/bench_slot.png 留作备用，不再被该皮肤路径消费。

提示词集合（内置 imagegen，非CLI）：

1. `background-extraction`：从原图提取完整悬空竞技场，保留3:2构图、暖色石地和草地、蓝旗、水晶、火盆、花草藤蔓、围墙与岛体拱桥；移除天空、云和远岛到真正RGBA透明。移除前排水平备战槽，用同风格石台接续；中央地面保持空白，不增加棋子、格线、文字或UI，不缩放裁切主体。
2. `precise-object-edit`：移除中央竞技场岛、围墙、旗帜、火盆、近景藤蔓和备战席，按原图风格修补被遮挡的天空。保留蓝天白云、边缘远处悬空石岛、瀑布和古塔，中央以淡蓝天空和云为主，16:9全幅不透明，无棋盘、人物、UI或文字。
3. `background-extraction`：只提取前排一个空的金边暗石备战槽，保持轻微俯视角、深灰石板、金色斜切框、角落铆钉和暖高光；移除邻槽、地面、植物、水晶、火盆与背景到真正RGBA透明。完整边框，单个方形可重复槽，不增加文字、数字、人物或纹章。

验证：`npm run test` 覆盖格子坐标往返、备战席拖放、合并/出售和实际UI组件。预览截图记录在本目录；仅命令行测试不代表图片已经显示。

已在 Cocos 浏览器预览确认：天空铺满、透明岛体正常叠放、半透明格线及野怪/棋子可见、前排9槽完整显示。右上角加入深色信息底板，保证浅色天空上的生命值与关卡文字可读。主界面也使用同一天空资源。三张 SpriteFrame 均由 Cocos 成功导入，TypeScript 诊断无错误。

备战席透视更新：`bench_slot.png` 改为远边窄、近边宽的俯视梯形，保留金框、四角铆钉及石板纹理，仍为256×256 RGBA，现有62×50显示范围和9槽容量保持不变。使用内置 imagegen 编辑，再裁去透明外沿、等比例缩小，保留原资源UUID。

棋盘棋子的透明画布为1.5个显示格（56×1.5=84像素），备战席仍为56×0.82。放大后的身体向上偏移，使脚底落点及阵营圈保持原位；血条和星级同步上移。准备、战斗和野怪均使用同一尺寸；退回备战席时恢复槽位尺寸。

本次透视编辑提示词：

```text
Use case: precise-object-edit. Edit target: existing transparent gold-framed dark stone reserve bench tile. Change ONLY its perspective to match a shallow top-down floating arena board: a clear trapezoid with the FAR/TOP edge about 82% as wide as the NEAR/BOTTOM edge, and depth about 65% of the bottom width. Far edge is higher on the canvas, near edge is lower. The corner rivets, gold beveled border, dark slate interior and stone cracks should follow the exact same perspective projection. Preserve existing colors, texture, four gold rivets, highlights and overall identity; do not redesign or add decorations. Single centered complete uncropped tile, minimal transparent margin on a square RGBA canvas. Outside is truly transparent. No characters, text, numbers, extra tiles, or shadows outside the tile. Intended to render inside a 62x50 game reserve slot.
```
