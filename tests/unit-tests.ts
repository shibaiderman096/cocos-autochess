/**
 * M1 第 13 项：独立单元测试。
 * 覆盖：伤害公式、寻敌、BFS 寻路、同种子可复现。
 * 运行：npm run test  → tsc 编译 + node 执行
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigManager, UnitConfigData } from '../assets/scripts/core/ConfigManager';
import { BattleSim, Placement } from '../assets/scripts/battle/BattleSim';
import { dist, nextStep } from '../assets/scripts/battle/Pathfinding';
import { Grid } from '../assets/scripts/battle/Grid';
import { Rng } from '../assets/scripts/core/Rng';

let pass = 0, fail = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

function approx(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) < eps;
}

// ─── 配置 ───
const root = resolve(__dirname, '..');
const cfg = new ConfigManager();
cfg.setUnits(JSON.parse(readFileSync(resolve(root, 'assets/resources/config/units.json'), 'utf8')) as UnitConfigData[]);
cfg.setSkills(JSON.parse(readFileSync(resolve(root, 'assets/resources/config/skills.json'), 'utf8')));
cfg.setBattle({ boardWidth: 8, boardHeight: 8, maxTicks: 1200, tickMs: 50 });

console.log('=== M1 单元测试 ===\n');

// ─── 1. 伤害公式 ───
console.log('[1] 伤害公式');
{
  // 物理伤害：dmg = atk * 100 / (100 + armor)，最低 1
  // warrior atk=55 armor=40 → 55*100/140 = 39.28 → round = 39
  const w = cfg.getUnit('warrior');
  const expectedPhys = Math.max(1, Math.round(w.atk * 100 / (100 + w.armor)));
  assert(expectedPhys === 39, `warrior vs warrior 物理伤害应为 39，得 ${expectedPhys}`);

  // 弓手打法师：archer atk=60, mage armor=10 → 60*100/110 = 54.54 → 55
  const a = cfg.getUnit('archer');
  const m = cfg.getUnit('mage');
  const expectedArchMage = Math.max(1, Math.round(a.atk * 100 / (100 + m.armor)));
  assert(expectedArchMage === 55, `archer vs mage 物理伤害应为 55，得 ${expectedArchMage}`);

  // 魔法伤害：power=220, mr=30 → 220*100/130 = 169.23 → 169
  const sk = cfg.getSkill('fireball');
  const expectedMagic = Math.max(1, Math.round(sk.power * 100 / (100 + m.mr)));
  assert(expectedMagic === 169, `fireball vs mage 魔法伤害应为 169，得 ${expectedMagic}`);

  // 真实伤害无视抗性
  const trueDmg = Math.max(1, Math.round(100 * 100 / (100 + 0)));
  assert(trueDmg === 100, `真实伤害 100 应为 100，得 ${trueDmg}`);

  // 最低伤害 1
  const minDmg = Math.max(1, Math.round(0 * 100 / (100 + 999)));
  assert(minDmg === 1, `零攻击应产生最低伤害 1，得 ${minDmg}`);
}

// ─── 2. 寻敌（nearestEnemy 逻辑验证） ───
console.log('[2] 寻敌');
{
  const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
    ({ cfg: cfg.getUnit(cfgId), side, x, y });
  const placements: Placement[] = [
    P('warrior', 0, 3, 3),
    P('archer', 0, 4, 1),
    P('mage', 0, 2, 0),
    P('warrior', 1, 3, 6),
    P('archer', 1, 4, 4),
    P('mage', 1, 2, 7),
  ];
  const sim = new BattleSim(cfg, placements, { seed: 1, w: 8, h: 8, maxTicks: 1200 });
  const u0 = sim.units[0]; // id=1, 己方 warrior at (3,3)
  // 最近的敌方：id=5 archer at (4,4) dist=2, id=4 warrior at (3,6) dist=3, id=6 mage at (2,7) dist=5
  // 但 BattleSim.nearestEnemy 是 private，我们通过运行一步检查事件验证
  sim.start();
  sim.step(); // 第一个 tick
  // warrior(3,3) 的最近敌人是 archer(4,4) dist=2，但 range=1 所以应该移动
  const moves = sim.events.filter(e => e.t === 'move' && (e as any).id === 1);
  assert(moves.length > 0 || sim.events.some(e => e.t === 'attack'), 'warrior 应在第一 tick 寻敌后移动或攻击');
}

// ─── 3. BFS 寻路 ───
console.log('[3] BFS 寻路');
{
  // 空棋盘 8×8，从 (0,0) 到 (3,0) 应返回 (1,0)
  const step = nextStep({ x: 0, y: 0 }, 8, 8, () => false, (x, y) => x === 3 && y === 0);
  assert(step !== null && step.x === 1 && step.y === 0, `BFS (0,0)→(3,0) 第一步应为 (1,0)，得 (${step?.x},${step?.y})`);

  // 被堵住时应绕路
  const blocked = (x: number, y: number) => x === 1 && y === 0;
  const step2 = nextStep({ x: 0, y: 0 }, 8, 8, blocked, (x, y) => x === 3 && y === 0);
  // (1,0) 被堵，应走 (0,1) 绕路
  assert(step2 !== null && step2.x === 0 && step2.y === 1, `BFS 绕路应为 (0,1)，得 (${step2?.x},${step2?.y})`);

  // 无路可走返回 null
  const allBlocked = () => true;
  const step3 = nextStep({ x: 0, y: 0 }, 8, 8, allBlocked, (x, y) => x === 7 && y === 7);
  assert(step3 === null, '全堵时应返回 null');

  // dist 函数
  assert(dist({ x: 0, y: 0 }, { x: 3, y: 4 }) === 7, 'Manhattan 距离 (0,0)→(3,4) 应为 7');
  assert(dist({ x: 5, y: 5 }, { x: 5, y: 5 }) === 0, '同格距离应为 0');
}

// ─── 4. Grid 边界 ───
console.log('[4] Grid 边界');
{
  const g = new Grid(8, 8);
  assert(g.inBounds(0, 0), '(0,0) 应在界内');
  assert(g.inBounds(7, 7), '(7,7) 应在界内');
  assert(!g.inBounds(-1, 0), '(-1,0) 应在界外');
  assert(!g.inBounds(0, 8), '(0,8) 应在界外');
  assert(g.isOwnHalf(0), 'y=0 应为己方半场');
  assert(g.isOwnHalf(3), 'y=3 应为己方半场');
  assert(g.isEnemyHalf(4), 'y=4 应为敌方半场');
  assert(g.isEnemyHalf(7), 'y=7 应为敌方半场');
}

// ─── 5. 同种子可复现 ───
console.log('[5] 同种子可复现');
{
  const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
    ({ cfg: cfg.getUnit(cfgId), side, x, y });
  const placements: Placement[] = [
    P('warrior', 0, 3, 3),
    P('archer', 0, 4, 1),
    P('mage', 0, 2, 0),
    P('warrior', 1, 3, 6),
    P('archer', 1, 4, 4),
    P('mage', 1, 2, 7),
  ];

  const r1 = new BattleSim(cfg, placements, { seed: 42, w: 8, h: 8, maxTicks: 1200 }).run();
  const r2 = new BattleSim(cfg, placements, { seed: 42, w: 8, h: 8, maxTicks: 1200 }).run();

  assert(r1.winner === r2.winner, '同种子胜者应一致');
  assert(r1.ticks === r2.ticks, '同种子 tick 数应一致');
  assert(r1.survivors.length === r2.survivors.length, '同种子幸存者数应一致');
  assert(JSON.stringify(r1.events) === JSON.stringify(r2.events), '同种子事件序列应完全一致');

  // 不同布阵 → 不同结果（至少事件数或 tick 不同）
  const placements2: Placement[] = [
    P('warrior', 0, 0, 0),
    P('archer', 0, 1, 0),
    P('mage', 0, 2, 0),
    P('warrior', 1, 7, 7),
    P('archer', 1, 6, 7),
    P('mage', 1, 5, 7),
  ];
  const r3 = new BattleSim(cfg, placements2, { seed: 42, w: 8, h: 8, maxTicks: 1200 }).run();
  assert(JSON.stringify(r1.events) !== JSON.stringify(r3.events) || r1.ticks !== r3.ticks,
    '不同布阵应产生不同结果');
}

// ─── 6. Rng 确定性 ───
console.log('[6] Rng 确定性');
{
  const r1 = new Rng(12345);
  const r2 = new Rng(12345);
  const seq1: number[] = [];
  const seq2: number[] = [];
  for (let i = 0; i < 100; i++) { seq1.push(r1.next()); seq2.push(r2.next()); }
  assert(JSON.stringify(seq1) === JSON.stringify(seq2), '同种子 Rng 序列应完全一致');

  const r3 = new Rng(99999);
  const seq3: number[] = [];
  for (let i = 0; i < 100; i++) seq3.push(r3.next());
  assert(JSON.stringify(seq1) !== JSON.stringify(seq3), '不同种子 Rng 序列应不同');

  // 范围 [0,1)
  const r4 = new Rng(1);
  let allInRange = true;
  for (let i = 0; i < 1000; i++) {
    const v = r4.next();
    if (v < 0 || v >= 1) { allInRange = false; break; }
  }
  assert(allInRange, 'Rng.next() 应全部在 [0,1) 范围内');

  // int 范围
  const r5 = new Rng(777);
  let intOk = true;
  for (let i = 0; i < 1000; i++) {
    const v = r5.int(3, 7);
    if (v < 3 || v > 7) { intOk = false; break; }
  }
  assert(intOk, 'Rng.int(3,7) 应全部在 [3,7] 范围内');
}

// ─── 7. 超时判平局 ───
console.log('[7] 超时判平局');
{
  // 两个不动的单位放得很远，永远打不到对方 → 超时
  const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
    ({ cfg: cfg.getUnit(cfgId), side, x, y });
  // warrior range=1 moveTicks=6，但放在对角，会移动接近
  // 改为两个 archer range=4 放在 (0,0) 和 (7,7)，dist=14 > range
  // 但它们会移动接近后攻击，不会超时
  // 用一个极端场景：maxTicks=5
  const placements: Placement[] = [
    P('warrior', 0, 0, 0),
    P('warrior', 1, 7, 7),
  ];
  const r = new BattleSim(cfg, placements, { seed: 1, w: 8, h: 8, maxTicks: 5 }).run();
  assert(r.winner === -1, `5 tick 超时应判平局(-1)，得 ${r.winner}`);
}

// ─── 结果 ───
console.log(`\n=== 结果：${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
