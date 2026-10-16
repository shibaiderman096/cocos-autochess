import { mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ConfigManager } from '../assets/scripts/core/ConfigManager';
import { loadRunInputs } from './run-simulation';
import { buildCalibrationCases, CALIBRATION_VERSION } from './power-calibration/fixtures';
import type { CalibrationMode } from './power-calibration/fixtures';
import { sampleCase, provenance, canonical, sha256 } from './power-calibration/sampling';
import { aggregateCase, fitPowerModel, finalizeModelHash } from './power-calibration/fitting';
import type { CaseAggregate } from './power-calibration/fitting';
import { analyzeModel, evaluateModel, calibrationMarkdown } from './power-calibration/report';

export interface CalibrationOptions {
  mode:CalibrationMode; seedStart:number; seedCount:number; output:string; cache?:string; modelOutput?:string; plan?:boolean;
}
function safePath(file:string,root:string):string {
  const target=resolve(root,file);let parent=existsSync(target)?target:dirname(target);
  while(!existsSync(parent)){const next=dirname(parent);if(next===parent)throw new Error('Cannot resolve output path');parent=next;}
  const actual=resolve(realpathSync(parent),relative(parent,target)),lower=actual.toLowerCase();
  if(!lower.startsWith(root.toLowerCase()+sep))throw new Error('Calibration outputs must stay inside the project');
  for(const p of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty/run-session']){
    const protectedRoot=resolve(root,p).toLowerCase();if(lower===protectedRoot||lower.startsWith(protectedRoot+sep))throw new Error('P0/P1-A evidence is read-only');
  }
  return target;
}
export function runCalibration(options:CalibrationOptions,root=resolve(__dirname,'..')):any {
  if(!['mirror','unit','star','equipment','team','full'].includes(options.mode))throw new Error('Unknown calibration mode');
  if(!Number.isInteger(options.seedStart)||options.seedStart<0||options.seedStart>0xffffffff||!Number.isInteger(options.seedCount)||options.seedCount<15||options.seedStart+options.seedCount-1>0xffffffff)throw new Error('Calibration requires at least 15 distinct uint32 seeds');
  if(options.modelOutput&&options.mode!=='full')throw new Error('Only a full calibration can export a runtime model');
  const inputs=loadRunInputs(root),cases=buildCalibrationCases(inputs.units,inputs.equipment.map(e=>e.id),options.mode);
  const trainCount=Math.floor(options.seedCount*.8);
  const counts=Object.fromEntries(['mirror','unit','star','single','combo','team'].map(k=>[k,cases.filter(c=>c.category===k).length]));
  const experiment={version:CALIBRATION_VERSION,mode:options.mode,seedStart:options.seedStart,seedCount:options.seedCount,
    trainSeeds:[options.seedStart,options.seedStart+trainCount-1],validationSeeds:[options.seedStart+trainCount,options.seedStart+options.seedCount-1],
    caseCount:cases.length,counts,orientationsPerSeed:4,distanceAssignment:'offset modulo 3; all four side/ID orientations share the assigned distance',
    logicalBattles:cases.length*options.seedCount*4,trainingBattles:cases.length*trainCount*4,validationBattles:cases.length*(options.seedCount-trainCount)*4};
  console.log(JSON.stringify({plan:experiment}));if(options.plan)return {experiment};
  const output=safePath(options.output,root),cache=options.cache?safePath(options.cache,root):undefined;
  const modelOutput=options.modelOutput?safePath(options.modelOutput,root):undefined;
  mkdirSync(output,{recursive:true});
  const prov=provenance(inputs,root),cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
  const t0=performance.now(),aggregates:CaseAggregate[]=[];
  const perf={actualBattleSimCalls:0,cacheHits:0,cacheCorruptions:0,elapsedSeconds:0,byMode:[] as any[]};
  for(const category of ['mirror','unit','star','single','combo','team']){
    const group=cases.filter(c=>c.category===category);let actual=0,cached=0;
    for(let i=0;i<group.length;i++){
      const result=sampleCase(cfg,group[i],prov,options.seedStart,options.seedCount,cache);
      actual+=result.actual;cached+=result.cached;perf.cacheCorruptions+=result.corruptions;
      aggregates.push(aggregateCase(result.data,trainCount));
      if((i+1)%25===0||i===group.length-1)console.log(`${category} ${i+1}/${group.length}: new=${actual} cached=${cached}`);
    }
    perf.actualBattleSimCalls+=actual;perf.cacheHits+=cached;
    perf.byMode.push({category,cases:group.length,logicalBattles:group.length*options.seedCount*4,actual,cached});
  }
  const write=(file:string,data:unknown)=>writeFileSync(resolve(output,file),JSON.stringify(data,null,2)+'\n','utf8');
  write('provenance.json',{...prov,experiment,seedPartition:'All orientations of one matchup+seed belong to the same partition; fitting never sees held-out seeds.'});
  write('observations.json',aggregates);
  let modelHash:string|null=null;
  if(options.mode==='full'){
    const fit=fitPowerModel(aggregates,inputs,prov);
    const validation=evaluateModel(fit.model,aggregates),analysis=analyzeModel(fit.model,aggregates,inputs);
    fit.model.applicability.teamValidationMae=validation.team.mae;
    fit.model.applicability.unitValidationMae=validation.unit.mae;
    if(validation.nearEqualExtreme.length)fit.model.applicability.notes.push(`${validation.nearEqualExtreme.length} held-out near-equal-power teams have extreme scores; individual sums miss composition effects.`);
    if(Object.values(fit.fits).some(f=>!f.converged))fit.model.applicability.notes.push('At least one rating fit reached its finite iteration limit; consult fitting diagnostics.');
    if(fit.slopeFit.boundHit)fit.model.applicability.notes.push('The training win-probability slope reached its configured bound; probability calibration is uncertain outside the tested matchup distribution.');
    finalizeModelHash(fit.model,experiment);modelHash=fit.model.calibrationHash;
    write('enemy-power.json',fit.model);write('validation.json',validation);write('analysis.json',analysis);
    write('fit.json',{variants:fit.variantCount,fits:fit.fits,slopeFit:fit.slopeFit});
    writeFileSync(resolve(output,'REPORT.md'),calibrationMarkdown(fit.model,fit,analysis,validation,experiment),'utf8');
    if(modelOutput){mkdirSync(dirname(modelOutput),{recursive:true});writeFileSync(modelOutput,JSON.stringify(fit.model,null,2)+'\n','utf8');}
    console.log(JSON.stringify({modelHash,variants:fit.variantCount,unitValidation:validation.unit,teamValidation:validation.team,mirrorMaxBias:analysis.mirror.maxSideBias}));
  }else{
    const rows=aggregates.map(d=>({id:d.fixture.id,category:d.fixture.category,a:d.fixture.a,b:d.fixture.b,train:d.train,validation:d.validation}));
    write('mode-summary.json',{note:'Partial mode: no runtime model is exported; use full for a complete connected calibration.',rows});
  }
  perf.elapsedSeconds=(performance.now()-t0)/1000;write('performance.json',perf);
  const deterministic=['provenance.json','observations.json',...(options.mode==='full'?['enemy-power.json','validation.json','analysis.json','fit.json','REPORT.md']:['mode-summary.json'])];
  // Performance is intentionally excluded: cache hit counts and wall clock are execution-specific.
  const outputHashes=Object.fromEntries(deterministic.map(file=>[file,sha256(require('node:fs').readFileSync(resolve(output,file)))]));
  write('output-hashes.json',outputHashes);
  console.log(JSON.stringify({output,modelHash,performance:perf,outputHashes}));return {experiment,outputHashes,performance:perf,modelHash};
}
function parse(args:string[]):CalibrationOptions {
  const options:CalibrationOptions={mode:'full',seedStart:1,seedCount:20,output:'docs/p1-enemy-difficulty/power-calibration/latest',cache:'temp/power-calibration-cache'};
  const seen=new Set<string>();
  for(let i=0;i<args.length;i++){
    let flag=args[i];if(flag==='--seeds')flag='--seed-count';
    if(seen.has(flag))throw new Error(`Repeated option ${flag}`);seen.add(flag);
    if(flag==='--no-cache'){options.cache=undefined;continue;}if(flag==='--plan'){options.plan=true;continue;}
    if(!['--mode','--seed-start','--seed-count','--output','--cache','--model-output'].includes(flag))throw new Error(`Unknown option ${flag}`);
    const value=args[++i];if(!value||value.startsWith('--'))throw new Error(`Missing value for ${flag}`);
    if(flag==='--mode')options.mode=value as CalibrationMode;
    if(flag==='--output')options.output=value;if(flag==='--cache')options.cache=value;if(flag==='--model-output')options.modelOutput=value;
    if(flag==='--seed-start'||flag==='--seed-count'){if(!/^\d+$/.test(value))throw new Error(`Invalid integer for ${flag}`);options[flag==='--seed-start'?'seedStart':'seedCount']=Number(value);}
  }
  return options;
}
if(require.main===module){try{runCalibration(parse(process.argv.slice(2)));}catch(error){console.error(error instanceof Error?error.stack:String(error));process.exitCode=1;}}
