# 棋盘交互模型与 UI 调整

2026-10-21，Cocos Creator 3.8.8，Blender 5.2.2 LTS。

## 交付结果

- 征战者及其他羁绊详情按实际文本高度收紧边框；头像统一每排4个，剩余头像换行。保留名称、档位、效果数值及当前成员。
- 人口提示放到棋盘中央，以地面投影轴压缩显示，随棋盘缩放。它仍是优先级低于棋子和操作层的2D文字，不是独立3D文字网格。
- 背包改为两列、四行，每页8格；格子72×72、图标52×52，原来分别为36×36、24×24。保留分页、选择、拖拽、战斗锁定与完整物品索引。
- 棋盘宝箱、商店换成真实带贴图的3D模型，接入现有环境与 RenderTexture 相机，位置来自 `cellToWorld(3,6)`。保留原奖励/商店逻辑，透明2D操作代理负责点击。
- 删除两张退役棋盘图片及其 meta；仍被奖励页面、商店页面使用的素材保留。

## 模型和贴图

| 项目 | 宝箱 | 商亭 |
| --- | ---: | ---: |
| 可编辑源零件 | 22 | 31 |
| 导出三角面 | 992 | 1964 |
| 网格 / primitive / 材质 | 1 / 1 / 1 | 1 / 1 / 1 |
| GLB 字节 | 3,190,120 | 3,260,464 |
| 回导 UV 层 | 1 | 1 |

源工程 `art-source/board-encounters-v1/board-encounters.blend` 包含 Chest、Shop 两个独立场景，默认 Shop；53个具名零件保留倒角修改器。导出时合并每件道具，源结构保持可编辑。没有动画、物理或新粒子。

两张1024×1024贴图分别为颜色 trim 图与 ORM 图，包含木纹、古铜、青绿织物、石材区域。ORM 的 R=1，G=粗糙度，B=金属度，没有声称烘焙 AO。实际图片连接材质输入，并打包进源工程和 GLB；不是只保留 Blender 程序节点。两份 GLB 分别嵌入相同图像，存在纹理重复打包，后续可考虑共享外部贴图。

Blender MCP 本轮两次连接检查失败，改用独立 Blender 后台进程完成建模、导出、回导和检查；不声称完成实时 MCP 编辑。按 blender-core、hardsurface-modeling、pbr-materials、export-pipelines、asset-qa 规范执行。最终工程再次打开后完成真实贴图渲染，见 `blender-render-final.log`。

### QA 结论

两份源模型 QA 均 `pass=true`、`errors=[]`；GLB 回导后的尺寸、UV、材质及三角面已核对。没有检测出退化面、法线、漂浮或 z-fighting 错误。原始警告保留，不能视为零警告：

- 宝箱23条、商亭45条警告。trim 图的重复 UV 是有意复用，不适合直接用于唯一 UV 烘焙。
- 编辑源保留平面多边形端盖，GLB 已自动三角化。
- 商亭有11对内部背靠背三角面，来自书本/台面、篷布/边条的封闭接触面，约22个冗余三角面。为保留模块编辑结构暂接受；未接受可见 z-fighting 错误。
- Blender 日志中的缩略图缓存写入限制没有阻止源文件保存；最终渲染另有 Blender 6.0 节点接口弃用提示。

![带贴图商亭](evidence/board-ui-encounters/shop-textured.png)
![带贴图宝箱](evidence/board-ui-encounters/chest-textured.png)

## 文件清单

| 范围 | 文件 |
| --- | --- |
| 源工程、贴图 | `art-source/board-encounters-v1/board-encounters.blend`、`T_Encounter_BaseColor.png`、`T_Encounter_ORM.png` |
| 可复现制作辅助 | 同目录 `build.py`、`render.py`、`prepare-source.py`、`README.md` |
| 运行时模型 | `assets/resources/models/board-encounters/ruins-chest.glb`、`ruins-shop.glb` 及导入 meta |
| UI / 展示代码 | `assets/scripts/ui/TraitPanel.ts`、`BattleUI.ts`，`assets/scripts/view/ShopVisitor.ts`、`BattleStage.ts`、`ArtPaths.ts` |
| 新专项测试 | `tests/trait-board-layout-tests.cjs`、`tests/board-encounter-model-tests.cjs` |
| 测试适配 | `tests/helpers/ui-harness.cjs`、`ui-interaction-tests.cjs`、`regression-tests.cjs`、征战者/机械/吟法者/疾风武者 UI 测试、`tools/run-tests.ps1` |
| 删除 | `assets/resources/art/ui/board_shop.png`、`board_boss_chest.png` 及对应 meta |
| 证据 | `docs/evidence/board-ui-encounters/`：源工程清单、QA、回导数据、日志、截图、投影与保护哈希 |

修改前的工作树状态和关键文件副本保存在 `D:/cocos/_trait-layout-backup-20261021/`。没有 reset、提交或推送。既有大量未提交文件保留。没有修改战斗公式、经济、角色数值或存档格式。

## 自动检查实测

| 检查 | 真实结果 / 日志 |
| --- | --- |
| `npm run check:resources` | PASS，175张登记贴图；`resources.log` / exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | PASS；`typecheck.log` / exit 0 |
| `npm test` | PASS，77组、0失败；`npm-test-final.log` / exit 0 |
| 最终位置调整后回归 | PASS，74项、0失败；`regression-final.log` / exit 0 |
| `npm run build:web` | PASS，最终包 `index.7a520.js`；`build-web.log` / exit 0 |
| Blender 导出与回导 | PASS；`model-report.json`、`chest-qa.json`、`shop-qa.json` |
| 最终源工程重新渲染 | PASS；`blender-render-final.log` / exit 0 |

77组全量测试之后仅将道具位置从 `(3,4)` 调为 `(3,6)`，随后重跑74项集成回归、网页构建并实际检查宝箱和商亭。没有把旧结果冒充修改后的全量重跑。

首轮测试因旧 UI 固定高度断言失败，更新为内容适应验收后通过；`npm-test-initial.log` 保留。一次受限进程运行中断的 `npm-test.log` 不作为通过证据。构建日志仍有既有缓存权限、插件网络及循环依赖提示，最终构建和包验证成功，不能称为零警告构建。

UI 单元测试的文本渲染是边界替身；以下实际浏览器截图提供原生 Cocos 布局与交互证据。

## 网页实际验收

浏览器实际运行最终 Web 包，独立 `http://127.0.0.1:8765/` 测试存档，1280×720。通过现有调试界面准备关卡和装备，再通过真实界面完成交互。

- PASS：征战者完整文本与紧凑边框；机械7头像4+3排列。
- PASS：背包9件物品分两页；第二页装备拖到备战席棋子后成功装备，数量9→8、页数回到1。
- PASS：3D商亭实际点击打开原有商店页面，离开特殊商店后隐藏，再进入可恢复。
- PASS：最终位置3D宝箱在1-2战斗胜利后显示；点击领取2个棋子，宝箱消失并进入1-3准备阶段。没有改变原奖励规则。
- PASS：人口标记显示1/2，滚轮缩放0.84→0.90时与棋盘一起移动、缩放。
- PASS：56中心+336角点，共392点；45°固定镜头，0.84和0.90两种缩放的最大中心误差0.000013795、最大角点误差0.000015366像素。保持原验收阈值。
- PASS：本次捕获的浏览器控制台 warning/error 为0，原始记录 `browser-console.json`；投影原始记录 `browser-alignment.json`、摘要 `alignment-summary.json`。
- PASS：正式场景 `floating-ruins.scene`、`BoardGeometry.ts`、`BoardProjectionAdapter.ts`、正式棋盘 GLB 与本轮前一份保护哈希一致，见 `protected.json`。

初次检查发现背包提示与页签重叠、中央道具与重新加载后的敌方头像重叠，均已修正。`02-backpack-initial.jpg`、`05-chest-ground-check.jpg` 为问题定位证据，不作为最终画面。

![征战者文字适应](evidence/board-ui-encounters/03-conqueror.jpg)
![头像每排4个](evidence/board-ui-encounters/04-mechanical-four-columns.jpg)
![商亭和两列背包](evidence/board-ui-encounters/10-backpack-final.jpg)
![最终宝箱](evidence/board-ui-encounters/15-chest-final.jpg)
![领取后进入下一关](evidence/board-ui-encounters/16-chest-claimed.jpg)

## 限制与后续

- NOT_RUN：Android真机性能、设备显存、持续 FPS/draw call 采样。本轮截图中的即时性能数字不是性能达标证明。
- OPEN：904×871窄视口裁切与输入历史问题，本轮未修改全局缩放，也未完成该视口复验。
- NOT_RUN：所有技能组合、所有环境动画极值、全部模式与画质排列的穷举。本轮重点验证新UI及两件道具，没有用原P2结果代替新的完整动效验收。
- 每件道具增加1个 primitive；通常只有当前事件对应的一件显示。实际整场景渲染仍包含旧棋盘、多层UI及特效，不能由这两个 primitive 推断整场景性能。
- 模型与交互可交付；后续发布和性能准入仍需上述设备、窄视口与持续采样验证。
