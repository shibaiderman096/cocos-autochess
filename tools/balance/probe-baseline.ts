import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildRunWaves} from '../../assets/scripts/core/RunSetup';
const root=process.cwd(),frozen=JSON.parse(readFileSync(resolve(root,'docs/p4-balance/baseline/frozen.json'),'utf8'));
if(!existsSync(resolve(root,'docs/p4-balance/baseline/baseline-completed.json')))throw Error('Complete untuned baseline first');
const c=frozen.configs,rows=[];
for(const growthRate of [1.02,1.04,1.06]){
 const difficulty={...c['enemy-difficulty'],growthRate};
 const waves=buildRunWaves(6,c.run,c.waves,c.units,{mode:'budget-v1',runSeed:12345,difficulty,power:c['enemy-power'],equipmentPolicy:c['equipment-policy'],equipmentRoles:c['enemy-roles']});
 rows.push({growthRate,stage3:waves.filter(w=>w.stage===3).map(w=>({round:w.round,requested:w.budget!.requestedBudget,effective:w.budget!.effectiveBudget,maxFeasible:w.budget!.maxFeasibleBudget,
   stars:w.enemies.map(e=>e.star),costs:w.enemies.map(e=>c.units.find((u:any)=>u.id===e.unitId).cost)})),stage6:waves.filter(w=>w.stage===6).map(w=>({round:w.round,effective:w.budget!.effectiveBudget}))});
}
const file=resolve(root,'docs/p4-balance/baseline/growth-cap-probe.json');if(existsSync(file))throw Error('Probe already exists');
writeFileSync(file,JSON.stringify({rows,note:'Pure generator sensitivity probe after full untuned baseline; original production config remains unchanged. Early requested power is clipped by population/one-cost one-star feasible envelopes. Kind multipliers are algebraically canceled by existing pacing, so they are not selected as meaningful independent tuning knobs.'},null,2)+'\n');
console.log(rows.map(r=>({growth:r.growthRate,stage3:r.stage3.map(w=>w.effective),max:r.stage3.map(w=>w.maxFeasible)})));
