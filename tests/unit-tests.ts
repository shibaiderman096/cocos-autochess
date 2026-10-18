/**
 * M1 单元测试（六边形版）。
 * 覆盖：伤害公式、寻敌、六边形 BFS 寻路、同种子可复现、hex 数学。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigManager, UnitConfigData, configuredSkillDamage } from '../assets/scripts/core/ConfigManager';
import { BattleSim, Placement } from '../assets/scripts/battle/BattleSim';
import { hexDist, hexNeighbors, offsetToAxial, axialToOffset, offsetToWorld, worldToOffset } from '../assets/scripts/battle/HexMath';
import { nextStep } from '../assets/scripts/battle/Pathfinding';
import { Grid } from '../assets/scripts/battle/Grid';
import { Rng } from '../assets/scripts/core/Rng';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

const root = resolve(__dirname, '..');
const cfg = new ConfigManager();
cfg.setUnits(JSON.parse(readFileSync(resolve(root, 'assets/resources/config/units.json'), 'utf8')) as UnitConfigData[]);
cfg.setSkills(JSON.parse(readFileSync(resolve(root, 'assets/resources/config/skills.json'), 'utf8')));
cfg.setBattle({ boardWidth: 8, boardHeight: 6, maxTicks: 1200, tickMs: 50 });

console.log('=== M1 单元测试（六边形版）===\n');

// ─── 1. 伤害公式 ───
console.log('[1] 伤害公式');
{
  const w = cfg.getUnit('warrior');
  const expectedPhys = Math.max(1, Math.round(w.atk * 100 / (100 + w.armor)));
  assert(expectedPhys === 33, `40 攻击对 20 护甲，物理伤害应为 33，得 ${expectedPhys}`);

  const a = cfg.getUnit('archer');
  const m = cfg.getUnit('mage');
  const expectedArchMage = Math.max(1, Math.round(a.atk * 100 / (100 + m.armor)));
  assert(expectedArchMage === 36, `archer vs mage 物理伤害应为 36，得 ${expectedArchMage}`);

  const sk = cfg.getSkill('fireball');
  const expectedMagic = Math.max(1, Math.round(configuredSkillDamage(sk, 1) * 100 / (100 + m.mr)));
  assert(expectedMagic === 150, `fireball vs mage 一星设定伤害应为 150，得 ${expectedMagic}`);

  const trueDmg = Math.max(1, Math.round(100 * 100 / (100 + 0)));
  assert(trueDmg === 100, `真实伤害 100 应为 100，得 ${trueDmg}`);

  const minDmg = Math.max(1, Math.round(0 * 100 / (100 + 999)));
  assert(minDmg === 1, `零攻击应产生最低伤害 1，得 ${minDmg}`);
}

// ─── 2. 寻敌 ───
console.log('[2] 寻敌');
{
  const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
    ({ cfg: cfg.getUnit(cfgId), side, x, y });
  const placements: Placement[] = [
    P('warrior', 0, 2, 2),
    P('archer', 0, 4, 1),
    P('mage', 0, 6, 0),
    P('warrior', 1, 2, 3),
    P('archer', 1, 4, 4),
    P('mage', 1, 6, 5),
  ];
  const sim = new BattleSim(cfg, placements, { seed: 1, w: 8, h: 6, maxTicks: 1200 });
  sim.start();
  sim.step();
  const moves = sim.events.filter(e => e.t === 'move');
  assert(moves.length > 0 || sim.events.some(e => e.t === 'attack'), '第一步应有移动或攻击');
}

// ─── 3. 六边形 BFS 寻路 ───
console.log('[3] 六边形 BFS 寻路');
{
  // 空棋盘 8×6，从 (0,0) 到 (3,0) 应走一步
  const step = nextStep({ x: 0, y: 0 }, 8, 6, () => false, (x, y) => x === 3 && y === 0);
  assert(step !== null, `BFS (0,0)→(3,0) 应找到路径`);
  assert(step !== null && step.x === 1 && step.y === 0, `BFS 第一步应为 (1,0)，得 (${step?.x},${step?.y})`);

  // 被堵住时应绕路
  const blocked = (x: number, y: number) => x === 1 && y === 0;
  const step2 = nextStep({ x: 0, y: 0 }, 8, 6, blocked, (x, y) => x === 3 && y === 0);
  assert(step2 !== null, `BFS 绕路应找到路径`);

  // 无路返回 null
  const step3 = nextStep({ x: 0, y: 0 }, 8, 6, () => true, (x, y) => x === 7 && y === 5);
  assert(step3 === null, '全堵时应返回 null');

  // hex 距离
  assert(hexDist({ x: 0, y: 0 }, { x: 1, y: 0 }) === 1, 'hex 距离 (0,0)→(1,0) 应为 1');
  assert(hexDist({ x: 0, y: 0 }, { x: 0, y: 1 }) === 1, 'hex 距离 (0,0)→(0,1) 应为 1');
  assert(hexDist({ x: 0, y: 0 }, { x: 3, y: 0 }) === 3, 'hex 距离 (0,0)→(3,0) 应为 3');
  assert(hexDist({ x: 2, y: 2 }, { x: 2, y: 2 }) === 0, '同格距离应为 0');
}

// ─── 4. hex 数学 ───
console.log('[4] hex 数学');
{
  // offset ↔ axial 往返
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 6; row++) {
      const ax = offsetToAxial(col, row);
      const back = axialToOffset(ax.q, ax.r);
      assert(back.col === col && back.row === row, `offset(${col},${row})→axial→offset 往返应一致，得 (${back.col},${back.row})`);
    }
  }

  // hexNeighbors 返回 6 个
  const ns = hexNeighbors(3, 3);
  assert(ns.length === 6, `hexNeighbors 应返回 6 个邻居，得 ${ns.length}`);

  // offsetToWorld ↔ worldToOffset 往返
  const ox = -100, oy = 100, size = 36;
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 6; row++) {
      const w = offsetToWorld(col, row, size, ox, oy);
      const back = worldToOffset(w.x, w.y, size, ox, oy);
      assert(back.col === col && back.row === row, `world 往返(${col},${row}) 应一致，得 (${back.col},${back.row})`);
    }
  }
}

// ─── 5. Grid 边界 ───
console.log('[5] Grid 边界');
{
  const g = new Grid(8, 6);
  assert(g.inBounds(0, 0), '(0,0) 应在界内');
  assert(g.inBounds(7, 5), '(7,5) 应在界内');
  assert(!g.inBounds(-1, 0), '(-1,0) 应在界外');
  assert(!g.inBounds(0, 6), '(0,6) 应在界外');
  assert(g.isOwnHalf(0), 'y=0 应为己方半场');
  assert(g.isOwnHalf(2), 'y=2 应为己方半场');
  assert(g.isEnemyHalf(3), 'y=3 应为敌方半场');
  assert(g.isEnemyHalf(5), 'y=5 应为敌方半场');
}

// ─── 6. 同种子可复现 ───
console.log('[6] 同种子可复现');
{
  const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
    ({ cfg: cfg.getUnit(cfgId), side, x, y });
  const placements: Placement[] = [
    P('warrior', 0, 2, 2),
    P('archer', 0, 4, 1),
    P('mage', 0, 6, 0),
    P('warrior', 1, 2, 3),
    P('archer', 1, 4, 4),
    P('mage', 1, 6, 5),
  ];
  const r1 = new BattleSim(cfg, placements, { seed: 42, w: 8, h: 6, maxTicks: 1200 }).run();
  const r2 = new BattleSim(cfg, placements, { seed: 42, w: 8, h: 6, maxTicks: 1200 }).run();
  assert(r1.winner === r2.winner, '同种子胜者应一致');
  assert(r1.ticks === r2.ticks, '同种子 tick 数应一致');
  assert(JSON.stringify(r1.events) === JSON.stringify(r2.events), '同种子事件序列应完全一致');

  const placements2: Placement[] = [
    P('warrior', 0, 0, 0),
    P('archer', 0, 1, 0),
    P('mage', 0, 2, 0),
    P('warrior', 1, 7, 5),
    P('archer', 1, 6, 5),
    P('mage', 1, 5, 5),
  ];
  const r3 = new BattleSim(cfg, placements2, { seed: 42, w: 8, h: 6, maxTicks: 1200 }).run();
  assert(JSON.stringify(r1.events) !== JSON.stringify(r3.events) || r1.ticks !== r3.ticks,
    '不同布阵应产生不同结果');
}

// ─── 7. Rng 确定性 ───
console.log('[7] Rng 确定性');
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

  const r4 = new Rng(1);
  let allInRange = true;
  for (let i = 0; i < 1000; i++) { const v = r4.next(); if (v < 0 || v >= 1) { allInRange = false; break; } }
  assert(allInRange, 'Rng.next() 应全部在 [0,1) 范围内');
}

// ─── 8. 超时判平局 ───
console.log('[8] 超时判平局');
{
  const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
    ({ cfg: cfg.getUnit(cfgId), side, x, y });
  const placements: Placement[] = [
    P('warrior', 0, 0, 0),
    P('warrior', 1, 7, 5),
  ];
  const r = new BattleSim(cfg, placements, { seed: 1, w: 8, h: 6, maxTicks: 5 }).run();
  assert(r.winner === -1, `5 tick 超时应判平局(-1)，得 ${r.winner}`);
}

console.log(`\n=== 结果：${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
