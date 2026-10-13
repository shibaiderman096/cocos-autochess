/**
 * 无渲染批量模拟器（M1 第 12 项）。
 * 运行：npm run batch -- [N] [seed]
 * 输出：胜率、平均时长、平均事件数。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigManager, UnitConfigData } from '../assets/scripts/core/ConfigManager';
import { BattleSim, Placement } from '../assets/scripts/battle/BattleSim';

const root = resolve(__dirname, '..');
const units = JSON.parse(readFileSync(resolve(root, 'assets/resources/config/units.json'), 'utf8')) as UnitConfigData[];
const skills = JSON.parse(readFileSync(resolve(root, 'assets/resources/config/skills.json'), 'utf8'));

const cfg = new ConfigManager();
cfg.setUnits(units);
cfg.setSkills(skills);
cfg.setBattle({ maxTicks: 1200, tickMs: 50 });

const N = Number(process.argv[2] ?? 1000);
const baseSeed = Number(process.argv[3] ?? 1);

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

let winOwn = 0, winEnemy = 0, draw = 0;
let totalTicks = 0, totalEvents = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const sim = new BattleSim(cfg, placements, { seed: baseSeed + i, w: cfg.battle.boardWidth, h: cfg.battle.boardHeight, maxTicks: cfg.battle.maxTicks });
  const r = sim.run();
  if (r.winner === 0) winOwn++;
  else if (r.winner === 1) winEnemy++;
  else draw++;
  totalTicks += r.ticks;
  totalEvents += r.events.length;
}

const avgSecs = (totalTicks / N) * 0.05;
console.log('=== 批量模拟结果 ===');
console.log(`场次:        ${N}`);
console.log(`己方胜:      ${winOwn} (${((winOwn / N) * 100).toFixed(1)}%)`);
console.log(`敌方胜:      ${winEnemy} (${((winEnemy / N) * 100).toFixed(1)}%)`);
console.log(`平局:        ${draw} (${((draw / N) * 100).toFixed(1)}%)`);
console.log(`平均时长:    ${avgSecs.toFixed(1)}s`);
console.log(`平均事件数:  ${(totalEvents / N).toFixed(0)}`);
console.log(`模拟耗时:    ${Date.now() - t0}ms`);
