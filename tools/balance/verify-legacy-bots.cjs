require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const revised=process.argv.includes('--revision-b');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/p4r1-bot-qualification',revised?'revision-b':'','legacy-bot-equality');
const sources=require('../../docs/p4r1-bot-qualification/freeze/v1-bot-sources.json'),configs=JSON.parse(sources['bot-configs.json']);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
if(process.argv[2]==='--child'){
 const legacy=process.argv[3]==='old';
 if(legacy){const ts=require('typescript'),ext=require.extensions['.ts'];require.extensions['.ts']=(m,file)=>{
  const rel=path.relative(root,file).replace(/\\/g,'/'),source=rel.startsWith('tools/bots/')?sources[path.basename(file)]:undefined;
  if(source!==undefined)m._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);else ext(m,file);
 };}
 const {loadRunInputs,runSimulation}=require('../run-simulation.ts'),rows=[];
 for(const bot of ['weak','strong'])for(const seed of revised?[5799,5800]:[2199,2200]){
  const r=runSimulation(loadRunInputs(),{runSeed:seed,stageCount:12,bot,botConfig:configs[bot],audit:true});if(r.error)throw Error(r.error);
  rows.push({bot,seed,version:r.botVersion,fullReportSha256:sha(JSON.stringify(r)),decisionsSha256:sha(JSON.stringify(r.waves.map(w=>w.actions))),waves:r.waves.length});
 }
 process.stdout.write(JSON.stringify(rows));
}else{
 if(fs.existsSync(dir))throw Error('Legacy comparison already exists');fs.mkdirSync(dir,{recursive:true});const rows={};
 for(const mode of ['old','current']){const r=spawnSync(process.execPath,[__filename,'--child',mode,...(revised?['--revision-b']:[])],{cwd:root,encoding:'utf8',timeout:120000});if(r.error||r.status!==0)throw Error(r.error??r.stderr);rows[mode]=JSON.parse(r.stdout);}
 if(JSON.stringify(rows.old)!==JSON.stringify(rows.current))throw Error('Weak/Strong behavior changed');
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({unchanged:true,comparison:'original captured strategy source vs current source, same current production inputs and separately corrected prices',...rows},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(rows));
}
