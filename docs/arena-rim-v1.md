# 棋盘围沿、烽火台、旗帜与藤蔓建模

2026-10-22；Cocos Creator 3.8.8，Blender 5.2.2 LTS。正式棋盘美术修订，另存完整可编辑源工程；不修改战斗、配置、存档、正式场景、相机或输入代码。

## 本轮改动

- 两侧灰石围沿抬高至棋盘上方约 **0.345 m**，后压顶约 **0.334 m**；前沿约 **0.154 m**，保留备战席视线。
- 新建 **4 座烽火台**（后方与两侧）、**2 面蓝金旗帜**、**16 组下垂藤蔓**。旗布有厚度与褶曲，金色徽记为模型；藤茎与叶片均为封闭网格，附着于外墙。
- 中央加入连续砂岩衔接层，顶面位于地砖顶面下 **0.022 m**，保留原地砖倒角间隙；外围使用多段弧面收边接入高围沿。共享地面贴图和世界坐标 UV，消除原灰色底板暴露形成的强烈锯齿轮廓。
- 烽火、旗帜与藤蔓为静态模型。既有晶石、符文、浮石动效照常运行；没有新增灯光、动画或粒子。

## 实际效果

| 改动前 | 本轮正式 Web 包 |
|---|---|
| ![改动前](evidence/arena-rim-v1/web-before.jpg) | ![改动后](evidence/arena-rim-v1/web-after.jpg) |

![Blender 材质检查](evidence/arena-rim-v1/blender-material.png)

[模型拓扑](evidence/arena-rim-v1/blender-wire_three_quarter.png)；[拖拽上阵](evidence/arena-rim-v1/web-drag.jpg)；[最大缩放](evidence/arena-rim-v1/web-zoom.jpg)；[战斗结算](evidence/arena-rim-v1/web-battle.jpg)。网页验收使用 1280×720，临时视口覆盖结束后还原；不是窄屏或真机验收。

## 文件和接入

| 文件 | 内容 |
|---|---|
| [floating-ruins-arena-rim.blend](../art-source/arena-rim-v1/floating-ruins-arena-rim.blend) | 新完整可编辑工程；原 546 模块、17 枢轴，加新增 495 模块 |
| [floating-ruins-arena-rim.glb](../art-source/arena-rim-v1/floating-ruins-arena-rim.glb) | 完整交付 GLB 副本 |
| `assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb` | 正式运行 GLB，更新四个静态材质批次 |
| 同目录 `.glb.meta` | Creator 更新四个批次的三角面计数，106 项子资源 UUID 保持 |
| [源文件说明与复现流程](../art-source/arena-rim-v1/README.md) | 新增集合、图集采样、增量导出和合并方法 |
| [本轮证据目录](evidence/arena-rim-v1/) | QA、回读、投影、截图、原始测试与构建日志、文件哈希清单 |

实际消费者：`FloatingRuinsBoard` → `resources/backgrounds/RuinsBackground.prefab` → GLB 子网格与材质。保持已有节点、网格和材质名称及索引；新增模型合入 Stone / Gold / Bronze / RedCrystal 四个原静态批次，Prefab、17 个 Cocos 动画片段及绑定均保留。

沿用两张内嵌 **1024² BC/ORM** 图片；旗帜、火盆和石墙使用原共享贴图。藤叶从原图集的深橄榄苔藓区域取色，没有新增图片或材质，也没有使用无法导出的 Blender 程序材质。106 项 Cocos 子资源 UUID 全部保持。

工作树起始为 446 项未提交记录，已先备份至 `D:\cocos\_arena-rim-backup-20261022`，包含旧运行 GLB、元数据、Prefab、上一版源工程、起始状态和保护哈希。未 reset、提交、推送或清理任何既有文件。旧砂岩 `.blend` 字节一致；51 项正式场景、Prefab、投影、相机、战斗与配置文件哈希一致。历史 P0/P0.5/P1/P2 和上一版贴图证据保留。

## Blender 与几何检查

| 检查 | 结果 |
|---|---|
| 新增模型结构 QA | PASS，495 个模块整组与逐模块检查；无新增 z-fighting、退化面、反法线、无效缩放或缺失 UV 错误 |
| 整场结构 QA | PASS；原始整场报告仍为 FAIL，33 项为原有、有意悬浮符文/碎石，已明确分类；110 个原悬浮模块本轮分别检查 PASS |
| 整场警告 | 341 条：212 平面 n-gon、107 叠放 UV、20 背靠背隐面、1 内含部件、1 浮岛低于地平面；保留原始报告 |
| 警告接受理由 | 静态平面 n-gon 由 glTF 三角化；共享平铺/trim UV 非光照烘焙 UV；模块相接隐面、被岩岛包围符文和负高度浮岛符合现有结构 |
| 缺陷修正 | 修复衔接层与原倒角、灰色基底侧面的共面重叠；修正围沿端头贴面、叶片/藤茎贴面；旗帜金边贴合曲面；高旗台外移 |
| GLB 重新导入 | PASS：81 网格、56 地砖、17 PIV、8 材质、28,392 三角面；无缺失 UV、退化面、无效网格或非法法线 |
| 原数据保护 | PASS：39,926 个原顶点及各属性、55,788 个原索引逐项保持；所有节点、PRS、层级、材质和两张图片字节一致；仅追加静态几何并整理无引用缓冲区 |
| 静态投影 | PASS：56 中心＋336 角点，最大误差 **0.0000124561 px**，保持 `<0.001 px` 阈值 |
| 网页真实相机 | PASS：45° 透视，.84 / .90 / .798228 / .84 缩放各 392 点，最大误差 **0.0000102435 px**，保持 `<0.5 px` 阈值 |
| 既有动效安全/循环 | PASS：17 枢轴、每个 725 相位、3,978,800 顶点采样；原有周期与安全阈值保持；20 轮暂停/off/重进测试通过 |
| 新增静态装饰投影 | PASS（限定范围）：8,766,464 次三角形/采样点检查，无操作中心碰撞；烽火台/旗帜/藤蔓避开普通棋子血条矩形采样 |

低后围沿仍与部分后排血条的屏幕背景区域重合，490 次三角形/采样命中保留在 `screen-safety.json`，没有声称所有装饰投影与血条完全分离。围沿位于 RenderTexture，血条、棋子、技能与 UI 在其上方绘制；网页验证检查了可见性。采样不代替所有大体型棋子、全部技能、窄视口或设备验收。

Blender MCP 连接失败，未声称 MCP 成功。本轮建模、保存、渲染、QA、导出和回读实际使用已安装 Blender CLI，并按 Blender modeling / QA / export Skills 执行。`qa-full-before-apron-fix.json` 保留一次修正前失败记录；最终结果以 `qa-full-summary.json` 等最终报告为准。

## 测试与网页验收

| 项目 | 实际结果 |
|---|---|
| `npm run check:resources` | PASS，退出 0：175 注册贴图与 SpriteFrame，27 可玩棋子、30 怪物及资源引用 |
| `npx tsc --noEmit -p tsconfig.json` | PASS，退出 0 |
| `npm test` | **FAIL，77 suites passed / 1 failed**；`ui-interaction-tests.cjs` 将整个设计分辨率对象与 `{width:1280,height:720}` 严格比较，当前已有 `fitHeight:true` 导致失败；该设置在起始工作树已修改，本轮不改全局缩放策略 |
| 最终美术专项 | PASS：新文件保护与追加审计、392 点校准、17 枢轴循环/安全、Cocos 背景动画绑定及新增装饰投影 |
| `npm run build:web` | PASS，最终退出 0；确实生成并从 `build/web-desktop` 运行正式棋盘；首次受限启动失败，工具批准后用正常启动构建成功 |
| 网页实际交互 | PASS：备战席拖拽上阵、滚轮放大/缩小/复位、high→low→off→high、暂停/恢复、准备至战斗结算；棋子与血条可见。没有截获战斗中间帧，全部技能逐项验收 NOT_RUN |
| 网页控制台 | 本轮捕获 warning/error 0；`browser-warnings.json` 保留原始结果 |
| 新模型进入 Web 包 | PASS：四个新静态网格的 Web 原生二进制与 Creator 本轮导入产物哈希一致，`web-model-payload.json` 记录 UUID、文件、大小和哈希；实际截图呈现新围沿、旗帜与烽火台 |

完整日志位于本轮证据目录。构建 stderr 存在项目日志/Chromium 缓存权限、插件请求与循环依赖、压缩回退、宝箱动态 URL 重复等既有警告，未宣称构建日志无警告。全量测试失败未被模型专项通过掩盖；本轮没有修改该 UI 测试或阈值。

## 性能与未完成

| 指标 | 改动前 → 最终 |
|---|---|
| 三角面 | 18,596 → **28,392**（小于 30,000，新增 9,796） |
| GLB 网格 / primitive | 81 / 81 → **81 / 81** |
| 材质 / 图片 | 8 / 2 → **8 / 2**；两张 1024² 图集字节保持 |
| GLB 大小 | 2,183,956 → **3,020,300 bytes**；去掉合并过程中替换后的无引用缓冲区 |
| 编辑模块 | 546 → **1,041**，运行时按原批次合并 |

四个原批次增大，不额外增加模型 primitive 数量；实际 draw call 还受 Cocos 材质、UI、阴影与技能影响。浏览器短时面板观察记录不等于稳定帧率或设备性能验收。后续应在统一阵容、视口、画质下记录 60 秒帧时间 p50/p95/p99、draw call、三角面与内存，并分别测 high / low / off。

截图短时观察：改动前准备画面 60 FPS / 333 draw call / 39,106 渲染三角面，改动后准备画面 60 FPS / 333 draw call / 58,698 渲染三角面；放大且已有上阵棋子时 60 FPS / 374 draw call。阵容、商店和 UI 不完全一致，不能据此宣称性能已达标。每份模型的 28,392 三角面也不等于整帧渲染三角面。

- **OPEN**：起始 `fitHeight` 配置与 UI 严格断言不一致；不在本轮建模范围擅自修复。
- **OPEN**：904×871 窄视口裁切与输入问题仍未验收通过；没有改全局 UI 缩放。
- 最大缩放下，部分侧面装饰会被两侧 HUD 挡住；HUD 与棋子始终在模型上层，本轮没有移动 UI 或扩大裁切区域。
- **NOT_RUN**：Android 真机性能、长时间压力、所有大体型棋子与全部技能、完整周期人工逐帧观察。
- 旗帜、火焰和藤蔓本轮是静态模型；后续若制作风动/火焰动画，需要独立动画预算与验收。

本轮建模可独立交付。P3 全量准入仍受上述 UI 回归与设备/窄屏项目限制，不能据此报告整体项目验收通过。
