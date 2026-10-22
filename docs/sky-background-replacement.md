# 天空序列帧替换与羁绊提示精简

2026-10-21：已按用户确认，将新绘制的16帧天空浮岛接入主菜单和正式棋盘后方；仅删除羁绊辅助提示，保留名称、人数/档位、简介、效果数值和成员头像。本轮没有改动游戏规则、数值或存档格式。

## 实现和文件

- `assets/resources/art/arena/sky_islands_16.png` 及 `.meta`：与 `art-source/sky-islands-16-v1/animation/atlas.png` 字节一致的4×4图集，2304×1296，每帧576×324，禁止动态合图，16帧共享一张纹理。
- `assets/scripts/view/SkyBackgroundAnimation.ts` 及 `.meta`：原生 `AnimationClip.createWithSpriteFrames`，8fps、2秒、Loop；异步加载完成后播放，场景停用暂停，重新启用恢复，销毁移除并销毁所持剪辑。图片加载失败保留旧静态底图，避免黑屏；没有输入事件、战斗Tick或RNG依赖。该天空剪辑在运行时创建，不是新保存的 `.anim` 编辑器资源。
- `assets/scripts/view/ArtPaths.ts`：登记新图集路径。
- `assets/scripts/ui/MainMenu.ts`：使用天空背景包装方法，保留原色调压暗。
- `assets/scripts/view/FloatingRuinsBoard.ts`：3D RenderTexture 清屏透明，以显示棋盘后方的天空；背景子节点固定在2D层，防止3D相机把UI背景误绘制进RenderTexture。镜头姿态、投影和输入坐标不变。
- `assets/scripts/ui/TraitPanel.ts`：去除“各效果累加”、咏咒使两个底部辅助说明、机械先驱底部说明及两个空成员提示；规则本身没有改变，简介和各档效果仍然保留。
- `tests/shadow-trait-ui-tests.cjs`、`tests/spellchanter-trait-ui-tests.cjs`：同步新的UI要求；`tests/sky-background-tests.cjs`、`tools/run-tests.ps1`：序列帧播放和生命周期回归。

关键原文件副本与开始时工作树状态保存在 `D:/cocos/_sky-trait-replace-backup-20261021/`。沿用既有未提交修改，未 reset、提交或推送。原天空图片仍被用作加载失败时的静态回退，并未删除。旧8帧/新16帧美术源和历史报告均保留。

## 真实验收

证据目录：`docs/evidence/sky-trait-replace/`，最终网页包：`assets/main/index.0b2fb.js`。

| 检查 | 结果 |
|---|---|
| 资源 | PASS，177张登记贴图/SpriteFrame，`resources.log` |
| 类型 | PASS，退出0，`typecheck.log`、`typecheck.exit.txt` |
| 完整回归 | PASS，最终修复后75 suites、0 failed，`npm-test.log` |
| 天空专用测试 | PASS，乱序加载后保持16帧顺序、8fps/2s、20次暂停/恢复/销毁、异步销毁回调、失败回退、2D层隔离、图集与源文件完全相同 |
| 网页构建 | PASS，退出0，`build-web.log`、`build-web.exit.txt` |
| 浏览器 | PASS，1280×720，菜单→棋盘→菜单→继续，4次天空资源就绪日志均为16帧/8fps/2s；帧间天空区域像素确有变化 |
| 羁绊网页 | PASS，机械先驱底部辅助文案、暗影“各效果累加”已消失；名称、简介、档位、数值、头像仍可见。其余卡片未全部人工逐张查看，咏咒使等使用自动UI回归验证 |
| 操作 | PASS，备战席暗影棋子与场上机械棋子拖拽交换，羁绊列表更新；滚轮放大、复位和场景重进正常 |
| 实际相机 | PASS，4次×392点＝1568点；最大中心误差0.0000137945px、角点0.0000153652px，阈值仍0.5px；原自动投影测试阈值仍0.001px |
| 控制台 | 最终包采集窗口 warning=0、error=0，`browser-final-console.json` |
| 保护校验 | 正式scene、BoardGeometry、BoardProjectionAdapter、正式GLB与既有保护基线哈希一致，`protected.json` |

首次实机包 `index.7859f.js` 在棋盘上出现右上灰色遮挡：新建 `skin` 节点默认落在 DEFAULT 层，误入3D相机。已修复为继承背景的2D层，补充边界测试，并再次完整测试、构建与实机验证。`01-menu.jpg`～`03-mechanical.jpg` 和 `browser-initial-console.json` 是初次记录，保留问题证据；最终效果使用 `04-menu-final.jpg`～`09-reentered.jpg`。

构建器日志仍记录项目日志文件EPERM、插件更新403及已有循环依赖警告，见 `creator.log` / `creator.err.log`。不能把网页控制台零告警解释成构建器完全无警告。

![最终棋盘天空背景](evidence/sky-trait-replace/09-reentered.jpg)

![机械先驱提示精简](evidence/sky-trait-replace/07-mechanical-final.jpg)

![暗影提示精简](evidence/sky-trait-replace/08-shadow-final.jpg)

## 保留的限制

16帧源图仍有2～4px局部地标漂移，`static_region_drift`＝4、阈值0、status=warn；首尾 `wrap_ratio`＝1.119679、status=needs-visual-review。用户授权替换不代表该美术限制已修复或无缝验收通过。素材原生每帧576×324，屏幕显示会放大，未声称高清绘制。

本轮没有进行所有技能的网页视觉回归或新的网页完整战斗实测；完整自动回归已通过。904×871窄视口裁切/输入继续OPEN，Android真机与长时间性能测量NOT_RUN；截图瞬时FPS不能代表性能达标。全局UI缩放策略未改。
