require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {traitEmblemChoices}=require('../assets/scripts/core/TraitEmblem.ts');
const {Rng}=require('../assets/scripts/core/Rng.ts');
const {createEquipmentReward}=require('../assets/scripts/core/EquipmentReward.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
const locked=['blackstar_warlock','oris'],removed=['bronda','leon','shadow_seam_assassin','soulcleaver_general'];
function make(save,seed=23){const cfg=new ConfigManager();cfg.setUnits(structuredClone(input.units));cfg.setSkills(structuredClone(input.skills));cfg.setBattle(structuredClone(input.battle));cfg.setEquipment(structuredClone(input.equipment));return new RunSession(cfg,input.run,input.waves,{...deps,enemyGenerationMode:'legacy',runSeed:seed,...(save?{save}:{})});}
function shop(s){s.level.level=10;const w=s.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');assert.ok(s.debugJump(2,w.round));return s.save.stageProgress.pending;}
for(const id of removed){assert.ok(!input.units.some(u=>u.id===id));assert.ok(!input.battle.traits.some(t=>t.members.includes(id)));for(const faction of ['sunlight','shadow'])assert.ok(!fs.existsSync(path.resolve('assets/resources/art/units',faction,id+'.png')));}
assert.equal(input.units.length,28);
let s=make();s.level.level=10;s.economy.add(100000);
for(let n=0;n<300;n++){assert.ok(s.shop.slots.every(slot=>!locked.includes(slot.unitId)));assert.ok(s.refreshShop().ok);}
assert.ok(locked.every(id=>!s.pool.canDraw(id)));assert.ok(locked.every(id=>s.pool.count(id)>0),'locked stock is available for special purchases');
const appeared=new Set();
for(let seed=1;seed<=70;seed++){const t=make(undefined,seed),pending=shop(t);pending.offers.filter(o=>locked.includes(o.id)).forEach(o=>appeared.add(o.id));}
assert.deepEqual([...appeared].sort(),locked.slice().sort(),'both units roll when the current level allows five-fee cards');
for(const id of locked){
 let t,p,index;for(let seed=1;seed<=100;seed++){t=make(undefined,seed);p=shop(t);index=p.offers.findIndex(o=>o.id===id);if(index>=0)break;}assert.ok(index>=0);
 assert.equal(t.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'buy',index}).ok,false);assert.equal(t.pool.canDraw(id),false,'failed purchase does not unlock');
 t.economy.add(100);const before=t.pool.count(id);
 assert.ok(t.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'buy',index}).ok);assert.ok(t.pool.canDraw(id));assert.equal(t.pool.count(id),before-1);
 assert.equal(t.owned.all().filter(u=>u.unitId===id).length,1,'one purchased card is granted');
 assert.equal(t.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'buy',index}).ok,false);
 const restored=make(t.snapshot(),t.save.runSeed);assert.ok(restored.pool.canDraw(id));assert.deepEqual(restored.snapshot(),t.snapshot());
 assert.ok(restored.claimStageReward({type:'stageChoice',rewardId:p.id,choice:'continue'}).ok);assert.ok(restored.nextWave());restored.level.level=10;restored.economy.add(10000);
 let seen=false;for(let n=0;n<100;n++){restored.refreshShop();seen||=restored.shop.slots.some(slot=>slot.unitId===id);}assert.ok(seen,'unlocked unit enters ordinary refreshes');
 assert.equal(make().pool.canDraw(id),false,'a new run resets the unlock');
}
const cfg=s.cfg,base=cfg.getUnit('turbo_fist_tiger');
assert.equal(cfg.getEquipment(['trait_emblem'])[0].hp,100);assert.equal(cfg.equipmentStats(base,['trait_emblem']).manaPerSecond,(base.manaPerSecond??0)+1);
assert.equal(deps.equipmentPolicy.tiers.trait_emblem,'special');assert.ok(!input.run.stageEncounters.basicEquipmentIds.includes('trait_emblem'));
for(let seed=1;seed<=50;seed++){const progress={lastClaimedWaveId:0,lastEvaluatedWaveId:0,guaranteeSatisfied:{}};const event=createEquipmentReward(deps.equipmentPolicy,new RunRandomContext(seed),{id:100,stage:99,round:5,roundsInStage:5,waveKind:'boss'},0,progress);assert.ok(!event.rewardCandidates.includes('trait_emblem'));}
s=make();let bearer=s.owned.all()[0];s.owned.equipmentReserve.push('trait_emblem');assert.ok(s.equipItem(bearer.uid,0).ok);
const p=s.pendingTraitChoice;assert.equal(p.candidates.length,4);assert.equal(new Set(p.candidates).size,4);assert.equal(s.startBattle(),null);assert.equal(s.refreshShop().ok,false);assert.equal(s.unequipItem(bearer.uid,0).ok,false);assert.equal(s.sellUnit(bearer.uid).ok,false);
let resumed=make(s.snapshot());assert.deepEqual(resumed.pendingTraitChoice,p);assert.equal(resumed.chooseEquipmentTrait(9).ok,false);assert.ok(resumed.chooseEquipmentTrait(0).ok);assert.equal(resumed.chooseEquipmentTrait(0).ok,false);
bearer=resumed.owned.get(bearer.uid);const bound=bearer.equipment[0];assert.equal(bound,`trait_emblem__${p.candidates[0]}`);assert.ok(cfg.getEquipmentReserve([bound])[0].grantedTraitId);
assert.ok(resumed.unequipItem(bearer.uid,0).ok);assert.equal(resumed.cfg.equipmentStats(resumed.cfg.getUnit(bearer.unitId),bearer.equipment).grantedTraitIds.length,0);
const other=input.units.find(u=>u.id!==bearer.unitId);assert.ok(resumed.pool.take(other.id));const next=resumed.owned.addToBench(other.id,resumed.save.benchSlots);assert.ok(next);assert.ok(resumed.equipItem(next.uid,0).ok);assert.equal(resumed.pendingTraitChoice,undefined,'bound equipment transfers without a new choice');assert.deepEqual(next.equipment,[bound]);assert.deepEqual(make(resumed.snapshot()).owned.get(next.uid).equipment,[bound]);
// Conversion is per carrier, but distinct copies of one unit identity count only once.
const synthetic={id:'converted',name:'converted',hp:1000,atk:0,armor:0,mr:0,atkSpeed:.1,range:1,moveTicks:6,maxMana:100,startMana:0,manaPerHit:0,critChance:0};
const trait={id:'test_trait',name:'Test',glyph:'测',description:'',members:['native'],breakpoints:[{count:2,tier:'bronze',power:20}]};
cfg.setBattle({...cfg.battle,traits:[trait]});
const sim=new BattleSim(cfg,[{cfg:{...synthetic,id:'native'},side:0,x:0,y:0},{cfg:synthetic,equipment:['trait_emblem__test_trait'],side:0,x:1,y:0},{cfg:synthetic,side:0,x:2,y:0},{cfg:{...synthetic,id:'target'},side:1,x:0,y:7}]);
assert.equal(sim.units[0].cfg.physicalPower,20);assert.equal(sim.units[1].cfg.physicalPower,20);assert.equal(sim.units[2].cfg.physicalPower,0,'unconverted duplicate does not inherit a different copy’s trait');
const state=resolveTraits([trait],[{id:'native'},{id:'converted',grantedTraitIds:['test_trait']},{id:'converted',grantedTraitIds:['test_trait']}])[0];assert.equal(state.count,2);
assert.deepEqual(cfg.getEquipmentReserve(['trait_emblem__unknown','trait_emblem__test_trait__bad']),[]);
const current=make(),units=['abyss_iron_guard','blackfeather_hunter','nightmare_lamplighter','ghostflame_blade','helion','saiph','kaeru','milu'].map((unitId,i)=>({uid:i+1,unitId,star:1,location:'board',x:i%7,y:Math.floor(i/7),equipment:[]}));
const choices=traitEmblemChoices(current.cfg,units,8,new Rng(77));assert.equal(choices[0],'shadow','four-member active trait precedes three-member active trait');assert.ok(choices.indexOf('sunlight')>=0);assert.ok(!choices.includes('astral'),'natural trait is excluded');
const corrupt=resumed.snapshot();corrupt.pendingTraitChoice={...p,uid:999};assert.throws(()=>make(corrupt),/trait choice/);
let duplicateSession;
for(let seed=1;seed<=100;seed++){const run=make(undefined,seed),pending=shop(run),ids=pending.offers.filter(o=>o.kind==='unit').map(o=>o.id);if(new Set(ids).size<ids.length){duplicateSession=run;break;}}
assert.ok(duplicateSession,'ordinary fee rolls can offer the same exclusive more than once');
const duplicateSave=duplicateSession.snapshot(),duplicateRestored=make(duplicateSave,duplicateSession.save.runSeed);
assert.deepEqual(duplicateRestored.snapshot(),duplicateSave,'RunSession restores duplicate unit offers without rerolling or reserving twice');
console.log('PASS special merchant: current roster/assets removed, locked ordinary draws, level-weighted exclusive offers, paid one-card unlock, duplicate-card restore, once-only grants, run reset/reload; emblem special-only rewards, HP/mana, frozen four choices, priorities, binding, transfer, per-carrier combat and distinct-ID counting');

const {load,Node,pending:artRequests}=require('./helpers/ui-harness.cjs');
const {StageRewardPanel}=load(path.resolve('assets/scripts/ui/StageRewardPanel.ts'));
const panel=new StageRewardPanel(new Node('UI'),current.cfg,()=>{}),selected=[];
const choice={uid:8,slot:0,equipmentId:'trait_emblem',candidates:choices};
panel.showTraitChoice(choice,units,index=>selected.push(index));
assert.equal(panel.root.children.filter(n=>n.name.startsWith('traitChoiceCard_')).length,4);
const stale=panel.root.getChildByName('traitChoiceCard_0').getChildByName('equipmentTrait_0');
panel.showTraitChoice(choice,units,index=>selected.push(index));stale.events.get('end')();assert.deepEqual(selected,[],'stale choice cards cannot resolve a newer panel');
while(artRequests.length)artRequests.shift()();
panel.root.getChildByName('traitChoiceCard_0').getChildByName('equipmentTrait_0').events.get('end')();assert.deepEqual(selected,[0]);panel.hide();
console.log('PASS emblem UI: four bottom-dock cards, actual guarded choice callback, loaded tier badges and stale-panel protection');
