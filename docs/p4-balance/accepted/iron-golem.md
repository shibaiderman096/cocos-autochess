# 铁傀儡专项：未标定的重要路径

当前P1-B enemy-power-v1没有iron_golem实测单位条目。EnemyPowerModel对未知单位使用显式费用的cost-fallback，confidence=low；并非正式标定。P4没有修改模型或自动把它升为high。

公开单位配置：费用4、HP 1400、攻击75、护甲60、魔抗40、技能iron_uppercut。机器人只用这些公开属性与技能启发式评估，不查询EnemyPowerModel。

| 分区 | 策略 | 上阵局数/总局 | 上阵波数 | 主carry/tank波数 | 敌军出现波数 |
| --- | --- | --- | --- | --- | --- |
| Validation | weak | 149/500 | 1113 | 226 | 0 |
| Validation | medium | 490/500 | 222340 | 50866 | 0 |
| Validation | strong | 500/500 | 462894 | 237147 | 0 |
| Holdout | weak | 87/250 | 3368 | 1852 | 0 |
| Holdout | medium | 246/250 | 112110 | 23974 | 0 |
| Holdout | strong | 250/250 | 232498 | 120030 | 0 |

Training确认的主carry/tank观测：weak 355波；medium 5053波；strong 13883波。不同指标口径：上阵包含任何位置，主carry/tank仅当波启发式选中的角色。

该单位确实进入重要平衡路径，最终通过率包含它的真实战斗效果；不能拿fallback结果当作可信强度证明。没有随机化移除实验，不声称它导致了某个通过率差异。敌军仍禁止给它添加未标定装备组合；需在独立增量标定中覆盖星级、技能、目标环境和装备，锁新模型版本后才能重新验收。
