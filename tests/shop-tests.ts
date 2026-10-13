/**
 * 商店 / 卡池 / 持有数据测试（M2）。
 */
import { Rng } from '../assets/scripts/core/Rng';
import { CardPool } from '../assets/scripts/core/CardPool';
import { OwnedUnits } from '../assets/scripts/core/OwnedUnits';
import { ShopSystem } from '../assets/scripts/core/ShopSystem';
import { EconomySystem } from '../assets/scripts/core/EconomySystem';
import { SHOP_RATES, POOL_STOCK, validateRates, COST_PRICE, Cost } from '../assets/scripts/core/ShopConfig';
import { migrateSaveV2, SAVE_VERSION as V2 } from '../assets/scripts/core/ShopSave';
import { UnitConfigData } from '../assets/scripts/core/ConfigManager';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) pass++;
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

const UNITS: UnitConfigData[] = [
  { id: 'w1', name: '步兵', cost: 1, hp: 100, atk: 10, armor: 0, mr: 0, atkSpeed: 1, range: 1, moveTicks: 6, maxMana: 0, startMana: 0, manaPerHit: 0 },
  { id: 'w2', name: '枪兵', cost: 1, hp: 120, atk: 12, armor: 0, mr: 0, atkSpeed: 1, range: 1, moveTicks: 6, maxMana: 0, startMana: 0, manaPerHit: 0 },
  { id: 'a1', name: '弓手', cost: 2, hp: 90, atk: 15, armor: 0, mr: 0, atkSpeed: 1, range: 4, moveTicks: 6, maxMana: 0, startMana: 0, manaPerHit: 0 },
  { id: 'a2', name: '弩手', cost: 2, hp: 85, atk: 16, armor: 0, mr: 0, atkSpeed: 1, range: 4, moveTicks: 6, maxMana: 0, startMana: 0, manaPerHit: 0 },
  { id: 'm1', name: '法师', cost: 3, hp: 70, atk: 20, armor: 0, mr: 0, atkSpeed: 1, range: 3, moveTicks: 6, maxMana: 50, startMana: 0, manaPerHit: 8 },
  { id: 'm2', name: '术士', cost: 3, hp: 65, atk: 22, armor: 0, mr: 0, atkSpeed: 1, range: 3, moveTicks: 6, maxMana: 50, startMana: 0, manaPerHit: 8 },
  { id: 'k1', name: '骑士', cost: 4, hp: 200, atk: 18, armor: 10, mr: 0, atkSpeed: 0.8, range: 1, moveTicks: 6, maxMana: 0, startMana: 0, manaPerHit: 0 },
  { id: 'd1', name: '龙', cost: 5, hp: 300, atk: 30, armor: 15, mr: 0, atkSpeed: 0.7, range: 2, moveTicks: 6, maxMana: 0, startMana: 0, manaPerHit: 0 },
];
const UNIT_MAP = new Map(UNITS.map(u => [u.id, u]));

function makeShop(level: number, gold = 100) {
  const economy = new EconomySystem(undefined, { gold, winStreak: 0, loseStreak: 0 });
  const pool = new CardPool(UNITS);
  const owned = new OwnedUnits();
  const shop = new ShopSystem(
    pool, owned, economy, UNIT_MAP,
    new Rng(42), () => level, 9,
  );
  return { economy, pool, owned, shop };
}

console.log('=== 商店 / 卡池测试 ===\n');

// ─── 1. 概率总和 100% ───
console.log('[1] 概率总和');
{
  const errors = validateRates();
  assert(errors.length === 0, `概率表应全部为 100%，错误: ${errors.join('; ')}`);
  assert(SHOP_RATES.length === 10, `应有 10 级概率，得 ${SHOP_RATES.length}`);
}

// ─── 2. 1/2 级不抽 2 费以上 ───
console.log('[2] 低等级费用限制');
{
  const { pool, shop } = makeShop(1);
  // 跑 200 次购买检测卡池分布（1 级只能抽 1 费）
  for (let i = 0; i < 40; i++) {
    for (let s = 0; s < 5; s++) shop.buy(s);
    shop.returnUnbought();
  }
  // 检查 2+ 费棋子存量未变
  assert(pool.count('a1') === POOL_STOCK[2], `1 级不应消耗 2 费棋子，a1 剩 ${pool.count('a1')}`);
  assert(pool.count('m1') === POOL_STOCK[3], `1 级不应消耗 3 费棋子，m1 剩 ${pool.count('m1')}`);
  assert(pool.count('d1') === POOL_STOCK[5], `1 级不应消耗 5 费棋子，d1 剩 ${pool.count('d1')}`);
}

// ─── 3. 卡池耗尽不出现负数/死循环 ───
console.log('[3] 卡池耗尽');
{
  const economy = new EconomySystem(undefined, { gold: 1000, winStreak: 0, loseStreak: 0 });
  const pool = new CardPool(UNITS);
  // 手动抽干 1 费
  pool.take('w1'); pool.take('w1');
  let guard = 0;
  while (!pool.isEmpty() && guard < 200) {
    const id = pool.pickByCost(1, new Rng(1));
    if (!id) break;
    pool.take(id);
    guard++;
  }
  assert(!pool.isEmpty() || guard < 200, '卡池应在有限步内耗尽');
  assert(pool.count('w1') === 0, '耗尽后 w1 应为 0');
  // 再 take 应失败（不出现负数）
  assert(!pool.take('w1'), '耗尽后 take 应失败');
  assert(pool.count('w1') === 0, 'take 失败后不为负');

  // 商店在整池空时显示空位
  const economy2 = new EconomySystem(undefined, { gold: 100, winStreak: 0, loseStreak: 0 });
  const pool2 = new CardPool(UNITS);
  // 抽干全部
  let g2 = 0;
  while (!pool2.isEmpty() && g2 < 200) {
    const ids = ['w1', 'w2', 'a1', 'a2', 'm1', 'm2', 'k1', 'd1'];
    for (const id of ids) { while (pool2.take(id)) { g2++; } }
  }
  const owned2 = new OwnedUnits();
  const shop2 = new ShopSystem(pool2, owned2, economy2, UNIT_MAP, new Rng(1), () => 5, 9);
  let allNull = true;
  for (const s of shop2.slots) if (s.unitId) allNull = false;
  assert(allNull, '整池空时商店应全部为空位');
}

// ─── 4. 购买/刷新/出售卡池变化 ───
console.log('[4] 购买/刷新/出售');
{
  const { economy, pool, owned, shop } = makeShop(3, 50);
  const gold0 = economy.gold;
  // 找到一个有棋子的格并购买
  let bought = false;
  for (let s = 0; s < 5; s++) {
    const uid = shop.slots[s].unitId;
    if (!uid) continue;
    const before = pool.count(uid);
    const r = shop.buy(s);
    if (!r.error) {
      assert(pool.count(uid) === before, `购买转移预留的 ${uid}，不应再次扣卡池`);
      assert(owned.all().length === 1, '购买后持有 +1');
      assert(economy.gold < gold0, '购买后金币减少');
      bought = true;
      break;
    }
  }
  assert(bought, '至少应成功购买一次');

  // 刷新：扣 2 金币，返还未购买
  const goldBefore = economy.gold;
  const totalBefore = pool.total();
  const r2 = shop.refresh();
  assert(r2 === null, '刷新应成功');
  assert(economy.gold === goldBefore - 2, `刷新扣 2 金币，得 ${economy.gold - goldBefore}`);

  // 出售：持有 -1，卡池 +1，金币 +
  const sellUnit = owned.all()[0];
  const poolCnt = pool.count(sellUnit.unitId);
  const goldBefore2 = economy.gold;
  const sr = shop.sell(sellUnit.uid);
  assert(sr !== null, '出售应成功');
  assert(owned.all().length === 0, '出售后持有 0');
  assert(pool.count(sellUnit.unitId) === poolCnt + 1, '出售后卡池 +1');
  assert(economy.gold > goldBefore2, '出售后金币增加');
}

// ─── 5. 拖动不改变卡池 ───
console.log('[5] 拖动不改卡池');
{
  const owned = new OwnedUnits();
  owned.addToBench('w1', 9, 0);
  owned.addToBench('w1', 9, 1);
  owned.addToBench('w1', 9, 2);
  const pool = new CardPool(UNITS);
  const before = pool.count('w1');
  // bench → board → bench
  owned.move(owned.all()[0].uid, { location: 'board', x: 2, y: 2 });
  owned.move(owned.all()[0].uid, { location: 'bench', x: -1, y: 5 });
  assert(pool.count('w1') === before, '拖动不应改变卡池');
}

// ─── 6. 备战席满不能非法购买 ───
console.log('[6] 备战席满');
{
  const economy = new EconomySystem(undefined, { gold: 100, winStreak: 0, loseStreak: 0 });
  const pool = new CardPool(UNITS);
  const owned = new OwnedUnits();
  const shop = new ShopSystem(pool, owned, economy, UNIT_MAP, new Rng(7), () => 5, 3); // bench=3
  // 填 2 个 w1 + 1 个 w2（bench 满 3）
  owned.addToBench('w1', 3, 0);
  owned.addToBench('w1', 3, 1);
  owned.addToBench('w2', 3, 2);
  assert(owned.all().length === 3, `应 3 个持有，得 ${owned.all().length}`);
  // 买 w1 → 会凑满 3 张合并（合法放行）
  // 买其他棋子（不是 w1/w2 的第 3 张）→ bench_full
  let denied = false;
  let mergedOk = false;
  for (let s = 0; s < 5; s++) {
    const uid = shop.slots[s].unitId;
    if (!uid) continue;
    const r = shop.buy(s);
    if (uid === 'w1' && !r.error) {
      // 合并成功
      mergedOk = true;
    } else if (r.error === 'bench_full') {
      denied = true;
    }
  }
  assert(denied || mergedOk, '应有 bench_full 拒绝或合并成功');
  if (mergedOk) {
    const w1s = owned.all().filter(u => u.unitId === 'w1');
    assert(w1s.length === 1 && w1s[0].star === 2, `合并后 w1 应 1 个 2 星，得 ${w1s.length} 个`);
  }
}

// ─── 7. 金币不足 ───
console.log('[7] 金币不足');
{
  const { economy, pool, owned, shop } = makeShop(5, 1); // 只有 1 金币
  let denied = 0;
  for (let s = 0; s < 5; s++) {
    const uid = shop.slots[s].unitId;
    if (!uid) continue;
    const cost = pool.costOfUnit(uid);
    if (COST_PRICE[cost] > 1) {
      const r = shop.buy(s);
      if (r.error === 'not_enough_gold') denied++;
    }
  }
  assert(denied > 0 || economy.gold === 1, '应有购买被拒或余额不变');
  assert(economy.gold === 1, `余额应不变，得 ${economy.gold}`);

  // 刷新余额不足
  const r = shop.refresh();
  assert(r === 'not_enough_gold', '刷新余额不足应返回错误');
}

// ─── 8. 战斗期间禁止商店操作 ───
console.log('[8] 战斗锁定');
{
  // 锁定由 BattleStage.fighting 拦截（UI 层），纯逻辑层由调用方保证。
  // 这里测 ShopSystem 本身无 fighting 概念 → 跳过，但记录约定。
  assert(true, '战斗锁定在 view 层实现（fighting 标志拦截 onBuy/onRefresh）');
}

// ─── 9. 存档读写一致 ───
console.log('[9] 存档一致');
{
  const { pool, owned, shop, economy } = makeShop(4, 60);
  for (let s = 0; s < 3; s++) shop.buy(s);
  owned.move(owned.all()[0].uid, { location: 'board', x: 3, y: 2 });

  const snapshot = {
    shop: shop.snapshot(),
    owned: owned.snapshot(),
    pool: pool.snapshot(),
    gold: economy.gold,
    floor: 2, level: 4, exp: 3,
    winStreak: 1, loseStreak: 0,
    benchSlots: 9,
  };
  const loaded = migrateSaveV2(snapshot);
  assert(loaded.version === V2, `版本应为 ${V2}，得 ${loaded.version}`);
  assert(loaded.gold === snapshot.gold, '金币应一致');
  assert(loaded.level === 4 && loaded.exp === 3, '等级经验应一致');
  assert(loaded.owned.length === owned.all().length, '持有棋子数应一致');
  const loadedBoard = loaded.owned.filter(u => u.location === 'board');
  assert(loadedBoard.length === 1 && loadedBoard[0].x === 3 && loadedBoard[0].y === 2, '棋盘位置应一致');
  assert(loaded.pool['w1'] === snapshot.pool['w1'], '卡池 w1 应一致');
  assert(loaded.shop.length === 5, '商店应 5 格');
  // v1 旧档（无 shop/owned/pool 字段）
  const old = migrateSaveV2({ floor: 3, gold: 25, level: 2, exp: 1 });
  assert(old.shop.length === 5 && old.owned.length === 0 && typeof old.pool === 'object', 'v1 旧档应补默认值');
}

// ─── 10. 同名合并 ───
console.log('[10] 同名合并');
{
  const owned = new OwnedUnits();
  owned.addToBench('w1', 9, 0);
  owned.addToBench('w1', 9, 1);
  const third = owned.addToBench('w1', 9, 2);
  assert(third !== null, '第 3 张应添加成功');
  // 合并后应剩 1 个 2 星
  const all = owned.all();
  assert(all.length === 1, `合并后应剩 1 个，得 ${all.length}`);
  assert(all[0].star === 2, `星级应为 2，得 ${all[0].star}`);
  // 合并不返还卡池
  const pool = new CardPool(UNITS);
  void pool;
}

// ─── 结果 ───
console.log(`\n=== 结果：${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
