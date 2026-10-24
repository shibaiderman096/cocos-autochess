# 普通装备与属性图标

现有 13 件装备统一归类为普通装备（basic），全部进入普通装备奖励池。特殊商店装备统一为 3 金币。2026-10-23 新增磐生壁垒、炽羽叠锋、秘涌法典，具体规则见 [成长与法力装备](growth-equipment.md)。森灵庇护改为仅严格低于 50% 生命时回血。

装备图鉴、背包装备、已穿戴装备提示及商店／Boss 奖励装备详情使用属性图标加数值；特殊效果保留文字。共用 EquipmentStatIcons，复用已有属性图片，按三列排列；支持法力回复的“+5/秒”和最大法力的“-10”。

旧存档允许仅由装备分类与普通奖励池扩展引起的配置迁移。未完成特殊商店的装备报价迁为 3 金币，保留已购买标记、装备和现有金币，不退款或重复扣款。迁移写入版本标记，之后的非法价格仍被拒绝；其他战斗或装备规则变化仍进行兼容性校验。

验证：

- ordinary-equipment-tests：全部普通装备、旧存档迁移、购买状态及图鉴／提示图标。
- TypeScript 检查、UI 交互、装备展示、阶段奖励验证通过。
- 全量回归首次 84 套通过，P3 装备测试的旧奖励池假设失败；已更新三选项预期，并将指定装备战斗测试改为独立装备池，单独复验见证据日志。
- 真实 Cocos 浏览器预览通过：背包悬停显示两属性／五属性装备，商店普通装备报价，点击详情与图片加载，无页面异常。
- 本次未验证 Android 真机。

证据位于 [ordinary-equipment](evidence/ordinary-equipment/browser-acceptance.json)，截图包含 [五属性提示](evidence/ordinary-equipment/tooltip-crimson_bloodclaw.png)、[商店](evidence/ordinary-equipment/ordinary-shop.png) 和 [装备详情](evidence/ordinary-equipment/ordinary-detail.png)。
