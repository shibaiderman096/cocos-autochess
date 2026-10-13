# M2 UI 素材包

配色与形状沿用 `BattleUI.ts` 现有风格：墨青底 `#0d1b23`、金色描边 `#ccae6d`、切角面板（cut=7）、棋子档位色（灰/青/蓝/紫/金）。
每个素材都有 `svg/`（矢量源文件）和 `png/`（2 倍分辨率，已用于预览图），尺寸与坐标见 `ui_manifest.json`。

## 导入 Cocos Creator
1. 把 `png/*.png` 拷到 `assets/resources/art/ui_m2/`，编辑器会自动生成 `.meta`。
2. 标了"九宫格"的素材：Sprite 的 Type 选 **Sliced**，并在 SpriteFrame 编辑器里把四边边距设成下表的"边距"（这是 1 倍尺寸下的像素，PNG 是 2 倍，所以编辑器里填 2 倍值：边距×2）。
3. 路径常量可以这样加进 `ArtPaths.ts`：`panelInk: 'art/ui_m2/panel_ink/spriteFrame'`，其余同理。
4. 现在的 `BattleUI.ts` 是用 `Graphics` 代码画的面板。这批素材是同风格的贴图版，可以逐个替换，不需要一次全换。

## 素材清单

### 面板（九宫格）

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `panel_ink` | 96×96 | 16 (填 32) | Sprite Type=Sliced，四边 16 |
| `panel_side` | 96×96 | 16 (填 32) | Sprite Type=Sliced，四边 16 |
| `panel_dock` | 96×96 | 16 (填 32) | Sprite Type=Sliced，四边 16 |
| `panel_modal` | 96×96 | 16 (填 32) | Sprite Type=Sliced，四边 16 |
| `tooltip_panel` | 96×96 | 16 (填 32) | 棋子详情提示框，九宫格 |

### 按钮（九宫格）

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `btn_primary` | 96×48 | 14 (填 28) | Sprite Type=Sliced，四边 14；文字用 Label |
| `btn_secondary` | 96×48 | 14 (填 28) | Sprite Type=Sliced，四边 14；文字用 Label |
| `btn_disabled` | 96×48 | 14 (填 28) | Sprite Type=Sliced，四边 14；文字用 Label |
| `btn_danger` | 96×48 | 14 (填 28) | Sprite Type=Sliced，四边 14；文字用 Label |

### 商店卡片

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `card_cost1` | 164×104 | — | 费用 1 的商店卡片；价格框中心 (139,80)，肖像中心 (82,37) |
| `card_cost2` | 164×104 | — | 费用 2 的商店卡片；价格框中心 (139,80)，肖像中心 (82,37) |
| `card_cost3` | 164×104 | — | 费用 3 的商店卡片；价格框中心 (139,80)，肖像中心 (82,37) |
| `card_cost4` | 164×104 | — | 费用 4 的商店卡片；价格框中心 (139,80)，肖像中心 (82,37) |
| `card_cost5` | 164×104 | — | 费用 5 的商店卡片；价格框中心 (139,80)，肖像中心 (82,37) |
| `card_empty` | 164×104 | — | 已买走 / 空位 |
| `card_lock_overlay` | 164×104 | — | 锁店后叠在每张卡上，右上角带锁徽章 |

### 锁店

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `btn_lock_off` | 40×40 | — | 锁店开关（未锁 / 已锁） |
| `btn_lock_on` | 40×40 | — | 锁店开关（未锁 / 已锁） |

### 生命 / 波次 / 等级

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `life_full` | 24×24 | — |  |
| `life_empty` | 24×24 | — |  |
| `wave_done` | 28×28 | — |  |
| `wave_current` | 28×28 | — |  |
| `wave_todo` | 28×28 | — |  |
| `wave_boss` | 28×28 | — |  |
| `badge_level` | 36×36 | — | 等级徽章，数字用 Label |
| `exp_bar_bg` | 174×10 | — |  |
| `exp_bar_fill` | 170×6 | — | 用 Sprite Filled Horizontal 控制进度 |
| `star_badge_1` | 60×20 | — |  |
| `star_badge_2` | 60×20 | — |  |
| `star_badge_3` | 60×20 | — |  |
| `divider` | 240×10 | — |  |

### 出售区 / 备战席

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `sell_zone` | 192×64 | — | 拖拽棋子到这里出售；中间放 icon_sell + Label |
| `sell_zone_hot` | 192×64 | — | 棋子悬停在出售区上时 |
| `bench_slot` | 56×56 | — |  |
| `bench_slot_hover` | 56×56 | — |  |

### 提示框

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `tooltip_panel` | 96×96 | 16 (填 32) | 棋子详情提示框，九宫格 |
| `tooltip_tail` | 24×12 | — | 挂在提示框底边中间，指向棋子 |

### 结算横幅

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `banner_victory` | 520×110 | — | 胜利横幅，文字用 Label 居中 (260,56) |
| `banner_defeat` | 520×110 | — | 失败横幅 |

### 图标 48×48

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `icon_lock_closed` | 48×48 | — |  |
| `icon_lock_open` | 48×48 | — |  |
| `icon_refresh` | 48×48 | — |  |
| `icon_exp` | 48×48 | — |  |
| `icon_sell` | 48×48 | — |  |
| `icon_info` | 48×48 | — |  |
| `icon_wave` | 48×48 | — |  |
| `icon_swords` | 48×48 | — |  |
| `icon_speed` | 48×48 | — |  |
| `icon_close` | 48×48 | — |  |
| `icon_life` | 48×48 | — |  |

### 属性图标 24×24

| 素材 | 尺寸 | 九宫格边距 | 说明 |
|---|---|---|---|
| `stat_hp` | 24×24 | — |  |
| `stat_atk` | 24×24 | — |  |
| `stat_armor` | 24×24 | — |  |
| `stat_range` | 24×24 | — |  |
| `stat_mana` | 24×24 | — |  |
| `stat_aspd` | 24×24 | — |  |

## 预览图

`preview_main.png`：整体界面（沿用仓库 `BattleUI` 的坐标布局）；`preview_modals.png`：结算面板与各种状态。
预览图里的九宫格拉伸、文字都是用 Pillow 按本包素材拼的，只用来看视觉效果，没有在 Cocos 里实际跑过。

## 布局提示（design 1280×720，原点居中，y 向上）

- 波次轨道：`panel_side` 330×34 放在 (0, 266)，下面 8 个节点间隔 36（`wave_done/current/todo`，最后一个用 `wave_boss`）。
- 生命：`panel_side` 196×38 放在 (488, 262)，心形 `life_full/life_empty` 缩放 0.8、间隔 19。
- 出售区：`sell_zone` 192×64 放在 (488, -176)，拖拽悬停时换成 `sell_zone_hot`。
- 备战席：9 个 `bench_slot`，x 从 -330 起间隔 82，y = -182。
- 商店卡片：按 `cost` 选 `card_cost1~5`，价格框中心 (139, 80)，肖像中心 (82, 37)，位置与现有 `shop_i` 完全一致。
- 锁店：`btn_lock_off/on` 放在刷新按钮右边；锁定时每张卡叠一层 `card_lock_overlay`。
