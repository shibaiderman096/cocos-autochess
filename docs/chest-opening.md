# 棋盘宝箱开盖动画

2026-10-21，Cocos Creator 3.8.8，Blender 5.2.2 LTS。

点击棋盘宝箱后，箱盖绕后侧铰链打开，轻微回弹并停留；1.1秒后执行原奖励领取回调。怪物关仍按原流程领取棋子并进入下一关，首领奖励仍由原回调打开选择面板。没有修改奖励内容、经济、战斗、存档或关卡规则。

## 制作与运行

- 从旧可编辑源另存 `art-source/board-encounters-open-v1/chest-opening.blend`，保留原工程。22个宝箱零件中，箱盖及12根盖面金属条跟随 `PIV_ChestLid`；其他部分静止。箱体和箱口改成真实中空结构，保留原颜色、金属/粗糙度贴图及共享材质。
- 实际 GLB 节点为 `PIV_ChestLid` → `SM_Chest_Lid`，另有静止 `SM_Chest_Base`。铰链 Blender 坐标 `(0,.37,.55)`，glTF Y-up 坐标 `(0,.55,-.37)`，已通过实际导出结构和回导核对。
- Cocos 原生 AnimationClip `RewardChestOpen` 在 `ShopVisitor.ts` 创建，67个绝对角度采样，时长1.1秒，非循环。局部 X 轴从初始角度打开到108°，回弹到100°，最终停在104°；0.9～1.1秒保留展示时间。GLB 自身不包含动画轨道。
- 动画使用独立引擎播放时间，不读取战斗 Tick、战斗倍速或 RNG。不会逐帧累加旋转，也不修改共享材质。
- 动画期间及完成后的重复点击会被忽略。隐藏/销毁会注销完成监听、停止动画、还原初始角度，销毁时释放运行时 clip；中途取消不会自动领取。下次显示重新处于闭合状态。
- 模型尚未加载、加载失败或铰链缺失时，保留原立即领取回退，避免卡住奖励。

## 文件

| 类型 | 路径 |
| --- | --- |
| 新源工程与制作脚本 | `art-source/board-encounters-open-v1/chest-opening.blend`、`build.py`、`README.md` |
| 更新运行时模型 | `assets/resources/models/board-encounters/ruins-chest.glb` 及其导入 meta |
| 动画、点击与清理 | `assets/scripts/view/ShopVisitor.ts` |
| 专项测试 | `tests/board-encounter-model-tests.cjs` |
| 真实日志、QA、截图、GIF | `docs/evidence/chest-opening/` |
| 修改前关键文件副本与工作树清单 | `D:/cocos/_chest-opening-backup-20261021/` |

没有 reset、自动提交或推送。`protected-before.json` 与 `protected-after.json` 确认旧 `.blend`、正式场景、`BattleStage.ts`、商亭 GLB 哈希不变。棋盘几何和投影代码未修改；历史证据未覆盖。

## Blender 与 GLB QA

- GLB：两个网格、两个 primitive、一个共享材质、两张实际嵌入贴图；箱盖608、箱体484，共1092三角面，比旧版992增加100。每件回导网格都有1层 UV。比原宝箱增加1个可渲染 primitive，不能据此宣称整场景性能达标。
- GLB 仅导出当前 Chest 场景，保留原 Cocos 资源路径 `models/board-encounters/ruins-chest/ruins-chest`。
- `source-qa.json`：`pass=true`、`errors=[]`。23条警告为22个零件有意复用 trim 图的 UV 重叠，以及静态箱盖的两个平面多边形端盖；接受这些警告，GLB 导出已三角化。没有接受 z-fighting、退化面或法线错误。
- 已查看闭合材质/线框及打开后的多视角验证图，实际网页也已确认贴图和内腔可见。
- Blender MCP 本轮无法连接，实际制作和校验通过独立 Blender 后台进程执行。日志中的缩略图缓存写入限制没有阻止源文件保存。

## 测试结果

| 检查 | 结果 |
| --- | --- |
| `npm run check:resources` | PASS，175张登记贴图；`resources.log`、exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | PASS；`typecheck.log`、exit 0 |
| 专项模型/交互测试 | PASS；`encounter-test.log`、exit 0 |
| `npm test` 最终重跑 | PASS，77组、0失败；`npm-test-final.log`、exit 0 |
| `npm run build:web` 最终重建 | PASS；`build-web-final.log`、exit 0 |
| Blender 保存、导出、回导、QA | PASS；`blender.log`、`model-report.json`、`source-qa.json` |

专项测试覆盖：实际 GLB 单场景与铰链层级、贴图及三角面；奖励等待完成事件；连点仅领取一次；20轮创建/销毁；中途隐藏后复位、重新开启；中途销毁不领取；延迟加载后销毁；缺失铰链回退和 clip/事件释放。引擎边界替身测试不代替以下原生网页验收。

初次受限环境构建进程启动失败，后续获准在限制外构建成功。首轮网页发现 GLB 多带一个空场景导致原资源路径缺失，已改为仅导出当前场景并新增防回归断言；错误记录保存在 `browser-initial-errors.json`，不能当作最终验收结果。

## 实际浏览器验收

1280×720，最终 Web 包 `index.e9227.js`，独立 localhost 测试对局；通过游戏现有调试界面领取3星测试棋子，通过真实拖拽上阵和真实战斗获得宝箱。

- PASS：重新加载并继续对局后，待领取宝箱正确显示为闭合状态。
- PASS：1-1宝箱点击后可见连续开盖，完成后领取奖励并进入1-2。开始/完成日志间隔1.122秒。
- PASS：1-2战斗胜利后，同一展示对象恢复闭合；连续点击3次只记录1次开始、1次完成，领取后进入1-3。间隔1.126秒。两次动画总共两对事件。
- PASS：最终复验捕获0条 console error；有2条既有 `LabelOutline.color/width` 弃用警告，见 `browser-console-final.json`，不称为零警告。
- `capture-times.json` 记录真实截屏时间；GIF由实际网页截图按测得间隔组合，没有合成中间帧。GIF截图采样率较低，不代表游戏动画帧率。

![实际网页开箱](evidence/chest-opening/opening-browser.gif)
![箱盖打开瞬间](evidence/chest-opening/opening-02.jpg)

NOT_RUN：Android真机、持续FPS/draw call采样，以及首领四选一分支的本轮网页操作；该分支保留同一原回调，已有规则回归通过。904×871窄视口问题继续 OPEN，本轮没有修改全局缩放。
