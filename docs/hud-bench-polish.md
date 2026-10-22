# 羁绊滚动、人口提示与浅底座

2026-10-22，Cocos Creator 3.8.8。

- 羁绊采用 330 px 裁切窗口，完整显示六行，每行 50 px、间隔 6 px。按最新要求改为原生 ScrollView 连续平滑滚动，支持滚轮和拖动惯性，移除上下翻页按钮；不按整行吸附。刷新保留小数像素滚动位置并限制边界，滑动不会误开详情。修复 Creator 延迟销毁旧节点导致新列表索引偏移、行全部隐藏的问题。
- 人口字号 86 → 110，地面投影位置 z=.75 → 1.15，颜色加深；按最后要求，透明度恢复为原来的 105/255。
- 删除左上角整组画质、缩放复位和暂停菜单及其文字；棋盘滚轮缩放保留。
- 只对棋盘模型世界高度低于 -.18 m 的部分压缩至原高度的 45%，最低点 -2.64 → -1.287 m。地面以上、棋格顶点、棋子和九个备战席落点保持。

## 接入与文件

`FloatingRuinsBoard` → `resources/backgrounds/RuinsBackground.prefab` → `models/floating-ruins-reference-v1/floating-ruins-reference-v1.glb`。

新模型交付及可编辑回读工程在 `art-source/arena-shallow-base-v1/`。`lower_base.py` 始终读上一版保留的 `arena-gates-bench-v2` GLB，避免重复压缩；`audit.cjs` 对照其逐顶点验证。新 blend 为运行网格的 Blender 回读工程，旧版模块化工程保留。没有新增备份目录。

## 实际验证

- TypeScript 无输出检查通过。
- 初次调整的 trait-board-layout、board-presentation、class-trait-ui、warrior-trait-ui、swiftmartialist-trait-ui、spellchanter-trait-ui、shadow-trait-ui 全部通过。连续滚动调整后重新通过 TypeScript 检查及 trait-board-layout、class-trait-ui、warrior-trait-ui、swiftmartialist-trait-ui、spellchanter-trait-ui；新增小数位移及刷新保留、内容缩短归正、滚动中防误触检查。测试桩仅验证布局与状态，真实输入和惯性以浏览器为准。
- 资源检查通过：175 个注册纹理、27 个可玩角色、30 个怪物。
- 模型审计通过：33,698 个上层顶点保持，26,748 个下层顶点按指定函数变换；81 网格、28,392 三角面；节点/枢轴/材质/拓扑/UV/内嵌图像保持。投影检查 1,960 个采样，最大误差约 .00001024 px。
- Blender 5.2 回读及 QA 通过，无错误，163 条警告保留：导入 GLB 的 UV/法线接缝分裂顶点、图集重叠 UV、隐藏背靠背面及浮岛低于地平面。接受这些警告，因为这是图集材质的静态浮岛，不作独立烘焙或地面道具使用。完整报告 `evidence/hud-bench-polish/blender-qa.json`；实心/线框审阅图同目录。
- 真实浏览器预览 1280×720：初次完成五次备战席上阵拖拽、七羁绊显示六项、滚动后点选详情、商店购买进入备战席检查。连续滚动调整后重新检查滚轮向下、20 px 小幅拖动产生非整行位置及上下边缘裁切、滚动后点击刺客详情、再次拖动关闭详情并返回顶部；没有翻页按钮。人口保持半透明。
- 使用独立端口 7460 的预览代理隔离测试存档，未清除原 7456 端口存档。原预览存在旧难度配置不匹配，本轮不修改该业务规则。
- 正式 Web 构建及构建检查通过；首次受限进程启动退出，后续正常启动已完成。保留既有宝箱 GLB 动态加载 URL 重复等构建警告，不声称无警告构建。
- 全 UI 旧测试在 project designResolution 多出 fitHeight:true 时中止；未把它写成通过，也未改动无关设置。上列针对性检查及浏览器结果单独成立。未做真机验收。

![最终半透明人口与六项窗口](evidence/hud-bench-polish/preview-final.png)

[向下滚动](evidence/hud-bench-polish/preview-scroll-down.png) · [滚动后详情](evidence/hud-bench-polish/preview-detail.png)

最新连续滚动：[非整行停留与边缘裁切](evidence/hud-bench-polish/preview-smooth-scroll.png) · [连续滚动后详情](evidence/hud-bench-polish/preview-smooth-detail.png)
