# 2026-10-22 Android APK 与完整版本提交

本次 APK 为当前工作区可运行版本：包含星穹羁绊、星铠守卫、流星灵狐·弥露及其专属特效，同时包含此前尚未提交的机械先驱、新遗迹正式棋盘、野怪及已执行的资源／预览场景清理。正式入口为 `main.scene` → `floating-ruins.scene`。

## 安装包

- 路径：`build/releases/autochess-android-arm64-debug.apk`。
- 应用：浮空棋境，包名 `com.shibaiderman.autochess`，版本 1.0（1）。
- 架构：仅 `arm64-v8a`，最低 Android API 21，目标 API 36。
- 类型：现有 Android Debug 签名，V1／V2 验证通过。
- 大小：169,604,700 字节，约 161.7 MiB。
- SHA-256：`925ddc494c4f7ee56b0ef0822ae3e8790c5568a8392343456975b2b9b2065f74`。

使用现有 `tools/build-android.ps1`、Cocos Creator 3.8.8、JDK 17、NDK 27.2.12479018 和 Gradle 8.11.1。Creator 导出完成，Gradle `BUILD SUCCESSFUL`；签名核对通过。构建缓存、APK 及签名文件继续按现有规则排除在 Git 源码提交之外，安装包留在本机交付路径。

## 内容与检查

`python -X utf8 tools/verify-android-apk.py build/releases/autochess-android-arm64-debug.apk` 检查 APK ZIP 完整性、仅包含 ARM64 库，并将包内 battle／units／skills／run／enemy-roles 五份配置逐项与当前源码比对，全部一致。两张新棋子立绘、八张星穹相关特效、两条新技能运行代码及两个正式场景均已包含。详见 [包内核验](evidence/android-20261022-astral/apk-content.json)。

提交前全量回归首次为 76 组通过、7 组失败。核实后只修改测试与文档，没有改变运行时玩法、配置、美术或构建参数：

- 更新正式名单到 29 名、1 费 8 名，校准组合矩阵为 3016 例。
- 羁绊列表加入正式星穹后为 12 行。
- 恒星壁垒属于护盾／控制技能，不把随后的普通攻击误当技能伤害；共享技能检查核对护盾事件和冲刺状态。
- 分辨率测试保留现有 `fitHeight: true`；生命周期测试覆盖当前备战席节点，移除对已退役 HUD 节点的假设。
- 项目导航改为实际正式场景路径。

修正后的完整检查为 **83 组通过，0 失败**，见 [最终输出](evidence/android-20261022-astral/test-suite-final.log)。首轮失败记录、构建日志、包信息和签名结果保存在 [验收目录](evidence/android-20261022-astral/)。未连接 Android 设备，因此仅确认构建、签名及包内内容，未宣称真机安装、交互或性能验证。
