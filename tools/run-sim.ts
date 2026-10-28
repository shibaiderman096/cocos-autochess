import { mkdirSync, realpathSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { createErrorReport, loadRunInputs, runSimulation } from './run-simulation';
import type { SimulationOptions } from './run-simulation';
import type { RunSimulationReport } from '../assets/scripts/core/RunSessionTypes';

function parse(args: string[]): { options: SimulationOptions; json?: string; help?: boolean } {
  const result: { options: SimulationOptions; json?: string; help?: boolean } = { options: { runSeed: 1 } };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') { result.help = true; continue; }
    if (!['--seed', '--max-stage', '--stages', '--max-waves', '--json','--enemy-mode','--formation','--equipment-policy','--bot'].includes(flag) || seen.has(flag)) throw new Error(`Unknown or repeated option: ${flag}`);
    seen.add(flag);
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--json') { result.json = value; continue; }
    if(flag==='--bot'){
      if(!['minimal','weak','medium','strong'].includes(value))throw new Error('Invalid --bot');
      result.options.bot=value as SimulationOptions['bot'];continue;
    }
    if(flag==='--equipment-policy'){
      if(!['none','auto'].includes(value))throw new Error('Invalid --equipment-policy');
      if(value==='none')result.options.equipmentPolicy=false;continue;
    }
    if(flag==='--formation'){
      if(!['auto','L0','L1','L2','L3'].includes(value))throw new Error('Invalid --formation');
      result.options.formation=value as SimulationOptions['formation'];continue;
    }
    if (flag === '--enemy-mode') {
      if(value!=='budget-v1')throw new Error('Invalid --enemy-mode');
      result.options.enemyGenerationMode=value;continue;
    }
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid integer for ${flag}`);
    const n = Number(value);
    if (flag === '--seed') result.options.runSeed = n;
    if (flag === '--max-stage') result.options.maxStage = n;
    if (flag === '--stages') result.options.stageCount = n;
    if (flag === '--max-waves') result.options.maxWaves = n;
  }
  return result;
}
function print(report: RunSimulationReport): void {
  console.log(`Run Seed: ${report.runSeed} | Rules version: ${report.rulesVersion} | Bot: ${report.bot}`);
  console.log(`Campaign stages: ${report.stageCount} | Max stage: ${report.maxStage}`);
  console.log(`Enemy mode: ${report.enemyGenerationMode} | Power model: ${report.powerModelVersion??'uninitialized'}`);
  for (const w of report.waves) {
    console.log(`Wave ${w.waveId} | Stage ${w.stage} | Round ${w.round}`);
    console.log(`  Player level ${w.level}, XP ${w.xp}, Gold ${w.goldAfter}, HP ${w.hpAfter} (was ${w.hpBefore})`);
    console.log(`  Board: ${w.playerUnits.map(u => `${u.unitId}*${u.star}@${u.x},${u.y}`).join(' ')} | Bench: ${w.benchUnits.map(u => `${u.unitId}*${u.star}`).join(' ') || '(empty)'}`);
    console.log(`  Enemy count: ${w.enemies.length} | Battle seed: ${w.battle.seed} | Battle result: ${w.battle.result} | Duration: ${w.battle.duration}s | Damage taken: ${w.battle.damageTaken}`);
    if(w.enemyBudget)console.log(`  ${w.waveKind}: requested ${w.requestedBudget}, effective ${w.effectiveBudget}, actual ${w.actualBudget}, deviation ${w.deviationPct}% | ${w.saturationReason??'unsaturated'}`);
    console.log(`  Formation ${w.formationLevel} strength ${w.formationStrength} | spacing ${w.spacingViolations} | template ${w.templateId??'none'} used=${w.templateUsed}`);
    if(w.enemyEquipmentPolicy)console.log(`  Equipment: enemy ${w.enemyEquipmentCount}/${w.enemyEquipmentTarget} target, model contribution ${w.equipmentPowerContribution}; player ${w.playerEquipmentCount}; reward ${w.rewardId??'none'} choice ${w.rewardChoice??'none'}`);
    const income = w.reward.breakdown;
    console.log(`  Income: victory ${income.winBonus}, interest ${income.interest}, streak ${income.streakBonus}, extra ${income.extraIncome ?? 0} | Total ${income.total}`);
  }
  console.log(`End state: ${report.result} | Waves: ${report.waves.length} | Game result: ${report.gameResult ?? 'pending'}`);
  if (report.error) console.error(`Simulation error: ${report.error}`);
}
function saveReport(file: string, report: RunSimulationReport): void {
  const target = resolve(file);
  // Resolve existing ancestors too, so a symlink cannot redirect output into the protected P0 tree.
  let ancestor = dirname(target);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = existsSync(target) ? realpathSync(target) : resolve(realpathSync(ancestor), relative(ancestor, target));
  for(const dir of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty/run-session','docs/p1-enemy-difficulty/power-calibration','docs/p1-enemy-difficulty/budget-generator','docs/p2-enemy-formation','docs/p3-equipment']){
    const protectedRoot = resolve(__dirname,'..',dir).toLowerCase();
    if(actual.toLowerCase()===protectedRoot||actual.toLowerCase().startsWith(protectedRoot+sep))throw new Error('P0 evidence is read-only; all P1, P2 and P3 evidence is protected; choose temp/ or p4-balance/');
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

let code = 0;
try {
  const parsed = parse(process.argv.slice(2));
  if (parsed.help) {
    console.log('npm.cmd run run-sim -- --seed 1 [--bot minimal|weak|medium|strong] [--stages 99] [--enemy-mode budget-v1] [--formation auto|L0|L1|L2|L3] [--equipment-policy auto|none] [--max-stage 6] [--max-waves 20] [--json temp/run-1.json]');
    console.log('MinimalBaselineBot validates infrastructure only. Default campaign: 99 stages; no wall-clock waiting.');
  } else {
    let report: RunSimulationReport;
    try { report = runSimulation(loadRunInputs(), parsed.options); }
    catch (error) { report = createErrorReport(parsed.options, error); }
    print(report);
    if (parsed.json) saveReport(parsed.json, report);
    if (report.result === 'SIMULATION_ERROR') code = 1;
  }
} catch (error) {
  console.error(`SIMULATION_ERROR: ${error instanceof Error ? error.message : String(error)}`); code = 1;
}
process.exitCode = code;
