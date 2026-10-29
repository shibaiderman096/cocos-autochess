require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits,highestActiveTraits}=require('../assets/scripts/battle/Traits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {drawOpeningEncounters}=require('../assets/scripts/core/OpeningEncounter.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),generation=loadEnemyGenerationInputs(),formation=loadFormationInputs();
function make(choice,save){
 const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
 let seed=save?.runSeed??1;
 while(!save&&!drawOpeningEncounters(new RunRandomContext(seed).stream('encounter',1,4100)).includes(choice))seed++;
 const s=new RunSession(cfg,inputs.run,inputs.waves,{runSeed:seed,stageCount:6,...generation,...formation,openingEncounter:true,...(save?{save}:{})});
 if(!save)assert.ok(s.chooseOpeningEncounter(choice).ok);return s;
}
function deploy(s,star=1){const u=s.owned.all()[0];u.star=star;assert.ok(s.moveUnit(u.uid,{location:'board',x:3,y:3}).ok);return u;}
function claim(s){const p=s.pendingStageReward;if(p)assert.ok(s.claimStageReward({type:'stageChoice',rewardId:p.id,choice:p.kind==='specialShop'?'continue':'claim'}).ok);}
function finish(s){const b=s.startBattle();assert.ok(b);b.end(0);assert.ok(s.settleBattle());claim(s);}
// Population is sampled once into detached preview/combat placements; bench/enemy excluded.
for(const [level,expected] of [[1,0],[5,.4],[9,.8],[10,.8]]){
 const s=make('vacancy');deploy(s);s.level.level=level;
 const a=s.createPreview().sim.units.find(u=>u.side===0),base=s.cfg.equipmentStats(s.cfg.scaleUnit(s.cfg.getUnit(a.cfg.id),1),[]);
 assert.ok(Math.abs(a.cfg.damageAmp-base.damageAmp-expected)<1e-8);
 assert.ok(Math.abs(a.cfg.damageReduction-base.damageReduction-expected)<1e-8);
 const sim=s.startBattle();s.level.level=1;assert.equal(sim.units.find(u=>u.side===0).cfg.damageAmp,a.cfg.damageAmp);
}
for(const star of [1,2,3]){
 const s=make('ascension');deploy(s,star);const a=s.createPreview().sim.units.find(u=>u.side===0);
 const base=s.cfg.scaleUnit(s.cfg.getUnit(a.cfg.id),star);
 assert.ok(Math.abs(a.cfg.damageAmp-(base.damageAmp??0)-(star===3?.4:0))<1e-8);
 assert.ok(Math.abs(a.cfg.damageReduction-(base.damageReduction??0)-(star===3?.2:0))<1e-8);
}
// Synthetic tiers make both tie behavior and activation crossing observable.
const traits=[{id:'a',members:['a1','a2','a3'],breakpoints:[{count:2,power:10},{count:3,power:20}]},{id:'b',members:['a1','a2'],breakpoints:[{count:2,power:10}]}];
assert.equal(highestActiveTraits(resolveTraits(traits,['a1'])).length,0);
assert.deepEqual(highestActiveTraits(resolveTraits(traits,['a1','a2'])).map(t=>t.config.id),['a','b']);
const boosted=resolveTraits(traits,['a1','a2','a2'],[],'a');
assert.equal(boosted.find(t=>t.config.id==='a').count,3);assert.equal(boosted.find(t=>t.config.id==='a').active.power,20);
assert.equal(boosted.find(t=>t.config.id==='b').count,2);assert.equal(boosted.find(t=>t.config.id==='a').memberIds.length,2);
const resonance=make('resonance');resonance.cfg.battle.traits=traits;
const ids=[resonance.owned.all()[0].unitId,resonance.cfg.allUnits().find(u=>u.id!==resonance.owned.all()[0].unitId).id];traits.forEach(t=>t.members=ids);
deploy(resonance);resonance.level.level=2;const ru=resonance.owned.forceAdd(ids.find(id=>id!==resonance.owned.all()[0].unitId)??ids[1]);ru.location='board';ru.x=2;ru.y=3;
const rt=resonance.createPreview().sim.resolvedTraits[0];assert.equal(rt.filter(t=>t.count===3).length,1);
assert.deepEqual(rt,resonance.createPreview().sim.resolvedTraits[0]);
console.log('PASS vacancy snapshot/cap, three-star only, active trait ties and tier crossing');
// Mixed chest value is scaled once, before rolling; claim/reload cannot multiply again.
const bounty=make('abundance');deploy(bounty);const baseValue=inputs.run.stageEncounters.monsterReward.initialValue;
const battle=bounty.startBattle();battle.end(0);bounty.settleBattle();
assert.equal(bounty.pendingStageReward.value,Math.floor(baseValue*1.5));
const reloaded=make('abundance',bounty.snapshot());assert.equal(reloaded.pendingStageReward.value,bounty.pendingStageReward.value);claim(reloaded);assert.equal(reloaded.pendingStageReward,undefined);
const normal=make('bounty'),boss=make('bossHunt');
// Compare against the same run seed without selection to preserve encounter layout.
const raw=boss.snapshot();raw.openingEncounter.selected=undefined;const same=make('bossHunt',raw);
const elites=same.waves.filter(w=>w.encounterKind==='elite');assert.ok(elites.length);
for(const w of elites){const replaced=boss.waves.find(v=>v.id===w.id);assert.equal(replaced.encounterKind,'boss');assert.equal(replaced.waveKind,'boss');assert.ok(replaced.goldBudget);}
assert.equal(boss.waves.filter(w=>w.encounterKind==='elite').length,0);
assert.deepEqual(make('bossHunt',boss.snapshot()).waves,boss.waves);
const replaced=boss.waves.find(w=>w.id===elites[0].id);assert.ok(boss.debugJump(replaced.stage,replaced.round));deploy(boss);const bb=boss.startBattle();bb.end(0);boss.settleBattle();
assert.equal(boss.pendingStageReward.source,'boss');assert.equal(boss.pendingStageReward.value,boss.stageProgression.value(replaced.stage));
console.log('PASS monster value and once-only claim/reload, actual boss wave generation and boss rewards');
// Gifts reserve real card stock, survive full benches/reload and never duplicate.
const gift=make('kindred');const gu=deploy(gift),members=gift.cfg.allUnits().filter(u=>!u.specialShopUnlock).slice(0,3).map(u=>u.id);
gift.cfg.battle.traits=[{id:'gift',members:[gu.unitId,...members],breakpoints:[{count:1}]}];
const ownedBefore=gift.owned.all().length;assert.ok(gift.debugJump(2,1));assert.equal(gift.owned.all().length,ownedBefore+1);
const total=gift.owned.all().length+gift.save.stageProgress.unitReserve.length;assert.ok(gift.debugJump(2,1));assert.equal(gift.owned.all().length+gift.save.stageProgress.unitReserve.length,total);
// A real roster fixture exercises persistence with an actual active trait.
const realGift=make('kindred'),trait=realGift.cfg.battle.traits.find(t=>!t.selector&&t.members.length>=t.breakpoints[0].count);
realGift.level.level=10;realGift.owned.all().splice(0); // use explicit deployment below
realGift.save.owned=[];
for(const [i,id] of trait.members.slice(0,trait.breakpoints[0].count).entries()){
 if(!realGift.owned.all().some(u=>u.unitId===id)){const u=realGift.owned.forceAdd(id);u.location='board';u.x=i%7;u.y=Math.floor(i/7);}
}
while(realGift.owned.inBench().length<realGift.save.benchSlots){const id=realGift.cfg.allUnits().find(v=>!trait.members.includes(v.id)&&!realGift.owned.all().some(u=>u.unitId===v.id)).id;const u=realGift.owned.forceAdd(id);u.y=realGift.owned.inBench().length-1;}
assert.ok(realGift.debugJump(2,1));assert.equal(realGift.save.stageProgress.unitReserve.length,1);
const gs=realGift.snapshot(),gr=make('kindred',gs);assert.equal(gr.save.stageProgress.unitReserve.length,1);assert.equal(gr.save.openingEncounter.lastGiftStage,2);
assert.ok(gr.debugJump(2,2));assert.equal(gr.save.stageProgress.unitReserve.length,1);
console.log('PASS seeded per-stage gifts, full-bench reserve and reload once-only guard');
const compound=make('compound');deploy(compound);compound.economy.add(109);const cb=compound.startBattle();compound.economy.spend(100);assert.equal(compound.incomePreview.win.interest,10);cb.end(0);compound.settleBattle();assert.equal(compound.save.lastReward.breakdown.interest,10);
const wallet=new EconomySystem();wallet.gold=109;assert.equal(wallet.preview(1).win.interest,5);wallet.unlimitedInterest=true;assert.equal(wallet.preview(1).win.interest,10);
wallet.gold=Number.MAX_SAFE_INTEGER;assert.throws(()=>wallet.settleBattle(1,{winner:0}),/safe range/);
const lucky=make('luckyRoll');deploy(lucky);finish(lucky);lucky.nextWave();lucky.economy.add(100);
for(let i=0;i<30;i++){
 const free=lucky.freeRefreshes,idx=lucky.save.shopRollIndex+1,gold=lucky.economy.gold;
 assert.ok(lucky.refreshShop().ok);
 const expected=free?free-1:(lucky.random.stream('encounter',lucky.flow.wave.id,4900+idx).next()<.5?1:0);
 assert.equal(lucky.freeRefreshes,expected);assert.equal(lucky.economy.gold,gold-(free?0:2));
}
assert.equal(make('luckyRoll',lucky.snapshot()).freeRefreshes,lucky.freeRefreshes);
const locked=make('luckyRoll');deploy(locked);finish(locked);locked.shop.locked=true;const lf=locked.freeRefreshes;locked.nextWave();assert.equal(locked.freeRefreshes,lf);
console.log('PASS uncapped entry-wallet interest, preview/overflow, seeded paid/free/locked round refresh');
// Revival: true death, fixed delay, stable ID, full temporary-state reset and occupied-cell fallback.
const life=make('secondLife');deploy(life);const sim=life.startBattle(),ally=sim.units.find(u=>u.side===0),enemy=sim.units.find(u=>u.side===1);
ally.hp=0;ally.pendingCast={skillId:ally.cfg.skillId,remainingTicks:999};ally.burns=[{untilTick:999}];ally.stunnedUntilTick=999;ally.manaLocked=true;
sim.resolveDamage();const deadTick=sim.tick;assert.equal(ally.alive,false);assert.equal(sim.finished,false);
enemy.x=ally.x;enemy.y=ally.y;enemy.cfg.atk=0;enemy.cfg.skillId=undefined;
for(const u of sim.units.filter(u=>u.side===1)){u.atkCd=9999;u.moveCd=9999;u.manaPerSecond=0;u.cfg.skillId=undefined;}
const due=deadTick+Math.ceil(3000/life.cfg.battle.tickMs);
while(sim.tick<due-1){sim.step();assert.equal(ally.alive,false);assert.equal(sim.finished,false);}
sim.step();assert.equal(ally.alive,true);assert.ok(ally.hp>=Math.floor(ally.cfg.hp*.3));assert.notDeepEqual(ally.pos,enemy.pos);
assert.equal(ally.pendingCast,null);assert.equal(ally.burns.length,0);assert.equal(ally.stunnedUntilTick,0);assert.equal(ally.manaLocked,false);
assert.equal(sim.events.filter(e=>e.t==='revive').length,1);
ally.hp=0;sim.resolveDamage();sim.step();assert.equal(sim.finished,true);assert.equal(sim.winner,1);
const life2=make('secondLife');deploy(life2);const sim2=life2.startBattle(),a2=sim2.units.find(u=>u.side===0);a2.hp=0;sim2.resolveDamage();sim2.end(-1);const eventCount=sim2.events.length;sim2.step();assert.equal(a2.alive,false);assert.equal(sim2.events.length,eventCount);
console.log('PASS first death delayed revival, last ally survival wait, cell collision, status cleanup, once-only and terminal cancellation');

// Every new card reaches the real UI through the existing three-choice presentation.
const {load,Node}=require('./helpers/ui-harness.cjs'),path=require('node:path');
const {BattleUI}=load(path.resolve('assets/scripts/ui/BattleUI.ts'));
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
for(const id of ['vacancy','resonance','ascension','abundance','bossHunt','secondLife','kindred','compound','luckyRoll']){
 const session=make(id),picks=[];
 assert.ok(session.openingEncounterOptions.every(c=>c.name&&c.description));
 ui.showOpeningEncounter(inputs.run.openingEncounter.name,session.openingEncounterOptions,choice=>picks.push(choice));
 const root=ui.shopRewardDock.getChildByName('openingEncounter');
 assert.equal(root.children.filter(n=>n.name.startsWith('encounter_')).length,3);
 root.getChildByName('encounter_'+id).events.get('end')();assert.deepEqual(picks,[id]);ui.hideOpeningEncounter();
}
// Revival cancels a previously scheduled death fade before reactivating the node.
const fs=require('node:fs'),source=fs.readFileSync('assets/scripts/view/UnitView.ts','utf8');
const body=source.match(/playRevive\(\): void \{([\s\S]*?)\n  \}/)[1];
const opacity={opacity:0},stopped=[];
const playRevive=new Function('UIOpacity','Tween',body);
const view={node:{active:false,getComponent:()=>opacity}};
playRevive.call(view,{}, {stopAllByTarget:target=>stopped.push(target)});
assert.deepEqual(stopped,[opacity]);assert.equal(opacity.opacity,255);assert.equal(view.node.active,true);
// Failed rolls and special-merchant rolls cannot mint ordinary refresh coupons.
const empty=make('luckyRoll');assert.ok(empty.debugJump(1,2));empty.economy.gold=0;empty.save.openingEncounter.freeRefreshes=0;
const untouched=JSON.stringify(empty.snapshot());assert.equal(empty.refreshShop().ok,false);assert.equal(JSON.stringify(empty.snapshot()),untouched);
const transition=make('luckyRoll');deploy(transition);finish(transition);transition.nextWave();
assert.equal(transition.freeRefreshes,transition.random.stream('encounter',transition.flow.wave.id,4900).next()<.5?1:0);
const merchant=make('luckyRoll');const mw=merchant.waves.find(w=>w.encounterKind==='specialShop');assert.ok(merchant.debugJump(mw.stage,mw.round));merchant.economy.add(10);
const mf=merchant.freeRefreshes;assert.ok(merchant.claimStageReward({type:'stageChoice',rewardId:merchant.pendingStageReward.id,choice:'refresh'}).ok);assert.equal(merchant.freeRefreshes,mf);
// Odd total-value rounding, and no uplift for boss/elite/explorer budgets.
assert.equal(bounty.stageProgression.chestValue({stage:1,encounterKind:'monster'}),Math.floor(baseValue*1.5));
assert.equal(bounty.stageProgression.chestValue({stage:1,encounterKind:'boss'}),baseValue);
assert.equal(bounty.stageProgression.chestValue({stage:1,encounterKind:'elite'}),Math.ceil(baseValue*.5));
// First simultaneous allied death uses stable ID ordering; forced timeout cancels it.
const simultaneous=make('secondLife');deploy(simultaneous);simultaneous.level.level=2;
const other=simultaneous.owned.forceAdd(simultaneous.cfg.allUnits().find(u=>u.id!==simultaneous.owned.all()[0].unitId).id);other.location='board';other.x=2;other.y=3;
const ss=simultaneous.startBattle(),allies=ss.units.filter(u=>u.side===0);allies.forEach(u=>u.hp=0);ss.resolveDamage();
assert.equal(ss.pendingRevive.unit.id,Math.min(...allies.map(u=>u.id)));
ss.tick=ss.maxTicks;ss.step();assert.equal(ss.finished,true);assert.equal(ss.winner,-1);assert.equal(ss.events.filter(e=>e.t==='revive').length,0);
console.log('PASS all nine UI cards, revive opacity, failed/transition/merchant rolls, reward scoping and simultaneous-death timeout');
