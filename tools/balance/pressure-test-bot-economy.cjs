require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path');
const {loadBalanceBundle}=require('../balance-sim.ts'),{ConfigManager}=require('../../assets/scripts/core/ConfigManager.ts'),{RunSession}=require('../../assets/scripts/core/RunSession.ts');
const {createBot}=require('../bots/factory.ts'),{assertLegalSession}=require('../bots/legality.ts');
const {publicEconomySnapshot}=require('./bot-economy-metrics.ts');
const fragile=process.argv.includes('--fragile-line'),revised=process.argv.includes('--revision-b'),late=process.argv.includes('--late-critical');
if(process.argv.slice(2).some(a=>!['--fragile-line','--revision-b','--late-critical'].includes(a)))throw Error('Unknown stress scenario');
const root=path.resolve(__dirname,'../..'),phase=path.join(root,'docs/p4r1-bot-qualification',revised?'revision-b':''),file=path.join(phase,late?'pressure-fixtures-late-critical-50.json':fragile?'pressure-fixtures-fragile-50.json':'pressure-fixtures-50.json');
if(fs.existsSync(file))throw Error('Pressure evidence already exists');
const freezeFile=path.join(phase,'freeze/bots-v2.json');
const bundle=loadBalanceBundle({root,...(fs.existsSync(freezeFile)?{config:freezeFile}:{})}),old=JSON.parse(require('../../docs/p4r1-bot-qualification/freeze/v1-bot-sources.json')['bot-configs.json']).medium;
const rows=[];
const seedStart=revised?late?5681:5601:fragile?2051:2001;
for(let seed=seedStart;seed<seedStart+50;seed++)for(const version of ['v1','v2']){
 const i=bundle.inputs,cfg=new ConfigManager();cfg.setUnits(i.units);cfg.setSkills(i.skills);cfg.setBattle(i.battle);cfg.setEquipment(i.equipment);
 const fresh=new RunSession(cfg,i.run,i.waves,{runSeed:seed,stageCount:12,...bundle.extra}),save=fresh.snapshot();
 save.round={...save.round,phase:'prepare',waveIndex:late?97:37,health:late?4:8,result:null,lastSettlement:null};save.gold=300;save.level=7;save.exp=0;save.equipmentReserve=[];
 const ids=fragile?['scout','archer','mage','sorcerer','shaman','young_sasuke','itachi','archer']:['warrior','archer','guardian','scout','shaman','mage','sorcerer','iron_golem'];
 save.owned=ids.map((unitId,n)=>({uid:n+1,unitId,star:n===7?2:1,location:n===7?'bench':'board',x:n===7?-1:n,y:n===7?0:1,equipment:[]}));save.nextOwnedUid=9;
 const s=new RunSession(cfg,i.run,i.waves,{runSeed:seed,stageCount:12,save,...bundle.extra});
 if(s.state.stage!==(late?12:6)||s.botPort().observe().waveKind!=='boss')throw Error('Fixture must use the real stage Boss');
 const config=version==='v1'?old:bundle.bots.medium,bot=createBot('medium',config),port=s.botPort();
 const actions=bot.prepare(port);if(actions.some(a=>!a.result.ok))throw Error('Illegal fixture action');assertLegalSession(s);
 const atBattle=publicEconomySnapshot(port.observe(),config),sim=s.startBattle();if(!sim)throw Error('Cannot start fixture');sim.run();const result=s.settleBattle();
 rows.push({seed,version,initial:{hp:late?4:8,gold:300,level:7,population:7,bench:1,stage:late?12:6,wave:'boss'},death:s.state.playerHp===0,hpAfter:s.state.playerHp,
   goldAtBattle:atBattle.gold,levelAtBattle:atBattle.level,population:atBattle.population,benchPowerProxy:atBattle.benchPowerProxy,
   spent:300-atBattle.gold,diagnostics:bot.diagnostics??atBattle,actions,result});
}
const summary=Object.fromEntries(['v1','v2'].map(version=>{const a=rows.filter(r=>r.version===version),dead=a.filter(r=>r.death);return[version,{runs:a.length,deaths:dead.length,
 deathGold100Plus:dead.filter(r=>r.goldAtBattle>100).length,meanGoldAtBattle:a.reduce((n,r)=>n+r.goldAtBattle,0)/a.length,
 meanLevel:a.reduce((n,r)=>n+r.levelAtBattle,0)/a.length,meanPopulation:a.reduce((n,r)=>n+r.population,0)/a.length,meanSpent:a.reduce((n,r)=>n+r.spent,0)/a.length}];}));
fs.writeFileSync(file,JSON.stringify({schema:'controlled-real-action-stress-v1',scenario:late?'late-critical-boss':fragile?'fragile-line-without-tank':'mixed-line-with-two-star-tank',classification:'Controlled bot test, NOT a natural campaign or qualification completion estimate',
 config:'Unchanged production rules and real stage Boss, identical initial saved state for v1/v2; no game parameters changed',seeds:[seedStart,seedStart+49],summary,rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
