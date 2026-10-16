const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/p4r1-bot-qualification/freeze');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(fs.existsSync(path.join(out,'game-before.json')))throw Error('Qualification baseline already captured');
fs.mkdirSync(out,{recursive:true});
const game={},historical={},botSources={};
function scan(dir,target){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=dir+'/'+e.name;if(e.isDirectory())scan(f,target);else target[f]=sha(path.join(root,f));}}
scan('assets/scripts',game);scan('assets/resources/config',game);
for(const d of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty','docs/p2-enemy-formation','docs/p3-equipment','docs/p4-balance'])scan(d,historical);
for(const name of fs.readdirSync(path.join(root,'tools/bots')).sort())botSources[name]=fs.readFileSync(path.join(root,'tools/bots',name),'utf8');
const old=require('../../docs/p4-balance/baseline/frozen.json');
for(const [name,value]of Object.entries(old.configs)){const file='assets/resources/config/'+name+'.json';if(sha(path.join(root,file))!==require('../../docs/p4-balance/accepted/decision.json').retainedConfigHashes[file])throw Error('Production config drift: '+file);}
const used=[];function seeds(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())seeds(f);else if(e.name==='provenance.json'){const p=JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));if(p.seedRange)used.push({file:f,range:p.seedRange});}}}seeds('docs/p4-balance');
const partitions={historicalOnly:[1,1250],smoke:[1951,2000],development:[2001,2200],qualification:[2201,2700],longTail:[2701,2750],reservedR2:{training:[3001,3500],validation:[4001,4500],holdout:[5001,5250]}};
for(const range of [partitions.smoke,partitions.development,partitions.qualification,partitions.longTail,...Object.values(partitions.reservedR2)])for(const u of used)if(range[0]<=u.range[1]&&range[1]>=u.range[0])throw Error('Seed overlap '+u.file);
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
write('game-before.json',{schema:'p4r1-current-production-v1',hashes:game,priorPricingCorrection:{buy:{4:4,5:5},sell:{4:4,5:5},source:'docs/shop-pricing/README.md'},gameBalanceChangesAllowed:0});
write('historical-before.json',historical);write('v1-bot-sources.json',botSources);write('seed-partitions.json',{partitions,previouslyUsed:used});
write('preflight-settings.json',{file:'settings/v2/packages/information.json',current:sha(path.join(root,'settings/v2/packages/information.json')),historical:require('../../docs/p1-enemy-difficulty/power-calibration/protected-before.json')['settings/v2/packages/information.json']});
console.log(JSON.stringify({gameFiles:Object.keys(game).length,historicalFiles:Object.keys(historical).length,partitions}));
