# P2：敌军智能布阵与特色阵型

日期：2026-10-15。P2已实现独立的L0/L1/L2/L3布阵、角色分类、纯位置模板、开战快照、存档兼容、CLI和诊断。**只改变敌军坐标**；P1-C的成员、属性、装备、预算及生成器保持不变。P3/P4未实施。L2有显式的保护/分散取舍和剩余冲突，不把启发式称作完美解。

正式结果为final-v2-seed12345与final-v2-seed12345-repeat。此前final-seed12345等保留为开发记录，最终回归日志是npm-test-acceptance.log。

## 1. 修改文件

| 文件 | 作用 |
| --- | --- |
| [assets/scripts/core/EnemyFormationTypes.ts](D:/cocos/NewProject/assets/scripts/core/EnemyFormationTypes.ts) | 新增FormationLevel、角色、快照、配置、模板、输出诊断和版本；快照身份采用明确的FNV-1a32，不用时间/UI对象。 |
| [assets/scripts/core/EnemyRoles.ts](D:/cocos/NewProject/assets/scripts/core/EnemyRoles.ts) | 显式角色→已有role→技能/射程→低置信fallback；快照只对当前unit/star/equipment/position做稳定身份。 |
| [assets/scripts/core/FormationPolicy.ts](D:/cocos/NewProject/assets/scripts/core/FormationPolicy.ts) | 验证配置，按阶段内进度插值role/spacing/counter强度；Boss/Elite小幅增益不会凭空解锁未开放的counter。 |
| [assets/scripts/core/FormationTemplates.ts](D:/cocos/NewProject/assets/scripts/core/FormationTemplates.ts) | 仅从7套旧模板提取坐标；检查半场、边界、重复、空模板，保留稳定失败原因。 |
| [assets/scripts/core/EnemyFormation.ts](D:/cocos/NewProject/assets/scripts/core/EnemyFormation.ts) | 独立位置求解器：真实hex几何、角色评分、保护/分散/侧翼、L3启发式、模板、稳定贪心和有限移动/交换。 |
| [assets/resources/config/enemy-roles.json](D:/cocos/NewProject/assets/resources/config/enemy-roles.json) | 15个单位的角色、标签、来源、置信度和理由。 |
| [assets/resources/config/enemy-formation.json](D:/cocos/NewProject/assets/resources/config/enemy-formation.json) | 角色深度/优先级、归一化权重、40轮上限、渐进强度、WaveKind与模板策略。 |
| [assets/scripts/core/RunSession.ts](D:/cocos/NewProject/assets/scripts/core/RunSession.ts) | 单独缓存基础预览；开战时锁L3玩家快照和最终阵型；原成员/预算不写回；存档身份和兼容检查。 |
| [assets/scripts/core/RunSessionTypes.ts](D:/cocos/NewProject/assets/scripts/core/RunSessionTypes.ts) | 新增布阵依赖、开发覆盖参数与逐波formation报告字段。 |
| [assets/scripts/core/ShopSave.ts](D:/cocos/NewProject/assets/scripts/core/ShopSave.ts) | 新budget存档明确formation-v1/auto；缺字段旧档固定l0-compat/L0；记录配置身份及开发覆盖。 |
| [assets/scripts/view/BattleStage.ts](D:/cocos/NewProject/assets/scripts/view/BattleStage.ts) | 实际加载两个新资源并传给共享会话；沿现有createViews和开战后重建显示最终位置，没有新建复杂UI。 |
| [tools/run-simulation.ts](D:/cocos/NewProject/tools/run-simulation.ts) | 另加载formation配置；记录最终真实敌军位置、等级、强度、评分、模板、冲突与玩家快照身份。 |
| [tools/run-sim.ts](D:/cocos/NewProject/tools/run-sim.ts) | 支持--formation auto/L0/L1/L2/L3；保护全部P0/P1证据输出目录。 |
| [tools/report-enemy-formation.ts](D:/cocos/NewProject/tools/report-enemy-formation.ts) | 生成角色表、全99阶段L0/L1/L2、L3场景、模板报告、固定成员BattleSim诊断、来源哈希和独立性能。 |
| [tests/enemy-formation-tests.cjs](D:/cocos/NewProject/tests/enemy-formation-tests.cjs) | 新增25项：真实hex、角色、间距/保护、L3/快照、模板、全部99阶段成员保护、RNG、预览/读档、版本和前缀。 |
| [tests/regression-tests.cjs](D:/cocos/NewProject/tests/regression-tests.cjs) | 原69项保留，P1-C预算夹具显式L0，新增Cocos资源/预览/开战/完整实战事件对照。 |
| [tests/enemy-budget-tests.cjs](D:/cocos/NewProject/tests/enemy-budget-tests.cjs) | 原26项保持P1-C的L0会话夹具；生成/费用/星级/预算数值断言不变。 |
| [tests/run-sim-cli-tests.cjs](D:/cocos/NewProject/tests/run-sim-cli-tests.cjs) | 原5项保留，新增四级真实CLI与P1-C输出保护。 |
| [tools/run-tests.ps1](D:/cocos/NewProject/tools/run-tests.ps1) | 保留全部旧套件，编译新报告工具，加入新布阵测试并传播失败。 |
| [package.json](D:/cocos/NewProject/package.json) | 新增report-enemy-formation命令；无新增依赖。 |

五个新增core TS和两个JSON各带独立Cocos .meta。RunSetup、EnemyGenerator、EnemyBudget、EnemyPowerModel、RunRandomContext、BattleSim、HexMath、Pathfinding、单位/技能/装备/预算配置，以及全部旧阶段报告未修改。350个既有文件字节不变，另10个明确的接入/测试文件在允许改动清单内。开始时已有的工作区改动保留。

## 2. 架构与时机

RunSetup/EnemyGenerator仍预生成原成员与预算 → RunSession在准备阶段取得基础Formation → 点击startBattle锁定当前PlayerFormationSnapshot → EnemyFormation生成最终坐标 → 原BattleSim/原BattleStage显示与回放。

EnemyFormation不导入EnemyGenerator或BattleSim。它不选人、不升星、不发装备、不算奖励，也不修改actualBudget。输出按原generation index还原顺序，保证同一单位仍分配原模拟ID；评分排序不会意外改变战斗ID顺序。

L3准备预览始终是基础L2/模板，不读取玩家阵型。拖动、打开详情或重复resetBattle(false)只复用基础缓存。点击开战后运行一次L3，随后最终位置固定；再次startBattle因phase拒绝。战斗中读档按旧规则返回准备，丢弃本场锁定结果；相同当前玩家快照可重建同一最终阵型。

## 3. 全部角色表

| unitId | 费 | 射程 | formation role | tags | source / confidence |
| --- | --- | --- | --- | --- | --- |
| archer | 1 | 4 | ranged_dps |  | explicit / high |
| guardian | 1 | 1 | tank | durable | explicit / high |
| scout | 1 | 3 | ranged_dps |  | explicit / high |
| warrior | 1 | 1 | melee_dps |  | explicit / high |
| duelist | 2 | 1 | melee_dps | aoe | explicit / high |
| ranger | 2 | 4 | ranged_dps | burst | explicit / high |
| sakura | 2 | 1 | tank | healing, durable | explicit / high |
| shaman | 2 | 3 | mage | aoe | explicit / high |
| young_sasuke | 2 | 4 | ranged_dps | burst | explicit / high |
| champion | 3 | 1 | tank | durable, burst | explicit / medium |
| mage | 3 | 3 | mage | aoe | explicit / high |
| sorcerer | 3 | 3 | mage | aoe | explicit / high |
| itachi | 4 | 3 | mage | control, burst | explicit / high |
| sasuke | 4 | 1 | melee_dps | burst | explicit / high |
| enderman | 5 | 1 | assassin | teleport, burst | explicit / high |

全部理由见[role-table.csv](D:/cocos/NewProject/docs/p2-enemy-formation/role-table.csv)和原角色JSON。当前没有真正的团队support单位：祭司是雷击AoE法师，小樱只治疗自身、仍归tank；support策略由明确标注的测试角色覆盖，不新增游戏内容。近战不会因为range=1自动变tank；无明确依据时稳定回退melee_dps/ranged_dps并标low。

## 4. L0/L1/L2/L3与渐进强度

- L0：普通波沿原enemyProgression.cells；Stage1 intro原样保留。兼容会话完全使用原坐标。
- L1：按配置角色优先级稳定放置；tank偏y4、melee偏y4/5、mage偏y6、ranged偏y6/7、support偏y7、assassin偏侧翼。角色有preferredDepth和allowedDepth，不把所有人钉死一行。
- L2：加入关键后排分散。mage/ranged/support以及高战力远程为关键单位，重要性直接查询P1-B；保护来自前方2 hex内tank，间距目标为关键单位之间至少2 hex。
- L3：在L2基础上使用开战快照。现有assassin/teleport偏向后排法师一侧；现有近战对远程密集阵型增加前压/接近偏好；现有AoE/control朝集中阵型中心偏移。不加冲锋、瞬移或其他新能力，不做战斗搜索。

配置按stage+(round−1)/rounds插值，角色强度从Stage2逐步提高到Stage6满值；spacing从Stage4后逐步提高到Stage8满值；counter从Stage6后逐步提高、仅默认Boss使用，Stage14满值。Elite/Boss仅小幅增加已经开放的评分强度；未开放的counter不会因为bonus突然出现。开发--formation可显式强制满强度，和默认auto政策区别记录。

初始归一化权重：role=1、cover=0.4、spacing=0.65、flank=0.2、counter=0.6、template=1。各评分分量在0～1，活跃权重加权后归一；这些是公开的启发式工程参数，未宣称最终平衡。

合法、唯一占格始终是硬约束；先尝试角色allowedDepth，不够才显式退化。保护与间距为公开的联合软目标，低优先级偏好可牺牲；fallbackSteps记录ROLE_DEPTH、PARTIAL_COVER、SPACING及模板失败/补位原因。部分覆盖和间距冲突可同时保留，不能声称严格的多目标最优。

## 5. Hex与有限求解

直接导入现有HexMath.hexDist/hexNeighbors，使用缓存的28×28距离/邻接矩阵；L3接近偏好复用Pathfinding.nextStep的六边形BFS。没有复制距离实现，也没有用abs(dx)+abs(dy)替代hex距离。角色对y的偏好只表示前后深度。

测试验证奇/偶行邻接，例(3,3)到(4,4)为1 hex，而(3,4)到(4,5)为2 hex。敌军合法区为x=0..6、y=4..7。

求解是稳定贪心+单单位移动到空格/两单位交换，最多40轮、同分top-3使用独立formation流；没有28P10完整排列。非法模板稳定回退普通评分；候选合法格不足等本身无合法解的输入明确报错。

## 6. Stage2/4/6/8/10实际位置

[坐标与ASCII阵型对比](D:/cocos/NewProject/docs/p2-enemy-formation/final-v2-seed12345/REPORT.md)列出这五个阶段首波的L0/L1/L2；[formation-table.csv](D:/cocos/NewProject/docs/p2-enemy-formation/formation-table.csv)包含完整99阶段各单位坐标。0～9标记原生成索引，奇数行有odd-r偏移。

示例来自同一runSeed=12345的实际P1-C成员，不用旧模板的英雄名单替换成员。L3另有15个实际生成Boss场景及3个固定战术夹具，见l3-examples.json；固定夹具明确与实际生成波区分。

## 7. L2间距、保护与退化

| 指标 | L1 | L2 |
| --- | --- | --- |
| 非intro波数 | 965 | 965 |
| 关键单位冲突对数 | 730 | 329 |
| 有间距冲突的波数 | 76 | 56 |
| 角色allowedDepth违规波数 | 0 | 0 |
| 记录fallback的波数 | 111 | 157 |
| 有tank+关键后排的波数 | 49 | 49 |
| 这些波的平均cover | 89.71% | 74.92% |

L2显著减少这些样本的聚团，但平均cover下降：分散、角色深度和模板偏好存在取舍。没有隐藏该退化，也不把329对剩余冲突全部说成数学不可达。最大10后排、角色限定深度及模板约束会增加冲突；有限局部搜索也可能停在局部最优。足够空间的3个关键单位测试达到pairwise hexDist≥2；人工拥挤场景能有限退化且报告原因。L1/L2的cover均高于固定随机位置对照测试。

L0不评分，其null统计表示未计算，不表示完美间距。输出API中L0的空角色/零计数字段仅为兼容，正式统计将其标为未计算。

## 8. L3玩家快照与示例

快照仅包括当前上阵单位unitId/star/equipment/position、由当前配置解析的role/range/tags；不含金币、未来商店、未来操作或RNG。快照身份只对白名单unit/star/equipment/position稳定排序，使用FNV-1a32作诊断；它不是安全校验，正式文件可复现性另用SHA-256。

formation seed不包含快照哈希，玩家快照只影响评分，因此无快照哈希碰撞导致的缓存复用。battleSeed仍为原runSeed+wave派生，不含formation/snapshot哈希。

固定夹具使用现有guardian/mage/itachi/ranger/enderman各2★。三个玩家场景为：

- backline-mage-left：玩家 mage@(0,0)、archer@(1,0)、guardian@(3,3)、sakura@(4,3)、ranger@(4,1)；敌末影人 (0,4)；snapshotHash=16a4ba26。
- ranged-cluster-right：玩家 mage@(6,0)、archer@(5,0)、ranger@(6,1)、scout@(5,1)、guardian@(3,3)；敌末影人 (6,4)；snapshotHash=2a710686。
- spread：玩家 mage@(0,0)、archer@(6,0)、ranger@(1,3)、guardian@(5,3)、sakura@(3,2)；敌末影人 (0,4)；snapshotHash=4f6b8dd6。

完整评分和counterReasons见l3-examples.json。对称左右后排测试会改变现有刺客的侧翼偏好；无刺客/传送成员时不会出现新能力。标签只用于评分，不保证技能将命中某个指定玩家单位。

## 9. Boss模板

旧7套waves.json均提取为legacy-shape-1..7：边境哨卫、林地伏击、秘法巡队、铁壁军阵、元素突袭、王城近卫、终焉守门者。解析只读取坐标，不读取旧unitId/star/statMultiplier/equipment，因此多名3★及0.7/0.85/1.15/1.25属性倍率不会复活。

先匹配适合角色深度的模板槽位，模板不足的人用普通评分补位；角色不匹配的槽可以不用。模板是位置偏好，局部优化可在合法范围调整；templateUsed仅在最终至少一个匹配槽保持命中时为true，并记录命中数。正式L1/L2各98个Boss均有模板命中。非法边界、重复或空模板都通过稳定fallback测试，不会让敌军消失或崩溃。

详情见[template-report.json](D:/cocos/NewProject/docs/p2-enemy-formation/template-report.json)，其中保留每个Boss的部分匹配/补位原因；不能把templateUsed理解为所有旧槽位强制填满。

## 10. 成员、预算与存档保护

基线保存于baseline-waves.json和baseline-signatures.json。生成器的全部968波对象仍完全相同；L0位置完全相同。成员签名忽略且仅忽略x/y，因此unitId、原顺序、星级、装备、倍率、额外增伤/减伤以及其他成员字段均被保护。预算签名覆盖完整生成诊断。

member SHA-256：073b9c8228aa7f5556a3bb058360eab229d9af470460fb4ea1ff4ba33d2bfbbf

budget SHA-256：5203644a323dc6f83c61d048bb08836fd3d00b68fc1af593a0431365f857718f

测试覆盖L1/L2/L3全部99阶段，确认成员和预算不变；真实auto整局报告也逐波与P1-C基线匹配。L0整局75场与P1-C保存的报告逐个旧字段完全一致，只有新布阵报告字段增加。legacy968波仍逐字段等于P0。

新budget游戏保存formation-v1与配置身份（包含角色、策略、几何、单位/技能、纯位置模板、模型版本/标定哈希及覆盖参数）。旧legacy或旧P1-C存档缺字段时固定l0-compat/L0，不静默升级AI。正式保存后的版本/身份不匹配会拒绝；开局菜单尚未绑定配置的新档在首次建会话时绑定。开发强制L0使用同一兼容路径。

## 11. RNG与确定性

使用原RunRandomContext的formation子流，派生包含runSeed、globalWaveId、formation版本/配置身份、等级及强度；没有shop/battle/enemy流消费，也没有Math.random/Date影响数据。候选格按y/x稳定排序，单位按角色优先级、原模型power、unitId、generation index排序；同分只在明确top-K中选择。

同输入两次独立进程运行，10份确定性产物逐字节一致。formations.json SHA-256：

75a222df9f972d41f41b9ff6f4f39268eab1648ba0f50556cf07afc6de6b2ed0

性能wall-clock单列，不进确定性哈希。源码哈希已与当前文件逐项核对；额外1000次formation RNG不改变shop/battle/enemy/bot/reward。重复预览、重复开战拒绝和中断读档均有自动测试。

## 12. 前缀稳定

L0/L1/L2在3/6/99阶段的共同14/38波，连同formation诊断完全一致。L3使用相同MinimalBaselineBot：3阶段运行14波、6阶段38波、99阶段实际74波，共同历史中玩家快照和最终formation逐字段一致。短整局与长整局共同历史之外的死亡/完成原因不冒充前缀不变。

全部哈希、保护数量与比较范围见[verification.json](D:/cocos/NewProject/docs/p2-enemy-formation/verification.json)。

## 13. 性能

第一次正式运行的数据如下；第二次完整结果也保存在verification.json。L0样本包含被强制为L0的intro，L3只有18个代表案例，不能外推设备端p95。

| Level | 样本 | mean ms | p95 ms | max ms | 最大优化轮数 |
| --- | --- | --- | --- | --- | --- |
| L0 | 974 | 0.054 | 0.076 | 0.961 | 0 |
| L1 | 965 | 0.165 | 0.277 | 1.036 | 3 |
| L2 | 965 | 0.182 | 0.437 | 1.163 | 5 |
| L3 | 18 | 1.876 | 5.241 | 5.241 | 6 |

L3平均约1.88ms，第二次约1.68ms；第一次p95/max约5.24ms，第二次约4.44ms。运行时只评分与有限hex BFS，不做BattleSim搜索。性能见[performance.json](D:/cocos/NewProject/docs/p2-enemy-formation/performance.json)；全部测试与统计在本机Node运行，不声称已做Cocos帧率或真机性能验收。

## 14. BattleSim效果诊断

20个实际生成敌军组合（Stage2/4/6/8/10各4波）×L0/L1/L2×50种子=3000场；另3组固定L3战术夹具×50种子=150场。正式单次实跑3150场，独立复跑再3150场；前期开发报告另有6300场。单元测试和整局bot烟测另计，不混进矩阵场数。

固定玩家为guardian/duelist/ranger/mage/sakura各2★、5个合法玩家半场位置；各Level共享对战种子。统计为：

| Level | 场数 | 敌方胜率 | 敌方平均存活数 | 平均秒数 |
| --- | --- | --- | --- | --- |
| L0 | 1000 | 20.00% | 1.604 | 10.213 |
| L1 | 1000 | 20.20% | 1.703 | 10.395 |
| L2 | 1000 | 21.20% | 1.746 | 10.216 |

这20组固定对战并不是1000次独立玩家整局，不能把+1.2个百分点称作一般胜率收益。三种L3玩家场景的敌方胜率为100%/98%/100%，敌方固定夹具含4费和5费，玩家组合也随场景不同；这不是L3相对L2的因果增益，更不是通关率。未据此nerf/buff或调整预算。

真实auto整局烟测在10-6、第74波淘汰；L0在10-7、第75波，与P1-C历史完全一致。没有跳过死亡、发免费资源或调整敌军。战斗明细见battle-diagnostics.json，纯为站位影响诊断。

## 15. 真实测试与复现

前置和最终npm test均退出0。最终新增布阵25项、适配层回归70项、CLI6项、预算26项、RunSession12项、模型8项、标定6项，以及原战斗127/经济56/商店41/属性9和其他旧技能/装备/交互套件均通过。项目声明类型检查与纯TS编译通过，git diff --check通过。日志见[npm-test-acceptance.log](D:/cocos/NewProject/docs/p2-enemy-formation/npm-test-acceptance.log)。

Cocos适配层测试通过真实资源加载入口、RunSession、完整BattleSim事件和现有开战/预览接口，验证最终敌军坐标与显示模型一致；节点边界为测试替身，没有声称看过编辑器画面或真机。

    npm.cmd test
    npm.cmd run run-sim -- --seed 12345 --stages 10 --formation L0 --json temp/p2-l0.json
    npm.cmd run run-sim -- --seed 12345 --stages 10 --formation L1 --json temp/p2-l1.json
    npm.cmd run run-sim -- --seed 12345 --stages 10 --formation L2 --json temp/p2-l2.json
    npm.cmd run run-sim -- --seed 12345 --stages 10 --formation L3 --json temp/p2-l3.json
    npm.cmd run run-sim -- --seed 12345 --stages 10 --formation auto --json temp/p2-auto.json
    npm.cmd run report-enemy-formation -- --seed 12345 --battle-seeds 50 --output temp/p2-report-new

报告工具拒绝覆盖已有目录及旧阶段证据。--enemy-mode legacy默认L0，只有明确开发参数可创建legacy+L1等测试局。

## 16. 尚未实现

P3装备循环尚未实现；P4正式机器人/平衡尚未实现；Stage7/8星级软目标冲突仍存在（成员保持原30.34%/42%/56%）；长期预算饱和仍存在（12-5起持续超上限）；最终85%/50%通关率尚未验证。

L2保护/间距仍是启发式联合软目标，存在剩余冲突；L3只做便宜的当下快照启发，不会完美读心。未新增羁绊、技能、冲锋、掉落或装备，也不根据历史输赢修改难度。
