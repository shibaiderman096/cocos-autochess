# 棋盘镜头修正：45° 斜俯视透视

2026-10-21。替代上一版正交显示，保留历史报告和截图。

上一版虽然把相机放在 45°，正交投影仍让前后排几乎等大，实际画面偏平。这次改用透视相机，从棋盘前上方向中心斜向下看，前排大、后排小；没有旋转或挤压模型来假造镜头角度。

## 最终参数与修改

- 视线与棋盘水平面的夹角 **45°**。相机位置 `(0, 7.0710678, 7.0710678)`，看向世界原点，距离 10 米；浏览器实测 `actualElevation:45`。
- 透视相机，垂直视野 **50°**。视野角与上述俯角是两个独立参数。
- 继续使用 1024×768 RenderTexture 和 2D 操作层。棋盘仍为原来的 7×8 odd-r，56 块地砖及原始顶点未改。
- `BoardPresentation.ts` 使用与相机一致的透视除法，点击时反向求射线与地面交点。地砖、高亮、单位、备战席和环境光芒共用投影。
- 滚轮缩放实际范围 0.64～0.90，默认 0.84，界面约 76%～107%。初次保留 0.96 上限时，备战席立绘下缘被商店遮挡，已收紧并重新生成网页包、重跑测试。
- `FloatingRuinsBoard.ts` 配置透视镜头，校准记录增加实测俯角、投影类型与垂直视野。
- `tests/board-presentation-tests.cjs` 独立计算相机透视结果，并检查近远缩放比，防止退回前后等大的正交画面。在地面 z=+3/-3 米处，同一宽度的近远显示比例约 1.5385。

没有更改正式场景文件、模型、游戏数值、存档或战斗逻辑。`BoardGeometry.ts`、历史 `BoardProjectionAdapter.ts`、正式场景及主棋盘 GLB 的前后 SHA-256 一致，见 `protected-before.json` / `protected-after.json`。

开工状态与本轮涉及文件备份在 `D:\cocos\_camera-perspective-backup-20261021`。没有 reset、提交或推送。

## 画面对比

上一版正交画面（历史原图）：

![上一版](evidence/board-oblique-zoom-bench/01-default.jpg)

本轮正式网页包默认画面：

![45°透视](evidence/board-perspective-45/01-default.jpg)

最大档备战席立绘下缘位于商店上方，仍可拖拽上阵：

![最大档](evidence/board-perspective-45/02-maximum.jpg)

## 本轮真实验收

| 项目 | 结果 |
|---|---|
| 资源检查 | PASS，176 张登记贴图/SpriteFrame，`resources.log` |
| TypeScript | PASS，退出 0，`typecheck.log` / `typecheck.exit.txt` |
| 完整测试 | PASS，73 suites，0 failed，最终缩放上限调整后再次执行，`npm-test.log` |
| 专用投影检查 | PASS，五档缩放 ×392点=1,960样本，最大误差 0.00001024347 px，阈值仍为 0.001 px；`board-presentation.json` |
| 输入与监听 | PASS，20 次启停去重、拖拽锁定、侧栏/商店/弹窗过滤，1/9/12 备战席坐标；同一专用测试 |
| 网页构建 | PASS，最终包 `assets/main/index.717cc.js`，`build-web.log`，退出 0 |
| 浏览器实测 | PASS，1280×720，进入正式场景、最大档上阵、缩放上下限、复位、战斗至结算、领取到1-2、菜单退出再继续 |
| 实际相机校准 | PASS，共10次392点记录；最大中心误差 0.00001379443 px，角点 0.00001536520 px；运行时阈值仍为 0.5 px |
| 动效控制 | PASS，high→low→off→high、暂停→继续；两次进入均17枢轴、1叠层，`browser-validation.json` |
| 控制台 | 最终包采集到 warning 0 / error 0，`browser-console.json` |

本轮证据目录为 `docs/evidence/board-perspective-45/`。`01-default.jpg`、`02-maximum.jpg`、`03-minimum.jpg`、`04-battle.jpg`、`05-static.jpg`、`06-next-wave.jpg`、`07-reentered.jpg` 均来自最终网页包。初始 0.96 档检查图及日志保存在外部备份；不混入最终验收。

构建器输出不为空：`creator.err.log` 记录了项目日志文件/Chromium缓存访问拒绝、插件更新检查403、构建配置回退以及 `BattleUI ↔ TraitPanel` 循环依赖警告。构建最终成功，实际新包可运行；以上提示没有修复，也不计入浏览器控制台的零告警结果。

![战斗中](evidence/board-perspective-45/04-battle.jpg)

## 仍未完成

- **OPEN**：904×871 窄视口裁切和输入、全局 UI 缩放适配。本轮未修改全局缩放策略。
- **NOT_RUN**：Android 真机性能和长时间性能采样。截图中的瞬时 FPS 不作为性能达标证明。
- **OPEN**：新透视镜头下所有外围动画极值的逐顶点安全区复验；最大档拱门等外围装饰仍可能被页头/侧栏遮挡。

当前交付通过本轮镜头、投影和常规交互验证；不代表以上未完成项目通过。
