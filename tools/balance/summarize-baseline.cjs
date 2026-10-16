const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/p4-balance/baseline');
const frozen=JSON.parse(fs.readFileSync(path.join(base,'frozen.json'),'utf8'));
for(const [name,value]of Object.entries(frozen.configs))assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config',name+'.json'),'utf8')),value,'Baseline must precede any numerical changes: '+name);
const a=JSON.parse(fs.readFileSync(path.join(base,'runs-500/aggregate.json'),'utf8'));
for(const id of ['weak','medium','strong']){assert.equal(a[id].runs,500);assert.equal(a[id].errors.length,0);assert.equal(a[id].failedActions,0);}
const rate=p=>p.rate===null?'NA':`${(p.rate*100).toFixed(1)}% [${(p.low*100).toFixed(1)}, ${(p.high*100).toFixed(1)}]`,fmt=n=>n===null?'NA':Number(n).toFixed(2);
let text='# 未调参P4 Baseline\n\n三档机器人各500个seed（1..500），12阶段真实campaign。所有游戏配置与P4开始时冻结值一致。此批为Training域baseline，不能冒充最终Validation/Holdout。\n\n';
text+='每档500局覆盖Stage1..10；Stage3/6共同历史与99阶段campaign前缀一致，另有99阶段长局诊断。完成定义为该阶段末波结束仍有HP；Boss击败率单独统计。\n\n';
text+='| Bot | Stage3累计通过率 / Wilson95% | Stage6累计通过率 / Wilson95% | Stage12累计通过率 | 非法/失败动作 |\n| --- | --- | --- | --- | --- |\n';
for(const id of ['weak','medium','strong'])text+=`| ${id} | ${rate(a[id].stages[2].cumulativeCompletion)} | ${rate(a[id].stages[5].cumulativeCompletion)} | ${rate(a[id].stages[11].cumulativeCompletion)} | ${a[id].failedActions} |\n`;
for(const id of ['weak','medium','strong']){
 text+=`\n## ${id}\n\n| Stage | 进入 | 完成 | 条件完成率 | 累计完成率 | 入阶段HP | 金币（购物后均值） | 等级 | 人口 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
 for(const s of a[id].stages.slice(0,10))text+=`| ${s.stage} | ${s.entered} | ${s.completed} | ${rate(s.conditionalCompletion)} | ${rate(s.cumulativeCompletion)} | ${fmt(s.averageEntryHp)} | ${fmt(s.averageGold)} | ${fmt(s.averageLevel)} | ${fmt(s.averagePopulation)} |\n`;
 text+=`\n升星（仅达成者分位，未达成另外计数）：${JSON.stringify(a[id].growth)}\n`;
}
text+='\n## 初步结论与边界\n\nStage3与Stage6显著高于85%/50%的目标；保留该事实，不通过削弱机器人或隐藏失败来达标。当前Stage3只解锁1费1星，且原始预算长期低于人口地板。提高growth等旋钮可能被原可行上限截断。下一步先用模型/生成器确认这一约束，再定义有边界的静态预算/解锁参数实验。\n\n';
text+='原始逐局JSONL、逐波CSV、阶段CSV及Wilson区间在runs-500各机器人目录。无未来信息、免费资源、绕过卡池或动态橡皮筋。P1-B模型、单位、技能、装备效果、经济/卡池公式仍未修改。\n';
const file=path.join(base,'README.md');if(fs.existsSync(file))throw Error('Baseline README is immutable');fs.writeFileSync(file,text);
const hashes=Object.fromEntries(Object.keys(frozen.configs).map(name=>{const p='assets/resources/config/'+name+'.json';return [p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')];}));
fs.writeFileSync(path.join(base,'baseline-completed.json'),JSON.stringify({runs:1500,bots:['weak','medium','strong'],trainingSeeds:[1,500],campaignStages:12,configsUnchanged:true,configHashes:hashes,baselineReport:'baseline/README.md'},null,2)+'\n');
console.log('Untuned baseline complete and immutable:',file);
