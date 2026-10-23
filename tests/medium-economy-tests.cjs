require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts'),{RunSession}=require('../assets/scripts/core/RunSession.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs,runSimulation}=require('../tools/run-simulation.ts');
const {createBot,loadBotConfigs}=require('../tools/bots/factory.ts'),{economyPlan}=require('../tools/bots/medium-economy.ts');
const {publicEconomySnapshot}=require('../tools/balance/bot-economy-metrics.ts');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const i=loadRunInputs(),extra={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()},c=loadBotConfigs().medium;
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
const configs=()=>{const cfg=new ConfigManager();cfg.setUnits(i.units);cfg.setSkills(i.skills);cfg.setBattle(i.battle);cfg.setEquipment(i.equipment);return cfg;};
function fixture({gold=300,hp=8,level=7,xp=54,bench=true,kind='boss',star=2}={}){
 const s=new RunSession(configs(),i.run,i.waves,{runSeed:2001,stageCount:12,...extra});
 const save=s.snapshot();save.gold=gold;save.level=level;save.exp=xp;save.owned=[];
 const ids=star===3&&level===10?['atlas','blackstar_warlock','voidscar_reaver','oris','seraphiel','eclipse_crossbow','nether_lantern_witch','aurelia','celine','leon']:['bao_zero','seraphiel','leon','phinia','aurelia','saiph','arc_repairer','ghostflame_blade','celine','helion'];
 for(let n=0;n<level+(bench?1:0);n++)save.owned.push({uid:n+1,unitId:ids[n%ids.length],star,location:n<level?'board':'bench',x:n<level?n%7:-1,y:n<level?Math.floor(n/7):0,equipment:[]});
 save.nextOwnedUid=save.owned.length+1;save.round.health=hp;
 const session=new RunSession(configs(),i.run,i.waves,{runSeed:2001,stageCount:12,save,...extra}),base=session.botPort();
 const port={act:a=>base.act(a),observe:()=>{const o=base.observe();o.waveKind=kind;o.state.stage=6;return o;}};
 return {session,port};
}
test('300 gold, low HP, Boss and usable bench triggers real XP spending and population growth',()=>{
 const {session,port}=fixture(),bot=createBot('medium');const before=port.observe();assert.equal(publicEconomySnapshot(before,c).levelUpGold,4);
 const actions=bot.prepare(port);assert.ok(actions.some(a=>a.action.type==='buyExp'&&a.result.ok));assert.ok(session.level.level>=8);
 assert.ok(session.economy.gold<300);assert.ok(actions.every(a=>a.result.ok));assertLegalSession(session);
 assert.ok(bot.diagnostics.policy.rolls<=c.economyV2.stabilizeRolls);
});
test('healthy stable ordinary wave may preserve interest and never rolls merely to reach zero',()=>{
 const {port}=fixture({gold:80,hp:20,level:10,xp:0,bench:false,kind:'normal',star:3}),bot=createBot('medium');
 const p=economyPlan(port.observe(),c);assert.equal(p.mode,'save');assert.equal(p.reserveGold,50);
 const a=bot.prepare(port);assert.equal(a.filter(v=>v.action.type==='refresh').length,0);assert.ok(port.observe().state.gold>=50);
});
test('Boss lowers reserve; critical HP all-in remains finite with minimum gold',()=>{
 const {port}=fixture({gold:300,hp:4}),bot=createBot('medium');const o=port.observe(),p=economyPlan(o,c);
 assert.equal(p.mode,'all_in');assert.equal(p.reserveGold,4);const a=bot.prepare(port);
 assert.ok(a.every(v=>v.result.ok));assert.ok(a.filter(v=>v.action.type==='refresh').length<=c.economyV2.allInRolls);
 assert.ok(a.filter(v=>v.action.type==='buyExp').length<=c.maxXpBuys);assert.ok(port.observe().state.gold>=4);
 const healthy=fixture({hp:20}).port.observe();assert.ok(economyPlan(healthy,c).reserveGold<economyPlan({...healthy,waveKind:'normal'},c).reserveGold);
});
test('population uses candidate value and remaining XP price, with no Stage6 Lv7 lock or empty upgrade',()=>{
 const a=fixture().port.observe();assert.equal(economyPlan(a,c).levelUpAllowed,true);
 const b=fixture({bench:false}).port.observe();assert.equal(economyPlan(b,c).levelUpAllowed,false);
});
test('no purchasable upgrade target means no paid refresh even when relative weakest slot is low',()=>{
 const {port}=fixture({gold:300,hp:8,level:10,xp:0,bench:false,kind:'boss',star:3}),bot=createBot('medium');
 const p=economyPlan(port.observe(),c);assert.equal(p.wantsRoll,false);
 const a=bot.prepare(port);assert.equal(a.filter(v=>v.action.type==='refresh').length,0);
 assert.equal(port.observe().state.gold,300);assert.ok(bot.diagnostics.unusedGoldReason.includes('NO_POLICY_UPGRADE_TARGET'));
});
test('Boss carry pair is bought through real shop before rolling',()=>{
 const {session,port}=fixture({star:1}),save=session.snapshot();
 save.owned.push({uid:99,unitId:'seraphiel',star:1,location:'bench',x:-1,y:1,equipment:[]});save.nextOwnedUid=100;
 save.shop=[{unitId:'seraphiel'},...Array.from({length:4},()=>({unitId:null}))];
 const s=new RunSession(configs(),i.run,i.waves,{runSeed:2001,stageCount:12,save,...extra}),p=s.botPort();
 const publicPort={act:a=>p.act(a),observe:()=>{const o=p.observe();o.waveKind='boss';o.state.stage=6;return o;}};
 const a=createBot('medium').prepare(publicPort),buy=a.findIndex(v=>v.action.type==='buy'),roll=a.findIndex(v=>v.action.type==='refresh');
 assert.ok(buy>=0&&(roll<0||buy<roll));assert.ok(s.owned.all().some(u=>u.unitId==='seraphiel'&&u.star>=2));assertLegalSession(s);
});
test('excess gold promotes development, core readiness distinguishes 1-star carry/tank and diagnostics name limits',()=>{
 const {port}=fixture({gold:300,hp:20,kind:'normal'}),o=port.observe();assert.equal(economyPlan(o,c).mode,'develop');
 for(const u of o.units)u.star=1;
 const p=economyPlan(o,c);assert.equal(p.cores.ready,false);assert.equal(p.wantsRoll,true);assert.equal(p.coreIds.length,2);
 const bot=createBot('medium');bot.prepare(port);assert.ok(bot.diagnostics.unusedGoldReason.length);
});
test('all bots obey future shop/enemy/reward/RNG traps and never use the seed as a strategy input',()=>{
 for(const id of ['weak','medium','strong']){const {port}=fixture(),o=port.observe();
  for(const key of ['futureShop','futureEnemy','futureReward','random','rng'])Object.defineProperty(o,key,{get(){throw Error('future leak '+key);}});
  Object.defineProperty(o.state,'runSeed',{get(){throw Error('seed leak');}});
  const p={act:a=>port.act(a),observe:()=>{const live=port.observe();for(const key of ['futureShop','futureEnemy','futureReward','random','rng'])Object.defineProperty(live,key,{get(){throw Error('future leak');}});Object.defineProperty(live.state,'runSeed',{get(){throw Error('seed leak');}});return live;}};
  assert.ok(createBot(id).prepare(p).every(a=>a.result.ok));
 }
 for(const file of ['medium-v2.ts','medium-economy.ts'])assert.ok(!/BattleSim|EnemyPowerModel|estimateTeamPower|Math\.random|Date\.now/.test(fs.readFileSync(path.join(__dirname,'../tools/bots',file),'utf8')));
});
test('Weak/Strong configurations and legacy policies keep their frozen behavior on identical public observations',()=>{
 const original=require('../docs/p4r1-bot-qualification/freeze/v1-bot-sources.json'),old=JSON.parse(original['bot-configs.json']),current=loadBotConfigs();
 for(const id of ['weak','strong'])assert.deepEqual(current[id],old[id]);
 for(const file of ['heuristic-bot.ts','evaluation.ts','roster-policy.ts','formation-policy.ts','equipment-policy.ts','economy-policy.ts']){
  let actual=fs.readFileSync(path.join(__dirname,'../tools/bots',file),'utf8').replace(/\r\n/g,'\n');
  if(file==='equipment-policy.ts')actual=actual
   .replace("import { claimStageRewards } from './stage-rewards';\n",'')
   .replace('  const actions = claimStageRewards(player);\n','')
   .replace('if(!pending)return actions;','if(!pending)return [];')
   .replace('return [...actions,{action,result:player.act(action)}];','return [{action,result:player.act(action)}];');
  assert.equal(actual,original[file].replace(/\r\n/g,'\n'),file+' permits only the shared stage-reward infrastructure adapter');
 }
});
console.log(`Medium economy: ${passed} passed, 0 failed`);
