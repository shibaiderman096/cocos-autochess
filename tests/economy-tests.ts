/**
 * 经济 / 等级 / 存档单元测试（M2）。
 */
import { EconomySystem, DEFAULT_ECONOMY_CONFIG } from '../assets/scripts/core/EconomySystem';
import { LevelSystem, LEVEL_UP_EXP, MAX_LEVEL, EXP_PER_BATTLE } from '../assets/scripts/core/LevelSystem';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) pass++;
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

console.log('=== 经济 / 等级 / 存档测试 ===\n');

// ─── 1. 经济结算 ───
console.log('[1] 经济结算');
{
  const e = new EconomySystem();
  assert(e.gold === 0, `初始金币应为 0，得 ${e.gold}`);

  const s1 = e.settleBattle(1, { winner: 0 });
  assert(s1.winBonus === 1 && s1.interest === 0 && s1.streakBonus === 1, '首胜获得胜利金币及1连胜金币');
  assert(s1.total === 2 && e.gold === 2, '首胜收入2金币');
  const s2 = e.settleBattle(2, { winner: 0 });
  assert(s2.winStreak === 2 && s2.streakBonus === 2, '两连胜奖励2，无阶段金币');
  assert(s2.total === 3 && e.gold === 5, '第二场收入3金币');
  const s3 = e.settleBattle(3, { winner: 1 });
  assert(s3.winStreak === 0 && s3.loseStreak === 1 && s3.total === 1, '首败获得1连败金币');
  for (const stage of [1,2,4,20,99]) {
    const fresh = new EconomySystem();
    assert(fresh.settleBattle(stage,{winner:1}).total === 1, '零存款首败获得1金币，与阶段无关');
  }
  const extra = new EconomySystem(undefined,{gold:9,winStreak:0,loseStreak:0});
  const reward = extra.settleBattle(4,{winner:0,extraIncome:20});
  assert(reward.extraIncome === 20 && reward.interest === 0 && reward.total === 22 && extra.gold === 31, '额外奖励计入总收入，不计入本场利息');
  for (const gold of [0,9,10,19,20,49,50,100]) {
    const bank = new EconomySystem(undefined,{gold,winStreak:0,loseStreak:0});
    assert(bank.settleBattle(99,{winner:1}).interest === Math.min(Math.floor(gold/10),5),'利息按结算前整10金币封顶5');
  }
}

// ─── 2. 利息上限 ───
console.log('[2] 利息上限');
{
  const e = new EconomySystem(undefined, { gold: 100, winStreak: 0, loseStreak: 0 });
  const s = e.settleBattle(1, { winner: -1 }); // 平局
  assert(s.interest === 5, `100 金币利息应为 min(10,5)=5，得 ${s.interest}`);
  // 平局不清连胜/连败
  assert(s.winStreak === 0 && s.loseStreak === 0, '平局两个计数都不变');

  const e2 = new EconomySystem(undefined, { gold: 1000, winStreak: 0, loseStreak: 0 });
  const s2 = e2.settleBattle(1, { winner: -1 });
  assert(s2.interest === 5, `1000 金币利息仍应为 5（封顶），得 ${s2.interest}`);
}

// ─── 3. 连胜/连败上限与切换 ───
console.log('[3] 连胜/连败');
{
  const e = new EconomySystem();
  // 连胜每场1金币，6次后封顶6。
  let last;
  for (let i = 0; i < 6; i++) last = e.settleBattle(1, { winner: 0 });
  assert(e.winStreak === 6, `连胜 6，得 ${e.winStreak}`);
  assert(last!.streakBonus === 6, `连胜6 → 6金币，得 ${last!.streakBonus}`);
  // 一次失败清零
  const s = e.settleBattle(1, { winner: 1 });
  assert(s.winStreak === 0 && s.loseStreak === 1, '失败应清零连胜并使连败=1');
  // 连败 8 次封顶
  for (let i = 0; i < 7; i++) e.settleBattle(1, { winner: 1 });
  assert(e.loseStreak === 8, `连败 8，得 ${e.loseStreak}`);
  const s2 = e.settleBattle(1, { winner: 1 });
  assert(s2.streakBonus === 6, `连败8 → bonus=6，得 ${s2.streakBonus}`);
}

// ─── 4. 消费不为负 ───
console.log('[4] 消费不为负');
{
  const e = new EconomySystem(undefined, { gold: 10, winStreak: 0, loseStreak: 0 });
  assert(!e.spend(11), '余额不足 spend 应返回 false');
  assert(e.gold === 10, '失败消费不应扣款');
  assert(e.spend(5), '成功消费应返回 true');
  assert(e.gold === 5, '扣除后余额=5');
  assert(!e.spend(0), '消费 0 应拒绝');
  assert(!e.spend(-3), '消费负数应拒绝');
}

// ─── 5. 利息只按结算前余额 ───
console.log('[5] 利息基线');
{
  const e = new EconomySystem(undefined, { gold: 50, winStreak: 0, loseStreak: 0 });
  const s = e.settleBattle(1, { winner: 0 });
  assert(s.interest === Math.min(Math.floor(50 * 0.1), 5), `利息应按结算前余额 50 算，得 ${s.interest}`);
  assert(s.goldBefore === 50, `goldBefore=50，得 ${s.goldBefore}`);
}

// ─── 6. 等级经验 ───
console.log('[6] 等级经验');
{
  const lv = new LevelSystem();
  assert(lv.level === 1 && lv.exp === 0, '初始 1 级 0 经验');
  assert(lv.unitCap === 1, '1 级上阵上限 1');

  // 第 1 回合 +2 经验 → 1→2（需 2），剩余 0
  let ups = lv.addExp(EXP_PER_BATTLE);
  assert(lv.level === 2 && lv.exp === 0, `+2 经验应升到 2 级剩 0，得 Lv.${lv.level} exp=${lv.exp}`);
  assert(ups.length === 1 && ups[0].from === 1 && ups[0].to === 2, '应返回一次升级事件');

  // +2 经验 → exp=2/2 → 升 3 级
  lv.addExp(EXP_PER_BATTLE);
  assert(lv.level === 3, `再次 +2 应升到 3 级，得 ${lv.level}`);

  // 一次加大量经验 → 连续升级
  const lv2 = new LevelSystem();
  lv2.addExp(LEVEL_UP_EXP[0] + LEVEL_UP_EXP[1] + LEVEL_UP_EXP[2]); // 2+2+6=10 → 1→2→3→4
  assert(lv2.level === 4, `10 经验应连升到 4 级，得 ${lv2.level}`);
  assert(lv2.exp === 0, `剩余 0，得 ${lv2.exp}`);

  // 多余经验保留
  const lv3 = new LevelSystem();
  lv3.addExp(3); // 1→2 需 2，剩 1
  assert(lv3.level === 2 && lv3.exp === 1, `3 经验应升 2 级剩 1，得 Lv.${lv3.level} exp=${lv3.exp}`);
  assert(LEVEL_UP_EXP.every(need => need % 2 === 0), '所有等级经验需求均为偶数');
  for (const [index, need] of [28, 44, 66, 86, 116].entries()) {
    const level = index + 5, boundary = new LevelSystem({ level, exp: need - 1 });
    assert(boundary.expToNext() === need, `${level}→${level + 1} 应需 ${need} 经验`);
    assert(boundary.level === level, '未达到门槛时保留当前等级');
    boundary.addExp(1);
    assert(boundary.level === level + 1 && boundary.exp === 0, '达到新门槛时准确升级');
  }
}

// ─── 7. 10 级上限 ───
console.log('[7] 10 级上限');
{
  const lv = new LevelSystem({ level: 10, exp: 0 });
  assert(lv.expToNext() === Infinity, '10 级 expToNext 应为 Infinity');
  const ups = lv.addExp(100);
  assert(lv.level === 10, '10 级不得再升');
  assert(ups.length === 0, '10 级无升级事件');
  assert(lv.unitCap === 10, '10 级上阵 10');

  // 9 级加大量经验 → 升到 10 停
  const lv2 = new LevelSystem({ level: 9, exp: 0 });
  lv2.addExp(500);
  assert(lv2.level === 10, `9 级 +500 应停在 10 级，得 ${lv2.level}`);
}

// ─── 结果 ───
console.log(`\n=== 结果：${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
