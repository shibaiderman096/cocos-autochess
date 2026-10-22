# 浮空棋境：浮空遗迹 P0.5 测试修复与回归隔离

日期：2026-10-20（Asia/Shanghai）。项目：`D:\cocos\NewProject`，Creator 3.8.8。

**标准全量回归最终为 69 套件通过、0 失败。资源检查、类型检查、新网页构建通过。P0 静态棋盘、主场景、配置与历史审计资料受到保护。没有进入 P1/P2，没有推送、合并或提交。** 浏览器发现的额外编译缺陷也纳入修复，详见下文；未运行的 Blender/设备项目仍明确列出。

## 基线、起点漂移和历史证明

- HEAD 始终为 `db4b4efbed30d72911d2634bed989056a75179e0`。当前工作树原有大量机械先驱、怪物、角色清理和 P0 未提交文件；不能把全部 `git diff HEAD` 当成本轮修改。没有 stash/reset/切换用户分支。
- 起始报告为项目 `docs/floating-ruins-p0.md`。已读 README、package.json、标准测试/构建入口、P0 manifest 与证据。P0 manifest 相对起点已有 engine.json 漂移，本轮没有覆盖；[起点漂移](evidence/floating-ruins-p0.5/p0-manifest-baseline-drift.json)。
- 首轮保存 [HEAD](evidence/floating-ruins-p0.5/baseline-head.txt)、[工作树](evidence/floating-ruins-p0.5/baseline-status.txt)、[现存文件哈希](evidence/floating-ruins-p0.5/baseline-hashes.json)、二进制 patch、未跟踪文件列表和 tar 快照。大体积恢复包留在项目证据目录；交付副本不重复打包。忽略的 library/temp/node_modules/build 未归档。
- 继续修复前另存 [状态](evidence/floating-ruins-p0.5/continuation-1/status.txt)、[哈希](evidence/floating-ruins-p0.5/continuation-1/baseline-hashes.json)、上一阶段报告 `previous-report.md` 与受改文件源副本。源副本 `.ts.txt` 保留原字节，避免项目宽泛 tsconfig 把证据当源码编译。首次因此失败的类型/全量日志仍保留为 `final/*.attempt1.log`，修正的是证据文件扩展名。
- [最初标准 npm test](evidence/floating-ruins-p0.5/npm-test-before.log) 在资源检查阶段提前退出；[逐套件基线](evidence/floating-ruins-p0.5/before/regression-suites.json) 为 **55/14**。第一阶段标准入口修至 **57/12**，记录保留在 `npm-test-verified.log`。本次继续后，标准入口达到 **69/0**，不是把旧报告数字沿用为当前结果。
- 用 `git archive HEAD` 建立隔离历史源码副本，未切换当前树。首次解包有两个中文原画名失败，随后独立导出 assets/tests/tools/docs/settings 成功；测试不依赖失败原画。HEAD 原入口 **58 套件，44/14**：[历史原入口](evidence/floating-ruins-p0.5/history-head/regression-suites.json)。与当前清单不同，不能直接比较总失败数。
- 又用当前对应测试跑历史源码，[结果](evidence/floating-ruins-p0.5/history-current-suites/results.json)、[比较](evidence/floating-ruins-p0.5/history-comparison.json)。12 项的同类首因在不含 P0 的 HEAD 复现，**仅证明指定首因/触发是历史问题，不证明所有后续断言都历史存在**。Shadow/Sunlight VFX 在 HEAD 通过，不能归入历史失败。新增 UI 重叠、失效奖励图标、网页迭代编译问题没有独立在 P0 前环境复现，历史归属仅疑似/未证实。

## sunlight_slash：修真实引用，不造资源

运行路径仍指向已迁移删除的 `art/fx/sunlight_slash/spriteFrame`；真实文件和 meta 在 `assets/resources/art/ui_m2/`。修改 `assets/scripts/view/ArtPaths.ts` 指向真实位置。

当前 PNG 与 HEAD 原 PNG blob 都为 `15bbf14eb630ebfe89a0d28ad06672de1c35c939`，meta UUID 都为 `edca0299-1173-4457-bbf5-baeb2dcc2022`，SpriteFrame 子资源保留。因此是路径失配，非图片遗失或新造空资源，也不需要复制重复 UUID。最终资源检查覆盖 177 个注册纹理/SpriteFrame、27 名购买棋子、30 种怪物及引用；日辉测试仍走实际文件存在性和加载回调。

## 原 14 个失败套件逐项交付

各项均实际单独重跑，修复中间失败日志保留在 `continuation-1/*attempt*.log`；最初日志在 `before/regression-<name>.log`。最终标准入口 [完整日志](evidence/floating-ruins-p0.5/continuation-1/final-iterables/npm-test.log) 包含全部 69 套件结果。没有删套件、跳过退役分支或放宽原有不等式来凑通过。

| 原失败套件 | 实际根因与最小修复 | 最终 |
| --- | --- | --- |
| unit-tests.js | 通用公式测试查退役 warrior，且旧常数连 M1 原配置也不吻合。使用 Git `40b0421` 原始 units/skills 明确绑定通用公式输入；按原 atk55/armor40/mr20/fireball220 独立重算 39、55、169。当前名单另有集成覆盖。改 `tests/unit-tests.ts`，127 项断言通过。首因历史已证实。 | PASS |
| regression-tests.cjs | Node 直接装载 ShopVisitor 导致缺 cc；补同一 Cocos 转译边界、真实 ArtPaths 和检查文件存在的加载器。后续旧名单/商店立即推进/战时合并预期失配：历史机制案例明确用原配置，当前案例用合法当前名单；真实走商店返回及下一关、战后合并。移除原夹具 atk/hp100000 强制胜利，改合法当前三星阵容真实获胜。74 项通过。首因历史已证实。 | PASS |
| ui-interaction-tests.cjs | 人口位置应为 centerY+28（88），倒计时结束与正式开战是不同状态；核对现有 HUD/备战席文档后更新过期用例，并测另一中心。强化图标实际尺寸、隐藏生命条仍见装备、独立日辉行、宝箱和商人返回路径。严格矩形断言发现真正详情面板重叠，另发现首领棋子图标使用退役 warrior；生产最小修复见下。8 组通过。原首因历史已证实；新暴露 UI 缺陷未单独历史复现。 | PASS |
| shadow-vfx-tests.cjs | ArtPaths mock 只给 FX_SPRITE，漏了新增消费者的 UNIT_ART。传真实 UNIT_ART，保留方向、雾、暂停/结束/重绑/迟加载覆盖。HEAD 原套件通过，此项不能说历史失败。 | PASS |
| sunlight-animation-tests.cjs | 旧 sunlight_slash 路径及 mock 单位缺 cfg 身份。修真实引用；使用真实 helion 身份，保留十成员、九类效果及方向/生命周期覆盖。HEAD 原套件通过。 | PASS |
| progression-tests.cjs | 旧 37 名单、退役 ID 与旧目标/位移假设；当前实际 27 名，费用分布 [6,6,5,5,5]。改合法十人上阵与技能实际拥有者，按真实 self/furthest/dash 结束时点断言。保留全部技能派发；无主 monster_blast 仅在明确共享施法分支中用现存配置作输入。首因历史已证实。 | PASS |
| skill-crit-equipment-tests.cjs | 退役 young_sasuke/sasuke/itachi 被当前 cfg 清除；混用旧百分比/新固定混伤也失真。以 `c001e20` 原配置成套恢复历史机制输入，保留物理/魔法/真实/AOE/暴击/抗性/持续伤害/延迟眩晕/治疗不暴击/确定性。未改运行角色。首因历史已证实。 | PASS |
| run-session-tests.cjs | 续战循环在 pending reward / specialShop 状态仍无条件 startBattle，正确得到 null。两条续战轨迹都通过公开 claimRewards/nextWave 推进，仍比较战斗、存档及随机历史。12 项通过。首因历史已证实。 | PASS |
| run-sim-cli-tests.cjs | 随机早期版式下“第一个第二阶段节点”未必 monster，误取节点导致分类断言错位；商店和小怪箱流程也更新。按 encounterKind 找真实怪物，精确核对 shops [2,3] 及五次公开领取，仍用真实 CLI 进程、保留保护/非法配置断言。7 项通过。首因历史已证实。 | PASS |
| power-calibration-tests.cjs | 装备机制比较夹带改名字段；当前 27 名单矩阵数量也过期。四件装备除 name/effectDescription 外仍逐字段严格等于冻结机制，名称单独精确断言。现矩阵 2754 案例精确分组核对；旧 971 矩阵、全部历史组队配置及 16 个真实确定性战斗保留。6 项通过。当前组队生成覆盖空缺见风险。首因历史已证实。 | PASS |
| enemy-budget-tests.cjs | 冻结旧 roster 查询当前无 warrior 的 power model。冻结 968 波预算实验配同版本 final-500 power；当前生成与运行集成继续用当前配置。保留预算边界、身份及冻结资料哈希断言。26 项通过。首因历史已证实。 | PASS |
| p3-equipment-tests.cjs | 冻结 guardian 等名单混入当前角色映射/强度，且老 hybrid 字段不兼容新结算。冻结生成器使用对应 power/roles/formation；历史实际战斗使用 Git 中真实兼容配置，模拟同时提供对应 policy。18 项通过，装备偏好/奖励/胜利与前缀仍测。首因历史已证实。 | PASS |
| formal-bot-tests.cjs | 胜利夹具三个退役 ID 全被清理，onBoard=[] 导致 null。使用真实 oris/bao_zero/helion 三星阵容，仍须真实获胜；三个 bot 实际领取并装备奖励，保留合法性/会计断言。9 项通过。首因历史已证实。 | PASS |
| medium-economy-tests.cjs | 十个退役 ID 清成空阵容，错误触发 underfilled/develop。改合法当前满编和真实高费三星无升级夹具，并用真实商店可售对子；原 XP/刷新/利息/金币预算断言保留，未调整经济规则。10 项通过。首因历史已证实。 | PASS |

历史夹具不是伪造数值：新增 `tests/fixtures/m1-40b0421.json` 来自 `40b0421543c517ba8dff1fe0e5e81e773b8ccaba`；`content-c001e20.json` 来自 `c001e20bf81cb65764a7ca1cb579742cd5943e8a`。每个配置经 `git show` 逐对象核对，[来源及最终代码审计](evidence/floating-ruins-p0.5/continuation-1/final/change-audit-final.json) 全部 exact=true。冻结历史审计 JSON 没有重写。`tests/advanced-equipment-compatibility.cjs` 单独严格核对机制与四个当前正式名称，不忽略数值差异。

## 实际生产缺陷与编译修复

1. `BattleUI.ts` 详情框原尺寸 280×490、中心 (450,35)，同时与生命 HUD 和指令区相交。高度改 478、装备行局部 y 从 -205 到 -202；矩形不重叠条件保持严格，浏览器实看通过。没有改主场景文件。
2. `StageRewardPanel.ts` 首领棋子补给使用已不存在的 `UNIT_ART.warrior`。改取当前配置首个真实一费棋子的 artId，缺省回落现有怪物图标。奖励生成/经济不变；实际首领宝藏能显示棋子与装备图。
3. Creator 对 Set/Map 展开编译为 `[].concat(iterator)`，Node 源码测试无法捕获。第一阶段修 OwnedUnits 去重、ShadowTraitPreview 查找、Shadow/Sunlight channel 快照。继续在编译版真实首领战看到 `_pop.split is not a function`；新增产物测试在旧构建上再次失败，[复现](evidence/floating-ruins-p0.5/continuation-1/final-iterables/compiled-before.log)。修 ShadowSkills 的射线 cells、void marked 及 EnemyFormation 的 assignments 为 `Array.from(...)`，迭代顺序、快照、去重和公式保持原语义。
4. `tests/web-build-tests.cjs` 直接抽取当前 Creator 编译方法和实际 helper：穿透完整伤害/事件轨迹、末端 (6,0)、两个唯一标记、阵型位置/诊断均与源码执行精确比较。[新产物通过](evidence/floating-ruins-p0.5/continuation-1/final-iterables/compiled-after.log)。第一次新增测试漏注入产物 `_extends` helper 的失败日志也保留，修正测试边界后重新真实构建成功。
5. `web-build-tests` 的退役忍者旧断言改为当前 authored mechanical 3/5/7 完整档位精确对象比较，重复成员不触发阈值仍测；没有删除原编译安全断言。

所有 battle/core 的更改仅为迭代表达式。对 ShadowSkills、SunlightCombat、OwnedUnits、EnemyFormation 进行精确反向语法替换后，SHA256 与初始基线一致；[保护报告](evidence/floating-ruins-p0.5/continuation-1/final-acceptance/protection.json) unexpected=[]。主 scene、P0 preview scene、GLB/Blender 源、全部配置、存档与核心实现、历史 P0 证据通过保护；四个文件的等价语法例外明确披露，不能说它们字节没变。

## 可复现自动验收和浏览器证据

在项目根运行：

```powershell
npm run check:resources
npx tsc --noEmit -p tsconfig.json
npm test
npm run build:web
node tools/verify-floating-ruins-p05.cjs --baseline docs/evidence/floating-ruins-p0.5/baseline-hashes.json
pwsh.exe -NoProfile -File tools/run-floating-ruins-p05-regression.ps1
```

两个新入口默认新时间目录、拒绝覆盖证据。逐套件脚本从标准入口取同一清单并分别记日志；失败非零退出，不能替代标准入口。`floating-ruins-tests.cjs` 默认不写旧 P0 资料，只在显式 `FLOATING_RUINS_REPORT` 时输出指定新报告。

自动验收解析真实 GLB、用生产几何验证 56 中心+336 顶点=392 点，最大离线误差 **0.0000124561 px**；中心及向内微缩角点均命中对应格，模式往返十轮后输入层/单位/fx 激活状态保持。它是逻辑边界验证，不冒充完整引擎。最新 [summary](evidence/floating-ruins-p0.5/continuation-1/final-acceptance/summary.json)。

脚本缺 Creator 声明会记清楚 NOT_RUN；资源/模型/保护或投影错误记 FAIL。`--build` 才启动新构建，缺 Creator 可执行文件明确失败。脚本自身的 Blender/browser 仍为 NOT_RUN，退出 **2** 表示完整外部验收未覆盖；本次构建与浏览器是另行执行并留证，不能把 raw summary 改写成全部 PASS。

真实独立 P0 预览 `http://localhost:7456/?scene=09ea902d-5d19-4527-b876-f6f994de5daa`：点击校准取得实际相机 392 点报告；最大中心误差 0.0000122437 px、顶点 0.0000131957 px。实际完成备战席上阵、2D/3D 往返保留单位、切回后再次拖到新格、查看详情、真实开局战斗结算（伤害175、宝箱）。console 无 error；原存档隔离/字节保持由预览校准记录核对。

新网页产物由只绑定 127.0.0.1 的临时服务器运行，实际进入主菜单/新对局、拖拽上阵、首领战及奖励面板。使用现有 Debug 菜单领取真实当前三星棋子/金币、买 XP、跳 4-7，未改运行属性或伪造胜利。此项是受控界面烟测，不能当自然游玩难度或性能验收。第一次编译版实战出现两次 ShadowSkills error，截图和 console 失败证据保留；修复后再用新构建复验，最终状态见 [浏览器复验记录](evidence/floating-ruins-p0.5/continuation-1/final-browser-result.json)。

修复后明确使用 **1280×720** 桌面视口再次拖拽三人上阵、真实赢下 4-7（统计伤害4540）、打开首领宝藏，console error **0**：[结算](evidence/floating-ruins-p0.5/continuation-1/p05-continued-build-victory-final.png)、[宝藏图标](evidence/floating-ruins-p0.5/continuation-1/p05-continued-build-reward-final.png)、[错误日志](evidence/floating-ruins-p0.5/continuation-1/p05-continued-build-errors-final.json)。临时服务器已关闭，视口设置已复原。

**未解决显示项**：浏览器变为 904×871 及重新载入时，原有编译版 UI 出现裁切、部分点击无响应/坐标失配；[截图](evidence/floating-ruins-p0.5/continuation-1/p05-continued-narrow-viewport-limitation.png)。新开页也观察到该限制，随后固定桌面视口完成技能回归。未单独在 P0 前网页产物复现，不能宣称历史已证实。本轮没有扩大修改主场景/全局缩放策略，因此这里保留 OPEN，**不是所有分辨率浏览器验收通过**。

当前网页构建配置仅导出原 main/scene，**独立 P0 preview scene 未包含在网页包**。所以“编译版浏览器验证”验证原有 2D 游戏，而 3D 棋盘通过 Creator 独立预览验证；没有声称发布包已经导出浮空遗迹场景。未改 builder 或主 scene 来扩大范围。

## 最终统计、范围和剩余限制

| 验证 | 当前真实结果与日志 |
| --- | --- |
| 最初逐套件基线 | 55 通过 /14 失败；标准入口当时卡资源 |
| 第一阶段 | 标准入口 57/12，原日志保留 |
| 最终标准 npm test | **69/0，退出0**；`continuation-1/final-iterables/npm-test.log` |
| 资源检查 | 通过；`continuation-1/final-acceptance/resources.log` |
| tsc --noEmit | 退出0；`continuation-1/final-acceptance/typecheck.log` |
| 网页构建 | 真实新构建及产物回归退出0；`continuation-1/final-iterables/build-web-verified.log` |
| 编译版浏览器 | 1280×720 实战胜利/宝藏图标通过、error0；904×871 裁切及输入问题保留 OPEN |
| P0 离线/实际相机投影 | 56格392点通过；十次离线模式往返、实际拖拽/模式切换/战斗已执行 |
| 原场景/模型/配置/核心保护 | unexpected=[]；四个等价迭代语法例外经反向哈希证明 |
| Blender 现场模型 QA | **未重跑**；旧 model-qa 仅证明历史资料一致，不能当本轮新验收 |
| 移动端/设备/全技能瞬时 VFX | **未运行**；不能从桌面通过推导 |

本次继续主要修改 13 个过期测试/兼容文件与两份有 Git 来源的历史配置；生产修两个 UI 问题、ShadowSkills 两个迭代表达式和 EnemyFormation 一个迭代表达式，另扩充产物/保护验收。第一阶段的资源/迭代兼容修改保留。完整本轮差异应按起点快照审核，不能用脏树 HEAD 差异混算。没有修改棋子数值、技能配置、经济规则、存档格式或战斗核心公式。

仍需如实保留的限制：当前强度校准矩阵生成器硬编码退役组队模板，当前 2754 案例中 **team=0**（mirror621/unit702/star81/single810/combo540），不是“当前全部组队校准通过”。本轮严格保留历史组队矩阵/确定性样本，以及当前运行/机器人集成测试；没有借此重新拟合强度模型或调整预算。当前内容的完整组队再校准属于单独后续工作。

P1 准入建议：代码回归、固定桌面视口与独立 P0 预览交互门槛已满足，**不据此直接给 P1 全面绿灯**。启动动画阶段前应处理/明确隔离窄视口显示与输入问题，明确独立浮空场景的发布包导出目标，并完成新 Blender 现场 QA 与目标设备性能/显示验收。当前没有实施任何动画、粒子、动态镜头或 P1/P2 内容。保留全部历史失败和中间失败证据，未隐瞒测试或浏览器发现的问题。
