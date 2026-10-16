# P3：装备循环交付报告

项目：`D:/cocos/NewProject`；日期：2026-10-15。P3已实现并通过核心、存档、Cocos适配层和实际浏览器预览验证。只实现装备预算、奖励、保底、领取与穿戴链路；P4及最终平衡未开始。

正式证据是 `final-v2-seed12345/` 与 `final-v2-seed12345-repeat/`。`final-seed12345/`、`final-seed12345-repeat/`、`development-report/`、`dev-run3.json`和早期日志保留为开发记录。全回归以`npm-test-final-v2.log`为准。根部verification.json为v2验收副本，旧副本保存在verification-v1.json。旧P0/P1/P2的289个证据文件逐字节未改。

## 1. 修改文件

| 文件 | 本阶段作用 |
| --- | --- |
| `assets/scripts/core/EquipmentPolicyTypes.ts` | tier、配额、pending、进度标记、奖励事件及敌军装备诊断类型。 |
| `assets/scripts/core/EquipmentPolicy.ts` | 配置验证、阶段解锁、配额和包含P2角色表的完整配置身份。 |
| `assets/scripts/core/EnemyEquipmentCandidates.ts` | 原裸装候选外增加有限装备组合；复用模型完整组合查询；按角色偏好剪枝。 |
| `assets/scripts/core/EquipmentReward.ts` | 独立reward子流、胜利触发、保底和冻结候选；不接触战斗或第二套库存。 |
| 上述4个TS的`.meta` | Cocos资源导入信息。 |
| `assets/resources/config/equipment-policy.json`及`.meta` | 显式装备分层、敌军候选白名单、阶段配额、角色偏好、掉落与候选不足策略。 |
| `assets/scripts/core/EnemyGenerator.ts` | 配额硬限制、装备软目标、裸装核心价值偏好、最终团队模型复算、装备诊断。 |
| `assets/scripts/core/EnemyGenerationTypes.ts` | 扩展逐波装备诊断字段；原budget-v1配置/公式不改。 |
| `assets/scripts/core/RunSetup.ts` | 可选传入装备政策；预算包络仍使用原裸装上下界。 |
| `assets/scripts/core/RunSession.ts` | 绑定版本/身份；真实胜利后创建pending；统一claim；未领奖时阻止开战、推进和调试跳波。 |
| `assets/scripts/core/RunSessionTypes.ts` | 公共claim动作、只读pending观察及报告字段。 |
| `assets/scripts/core/ShopSave.ts` | 统一v2存档内保存装备版本、身份、pending、领取/评估波号及阶段保底；旧档固定none。 |
| `assets/scripts/core/index.ts` | 导出装备政策、奖励和类型。 |
| `assets/scripts/view/BattleStage.ts` | 加载政策、即时保存结算/领取、恢复奖励面板、拦截自动/手动下一波。 |
| `assets/scripts/ui/BattleUI.ts` | 必要的模态奖励面板，使用真实配置图标/名称/说明；清理旧节点并拒绝迟到图标回调。 |
| `assets/scripts/ui/MainMenu.ts` | 新局预存档显式携带P3标记；继续游戏遵循原档政策。 |
| `tools/bots/minimal-baseline.ts` | 公共接口选index0；准备阶段按UID把库存第一件穿到首个有空槽单位。仅基础设施夹具。 |
| `tools/run-simulation.ts` | 另加载装备政策，结算后公共claim，导出真实装备/奖励/保底；支持显式关闭P3用于历史复现。 |
| `tools/run-sim.ts` | `--equipment-policy auto|none`、装备摘要；保护全部P0/P1/P2报告目录。 |
| `tools/report-equipment.ts` | 99阶段生成、真实run-sim、阶段/奖励/装备表、同预算实战例、存档、前缀、性能和校验。 |
| `tools/audit-p3-equipment.cjs` | 从当前配置和模型生成完整装备审计。 |
| `tools/capture-p3-baseline.cjs` | 一次性保存464个既有文件哈希和968波改动前生成结果；拒绝覆盖。 |
| `tools/finalize-p3-evidence.cjs` | 核对重复结果、浏览器证据、最终测试日志与源码指纹，固定验收结果。 |
| `tests/p3-equipment-tests.cjs` | 新增18项跨系统验收，含全部99阶段、真实战斗、存档、RNG与前缀。 |
| `tests/p3-equipment-compatibility.cjs` | 明确P3接入文件；其他源码/配置按实施前哈希保护。 |
| `tests/historical-inputs.cjs` | 旧实验绑定原输入，同时验证原15单位/技能未变、当前仅新增铁傀儡/对应技能及原6件装备扩展。 |
| 原RunSession、power、calibration、budget、formation测试 | 修复实施前已存在的内容扩展失配，历史实验仍用历史输入；未降低预算/星级/阵型断言。 |
| `tests/regression-tests.cjs` | 增加实际BattleStage资源加载、立即保存、读档、自动/手动阻塞、重复点击及恢复推进。 |
| `tests/ui-interaction-tests.cjs` | 实际BattleUI的2/3张卡、真实说明/图标、模态事件、点击回调与迟到加载保护。 |
| `tests/run-sim-cli-tests.cjs` | 独立进程P3确定性、none政策、非法参数和P2目录保护。 |
| `tools/run-tests.ps1`、`package.json` | 编译报告工具、运行P3测试并传播失败；新增`report-equipment`，无新依赖。 |
| 本目录 | 新阶段证据，旧阶段文件不覆盖。 |

P3未改`equipment.json`、`units.json`、`skills.json`、`BattleSim`、`Unit`、`ConfigManager`、`OwnedUnits`、`EnemyBudget`、`EnemyCandidates`、`EnemyPowerModel`、`enemy-power.json`、P2求解器/角色表/评分配置、B0或4%增长。

实施期间另一工作流更新了既有`tests/advanced-equipment-tests.cjs`，P3未编辑它；前后哈希在`concurrent-changes.json`明确记录，新字节另行固定校验。现有透明装备图片等无关改动保留。

## 2. 当前装备审计

当前10件；3槽、允许同装备重复；背包库存无限，24格是分页显示容量。属性和被动叠加细则直接沿用真实装备说明。

| ID / 名称 | tier | 主要属性及效果 | P1-B实测单件贡献范围 / 置信度 |
| --- | --- | --- | --- |
| guinsoo / 鬼索的狂暴之刃 | advanced | 法术+10%，攻速+0.1次/秒；每普攻+0.05，每场重置，最高5次/秒 | 9.37～1911.39；单位点medium/low，全局fallback low |
| jeweled_gauntlet / 珠光护手 | advanced | 法术+20%、暴击+35%、技能可暴击 | 4.33～54.76；单位点medium/low，全局low |
| infinity_edge / 无尽之刃 | advanced | 物理+20%、暴击+35%、技能可暴击 | 10.65～90.61；单位点medium/low，全局low |
| totem_of_undying / 不死图腾 | special | 生命+200、双抗+10；濒死保护、护盾与回复，每场一次 | 15.20～453.05；单位点medium/low，全局low |
| arcane_sovereignty / 奥术君权 | advanced | 法术+50%；按最终法术加成档位增加伤害 | 未标定；敌军禁用 |
| crimson_bloodclaw / 猩红噬血爪 | advanced | 全能吸血20%、双抗+10、物理/法术+10%；失血增吸血 | 未标定；敌军禁用 |
| abyssal_plate / 深渊重铠 | advanced | 护甲+60、生命+100；护甲严格高于100时额外减伤 | 未标定；敌军禁用 |
| divine_judgment / 神圣裁决 | advanced | 物理+50%；攻击半血以下目标增伤 | 未标定；敌军禁用 |
| arcane_veil / 秘法帷幕 | advanced | 魔抗+60、生命+100；魔法伤害额外减免15% | 未标定；敌军禁用 |
| forest_sanctuary / 森灵庇护 | special | 生命+500、最大生命+20%；首次半血后持续回复 | 未标定；敌军禁用 |

范围来自原15单位×1/2/3★的单装实测点，不是装备统一售价。鬼索对特殊3★单位收益差异很大。铁傀儡尚无P1-B单位标定，保留原显式cost fallback、置信low，并排除其装备候选。

完整基础字段、效果、组合查询、贡献、置信度、方法和单位差异见`equipment-audit.json`、`equipment-table.csv`。未标定物品的估值显示null；没有把模型“忽略未知物品”的部分估值冒充装备价格。

## 3. 是否新增基础装备

没有新增装备，因此没有增量标定，也未修改P1-B模型文件。6件新特效装备和铁傀儡均在P3开始前已经存在。

当前无basic，前期不足三选一采用显式配置降级：basic池为空时，使用`guinsoo`、`jeweled_gauntlet`两个advanced候选，返回真实**2选1**，附`EMPTY_BASIC_POOL_CONFIGURED_ADVANCED_FALLBACK`和`INSUFFICIENT_POOL_FEWER_CHOICES:2`。Stage4起advanced池足够，返回3个不同候选；Stage8才开放special。没有重复装备凑数。

模型版本仍是`enemy-power-v1`，calibrationHash仍为`fb31829c87670bdba73af786d39ca99cda9aa875f1ffb609fd1e072e66e00b3d`，文件SHA-256仍为`38ba7d425fa235b528799d46e6a21a1c58ec506841fd58e15c41a64887837cb0`。

## 4. 敌军装备政策

| 阶段 | normal | elite：人数×单人槽上限 / 总目标 | boss：人数×单人槽上限 / 总目标 |
| --- | --- | --- | --- |
| 1～2 | 0 | 0 | 0 |
| 3～5 | 0 | 1×1 / 1 | 1×1 / 1 |
| 6～9 | 0 | 2×1 / 2 | 1×2 / 2 |
| 10～99 | 0 | 2×1 / 2 | 2×3 / 3 |

Stage3开放已有标定的advanced，Stage8开放已标定special。白名单仅原4件。配额是硬上限，targetItems是软目标；预算优先，冲突记录`EQUIPMENT_POLICY_BUDGET_CONFLICT`并允许少装备。强行低预算测试已证明不会免费塞装；正式seed12345的软目标均满足，无该冲突。

每个unitId跨所有星级最多12个装备候选，单装top2、组合beam2；双/三装仅Boss配置允许。保留各合法槽深的代表候选；允许重复装备。角色偏好复用P2显式角色表（未提供角色表的底层调用才走已有role fallback），只影响剪枝顺序；单位裸装模型价值用于核心偏好，不创造角色战力倍率。角色表也绑定进装备配置身份，改变角色不能静默重生成未来装备。每一个组合都调用`estimateUnitPower`；未测组合由原模型自身fallback并标low。

## 5. 装备预算

原裸装可行包络不变，968波的raw/requested/effective、人口与WaveKind均与实施前相同。装备不能提高effectiveBudget，也不扩大后期饱和上限。费用解锁与3★硬限制照旧。Elite/Boss重新优化后unitId/star可以变化，遵循任务第56条，不声称成员完全不变。

| 实际波次 | 相同effectiveBudget | 无装备actual / 偏差 | 装备actual / 偏差 | 同成员装备贡献 |
| --- | --- | --- | --- | --- |
| 4-6 Elite | 626.119640 | 619.082981 / 1.1239% | 625.282624 / 0.1337% | 9.372418 |
| 4-7 Boss | 694.452202 | 696.584244 / 0.3070% | 694.699539 / 0.0356% | 10.650206 |

贡献严格为最终装备成员模型估值减同单位/同星级裸装估值，不等于两个不同成员方案的预算之差。两组完整成员、装备、预算和实战在`final-v2-seed12345/budget-examples.json`。

965个非intro波全部在5%内，最大4.9799648911%；无infeasible。全部最终actualBudget均重新查询`estimateTeamPower(final enemies)`。普通波装备总数0。

`baseline-signatures.json`记录实施前后的签名：target、population、WaveKind及原L0坐标一致；194个挑战波的unitId/star组合改变，属于预算购买装备时的合法替换。P2最终坐标仍按实际成员求解，不要求不同成员有相同最终站位。

## 6. Stage2～10敌军装备分布

seed12345实际生成；normal各阶段均0。每阶段目前各有一波Elite和Boss，完整按WaveKind拆分在`enemy-equipment-by-stage.csv`。

| stage | elite件数 / 携装人数 | boss件数 / 携装人数 | 全部可奖励机会 | 最小机器人实际创建奖励 | 阶段保底实际满足 |
| --- | --- | --- | --- | --- | --- |
| 2 | 0 / 0 | 0 / 0 | 2 | 1 | 是 |
| 3 | 1 / 1 | 1 / 1 | 2 | 1 | 是 |
| 4 | 1 / 1 | 1 / 1 | 2 | 2 | 是 |
| 5 | 1 / 1 | 1 / 1 | 2 | 1 | 是 |
| 6 | 2 / 2 | 2 / 1 | 2 | 2 | 是 |
| 7 | 2 / 2 | 2 / 1 | 2 | 1 | 是 |
| 8 | 2 / 2 | 2 / 1 | 2 | 2 | 是 |
| 9 | 2 / 2 | 2 / 1 | 2 | 1 | 是 |
| 10 | 2 / 2 | 3 / 2 | 2 | 0 | 否；10-7淘汰，未打奖励波 |

99阶段生成共472件、378个携装敌人。三槽和3★带装候选均可查询并受限，但本seed最终没有选中三槽或3★带装单位，不能声称实战发生过。装备对星级/成员的替换由预算决定。

候选tier分布、实际奖励波胜负、未到达机会、玩家装备数量均另列CSV。玩家统计来自实际run-sim，绝不把未打到的Stage10奖励波算作胜利或已掉落。

`playerEquipmentInventory`、`playerEquippedItems`、`playerEquipmentCount`均为开战快照（含备战席携装）；本波新领取装备在下一波快照体现。`rewardChoice`和`guaranteeState`是本波结算/领取之后的状态。

## 7. 玩家奖励规则

只认真实BattleSim的`winner===0`；整局仍存活、平局、失败均不是奖励胜利。普通/intro不掉；Elite胜利50%机会，Boss胜利100%。每阶段末波符合奖励的胜利若尚未领取本阶段装备，会强制创建奖励，即使概率配置为0。整阶段奖励波都失败不会凭空发装。

基础/进阶/特殊解锁为1/4/8；前期空池降级见第3节。合法装备ID先稳定排序，再使用独立reward子流打乱取最多3个不同ID。版本派生流索引，不使用时间或UUID。

rewardId形式：`equipment-reward-v1:<runSeed>:<waveId>`。候选生成即保存；保底在实际claim后置true。`lastEvaluatedWaveId`防重复生成，`lastClaimedWaveId`压缩领取历史；未保留无界奖励全文。

## 8. pending状态机

```text
真实战斗结束 → RoundFlow.settle → 原金币/经验一次
  → 符合奖励胜利 → 冻结pending + 同一份存档立即保存
  → 模态奖励面板，核心nextWave/startBattle/debugJump均阻塞
  → RunSession.claimEquipmentReward(index)
  → 原equipmentReserve +1，记录领取波号、阶段保底，清pending并立即保存
  → 面板关闭；结算阶段正常一秒推进，整局结束则等待原结束操作
```

领取检查pending、索引、装备ID和领取标记。背包无限，沿用现状；装备仍最多3槽。UI、最小机器人、测试共用`claimEquipmentReward`或对应公共act动作，不直接发放奖励库存。新UI不改BattleSim result。

## 9. 存档与恢复

v2内新增`enemyEquipmentVersion`、`equipmentRewardVersion`、`equipmentConfigIdentity`、`equipmentProgress`及最近奖励诊断。equipmentConfigIdentity绑定完整政策、P2角色表和当前全部装备配置；已绑定档的配置、模型或版本变化明确拒绝。

旧P2缺字段档固定`none/none`，不会开启未来敌军装备或新增奖励；玩家已有装备原样保留。新局由主菜单票据或显式装备政策的新RunSession绑定P3。底层`freshSaveV2`第四参数用于新菜单票据，未显式开启的历史fixture保持none。

P3开始前新增的铁傀儡/6件装备已经改变原配置身份；更早内容版本的档仍可能按既有身份规则被拒绝。没有静默升级模型或未来敌军。

真实测试：生成未领→JSON保存→读档候选相同且金币/经验不重发→领取第2项→保存→再读档奖励不再出现；settle调用3次只生效一次；重复claim失败且库存不增。实际pending/claimed样例保存在正式目录。

浏览器也执行重载继续：同一`equipment-reward-v1:1:14`、候选`jeweled_gauntlet/guinsoo`保持，金币9744、XP2不变；指针点击第2项后背包仅增加鬼索，pending消失，存档领取标记为14。详见`runtime-verification.json`。

## 10. RNG与独立复跑SHA-256

reward×1000不改变shop/enemy/formation/battle/bot；额外enemy/formation×1000不改变奖励；已冻结候选不受预览操作影响。所有流沿用P1-A派生协议，未改RunRandomContext。

两次独立`report-equipment`进程的14个确定性文件全部字节一致，耗时与manifest不参与比对，见`repeat-verification.json`。

- reward-report.json：`0a18a5f99981a50ee75e199ae8b83258865e4904a14d5564728df3ad659449df`
- reward-table.csv：`40b6d035f98e51182ba18093ed82f8b837df9fd2338487aa90ae1b0b4872069f`
- waves.json：`b7f4c712648083f6052a2a01868711378b0dc620d4c879620f0aed54c063a31d`
- run-99.json：`26db781996c775eee60db8aac930b859aa207c93c0013ee2b15f582810ae32c1`

## 11. 前缀稳定

真实3/6/99阶段分别生成14/38/968波，共同生成前缀相同；实际最小机器人分别打14/38/75波，前14及前38波逐字段相同，包括商店、敌军、最终阵型、奖励候选、选择、装备、金币和战斗。前两局正常完成，99阶段夹具10-7死亡；根部终止原因不纳入共同历史比较。单seed结果不代表通关率。

P2求解器及其配置字节不变；相同member+equipment+playerSnapshot的阵型与真实战斗可重复。奖励UI操作不消费formation流。

## 12. 真实战斗与实际UI

同预算4-6/4-7各方案均实跑50seed×换边×反转实例顺序=200场，2个波次×2方案共800场/报告进程。均为合法5名2★固定玩家夹具、原L0格控制位置，不冒充装备策略或最终平衡。

- Elite两方案敌军胜数均0/200，敌军平均实际伤害1942.765→2326.58。
- Boss两方案敌军胜数均0/200，平均实际伤害2910.05→3057.86。

原战斗效果没有替代实现。实际奖励领取鬼索→原背包→公共equip→真实BattleSim：卫士攻速0.6→0.7次/秒、法术加成10，战后叠层7；新战斗叠层0、攻速回0.7。无新增basic，按要求验证现有代表装备；图腾、技能暴击和6件新增特效继续由原全部装备测试覆盖。

Cocos Creator 3.8.8实际Browser Preview中完成：主菜单新局绑定P3、真实BattleSim击败Boss、2选1/3选1图标和完整配置说明、重载恢复候选、指针点击第2项、持久化。5-8的非终局settlement等待超过原1秒仍停留，手动restart也被阻止；领取后恢复自动推进。浏览器使用独立临时session partition，不改用户原游戏存档。

图片：`runtime-reward-two-choice.png`、`runtime-reward-three-choice.png`；结构与操作结果：`runtime-verification.json`。开始预览读到旧编译缓存时未据此验收；显式刷新资产数据库后确认实际组件有P3方法/版本，才执行上述验证。未运行安装设备验收。

浏览器证据在最后的P2角色来源/配置身份修正前执行；该修正未改UI、奖励、claim或推进代码，也未改变本seed的75波实玩历史与两个实战例。最终修正以完整核心/适配层测试和两次独立报告重新验证，未重新执行一次浏览器验收。

## 13. 性能与候选上限

965个非intro波的单波生成耗时，包含需要时的候选构造/模型查询；不把耗时加入确定性报告。

| 指标 | 正式第一次 | 独立第二次 |
| --- | --- | --- |
| mean | 1.028ms | 1.049ms |
| p95 | 3.932ms | 3.989ms |
| max | 46.487ms | 51.073ms |
| 最大候选数：裸装→装备 | 48→228 | 48→228 |

每unitId跨星级装备候选硬上限12，无全组合穷举。奖励候选独立微基准2000次：mean0.00300ms、p950.0033ms、max0.9377ms；该微基准不计入实际胜利/掉落统计。原始逐波数据在`performance.json`。

## 14. npm test与复现

`npm.cmd test`最终退出码0；Cocos已生成声明下的TypeScript检查和纯TS编译通过。明确计数：战斗127、经济56、商店41、联动72、属性9、RunSession12、CLI7、模型8、标定6、预算26、阵型25、P3装备18，均零失败；其余原技能/公平性/装备/界面套件也通过。日志`npm-test-final-v2.log`。`git diff --check`通过。

实施前`pre-p3-npm-test.log`退出1：当前16单位与历史15单位输入、标定矩阵、快照和源保护失配。修复测试输入边界后旧实验仍按原15单位/4件装备复现，同时单独验证新内容和本次P3；没有修改原标定值或历史证据来让断言通过。

```powershell
Set-Location D:\cocos\NewProject
npm.cmd test
npm.cmd run run-sim -- --seed 12345 --stages 6 --json temp/p3-run.json
npm.cmd run run-sim -- --seed 12345 --stages 6 --equipment-policy none --json temp/p2-compatible-run.json
# 每次选一个不存在的新目录，避免覆盖证据
npm.cmd run report-equipment -- --output docs/p3-equipment/recheck-new
```

## 15. 尚未实现

- P4弱/中/强机器人尚未实现；现有领取/穿戴规则只是基础设施夹具。
- 最终3阶段85%通关率尚未验证。
- 最终6阶段50%通关率尚未验证。
- Stage7/8星级软目标冲突仍存在。
- Stage12-5以后长期预算饱和仍存在；P3刻意保留原包络，没有靠装备扩大预算上限。
- 装备掉率与最终数值平衡尚未最终调参。
- 纯basic装备内容仍缺失，已用明确2选1降级处理；6件现有新增装备和铁傀儡仍待独立的后续标定，敌军未使用其未标定装备估值。
