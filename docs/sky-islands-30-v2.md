# 天空浮岛背景：30 帧重绘

2026-10-21。使用 `generate2dmap`、`generate2dsprite`、`imagegen` 和 `cocos-autochess-dev` Skills，已替换主菜单和正式棋盘后方的背景。当前游戏为 30 帧、15fps、2 秒循环；棋盘、镜头、输入和游戏规则未改。

## 绘制和组帧

来源为 **host_image / 内置 image_gen**：新绘一张母图，再分别绘制五张 2×3 画稿，共 30 个连续相位。具体提示词、来源和生成文件标识见 `art-source/sky-islands-30-v2/prompt-0..4.txt`、`provenance.json`、`art-brief.txt`。工具未返回底层型号或费用，均记 null，未虚构型号或成本。

新画面采用两侧大浮岛、古老断拱、植被和瀑布，中央留空给棋盘。原始生成画稿存在建筑细节漂移：整理时固定首幅画稿的六处遗迹/岛屿区域，仅在云雾范围使用连续画稿；对云雾统一色调，并做首尾相连的时间降噪（sigma=2.4 帧、最大混合强度 0.78、边界羽化 14px）。因此，最终帧不是未经处理的模型原图。30 个相位仍各不相同，未插入中间帧，也未平移或缩放一张静态背景制造动画。最终瀑布保持静态，未把原画稿的水纹变化带回固定区域。

循环起点选在变化最缓的相位（原相位 22），不反转、不删帧。全部 30 个相邻过渡均检查，不能用起点选择掩盖内部跳变。源画稿约 1365/1366×1152，每格约 682/683×384，最终 **640×360**；母图尺寸较大不代表每帧为 1080p。

使用 Skill 的 `assemble_frames.py --strict` 检查无损组帧、逐像素比对、静态区域和 WebP 时间线。WebP 毫秒整数帧长为 67ms，总长 2.010 秒；游戏 AnimationClip 为严格的 30/15=2 秒。GIF 以 60/70/70ms 重复分配，总长 2 秒，均仅供预览，游戏加载 PNG 图集。

![30 帧美术预览](../art-source/sky-islands-30-v2/preview.gif)

## 文件清单

| 路径 | 内容 |
| --- | --- |
| `art-source/sky-islands-30-v2/master.png` | 新绘母图 |
| 同目录 `frames-00-05-source.png` 至 `frames-24-29-source.png` | 五张原始画稿，30 个绘制相位 |
| 同目录 `cropped/`、`finished-frames/` | 原始裁切、整理后的独立 PNG |
| 同目录 `animation/frames/frame-00.png` 至 `frame-29.png` | Skill 导出的最终逐帧 PNG |
| 同目录 `animation/animation.json`、`animation/animation.webp` | 原始 QA、无损打包与预览 |
| 同目录 `runtime-atlas.png`、`contact-sheet.png`、`preview.gif` | 运行图集、逐帧总览、GIF |
| 同目录 `motion-mask*.png`、`static-regions.json`、`finish-qa.json` | 动态范围与全部过渡检查 |
| `assets/resources/art/arena/sky_islands_30.png` 及 `.meta` | 5×6 图集，3200×2160，与源 `runtime-atlas.png` 字节相同 |
| `assets/resources/art/arena/sky_islands_30_poster.png` 及 `.meta` | 与最终首帧字节相同的加载回退图 |
| `assets/scripts/view/ArtPaths.ts` | 切换图集与配套静态图 |
| `assets/scripts/view/SkyBackgroundAnimation.ts` | 原生 30 帧播放，保留暂停/恢复/销毁、2D 层隔离 |
| `tests/sky-background-tests.cjs` | 帧数、顺序、切格、生命周期和资产 QA 回归 |
| `tools/prepare-sky30.py` | 可审计的整理工具，拒绝覆盖生成目录 |
| `docs/evidence/sky-islands-30-v2/` | 本轮日志、网页截图、动图、保护校验 |

原 16 帧及更早源图、运行素材和历史报告保持原样。已有未提交修改保留；修改前涉及的三个代码/测试文件副本和工作树状态在 `D:/cocos/_sky-islands-30-backup-20261021/`。没有 reset、提交或推送。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| 帧数/独立性 | PASS：30 帧、30 个不同像素哈希 |
| 固定遗迹 | PASS：六处受保护区域最大像素差 0，阈值 0；Skill `static_region_drift`＝0，阈值 0 |
| 全部过渡 | PASS：最大 RGB MAE 0.516398，阈值 3；包括内部批次接缝和首尾 |
| 首尾 | RGB wrap_ratio＝0.687765，阈值 1；Skill RGBA seam＝0.169359、adjacent_mean＝0.246245、seam_over_p95＝0.487417。RGBA 包含恒定 alpha，不与 RGB 指标混用 |
| Skill 组帧 | `png_rgba_exact`、`atlas_rgba_exact`、`webp_timeline`＝pass；`cross_cell_spill`＝skipped（完整不透明画面）；`loop_seam`＝needs-visual-review、value＝0.687765、threshold＝null。总状态仍为 needs-visual-review，未篡改为完全通过 |
| 视觉查看 | 已查看新母图、五张原画稿、30 帧总览、遮罩及实际网页；固定建筑、中央天空和层位正常。降噪后云雾变化较克制，数值不证明所有设备无缝 |
| 专用测试 | PASS：乱序加载后顺序正确、15fps/2s、5×6 切格、20 次暂停/恢复/销毁、迟到回调、失败回退、2D 层隔离、源图/图集/首帧一致 |
| `npm run check:resources` | PASS：175 个登记纹理/SpriteFrame、27 棋子、30 怪物；退出 0 |
| `npx tsc --noEmit -p tsconfig.json` | PASS，退出 0 |
| `npm test` | PASS，78 组通过、0 失败，退出 0 |
| `npm run build:web` | PASS，退出 0；新 Web 包实际运行 |
| 保护文件 | PASS：主场景、BoardGeometry、BoardProjectionAdapter、RunSession、OwnedUnits、旧 16 帧图集六项 SHA256 前后相同 |

能力检查 `doctor.json` 的 `python.path` WARN 为 PATH 中另有 WindowsApps Python；本轮使用可用的 Python 3.12.10。六项 MISSING 为未配置的可选外部 API/CLI，不阻塞内置 image_gen；没有采用代码绘景或视频回退。

## 新 Web 包实测

1280×720，`http://127.0.0.1:8765/`，实际脚本 `assets/main/index.7e9cc.js`。

- 主菜单→开始游戏→拖拽备战席棋子上阵→返回菜单→继续，均已操作；背景未遮盖棋盘、未拦截拖拽。
- 四次 `SKY_BACKGROUND_READY` 均为 frames=30、fps=15、duration=2，并指向新 `sky_islands_30`，见 `browser-sky-log.json`。
- 菜单采集 31 张原生截图，跨度 6.417 秒，超过三个循环。无 UI 的天空区域 `[300,550,480,630]` 有 27 个不同像素状态，相对首张最大 RGB MAE 4.189051；证明真实消费者持续更新。截图为 JPEG、约 200ms 采样，不能当作 15fps 全帧录制或性能测量。
- 采集窗口 warning=0、error=0，见 `browser-warnings-errors.json`。未使用旧轮结果冒充新验收。

![新背景与正式棋盘](evidence/sky-islands-30-v2/04-reentered.jpg)

![实际菜单多周期采样](evidence/sky-islands-30-v2/browser-loop.gif)

## 成本和未完成项

图集 PNG 6,038,879 字节，首帧约 0.36MB；RGBA8 理论显存图集 26.37MiB、首帧 0.88MiB。禁止动态合图、无 mipmap；30 个 SpriteFrame 共用一张纹理，不创建 30 个同时可见 Sprite。美术源及处理阶段不作为运行资源加载。

构建成功，但 Creator 原始诊断仍包含项目日志文件 EPERM、Chromium/GPU 磁盘缓存访问失败、插件更新 TLS 连接中断、压缩配置回退及既有 BattleUI/TraitPanel 循环依赖；详见 `creator-build.err.log`。网页无告警不代表这些构建诊断已解决。

- NOT_RUN：Android/iOS 真机、长期 GPU/CPU/显存基准，截图瞬时 FPS 不作为性能达标证据。
- OPEN：904×871 窄视口裁切与输入，本轮未改全局 UI 缩放策略。
- NOT_RUN：Creator 动画面板人工逐帧编辑。本轮交付逐帧 PNG 和原生运行时剪辑，未宣称在面板中手绘或保存新 `.anim`。
- NOT_RUN：本轮全部技能、完整战斗的网页视觉回归；已完成拖拽/重入实测及完整自动测试。

可交付本次 30 帧背景替换；以上未完成范围不计为通过。
