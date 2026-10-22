# 浮空晶石竞技场：参考图建模修订

日期：2026-10-20～21。项目 `D:\cocos\NewProject`，Blender 5.2.2 LTS，Cocos Creator 3.8.8。

按照用户提供的三视图，另存制作了新的可编辑模型和 GLB，并创建独立预览。本版完成低多边形造型修订与回归，正式入口未替换。最后保护核对发现原 P1 工程发生一次来源未确认的保存变更，已同时保留变更版和起始原版备份，详见下文；不能声称所有历史文件保持原位不变。**固定战斗画面尚不能完整展示外围建筑，P3 准入继续 HOLD。**

## 造型与对照

参考图的主要轮廓落实为：分层悬浮岩岛与碎裂岩柱、古石/古铜围边、左右分离的悬晶拱门、四角青绿与紫色晶簇、后方红晶祭坛、前方青绿小祭坛、灯柱、碑石、外围碎石和三条可见的静态轨道。增加浅石质承托层，减少地砖之间过深黑缝；原地砖位置和所有顶点保持不变。

原 P1 历史画面，仅作造型对照，本轮未重新验收旧模型：

![P1 历史造型](evidence/floating-ruins-p1/blender-material.png)

本版最终 Blender 实际材质渲染，完整造型：

![参考图版完整模型](evidence/floating-ruins-reference-v1/reference-beauty.png)

[顶视](evidence/floating-ruins-reference-v1/reference-top.png)、[正视](evidence/floating-ruins-reference-v1/reference-front.png)、[侧视](evidence/floating-ruins-reference-v1/reference-side.png)、[独立零件检查](evidence/floating-ruins-reference-v1/reference-parts.png)、[最终细线框](evidence/floating-ruins-reference-v1/reference-wire-clean.png)。这是受原棋盘契约约束的低多边形转译，不是原图逐像素复刻；磨损、苔藓、雕刻和晶石内部层次仍较参考图简化。

## 文件与可编辑结构

| 文件 | 用途 |
|---|---|
| [floating-ruins-reference-v1.blend](../art-source/floating-ruins-reference-v1/floating-ruins-reference-v1.blend) | 新的普通可编辑 Blender 工程，546 个网格零件、17 枢轴，127 个模块保留 Bevel |
| [floating-ruins-reference-v1.glb](../assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb) | 新 glTF 2.0 运行资产，3,668,324 B |
| [textures/](../art-source/floating-ruins-reference-v1/textures/) | 独立复制并修改的 BC/ORM 两张 1024² 图集，源工程打包、GLB 内嵌 |
| [制作与 QA 脚本说明](../art-source/floating-ruins-reference-v1/README.md) | 建模过程、导出副本合并、重新导入、源文件检查 |
| [floating-ruins-reference-preview.scene](../assets/floating-ruins-reference-preview.scene) | 独立场景；不覆盖 `assets/scene.scene` |
| [FloatingRuinsReferencePreview.ts](../assets/scripts/tools/FloatingRuinsReferencePreview.ts) | 从现有 P2 预览派生，载入新模型；复用原 P2 控制器与投影适配 |
| [几何验收](../tests/floating-ruins-reference-tests.cjs)、[新模型运动验收](../tests/floating-ruins-reference-motion-tests.cjs) | 392 点、原几何、GLB 结构及 17 枢轴完整周期安全采样 |
| [evidence/](evidence/floating-ruins-reference-v1/) | 备份、真实日志、模型检查、渲染图、浏览器截图、文件哈希 |

完整文件大小和 SHA-256 见 [delivery-files.json](evidence/floating-ruins-reference-v1/delivery-files.json)。最终 GLB SHA-256：`657ec372a4a0a325c461e98eeeee0c3a4d69e1c51312993d508d312626f78379`。

源工程保留模块，导出时才按材质/共同枢轴合并副本。相较 P1，网格/primitive 从 **167/223 降为 81/81**，三角面从 **6,760 增至 18,596**，材质从 7 增至 8，图集仍为 2×1024²。没有把模块合并回可编辑源工程。

## 投影与动效兼容

56 地砖的原顶点、平移、旋转、缩放逐格与 P0 对照完全一致。仍为 7×8 odd-r，固定相机、1024×768 RenderTexture 和 2D 输入层；未修改 BoardGeometry、BoardProjectionAdapter、HexMath、Grid、BattleStage、技能、装备、经济、存档或战斗公式。

| 检查 | 本轮实际结果 |
|---|---|
| [GLB 几何与投影](evidence/floating-ruins-reference-v1/projection-automated.json) | PASS，56 中心+336 角点，最大误差 **0.0000124561 px**，原阈值 `<0.001 px` 保持 |
| [实际网页相机](evidence/floating-ruins-reference-v1/projection-browser.json) | PASS，392 点，原阈值 `<0.5 px` 保持 |
| [329 个静态装饰的完整包围盒](evidence/floating-ruins-reference-v1/static-decoration-safety.json) | PASS，均与扩展操作矩形 x=±335、y=±180 px 分离；低于棋盘的承托层单独处理 |
| [新 GLB 的 17 枢轴运动](evidence/floating-ruins-reference-v1/motion-safety.json) | PASS，每个枢轴 725 个相位/极值，**3,978,800** 顶点姿态；1,928,584 个落入操作矩形的环顶点由实际不透明皇冠层遮挡 |
| 连续时间边界 | 晶石固定 X 范围、浮石旋转包围球证明在采样间也不侵入操作矩形；环保持实际皇冠层之下 |

保留原 3 个符文环、8 个晶石、6 个浮石的真实 PIV 名称。四角晶石沿纵向移到 ±2.3 m 附近以配合参考造型；其底部旋转中心保留，实际新 GLB 的位置被运行控制器捕获为基准。原环/浮石的基准与环半径保持不变，所以原 P2 参数可以直接复用。新增加的大轨道、侧门悬晶、碎石是静态装饰，没有假称它们也在原 17 个动画绑定中。

## 模型 QA

使用已安装的 blender-core、blender-scene-setup、blender-hardsurface-modeling、blender-export-pipelines、blender-asset-qa、blender-game-optimization，以及 Cocos 项目技能。建模通过 Blender MCP 执行，最终另用 Blender 后台进程重新打开源工程、导出和导入复验。

| 检查 | 实际结果 |
|---|---|
| [原始整场扫描](evidence/floating-ruins-reference-v1/qa-final-raw.json) | **raw pass=false**；36 条错误均为有意悬浮部件，原始记录保留 |
| [承托建筑整体](evidence/floating-ruins-reference-v1/qa-structural.json) | pass=true，errors=[] |
| [110 个有意悬浮网格逐件](evidence/floating-ruins-reference-v1/qa-intentional-floats.json) | 全部 pass=true |
| [分类复核](evidence/floating-ruins-reference-v1/qa-adjudicated.json) | pass=true，未接受错误 0；z-fighting=0 |
| UV、法线、退化、比例 | 全部有 UV/法线；没有对应退化/反向壳/不一致法线错误；米制单位缩放 1 |
| [最终 GLB 重新导入](evidence/floating-ruins-reference-v1/roundtrip.json) | PASS，81 网格、56 地砖、17 枢轴、8 材质、18,596 三角面；中心与顶点往返误差均 **0 m** |
| [保存源工程检查](evidence/floating-ruins-reference-v1/source-project.json) | PASS，普通 .blend，场景唯一，546 可编辑网格，两张图集均打包；BC=sRGB，ORM=Non-Color |

修正了初轮碑石与围边共面、镶线/拱石/柱帽的接触间隙，以及安全区修订后暴露的灯芯连接间隙。未放宽 QA 阈值。129 条 warning 包括共享/堆叠图集 UV、可编辑封闭石块接触处背靠背面、内部被遮挡部件和浮空最低点；这些不是独立 lightmap UV 或 AO 烘焙成果。[场景整理检查](evidence/floating-ruins-reference-v1/scene-audit.json) 另有 87 个 `origin_far` 提示：静态拱石/柱帽按建筑模块共用组装中心，作为有意结构保留；实际 P2 旋转中心已单独检查。

通用 wireframe 检查图曾因叠层过厚和 even-offset 产生显示尖刺，保留原图作诊断。最终改用更细的检查叠层并关闭 even-offset，重新查看四视角；未以此修改源网格或掩盖几何错误。

## 本轮网页与测试

Creator 打开独立场景运行，或在当前服务存活时访问 [参考图预览](http://localhost:7456/?scene=70fc015a-6d4a-477a-9a40-761c210565d7)。测试使用 1280×720；2026-10-21 续办时重新检查浏览器清单，已没有本轮预览页，未声称再次完成实时验收。

![最终模型网页与原 UI](evidence/floating-ruins-reference-v1/web-final-preparation.png)

[拖拽上阵](evidence/floating-ruins-reference-v1/web-final-drag.png)、[2D 原画模式](evidence/floating-ruins-reference-v1/web-final-2d.png)、[效果 off](evidence/floating-ruins-reference-v1/web-final-effects-off.png)、[战斗至结算](evidence/floating-ruins-reference-v1/web-final-battle.png)。实际从备战席拖到棋盘成功，2D/3D 往返保留棋子；high→low→off→high、重新绑定后仅有一个叠层、17 个绑定。off 时 17 个局部位置/旋转与新 GLB 基准一致。实际一场战斗完成，伤害统计175、奖励箱显示；日志观察到 floatText 和 sunlightSpriteVfx，单位与 FX 层保持可见。

[本轮浏览器摘要](evidence/floating-ruins-reference-v1/browser-summary.json)：最终模型会话记录到环境时间 **126.0108 s**，12 个动作时间采样均为17绑定，覆盖三个环各至少3个周期；这不等于逐帧肉眼验收所有循环接缝。精确周期与极值由新 GLB 专用测试补充。控制台捕获 error/warn=0，原存档保持；完整记录见 [browser-final-console.json](evidence/floating-ruins-reference-v1/browser-final-console.json)。

| 命令/检查 | 真实结果与日志 |
|---|---|
| npm run check:resources | PASS，退出0，[日志](evidence/floating-ruins-reference-v1/check-resources.log) |
| npx tsc --noEmit -p tsconfig.json | PASS，退出0，[日志](evidence/floating-ruins-reference-v1/typecheck.log) |
| npm test | PASS，71 套件，0 失败，[日志](evidence/floating-ruins-reference-v1/npm-test.log) |
| 新模型几何专用测试 | PASS，最终模型重跑，[日志](evidence/floating-ruins-reference-v1/model-contract-final.log) |
| 新模型动态安全专用测试 | PASS，最终模型重跑，[日志](evidence/floating-ruins-reference-v1/motion-tests-final.log) |
| npm run build:web | 首次启动失败，退出码 -2147483645、原因未定；保留[失败日志](evidence/floating-ruins-reference-v1/build-web.log)。经本机执行授权后复跑成功，最终资产又构建一次退出0：[最终日志](evidence/floating-ruins-reference-v1/build-web-final.log)、[Creator 日志](evidence/floating-ruins-reference-v1/creator-final-creator.log) |

**正式 Web 包没有本版预览场景。** [实际 main bundle 场景清单](evidence/floating-ruins-reference-v1/formal-web-scenes.json) 仍是正式入口，浏览器模型证据来自 Creator 独立预览，不能冒充正式发布包验收。

## 备份、预算与未完成项

[起始哈希/差异](evidence/floating-ruins-reference-v1/baseline-hashes.json) 保存 3,176 个原有文件。对照已有 P2 已验证归档，复用其中相同内容，并保存本次 118 个差异文件的 UTF-8 PAX 归档 `worktree-delta.tar`，逐一核验；[恢复说明](evidence/floating-ruins-reference-v1/backup.json)。[最终保护核对](evidence/floating-ruins-reference-v1/protection.json)：**FAIL：1 改变、0 丢失，其余 3,175 文件哈希一致**。改变文件为 `art-source/floating-ruins-p1/floating-ruins-p1.blend`，修改时间为本机 2026-10-21 00:12:17，文件从 4,725,922 B 变为 18,721,897 B。该保存的触发来源未确认。建模会话从 P1 路径打开，存在继续保存至旧路径的风险；本轮制作脚本的显式保存路径均指向新 reference 工程，这不足以确定该次保存的操作者或排除会话关联。

为避免覆盖可能的新编辑，**没有自动回写原 P1 路径**。已经将当前变更版复制为 [p1-detected-drift.blend](evidence/floating-ruins-reference-v1/p1-detected-drift.blend)，并从同目录 `.blend1` 保留 [p1-baseline-recovery.blend](evidence/floating-ruins-reference-v1/p1-baseline-recovery.blend)，后者 SHA-256 与起始 P1 原件完全一致（`bdf8b50909404f62073569f51dce553f6b8010e15fcdcc76e7e6989354daeaf8`）。恢复原路径前需确认保留哪次编辑；可直接打开本次独立 reference 源工程继续制作。详细哈希见 [保存变更记录](evidence/floating-ruins-reference-v1/preservation-incident.json)。保护工具保留失败状态和失败退出码，同时更新交付清单，不降低保护要求。

Creator 扫描期间原有 `assets/.meta` 消失，已从本次差异备份按原 SHA-256 恢复。没有 reset、提交或推送。

模型满足本任务环境预算 `<30,000 tris`、`≤8 mats`、两张1024²图集。通用 Skill 将整个棋盘按单件 Web prop 衡量时，10,000 tris/2材质预算仍为 false，见 [原始统计](evidence/floating-ruins-reference-v1/source-stats.json)，没有改成通过。两个 RGBA8 图集含 mip 的未压缩估算约10.7 MiB；导出81 primitive 可作为模型单渲染 pass 约81次提交的初步估算，**不是 GPU 实测 draw call**，还需加上 RT、UI、单位及技能开销。

以下保留 OPEN/NOT_RUN：

- **OPEN：P1 原工程保存变更。** 原路径恢复尚未执行；起始版和变更版均已保留。文件保护验收未通过，不能以新版模型验收代替。
- **OPEN：固定战斗视图的展示范围。** 完整模型渲染图可见左右拱门和后祭坛；实际战斗截图中原 UI 遮住侧边，后祭坛顶部出画。没有擅自缩放棋盘、重设镜头或改 UI 以挤入全部建筑。若要求整座竞技场在战斗中完整可见，需要下一轮明确镜头/外围比例/UI 留白的取舍。
- **OPEN：904×871 窄视口裁切与输入问题。** 沿用 P0.5 限制，本轮没有修全局缩放，也没有将1280×720成功推广到所有尺寸。
- **NOT_RUN：Android 真机、GPU draw call、FPS、发布包新预览场景。** 没有真实性能测量，不宣称达标。
- **NOT_RUN：全角色、全技能的瞬时遮挡与压力测试。** 本轮只实际完成一场合法阵容战斗和相关血条/FX可见性检查。
- **NOT_RUN：交付前追加的 Blender MCP `look` 实时视窗检查。** 自动审批审核因使用额度耗尽而无法完成，该调用没有执行，并非模型被判定不安全。未重试或绕过审批；此前已完成的多角度材质渲染、随机零件图、最终细线框、源工程复开、GLB 复导入和网页证据仍有效。
- **OPEN：参考图细节精度。** 当前为低多边形结构版，尚未逐项还原苔藓、雕刻、晶体分层、破损细节和全部外围碎石分布。

可以继续在本版独立源工程上进行美术细化；正式替换和 P3 准入仍 HOLD，需先确定固定战斗画面的展示取舍，再补目标设备性能及窄视口验收。
