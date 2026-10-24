require('tsx/cjs');
const assert = require('node:assert/strict');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {RunSession} = require('../assets/scripts/core/RunSession.ts');
const {OwnedUnits} = require('../assets/scripts/core/OwnedUnits.ts');
const {loadRunInputs} = require('../tools/run-simulation.ts');
const {OPENING_ENCOUNTER_IDS, drawOpeningEncounters} = require('../assets/scripts/core/OpeningEncounter.ts');
const {RunRandomContext} = require('../assets/scripts/core/RunRandomContext.ts');
const inputs = loadRunInputs();
function seedFor(choice) {
  for (let seed=1;seed<=100;seed++) if(drawOpeningEncounters(new RunRandomContext(seed).stream('encounter',1,4100)).includes(choice)) return seed;
  throw Error('Missing fixture for '+choice);
}
function make(save, choice='inspiration') {
  const cfg = new ConfigManager(); cfg.setUnits(inputs.units); cfg.setSkills(inputs.skills);
  cfg.setBattle(inputs.battle); cfg.setEquipment(inputs.equipment);
  return new RunSession(cfg, inputs.run, inputs.waves, {runSeed: save?.runSeed ?? seedFor(choice), stageCount: 6, enemyGenerationMode: 'legacy', openingEncounter: true, ...(save ? {save} : {})});
}
function finish(s, winner=0, extra=0) {
  if (!s.owned.onBoard().length) assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
  const sim = s.startBattle(); assert.ok(sim); sim.end(winner); assert.ok(s.settleBattle(extra));
  return sim;
}
function claim(s) {
  const p=s.pendingStageReward;
  if(p) assert.ok(s.claimStageReward({type:'stageChoice',rewardId:p.id,choice:p.kind==='specialShop'?'continue':'claim',index:0}).ok);
}
const pending=make(); assert.ok(pending.pendingOpeningEncounter);
assert.equal(pending.startBattle(),null); assert.equal(pending.buyShopSlot(0).error,'shop_occupied');
assert.equal(pending.refreshShop().error,'shop_occupied'); assert.equal(pending.buyExp().error,'encounter_pending');
assert.equal(pending.chooseOpeningEncounter('invalid').ok,false);
assert.ok(make(pending.snapshot()).pendingOpeningEncounter,'unselected opening survives reload');
assert.ok(pending.chooseOpeningEncounter('inspiration').ok);assert.equal(pending.chooseOpeningEncounter('tempered').ok,false);
pending.economy.add(4);
const beforeLocked=JSON.stringify(pending.snapshot());
for(const result of [pending.buyShopSlot(0),pending.refreshShop(),pending.toggleShopLock(),pending.buyExp()])assert.equal(result.error,'shop_occupied');
assert.equal(JSON.stringify(pending.snapshot()),beforeLocked,'blocked shop actions change neither gold nor stock, RNG, lock or XP');
assert.ok(make(pending.snapshot()).openingShopLocked,'selection and reload keep the whole 1-1 locked');
assert.ok(pending.debugJump(1,2));assert.equal(pending.openingShopLocked,false);assert.ok(pending.buyExp().ok);assert.equal(pending.level.level,3);assert.equal(pending.freeRefreshes,4,'two level-ups grant four rolls');
assert.equal(pending.economy.gold,0);assert.ok(pending.refreshShop().ok);assert.equal(pending.freeRefreshes,3);assert.equal(pending.economy.gold,0);
let resumed=make(pending.snapshot());assert.equal(resumed.freeRefreshes,3);
for(let n=0;n<3;n++)assert.ok(resumed.refreshShop().ok);
assert.equal(resumed.refreshShop().error,'not_enough_gold');assert.equal(resumed.freeRefreshes,0);
const natural=make();natural.chooseOpeningEncounter('inspiration');finish(natural);assert.equal(natural.freeRefreshes,2);
assert.equal(natural.settleBattle(),null);assert.equal(natural.freeRefreshes,2,'duplicate settlement cannot grant rolls');
assert.equal(make(natural.snapshot()).freeRefreshes,2);
console.log('PASS opening choice, invalid/stale guards, purchase/natural/multiple level-ups, zero-gold free rolls, persistence and once-only settlement');

let stipend=make(undefined,'stipend');assert.ok(stipend.chooseOpeningEncounter('stipend').ok);
for(let round=1;round<=3;round++){finish(stipend);claim(stipend);const gold=stipend.economy.gold;assert.ok(stipend.nextWave());assert.equal(stipend.economy.gold,gold+(round===3?10:0));}
claim(stipend);
const at2=stipend.economy.gold;stipend=make(stipend.snapshot());assert.equal(stipend.economy.gold,at2,'reload does not re-grant stage income');
assert.ok(stipend.debugJump(2,stipend.waves.find(w=>w.stage===2&&w.encounterKind==='normal').round));assert.equal(stipend.economy.gold,at2);
assert.ok(stipend.debugJump(3,stipend.waves.find(w=>w.stage===3&&w.encounterKind==='normal').round));assert.equal(stipend.economy.gold,at2+10);
assert.ok(stipend.debugJump(2,stipend.waves.find(w=>w.stage===2&&w.encounterKind==='normal').round));assert.ok(stipend.debugJump(3,stipend.waves.find(w=>w.stage===3&&w.encounterKind==='normal').round));assert.equal(stipend.economy.gold,at2+10,'revisiting a stage does not duplicate stipend');
console.log('PASS stage income: none during stage 1, +10 entering stage 2 and 3, no per-round/reload/revisit duplicate');

const tempered=make(undefined,'tempered');assert.ok(tempered.chooseOpeningEncounter('tempered').ok);tempered.level.addExp(1000);
const first=tempered.owned.all()[0];first.star=2;tempered.moveUnit(first.uid,{location:'board',x:3,y:3});
const second=tempered.owned.forceAdd(tempered.cfg.allUnits().find(u=>u.id!==first.unitId).id);
tempered.moveUnit(second.uid,{location:'board',x:2,y:3});
const reserve=tempered.owned.forceAdd(tempered.cfg.allUnits().find(u=>u.id!==first.unitId&&u.id!==second.unitId).id);reserve.y=0;
let sim=tempered.startBattle();const dead=sim.units.find(u=>u.id===tempered.activeBattleIds.get(second.uid));dead.hp=0;dead.alive=false;
sim.end(-1);assert.ok(tempered.settleBattle());
assert.equal(first.permanentMaxHp,50,'survivors gain health even on draws');assert.equal(second.permanentMaxHp,undefined);assert.equal(reserve.permanentMaxHp,undefined);
assert.equal(tempered.settleBattle(),null);assert.equal(first.permanentMaxHp,50);
const saved=tempered.snapshot(),healthReload=make(saved);claim(healthReload);healthReload.nextWave();
const ally=healthReload.createPreview().sim.units.find(u=>u.id===healthReload.createPreview().battleIds.get(first.uid));
const base=healthReload.cfg.scaleUnit(healthReload.cfg.getUnit(first.unitId),2).hp;
assert.equal(ally.cfg.hp,base+50,'permanent health is flat after star scaling');
finish(healthReload);assert.equal(healthReload.owned.get(first.uid).permanentMaxHp,100,'survivor growth stacks across battles');
const merged=new OwnedUnits([1,2,3].map((uid,i)=>({uid,unitId:first.unitId,star:1,location:'bench',x:-1,y:i,permanentMaxHp:50*(i+1)})));
merged.mergeAll();assert.equal(merged.all().length,1);assert.equal(merged.all()[0].permanentMaxHp,300,'merge preserves all earned health');
console.log('PASS survivor health: actual combat UID map, dead/reserve exclusion, draw, flat two-star bonus, reload, stacking and merge preservation');

const seen=new Set(),combinations=new Set();
for(let seed=1;seed<=1000;seed++){
  const random=new RunRandomContext(seed),offers=drawOpeningEncounters(random.stream('encounter',1,4100));
  assert.equal(offers.length,3);assert.equal(new Set(offers).size,3);offers.forEach(id=>seen.add(id));
  assert.deepEqual(offers,drawOpeningEncounters(random.stream('encounter',1,4100)));
  combinations.add([...offers].sort().join(','));
}
assert.deepEqual([...seen].sort(),[...OPENING_ENCOUNTER_IDS].sort());assert.equal(combinations.size,20,'all six-choose-three combinations reachable');
const offered=pending.save.openingEncounter.offered;
assert.deepEqual(make(pending.snapshot()).save.openingEncounter.offered,offered);
const unselected=make(),absent=OPENING_ENCOUNTER_IDS.find(id=>!unselected.save.openingEncounter.offered.includes(id));
const untouched=JSON.stringify(unselected.snapshot());assert.equal(unselected.chooseOpeningEncounter(absent).ok,false);
assert.equal(JSON.stringify(unselected.snapshot()),untouched,'valid but unoffered choices cannot be selected');
const legacy=make().snapshot();delete legacy.openingEncounter.offered;
assert.deepEqual(make(legacy).openingEncounterOptions.map(c=>c.id),['inspiration','stipend','tempered'],'old pending save retains original visible choices');
legacy.openingEncounter.selected='tempered';assert.equal(make(legacy).save.openingEncounter.selected,'tempered');
for(const ids of [['inspiration','inspiration','study'],['inspiration','study'],['inspiration','study','invalid']]){
  const bad=make().snapshot();bad.openingEncounter.offered=ids;assert.throws(()=>make(bad),/Invalid saved opening encounter/);
}
console.log('PASS six-choice seeded pool: unique random three, all combinations, stable save/order, unoffered rejection and legacy pending/selected saves');

for(const winner of [0,1,-1]){
  const bounty=make(undefined,'bounty');assert.ok(bounty.chooseOpeningEncounter('bounty').ok);bounty.economy.add(9);
  finish(bounty,winner,4);
  const reward=bounty.save.lastReward;
  assert.equal(reward.breakdown.extraIncome,4+(winner===0?2:0));assert.equal(reward.breakdown.interest,0,'bonus excluded from same-round interest');
  assert.equal(reward.expGained,2);const gold=bounty.economy.gold;
  assert.equal(bounty.settleBattle(),null);assert.equal(make(bounty.snapshot()).economy.gold,gold);
  const study=make(undefined,'study');assert.ok(study.chooseOpeningEncounter('study').ok);finish(study,winner);
  assert.equal(study.save.lastReward.expGained,3);assert.equal(study.level.level,2);assert.equal(study.level.exp,1);
  assert.equal(study.save.lastReward.breakdown.extraIncome,0);
  assert.equal(study.settleBattle(),null);const studyReload=make(study.snapshot());assert.equal(studyReload.level.exp,1);
  claim(studyReload);assert.ok(studyReload.nextWave());finish(studyReload,winner);
  assert.equal(studyReload.level.level,3);assert.equal(studyReload.level.exp,2,'bonus applies again next battle');
  let renewal=make(undefined,'renewal');assert.ok(renewal.chooseOpeningEncounter('renewal').ok);
  const hurt=renewal.snapshot();hurt.round.health=90;renewal=make(hurt);
  const battle=finish(renewal,winner),damage=winner===0?0:battle.units.filter(u=>u.side===1&&u.alive).length*inputs.battle.lossPerEnemy;
  assert.equal(renewal.flow.health,90-damage+(winner===0?3:0));
  assert.equal(renewal.flow.lastSettlement.healthRemaining,renewal.flow.health);
  assert.equal(renewal.settleBattle(),null);assert.equal(make(renewal.snapshot()).flow.health,renewal.flow.health);
}
let capped=make(undefined,'renewal');capped.chooseOpeningEncounter('renewal');const capSave=capped.snapshot();capSave.round.health=99;capped=make(capSave);finish(capped);
assert.equal(capped.flow.health,100);assert.equal(capped.flow.lastSettlement.healthRemaining,100);
let lethal=make(undefined,'renewal');lethal.chooseOpeningEncounter('renewal');const lethalSave=lethal.snapshot();lethalSave.round.health=1;lethal=make(lethalSave);finish(lethal,1);
assert.equal(lethal.flow.health,0);assert.equal(lethal.flow.result,'defeat','healing cannot revive a defeated player');
console.log('PASS new effects: victory-only gold/healing, win/loss/draw XP, extra-income stacking, interest order, next battle, reload, duplicate settlement, health cap and lethal loss');

const path=require('node:path');
const {load,Node,Label,pending:assets}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.resolve('assets/scripts/ui/BattleUI.ts'));
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
ui.setShopVisible(true);ui.setShopContentOccupied(true);
const picked=[];const display=make(undefined,'tempered').openingEncounterOptions;
ui.showOpeningEncounter(inputs.run.openingEncounter.name,display,id=>picked.push(id));
const opening=ui.node.getChildByName('openingEncounter');
assert.equal(opening.children.filter(n=>n.name.startsWith('encounter_')).length,3);
assert.ok(ui.shopSlots.every(card=>!card.node.active));assert.equal(ui.economyControls.active,false);
ui.showSellPreview('test',1,false);assert.equal(opening.active,false);
ui.clearSellPreview();assert.equal(opening.active,true);assert.equal(ui.economyControls.active,false);assert.equal(ui.shopHeader.active,false);
const click=opening.getChildByName('encounter_tempered').events.get('end');click();assert.deepEqual(picked,['tempered']);
ui.hideOpeningEncounter();click();assert.deepEqual(picked,['tempered'],'removed opening controls cannot choose again');
ui.setShopContentOccupied(false);assert.ok(ui.shopSlots.every(card=>card.node.active));
ui.setFreeRefreshes(4);const refresh=ui.economyControls.getChildByName('refresh');
assert.equal(refresh.getChildByName('text').getComponent(Label).string,'免费 ×4');assert.equal(refresh.getChildByName('goldCost').active,false);
ui.setFreeRefreshes(0);assert.equal(refresh.getChildByName('goldCost').active,true);
ui.setOpeningShopLocked(true);
assert.equal(ui.shopRoot.active,false);assert.equal(ui.economyControls.active,false);
assert.equal(ui.node.getChildByName('expandShop'),undefined,'no bypass button on 1-1');
ui.showSellPreview('test',1,false);ui.clearSellPreview();
assert.equal(ui.shopRoot.active,false,'drag release preserves 1-1 lock');
ui.setShopContentOccupied(true);ui.setShopContentOccupied(false);
assert.equal(ui.shopRoot.active,false,'content refresh cannot open 1-1 shop');
ui.setOpeningShopLocked(false);
assert.equal(ui.shopRoot.active,true);assert.equal(ui.economyControls.active,true,'1-2 opens the shop');
const settings=[];ui.onSettings=value=>settings.push(value);
ui.homeButton.events.get('end')();assert.ok(ui.mainMenuPanel.active);
assert.equal(ui.node.getChildByName('debugToggle'),undefined,'debug has no standalone HUD entry');
ui.mainMenuContent.getChildByName('settingSpeed').events.get('end')();assert.equal(settings.at(-1).speed,2);
ui.mainMenuContent.getChildByName('settingDamageNumbers').events.get('end')();assert.equal(settings.at(-1).damageNumbers,false);
ui.mainMenuContent.getChildByName('settingHealingNumbers').events.get('end')();assert.equal(settings.at(-1).healingNumbers,false);
ui.mainMenuContent.getChildByName('debugToggle').events.get('end')();assert.ok(ui.debugPanel.active);assert.equal(ui.mainMenuPanel.active,false);
ui.debugPanel.getChildByName('debugClose').events.get('end')();assert.ok(ui.mainMenuPanel.active);assert.equal(ui.debugPanel.active,false);
while(assets.length)assets.shift()();
console.log('PASS opening UI: three cards, shop occupancy, drag restoration, removed callback guard and free-refresh price/count');
