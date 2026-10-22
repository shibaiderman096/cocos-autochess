# 两侧拱门朝内与备战席建模优化

2026-10-22，Cocos Creator 3.8.8 / Blender 5.2.2 LTS。仅更新模型和导入元数据，未修改战斗、数值、存档、正式场景、45°相机、输入或 UI 缩放。

## 最终结果

- 左门绕 Blender Z 轴 +90°、右门 -90°。原装饰正面为 -Y，现在分别朝 +X / -X，明确朝向棋盘中央；两侧共 54 个门框、金饰、悬晶、支架和小岛基座同步转动，桥接段保留。
- 九个备战席改成灰石阶台、凹槽承托面、金属包边、角钉、前侧青绿晶印。模型有实际 BC / ORM 图片材质，保留三个渲染网格及材质名称。
- 单席宽 0.698 m，仍按原 0.7125 m 间距放置；前后尺寸缩短，最大深度含晶印约 0.590 m。承托面高度为 0，棋子原点、九个落点和命中矩形均不变。
- 网页发现旧前神龛遮住中央席位，已将其 31 个模块整体下降 0.65 m，让出第五席；模型保留在浮岛下沿。九个席位在默认视口完整可见。

![正式网页最终效果](evidence/arena-gates-bench-v2/web-final.jpg)

[上阵与血条](evidence/arena-gates-bench-v2/web-deploy.jpg) · [中央席位](evidence/arena-gates-bench-v2/web-center-seat.jpg) · [右端席位](evidence/arena-gates-bench-v2/web-right-seat.jpg) · [最大缩放](evidence/arena-gates-bench-v2/web-zoom.jpg)

![单席贴图与模型](evidence/arena-gates-bench-v2/bench-material.png)

[九席模型](evidence/arena-gates-bench-v2/bench-nine-slots.png) · [席位线框](evidence/arena-gates-bench-v2/bench-wire.png) · [棋盘材质](evidence/arena-gates-bench-v2/arena-material.png) · [线框](evidence/arena-gates-bench-v2/blender-wire_three_quarter.png)

## 文件与保护

| 文件 | 用途 |
|---|---|
| [完整棋盘源工程](../art-source/arena-gates-bench-v2/floating-ruins-gates-bench.blend) | 从上一版围沿工程另存，保留模块、贴图和修改器 |
| [备战席源工程](../art-source/arena-gates-bench-v2/reserve-bench-v2.blend) | 11 个独立可编辑模块 |
| [棋盘 GLB](../art-source/arena-gates-bench-v2/floating-ruins-gates-bench.glb) | 正式棋盘完整交付副本 |
| [单席 GLB](../art-source/arena-gates-bench-v2/reserve-bench-v2.glb) | 由现有运行组件实例化为九席 |
| `assets/resources/models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb` | 正式背景 Prefab 使用，改动六个原静态批次的局部几何 |
| `assets/resources/models/ruins-bench/ruins-bench.glb` 及 `.meta` | 保留原运行加载路径与既有七项子资源 UUID，新增纹理子资源 |
| [生成、复现与检查说明](../art-source/arena-gates-bench-v2/README.md) | 来源映射、增量变换、检查和导出 |
| [证据目录](evidence/arena-gates-bench-v2/) | QA、回读、保护审计、构建、截图和本轮测试日志 |

开始前备份至 `D:/cocos/_arena-gates-bench-backup-20261022`，保存当前工作树清单、旧两个运行 GLB/元数据、旧两个 Blender 工程及保护哈希。未 reset、提交、推送或覆盖旧源工程/历史报告。55 个场景、Prefab、投影、相机、战斗与配置文件保护哈希一致。

正式消费者保持：`FloatingRuinsBoard` → `RuinsBackground.prefab` 和原 `models/ruins-bench/ruins-bench/ruins-bench`。所有原模型节点、层级、17 个 PIV、PRS、拓扑索引与图片内容保持。仅改来源明确的 85 个模块对应的 4,228 个导出顶点及旋转法线，172,882 项其余属性逐项相同。棋盘 106 项、备战席原 7 项子资源 UUID 保持。

## QA 与测试

| 检查 | 本轮真实结果 |
|---|---|
| Blender 环境与执行 | MCP 两次连接失败；实际使用已安装 CLI 完成建模、QA、渲染与回读，不声称 MCP 成功 |
| 棋盘 QA | 结构 PASS；整场原始 QA 仍 FAIL，错误仅为原有有意悬浮部件，110 个浮动模块按既有类别区分，无未接受新错误；保留 341 条原警告 |
| 备战席 QA | PASS，无错误；18 条警告为共享平铺 UV、6 个静态平面 n-gon、3 组接合隐面与底面位于 -0.245 m。原点服务棋子承托平面，不为强行归地改变放置 |
| 警告接受 | 共用图集不作唯一光照 UV；平面 n-gon 导出三角化；隐面为模块接合；浮岛/席台底部位于承托面之下。未调低 QA 阈值 |
| 两份 GLB 重新导入 | PASS：棋盘 81 网格 / 56 地砖 / 17 PIV / 8 材质 / 28,392 三角面；备战席 3 网格 / 3 材质 / 476 三角面；无缺 UV、退化面、无效网格和非法法线 |
| 静态投影契约 | PASS，56 中心＋336 角点，392 点最大误差 0.0000124561 px，保持 `<0.001 px` |
| 既有动效/相机/席位专项 | PASS：17 枢轴、3,978,800 运动采样；17 Cocos clips 绑定与 20 轮暂停/off/重进；45°透视与九席共享投影 |
| 修改模型屏幕安全 | PASS（采样范围）：1,940 投影三角形、761,536 点/三角形检查。内向门组避开 56 操作中心及普通血条采样；下移神龛避开 56 中心与九个席位脚底矩形 |
| `npm run check:resources` | PASS，退出 0 |
| `npx tsc --noEmit -p tsconfig.json` | PASS，退出 0 |
| `npm test` | FAIL，77 suites passed / 1 failed。既有 `ui-interaction-tests.cjs` 严格比较设计分辨率对象，当前多出 `fitHeight:true`；保护哈希证明本轮未修改该配置或 UI 测试 |
| `npm run build:web` | 最终 PASS，退出 0；首次受限环境启动 Creator 失败，工具批准正常启动后完成构建；最终文件使用 `build-web-final.log` |
| 正式 Web 包模型 | PASS，84 个模型网格原生二进制与 Creator 本轮导入产物哈希一致，见 `web-model-payload.json` |
| 实际网页 | PASS（本轮范围），1280×720：九席模型载入，左席→中央→右席→棋盘→中央往返，滚轮放大与复位；棋子、血条可见 |
| 实际网页相机 | .84 / .90 / .84 各 392 点，最大误差 0.0000102435 px；pitch 与 actualElevation 均为 45° |
| 网页控制台 | 本轮正式最终会话 warning / error 为 0，记录在 `browser-console.json` |

原始构建 stderr 仍有插件、压缩回退、循环依赖和既有宝箱动态 URL 重复等警告，不声称构建日志无警告。完整测试在本轮执行；最终席台进深/神龛让位修订后重新执行模型审计、投影、动效、相机、动画专项与正式 Web 构建。

## 预算与限制

- 棋盘保持 28,392 三角面、81 网格/primitive、8 材质、两张 1024² 图片；没有新增棋盘批次。
- 单席 232 → 476 三角面，仍 3 网格/primitive、3 材质；九席合计 4,284 三角面。棋盘＋九席静态模型合计 **32,676** 三角面，超过原先建议的 30,000 整场预算，不能只引用棋盘数字声称整场达标。
- 备战席新内嵌两张原图集内容的 1024² 图片，GLB 约 0.73 MiB。存在六个重复引用两张图片的 texture 项；未验证与棋盘跨资源复用 GPU 纹理，后续可合并或做共享 Cocos 材质。
- 网页截图短时可见 60 FPS；UI 与资源加载状态会影响 draw call，未做统一阵容的持续性能测量，不报告设备性能达标。
- **OPEN**：既有 904×871 窄视口裁切/输入问题和 `fitHeight` 测试不一致继续保留。最大缩放时席台前缘与侧面装饰会进入原 HUD 覆盖区域，没有改全局 UI 布局策略。
- **NOT_RUN**：Android 真机、长时压力、本轮完整战斗流程及全部技能、大体型棋子全覆盖、九席每一席逐个拖动；网页实际抽查左/中/右席，九席投影与渲染另行验证。

本轮静态建模与默认视口交互可独立交付；全量 UI、窄屏和设备验收仍未完成。
