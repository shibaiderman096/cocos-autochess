/**
 * 冒烟测试（Node 直跑，不依赖 cc）：
 *   node .test-build/tests/smoke.js  （由 npm run smoke 编译并运行）
 * 验证：完整战斗分出胜负、事件序列结构、同种子结果一致。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigManager, UnitConfigData } from '../assets/scripts/core/ConfigManager';
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
const deaths = r1.events.filter(e => e.t === 'death');
console.log(`死亡数=${deaths.length}`);
const casts = r1.events.filter(e => e.t === 'cast');
console.log(`施法数=${casts.length}`);
const moves = r1.events.filter(e => e.t === 'move');
console.log(`移动数=${moves.length}`);
const attacks = r1.events.filter(e => e.t === 'attack');
console.log(`攻击数=${attacks.length}`);

// 多种子统计：M1 阶段逻辑是确定性的（无随机技能），不同种子应得到同样的战斗结果（可复现性检查的反面验证）
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
