# 特殊商店解锁与万象共鸣徽记

2026-10-23

后续规则：特殊商店不再刷新普通棋子，棋子商品仅保留黑星咒术师、奥瑞斯。2026-10-24 起按普通商店同等级费用概率逐格抽取，无对应专属棋子的费用档显示装备，低等级不再提前出现 5 费专属；同名棋子可重复出现。商店区各占用面板加入统一弹出动画，见[弹出动画与特殊商店概率](shop-dock-popup-and-rates.md)。新增装备及赛芙、守灯人调整见[本轮更新](soul-lamp-and-overdrive.md)。下方种子与截图属于徽记初次验收版本。

## 本次规则

- 黑星咒术师 `blackstar_warlock`、奥瑞斯 `oris` 初始不参与普通商店抽取，也不进入未解锁的棋子补给抽取。特殊商店从第 2 阶段起可随机出现，售价沿用各自 5 费价格；成功购买获得一张并解锁本局普通牌库。库存照常扣除，金币不足、售罄或重复点击不会解锁或重复获得。备战席满时进入奖励仓库。解锁保存于本局存档，新一局重置。
- 删除布隆达、雷昂、影缝刺客、裂魂斩将的当前配置、独占技能、羁绊成员、敌方角色表、棋盘/头像映射、PNG 与 meta。旧关卡模板改用保留的同费棋子。当前可玩棋子共 25 名；日辉、暗影各保留 8 名，原 3/5/7/10 档数值不变。
- 特殊装备“万象共鸣徽记” `trait_emblem`：+100 最大生命、每秒 +1 法力。仅特殊商店随机出售；2026-10-24 价格调整为 10 金币，普通装备统一 6 金币。普通装备奖励和敌方装备候选不包含此物。
- 首次穿戴后，下方商店区展示四个不同羁绊。已激活羁绊优先，按当前不同上阵棋子数降序；同数及剩余位置使用独立确定性随机流补齐。排除携带者本来已有的羁绊、已由其他装备赋予的同种羁绊和无成员的预留羁绊。选择前暂停商店交易、装备操作与开战。
- 四个候选连同棋子、装备槽位写入存档，重进不重抽。选定后生成绑定羁绊的装备记录，例如 `trait_emblem__sunlight`。卸下、转移、出售返包和合成装备整理均保留该绑定，不重新选择。
- 携带者按实例获得羁绊；同名棋子的另一张未装备副本不会继承。凑羁绊时同名棋子仍只计一次，原生与装备授予的同羁绊不重复计数。棋子详情、羁绊面板、预览与真实战斗使用相同成员规则。

## 图片

- 原图：`art-source/equipment/trait_emblem-original.png`。
- 运行图：`assets/resources/art/equipment/trait_emblem.png`，透明 RGBA，128 × 128，已接入图鉴、商店、背包、装备槽与棋子装备显示。
- 生成器：内置 imagegen，透明背景。生成提示词如下（未做后续生成式编辑；缩小为运行图）：

> Use case: stylized-concept. Asset type: one production-ready transparent equipment icon for a polished Chinese fantasy autochess game, square composition. Primary request: design a mysterious synergy-awakening emblem, an ornate gold and dark silver amulet with a faceted prismatic crystal core, several small interlocking rune segments symbolizing different factions, a subtle emerald life glow and sapphire mana glow. Match high-detail painted fantasy RPG equipment inventory art: bold instantly readable silhouette, bevelled metallic gold ornament, vivid luminous crystal, clean strong contrast at 128 pixels. One single complete emblem centered, fills about 85% of square with comfortable margins; three-quarter frontal view. Genuine transparent alpha background, no scene, no surrounding card, no border, no lettering, no numerals, no watermark. Show exactly one emblem, not a sprite sheet. This item grants +100 health, +1 mana regeneration per second and a selectable trait to its bearer; suggest life and magic in the visual without text.

## 验证与历史边界

- 本轮完整 `npm test`：89 组通过、0 组失败，日志见 `docs/evidence/special-shop/full-test.log`。实际 Creator Web 构建已生成，`tests/web-build-tests.cjs` 与 `tools/build-web.ps1 -VerifyOnly` 验证通过；编译产物包含新装备及特殊解锁标记，当前配置不含四名删除角色。
- Cocos `validate_scene` 场景诊断通过，0 条诊断、无警告；本次未包含编辑器历史日志错误。差异空白检查通过。
- `tests/special-shop-unlock-tests.cjs`：普通商店隔离、特殊商店自然刷新、支付与一次性领取、重开与读档、普通奖励排除、四选一优先级、绑定转移、逐实例战斗归属、同名去重及失效按钮。
- `tools/verify-special-shop-preview.cjs`：实际 Cocos 浏览器预览，鼠标点击购买、背包装备、选择、卸下与转移；重载后通过“继续游戏”恢复同一组选项。第 34 号种子的第 2 阶段特殊商店自然出现黑星咒术师与徽记。已激活的 4 人机械、3 人日辉优先进入四选一。
- 截图及结构化结果：`docs/evidence/special-shop/`。已查看图鉴、四选一和绑定后棋子详情的实际渲染；未做 Android 安装或真机测试。
- `tests/fixtures/retired-20261023.json` 只为历史技能回归保存删除的四条角色/技能记录，游戏不读取此文件。旧技能测试仍验证历史行为；运行资源检查验证其不再进入当前游戏。P0/P1/P2/P3/P4 历史报告与哈希证据保持不变。
- 原有配置身份校验继续生效。使用旧角色名单的进行中存档不会强行套用新战斗配置；开始新一局使用新名单。
