/**
 * 冒烟 + 驱动器测试（Node 直跑，不依赖 cc）：
 *   npm run smoke   → tsc 编译 + node .test-build/tests/smoke.js
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigManager, UnitConfigData } from '../assets/scripts/core/ConfigManager';
import { TickDriver } from '../assets/scripts/core/TickDriver';
import { BattleSim, Placement } from '../assets/scripts/battle/BattleSim';

const cfg = new ConfigManager();
cfg.setUnits(JSON.parse(readFileSync(resolve(__dirname, '../assets/resources/config/units.json'), 'utf8')) as UnitConfigData[]);
cfg.setSkills(JSON.parse(readFileSync(resolve(__dirname, '../assets/resources/config/skills.json'), 'utf8')));
cfg.setBattle({ boardWidth: 8, boardHeight: 8, maxTicks: 1200, tickMs: 50 });

const placements: Placement[] = [
  { cfg: cfg.getUnit('warrior'), side: 0, x: 3, y: 3 },
  { cfg: cfg.getUnit('archer'),  side: 0, x: 4, y: 1 },
  { cfg: cfg.getUnit('mage'),    side: 0, x: 2, y: 0 },
  { cfg: cfg.getUnit('warrior'), side: 1, x: 3, y: 6 },
  { cfg: cfg.getUnit('archer'),  side: 1, x: 4, y: 4 },
  { cfg: cfg.getUnit('mage'),    side: 1, x: 2, y: 7 },
];

function runOnce(seed: number) {
  const sim = new BattleSim(cfg, placements, { seed, w: 8, h: 8, maxTicks: 1200 });
  return sim.run();
}

const r1 = runOnce(42);
const r2 = runOnce(42);

console.log('--- 战斗结果 ---');
console.log(`winner=${r1.winner} ticks=${r1.ticks} survivors=${r1.survivors.length}`);
console.log(`事件数=${r1.events.length}`);

console.log('--- 断言 ---');
assert(r1.winner === 0 || r1.winner === 1, 'must have a winner');
assert(JSON.stringify(r1.events) === JSON.stringify(r2.events), 'same seed => same events');
assert(r1.events[0].t === 'battle_start', 'first event is battle_start');
assert(r1.events[r1.events.length - 1].t === 'end', 'last event is end');
console.log(`死亡数=${r1.events.filter(e => e.t === 'death').length}`);
console.log(`施法数=${r1.events.filter(e => e.t === 'cast').length}`);
console.log(`移动数=${r1.events.filter(e => e.t === 'move').length}`);
console.log(`攻击数=${r1.events.filter(e => e.t === 'attack').length}`);

// TickDriver：模拟 1x / 2x / 3x 推进固定 tick 数
function simulateTicks(speed: number, targetTicks: number, tickMs = 50): number {
  let ticks = 0;
  const driver = new TickDriver(tickMs, () => { ticks++; });
  const frameDt = 1 / 60; // 60fps
  let elapsed = 0;
  while (ticks < targetTicks && elapsed < 120) {
    driver.advance(frameDt * speed);
    elapsed += frameDt;
  }
  return elapsed;
}
const t1 = simulateTicks(1, 100);
const t2 = simulateTicks(2, 100);
const t3 = simulateTicks(3, 100);
console.log(`TickDriver 到 100 tick 所需秒数: 1x=${t1.toFixed(2)} 2x=${t2.toFixed(2)} 3x=${t3.toFixed(2)}`);
assert(Math.abs(t1 - 5) < 0.5, `1x should take ~5s, got ${t1.toFixed(2)}`);
assert(Math.abs(t2 - 2.5) < 0.4, `2x should take ~2.5s, got ${t2.toFixed(2)}`);
assert(Math.abs(t3 - 1.67) < 0.4, `3x should take ~1.67s, got ${t3.toFixed(2)}`);

const winners = new Set<number>();
for (let seed = 1; seed <= 20; seed++) winners.add(runOnce(seed).winner);
console.log(`20 种子胜者集合=${Array.from(winners).join(',')}（M1 当前无随机性，应恒定）`);
assert(winners.size === 1, 'deterministic logic => one winner across seeds');

console.log('\nOK smoke test passed');
process.exit(0);

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}
