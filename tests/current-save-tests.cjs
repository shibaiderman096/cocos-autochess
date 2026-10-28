require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {freshRunSave,readRunSave,loadRunSave,writeRunSave,SAVE_VERSION,SAVE_KEY}=require('../assets/scripts/core/ShopSave.ts');
const {POOL_STOCK,COST_PRICE}=require('../assets/scripts/core/ShopConfig.ts');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs();
const deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const clone=x=>JSON.parse(JSON.stringify(x));
function make(save,seed=save?.runSeed??1028){const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);return new RunSession(cfg,input.run,input.waves,{...deps,runSeed:seed,stageCount:6,openingEncounter:true,...(save?{save}:{})});}
function accounting(s){for(const c of s.cfg.allUnits())assert.equal(s.pool.count(c.id)+s.owned.all().filter(u=>u.unitId===c.id).reduce((n,u)=>n+3**(u.star-1),0)+s.shop.slots.filter(slot=>slot.unitId===c.id).length+s.save.stageProgress.unitReserve.filter(id=>id===c.id).length,POOL_STOCK[c.cost]);}
const blank=freshRunSave();assert.equal(blank.version,SAVE_VERSION);assert.deepEqual(readRunSave(blank),blank);assert.throws(()=>readRunSave({...blank,gold:-1}));
for(const seed of [1,17,1028]){
 const s=make(undefined,seed);assert.equal(s.owned.all().length,1);assert.ok(s.chooseOpeningEncounter(s.openingEncounterOptions[0].id).ok);
 assert.deepEqual(make(s.snapshot()).snapshot(),s.snapshot());accounting(s);
 assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
 let claimed=0,merchant=false;
 for(let n=0;n<60&&!merchant;n++){
  const p=s.pendingStageReward;
  if(p?.kind==='specialShop'){
   merchant=true;s.economy.add(200);
   assert.ok(s.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'refresh'}).ok);
   s.owned.equipmentReserve.push('basic_iron_shield');let index=s.owned.equipmentReserve.length-1;
   assert.ok(s.enhanceEquipment(index,'basic_iron_shield').ok);const id=s.owned.equipmentReserve[index];
   assert.equal(s.save.merchantServices.forged[id].spentGold,3);const resumed=make(s.snapshot());assert.equal(resumed.cfg.getEquipmentReserve([id])[0].shopPrice,s.cfg.getEquipmentReserve([id])[0].shopPrice);
   s.owned.equipmentReserve.push('guinsoo');index=s.owned.equipmentReserve.length-1;assert.ok(s.enhanceEquipment(index,'guinsoo').ok);assert.equal(s.owned.equipmentReserve[index],'radiant_guinsoo');
   assert.ok(s.beginDiceBet(5,[1,3]).ok);const bet=s.merchantDice,restored=make(s.snapshot());assert.deepEqual(restored.merchantDice,bet);assert.ok(restored.finishDiceBet(bet.id).ok);assert.equal(restored.finishDiceBet(bet.id).ok,false);accounting(restored);
   break;
  }
  if(p){assert.equal(p.kind,'mixedChest');const before=s.snapshot(),resumed=make(before);assert.deepEqual(resumed.pendingStageReward,p);
   const a=s.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'claim'}),b=resumed.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'claim'});assert.deepEqual(a,b);assert.ok(a.ok);assert.equal(a.stageReward.value,p.value);assert.equal(s.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'claim'}).ok,false);claimed++;
  }
  if(s.flow.phase==='settlement'){assert.ok(s.nextWave());continue;}
  const sim=s.startBattle();assert.ok(sim);sim.finished=true;sim.winner=0;assert.ok(s.settleBattle());accounting(s);
 }
 assert.ok(merchant);assert.ok(claimed>0);
}
const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
const s=make();writeRunSave(s.snapshot());assert.ok(store.has(SAVE_KEY));assert.deepEqual(loadRunSave(),s.snapshot());delete global.localStorage;
console.log('PASS current saves: fresh opening, current-schema storage/continue, deterministic chest claim, inventory conservation, merchant refresh, forging/radiant gear and dice settlement');
