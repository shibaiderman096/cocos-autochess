# 棋盘贴图：浅金石面与蓝金遗迹

2026-10-21～22；Cocos Creator 3.8.8，Blender 5.2.2 LTS。

已按用户新参考图制作并接入正式 3D 棋盘：浅金石面、稀疏草缝、灰石建筑、深蓝与金色装饰。保留当前模型轮廓，没有重建参考图中的旗帜、火盆和植物模型。56 格顶面的纹理使用连续世界坐标铺开。

本轮仅修改运行 GLB 的图片与 UV，以及 Creator 自动更新的两项图片透明度元数据。未编辑游戏 TS、正式场景、棋盘几何、镜头、输入、战斗、存档或配置数值。当前 45° 镜头和 RenderTexture 映射保留。

## 实际效果

同一浏览器会话，分别载入替换前和新构建包；新开局的商店随机展示不同，不属于美术改动。

| 替换前 | 新贴图 |
|---|---|
| ![旧贴图](evidence/board-texture-sandstone-v1/web-before.jpg) | ![新贴图](evidence/board-texture-sandstone-v1/web-after.jpg) |

[拖拽上阵](evidence/board-texture-sandstone-v1/web-drag.jpg)、[放大](evidence/board-texture-sandstone-v1/web-zoom-in.jpg)、[缩小](evidence/board-texture-sandstone-v1/web-zoom-out.jpg)、[开战准备](evidence/board-texture-sandstone-v1/web-battle-start.jpg)、[战斗结算](evidence/board-texture-sandstone-v1/web-battle.jpg)。结算画面可见棋子、血条、金色护盾与伤害统计；未逐一验收全部技能效果。

![新 Blender 工程材质检查](evidence/board-texture-sandstone-v1/blender-material.png)

## 文件与接入

| 文件 | 作用 |
|---|---|
| `assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb` | 正式运行资产更新；8 材质、2 张内嵌 1024² 图片 |
| 同目录 `.glb.meta` | Creator 仅将 BC/ORM 图片 `hasAlpha` 从 true 改为 false，UUID 保持 |
| [新源工程与图集](../art-source/board-texture-sandstone-v1/README.md) | 可编辑 blend、交付 GLB 副本、生成母图、材质分图、BC/ORM、提示词和复现脚本 |
| [evidence/](evidence/board-texture-sandstone-v1/) | 本轮原始 QA、回读、日志、投影、网页截图与哈希清单 |

逐文件大小与 SHA-256 见 [delivery-files.json](evidence/board-texture-sandstone-v1/delivery-files.json)。

实际加载链为 `FloatingRuinsBoard` → `backgrounds/RuinsBackground` Prefab → 原 GLB 子网格/材质。Prefab、节点名称、17 个 PIV、全部材质编号和发光参数保持。保留子资源索引而直接更新 GLB，避免重导出改变顶点、法线或 Prefab 引用。生成母图使用内置 imagegen，实际提示词见 [prompt.txt](../art-source/board-texture-sandstone-v1/prompt.txt)。仅裁切、拼接与缩放，不使用参考图的透视画面直接贴地。

外部原件备份：`D:\cocos\_board-texture-sandstone-backup-20261021`，含起始工作树清单、运行 GLB/元数据、Prefab、历史 blend 和保护哈希。历史 `art-source/floating-ruins-reference-v1/floating-ruins-reference-v1.blend` 原件与备份字节一致。未 reset、提交或推送，也未清理任何既有未提交文件。

## 检查与测试

| 项目 | 本轮真实结果 |
|---|---|
| 几何与节点保护 | PASS：81 网格的全部位置、法线、索引一致；所有节点、枢轴、PRS、层级一致，Prefab 一致 |
| 静态投影 | PASS：56 中心＋336 角点，392 点最大误差 **0.0000124561 px**；原 `<0.001 px` 阈值保持 |
| 网页真实相机 | PASS：45°，缩放 .84/.90/.79823/.84 均 392 点；最大误差 **0.0000153652 px**，原 `<0.5 px` 阈值保持 |
| 地面 UV | PASS：1,008 个顶面 UV 顶点，世界映射误差最大 2.965e-8；无退化顶面 UV 三角形 |
| Blender 源文件 | 546 个可编辑网格模块、17 枢轴、8 材质；保存新路径 |
| GLB 重新导入 | PASS：81 网格、56 格、17 枢轴、18,596 三角面；无缺失 UV、退化面或无效网格 |
| 原始模型 QA | 整场原始脚本为 FAIL：36 项有意悬浮零件，另有 129 条警告；拆分后的结构检查、110 个独立悬浮零件检查均 PASS；接受判定 PASS，原始报告保留 |
| 保护文件 | PASS：122 个场景/投影/逻辑/配置文件无变化 |
| `npm run check:resources` | PASS，退出 0，175 项注册贴图与 SpriteFrame；GLB 内嵌图集另行比对 |
| `npx tsc --noEmit -p tsconfig.json` | PASS，退出 0 |
| `npm test` | PASS，退出 0，**78 suites passed / 0 failed** |
| `npm run build:web` | PASS，最终退出 0，生成 `build/web-desktop`；首个受限环境尝试启动失败，按工具批准路径重试成功 |
| Web 包真实新图集 | PASS：包内两张 PNG 与交付 BC/ORM 的 SHA-256 完全一致 |
| 网页交互 | PASS：棋子从备战席拖入棋盘、开战至结算、滚轮放大/缩小/复位、high→low→off→high、暂停→继续 |
| 网页控制台 | 本轮新包验证区间 warning/error **0**；原始日志保留 |

QA 接受理由：浮石、外部碎石、符文由 `intentional_float` 属性或 PIV 父节点明确标识；UV 是共享平铺/条带图集，侧面与底面重叠，不作光照烘焙 UV；模块建筑保留原来的封口接触面；岛体低于地面与少量符文被岩岛包覆均为既有设计。没有法线、比例或拓扑改动。完整 [原始 QA](evidence/board-texture-sandstone-v1/qa-source-raw.json)、[接受判定](evidence/board-texture-sandstone-v1/qa-adjudicated.json)、[GLB 回读](evidence/board-texture-sandstone-v1/roundtrip.json)、[资产审计](evidence/board-texture-sandstone-v1/asset-audit.json)、[自动投影](evidence/board-texture-sandstone-v1/projection-392.json)、[新包相机日志](evidence/board-texture-sandstone-v1/projection-browser-new.json)。完整浏览器相机原始记录还包含一次旧包对照，`projection-browser-new.json` 已排除该记录。

Blender MCP 当前未连接（调用返回 Could not connect），因此 MCP 实机检查标为 NOT_RUN；实际建材质、保存、渲染、QA 与 GLB 回读均使用已安装 Blender 的 CLI 执行，未声称 MCP 成功。

构建 stdout 成功，但 stderr 含项目日志/Chromium 缓存权限、插件更新 HTTP 403、压缩选项回退、BattleUI/TraitPanel 循环依赖、宝箱动态 URL 重复警告。保存 [creator.err.log](evidence/board-texture-sandstone-v1/creator.err.log)，未宣称构建日志无警告。

## 预算与未完成项

| 指标 | 替换前 → 替换后 |
|---|---|
| GLB 大小 | 3,668,324 → **2,183,956 B**，减少约 40.5% |
| 网格 / primitive | 81 / 81 → **81 / 81** |
| 三角面 / 材质 | 18,596 / 8 → **18,596 / 8** |
| 图集数量与分辨率 | 2×1024² → **2×1024²** |

两张纹理未压缩的 RGBA8 理论上限约 8 MiB，不含 mip；实际显存以设备测量为准。网页准备画面替换前后统计面板瞬时均显示 333 draw calls、60 FPS，这只是本次桌面短时观察，含 UI 与其他资源，不是稳定性能测试或 Android 达标结论。

- OPEN：904×871 窄视口裁切和输入问题继续保留，本轮未重测、未修改全局 UI 缩放。
- NOT_RUN：Android 真机、长期 FPS/显存、不同 GPU/浏览器专项性能、全部技能可见性、完整循环极值和多次场景往返压力测试。
- 视觉边界：本轮为贴图换肤，保留现有晶石、拱门与棋盘形体；参考图中的旗帜、火盆、花草实体未新增。
- 可交付当前桌面棋盘贴图；这些结果不构成完整 P2/P3 或移动端准入通过。
