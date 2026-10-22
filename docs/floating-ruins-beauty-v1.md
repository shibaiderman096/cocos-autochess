# 浮空棋境：静态棋盘美化 v1

日期：2026-10-20。工程：D:\cocos\NewProject，Cocos Creator 3.8.8 / Blender 5.2.2。
起点 HEAD：db4b4efbed30d72911d2634bed989056a75179e0。工程原本已有大量未提交修改，本轮按开工快照核对，不能把 HEAD 到工作区的全部差异归入美化。

## 已交付

独立浮空预览默认载入美化模型：冷青玉石与蓝灰石纹分区、清晰浅石边、古铜包边、青色侧壁符文、立柱石帽及六枚晶体。仅静态材质与几何；没有动画、动态镜头、粒子或 P1/P2 内容。

原 P0 源模型、GLB、布局、主场景及预览场景文件保持原字节。56 个棋格名称、位置、旋转、缩放和所有导出顶点逐格与旧 GLB 对比一致。装饰放在基座侧壁和边缘立柱，不进入格位中心。

运行入口（Creator 开启项目预览服务时）：

- 美化版：http://localhost:7456/?scene=09ea902d-5d19-4527-b876-f6f994de5daa
- 原 P0 对照：同一入口加 &ruins=p0
- 在独立浮空预览中使用“切换 2D / 3D”返回原二维画面。

美化尚未替换正式 main.scene / scene.scene 的默认战场。正式网页构建仍按原 builder 场景清单输出；本轮真实三维画面来自 Creator 独立预览，不能把正式构建通过表述为三维独立场景发布验证通过。

## 文件

| 文件 | 用途 |
| --- | --- |
| art-source/floating-ruins-beauty-v1/floating-ruins-beauty-v1.blend | 可编辑源模型，贴图已打包 |
| art-source/floating-ruins-beauty-v1/textures/*.png | 两张真实 512×512 石纹贴图 |
| art-source/floating-ruins-beauty-v1/build_ruins_beauty.py | 从原 P0 只读派生，检查并导出美化版 |
| art-source/floating-ruins-beauty-v1/review_beauty.py | 完整 71 个网格的多角度检查图 |
| assets/resources/models/floating-ruins-beauty-v1/floating-ruins-beauty-v1.glb 及 meta | Creator 已真实导入的新资源 |
| assets/scripts/tools/FloatingRuinsPreview.ts | 新资源路径、原 P0 回退参数和载入日志；原存档隔离及操作层保留 |
| tests/floating-ruins-beauty-tests.cjs | 对实际 GLB 的原顶点保护、392 点投影和命中检查 |
| tools/run-tests.ps1 | 将原 P0 和美化版两个验收套件纳入标准回归 |

复现导出：从工程根目录，用本机 Blender 的 -b art-source/floating-ruins-p0/floating-ruins-p0.blend --python-exit-code 1 --python art-source/floating-ruins-beauty-v1/build_ruins_beauty.py 执行。依赖本机所用 Blender 技能脚本，路径在脚本中明确列出；缺失时应报错退出。实时 Blender 服务未连接，本轮使用已安装的 Blender 后台执行。独立 Node 几何验收无需 Blender 或 Creator；它不替代浏览器预览。

## 实际验证

证据全部在 docs/evidence/floating-ruins-beauty-v1/，保留失败尝试与最终日志。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Blender 几何 QA | PASS，errors=[]、zfighting=[]、floating=[] | model-qa.json、build-final.log |
| 多角度结构/实际材质 | 已人工查看正面/侧面/顶面/斜视随机色、线框及材质渲染 | review-random.png、review-wire.png、beauty-render.png |
| GLB 原格位保护 | 56 格全部顶点及变换与原版一致，392 点最大误差 0.00001246 px，边角内缩命中通过 | geometry-report.json |
| 实际 Cocos 相机 | 56 格 392 点，中心最大误差 0.00001734 px，边角最大误差 0.00001869 px，storageUnchanged=true | beauty-browser-initial.json |
| 实际浏览器操作 | 备战席拖到棋盘成功；2D→3D 往返后棋子保留；战斗胜利，伤害统计175、奖励箱显示；捕获 error 日志为空 | board-beauty-game.png、beauty-mode-2d.png、beauty-mode-restored-3d.png、beauty-battle.png |
| 原模型回退 | 实际载入原 P0 路径并显示；投影校验通过 | board-p0-comparison.png、p0-fallback-browser.json |
| npm run check:resources | 退出0 | resources.log、test-exits.json |
| npx tsc --noEmit -p tsconfig.json | 退出0 | typecheck.log、test-exits.json |
| npm test | 71套件通过，0失败；初次69套件日志保留，加入两个棋盘套件后再跑71套件 | npm-test-final.log、final-exits.json |
| npm run build:web | 退出0，真实 Creator 构建及编译产物回归通过 | build-web.log、creator-web-build.log、final-exits.json |
| 原文件保护 | 773 个受保护文件哈希无变化 | protected-before.json、protected-after.json |

操作验证使用过 1280×720 与 1280×960。Creator 顶部工具栏在鼠标进入顶部时出现并改变画布显示位置，前几次顶部按钮点击没有切换；改用上下留白的 1280×960 视口后，实际往返操作成功。没有改动 Creator 网页工具栏。临时浏览器尺寸覆盖已恢复。此证据不能推导所有窗口尺寸或移动端触控都已通过；P0.5 报告原有窄窗口限制继续保留。

## 质量与性能边界

最终导出：71 meshes、3548 三角形、6 个共享材质、2 张 512×512 内嵌 PNG、0 animation / skin / morph。GLB 1,090,556 bytes；193 个材质 primitive。新增装饰按材质合并为三个网格，清除了无用材质槽。

第一次 QA 检出符文独立笔画共面重叠（build-attempt-1.log）。已将符文改为连续的闭合镶嵌几何并分离侧壁层次；没有放宽 QA 检查，最终重新运行通过。

保留并明确接受的静态展示限制：

1. QA 提示最低点 z=-1.12 未落地。这是沿用原 P0 浮空基座与格面 z=0 的坐标约定，不是悬空零件缺陷；自动检查 floating=[]，多角度实体图也已检查。
2. 通用 Web 单道具材质预算要求≤2，当前6个材质，model-stats.json 中 budget.pass=false 保持原样。为了保留56格独立校准和清晰材质层次，本轮接受作为桌面静态预览的限制，不能宣称性能优化完成。193 primitive 是资产拆分计数，并非实际 GPU 帧采样的 draw-call 结果。没有运行目标设备性能测试。
3. 没有验证移动设备、全技能瞬时特效遮挡或发布包内三维独立场景；没有修改正式场景入口。

后续若批准正式接入或 P1，先明确独立三维场景的发布目标、处理既有窄视口边界，并做材质合图/静态合批和目标设备帧耗验证。本轮没有改角色数值、技能、经济、存档格式及战斗公式，没有提交、推送或合并。
