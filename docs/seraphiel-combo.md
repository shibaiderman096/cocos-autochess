# 塞拉菲尔：连续法术攻击与击杀追击

2026-10-19，按用户确认的数值与判定实现。

| 项目 | 1星 | 2星 | 3星 |
| --- | --- | --- | --- |
| 每轮攻击次数（含末击） | 5 | 7 | 20 |
| 普通段基础魔法伤害 | 110 | 165 | 1600 |
| 末击基础魔法伤害 | 550 | 825 | 8000 |
| 相邻两次攻击间隔 | 0.2秒 | 0.2秒 | 0.2秒 |

初次施法沿用跃迁接近目标，随后锁定同一目标连击。末击替代普通段，不额外增加一次攻击。所有段数均走技能魔法伤害公式，受法强、增伤、魔抗及技能暴击资格等现有规则影响，独立于普通攻击力。

只有本轮技能实际击杀目标才触发追击；普通段和末击都能触发。在下一个0.2秒攻击时点，选择距离施法者最近的存活、可选取敌人，距离相同按单位ID排序，跃迁至其相邻空格并免费重开完整连击。每次追击不扣除法力。没有目标，或最近目标周围没有可用落点时结束，不跳过该目标去追击更远的敌人。

击杀依据护盾与保命装备结算后的生命值变化判定。队友击杀、自己的其他伤害、同一Tick中打到已被击杀的目标、触发余烬命核但未死亡，均不触发追击。目标失效、施法者死亡或控制打断时结束。取消技能原有的不可选取。

## 自动验证

以下11组相关测试通过：`seraphiel-tests`、`sunlight-tests`、`sunlight-animation-tests`、`sunlight-ui-tests`、`skill-presentation-tests`、`skill-attack-isolation-tests`、`skill-layout-save-tests`、`combat-statistics-tests`、`combat-attributes-tests`、`totem-tests`、`shadow-roster-tests`。

新测试覆盖双方、全部星级、普通段与末击、法强与物理强度隔离、固定攻击时点、个人击杀归属、稳定的最近目标选择、真实棋盘落点被占满、免费重开、护盾/保命、目标失效、眩晕/恐惧/死亡、有效伤害统计和重复种子一致性。动画测试检查末击弧光/法印放大、真实回放调用点八方向、暂停、结束与对象池清理。存档测试继续拒绝技能机制变化后的不兼容存档。

Cocos项目脚本诊断及最终 `npx tsc --noEmit -p tsconfig.json` 无错误。资源检查通过：140条贴图/SpriteFrame映射、20个可用棋子、8种怪物。`git diff --check` 无空白错误。

[通用设计校验](evidence/seraphiel-combo/unit-validator.log)仍为4 ERROR、66 WARN，与本次修改前数量一致。4项错误分别为奥瑞斯三星单段倍率、奥瑞斯“全部目标”星级表格式、塞拉菲尔三星单段倍率、虚痕三星单段倍率。塞拉菲尔沿用用户确认的基础值，不为通过通用20倍模板而改动。未重跑整个旧名单全量测试入口；该入口此前已有未迁移的旧用例失败。

## 实际预览

使用现有独立 `sunlight-preview.scene`，种子1019，选择“塞拉菲尔·技能特写”。不创建RunSession，不读取或修改玩家存档。首次预览发现编辑器仍使用旧资源缓存，刷新本次配置和脚本后重新验证，以下截图均为刷新后的版本。

- [1星技能面板](evidence/seraphiel-combo/skill-1star.jpg)、[3星技能面板](evidence/seraphiel-combo/skill-3star.jpg)：三行数值、法强图标、当前星级正文、可选取/可打断说明无裁切。
- [1星普通段](evidence/seraphiel-combo/ordinary-hit.jpg)、[1星末击](evidence/seraphiel-combo/finisher-1star.jpg)、[1星击杀追击](evidence/seraphiel-combo/kill-recast-1star.jpg)：首个目标600生命，末击后消失，追击下一目标后累计有效伤害由600变为710。
- [3星末击](evidence/seraphiel-combo/finisher-3star.jpg)、[3星击杀追击](evidence/seraphiel-combo/kill-recast-3star.jpg)：首个目标32000生命，击杀后重开普通段，累计伤害由32000变为33600。
- [3星追击结束](evidence/seraphiel-combo/chain-end-3star.jpg)：6个目标全部击杀，有效伤害192000，结束时弧光与落点法印已清理。浏览器本轮控制台无error/warn。

实际预览检查了1星和3星；2星由自动测试覆盖。未执行设备运行或APK打包。
