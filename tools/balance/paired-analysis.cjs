const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
if(process.argv.length!==6)throw Error('Expected: paired-analysis.cjs report-A report-B bot output.json');
const [a,b,bot,file]=process.argv.slice(2),load=dir=>fs.readFileSync(path.resolve(root,dir,bot,'per-run.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const aa=load(a),bb=load(b),map=new Map(bb.map(r=>[r.seed,r])),pairs=aa.filter(r=>map.has(r.seed)).map(r=>[r,map.get(r.seed)]);
const rounds=stage=>stage===1?3:Math.min(10,5+stage-2),complete=(r,stage)=>r.waves.some(w=>w.stage===stage&&w.round===rounds(stage)&&w.hpAfter>0);
const stages=[3,6,10,12].map(stage=>{
 const outcomes=pairs.map(([x,y])=>[Number(complete(x,stage)),Number(complete(y,stage))]),n=outcomes.length,mean=outcomes.reduce((v,[x,y])=>v+y-x,0)/n;
 const variance=n>1?outcomes.reduce((v,[x,y])=>v+(y-x-mean)**2,0)/(n-1):0,se=Math.sqrt(variance/n);
 return {stage,seeds:n,onlyA:outcomes.filter(([x,y])=>x&&!y).length,onlyB:outcomes.filter(([x,y])=>!x&&y).length,both:outcomes.filter(([x,y])=>x&&y).length,neither:outcomes.filter(([x,y])=>!x&&!y).length,deltaBMinusA:mean,pairedNormal95:[mean-1.95996398454*se,mean+1.95996398454*se]};
});
const waveIds=[...new Set(pairs.flatMap(([x,y])=>[...x.waves,...y.waves].map(w=>w.waveId)))].sort((x,y)=>x-y),waves=[];
for(const id of waveIds){const common=pairs.map(([x,y])=>[x.waves.find(w=>w.waveId===id),y.waves.find(w=>w.waveId===id)]).filter(([x,y])=>x&&y);
 if(!common.length)continue;waves.push({waveId:id,commonEncounters:common.length,winDeltaBMinusA:common.reduce((n,[x,y])=>n+Number(y.winner===0)-Number(x.winner===0),0)/common.length,hpLossDeltaBMinusA:common.reduce((n,[x,y])=>n+y.hpLoss-x.hpLoss,0)/common.length});
}
const result={a,b,bot,pairedSeeds:pairs.length,stages,waves,note:'Same seed and frozen bot version; survival changes affect later exposure. Wave differences use common encounters only. Formation-aware bots may react to the changed current preview; this is a gameplay policy comparison, not a fixed-placement causal isolation.'};
const out=path.resolve(root,file);if(!out.startsWith(path.join(root,'docs/p4-balance')+path.sep)||fs.existsSync(out))throw Error('Use a new P4 evidence file');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pairedSeeds:pairs.length,stages},null,2));
