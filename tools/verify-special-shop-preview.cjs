const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('docs/evidence/special-shop');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{const cc=window.cc||await System.import('cc');window.ccTest=cc;
   if(!cc.find('Canvas')?.getComponentInChildren('MainMenu'))await new Promise((resolve,reject)=>cc.director.loadScene('main',e=>e?reject(e):resolve()));
   window.point=node=>{const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()));const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};});
  await page.waitForFunction(()=>ccTest.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>window.menu=ccTest.find('Canvas').getComponentInChildren('MainMenu'));
  const click=async(fn,arg)=>{const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(200);};
  await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection_equipment')));
  await click(()=>point(menu.collection.body.getChildByName('collectionNext')));
  await click(()=>point(menu.collection.body.getChildByName('collectionEntry_trait_emblem')));
  await page.waitForFunction(()=>menu.collection.body.getComponentsInChildren('cc.Sprite').every(s=>!!s.spriteFrame));
  await page.screenshot({path:path.join(output,'emblem-catalogue.png')});
  await click(()=>point(menu.collection.root.getChildByName('closeCollection')));
  await click(()=>point(menu.node.getChildByName('startGame')));
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded,null,{timeout:45000});
  const report={};
  report.shop=await page.evaluate(()=>{const s=ccTest.find('Canvas/Stage').getComponent('BattleStage');window.stage=s;
   const Session=s.session.constructor;
   for(let seed=1;seed<=150;seed++){
    const run=new Session(s.cfg,s.runConfig,s.waveTemplates,{runSeed:seed,enemyGenerationMode:'budget-v1',equipmentPolicy:s.equipmentPolicy,
      enemyRoles:s.enemyRoles,formationConfig:s.formationConfig,enemyDifficulty:s.enemyDifficulty,enemyPower:s.enemyPower});
    run.level.level=10;const wave=run.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');run.debugJump(2,wave.round);
    const offers=run.pendingStageReward.offers;
    if(offers.some(o=>o.id==='trait_emblem')&&offers.some(o=>['blackstar_warlock','oris'].includes(o.id))){s.session=run;break;}
   }
   s.economy.add(100);s.resetBattle(false);s.refreshShopUI();s.refreshEconomyUI();s.refreshRunUI();
   return{seed:s.save.runSeed,offers:s.session.pendingStageReward.offers};});
  const emblemIndex=report.shop.offers.findIndex(o=>o.id==='trait_emblem'),unitIndex=report.shop.offers.findIndex(o=>['blackstar_warlock','oris'].includes(o.id));assert.ok(emblemIndex>=0&&unitIndex>=0);
  await page.waitForTimeout(1500);await page.screenshot({path:path.join(output,'special-merchant.png')});
  for(const index of [emblemIndex,unitIndex])await click(i=>point(stage.stageRewards.root.getChildByName('stageRewardBody').children.find(n=>n.name==='stageOffer'&&n.getChildByName('stageChoice_'+i)).getChildByName('stageChoice_'+i)),index);
  report.purchase=await page.evaluate(()=>({unlocked:stage.save.unlockedUnits,units:stage.owned.snapshot(),reserve:stage.owned.equipmentReserve,gold:stage.economy.gold}));assert.ok(report.purchase.reserve.includes('trait_emblem'));assert.equal(report.purchase.unlocked.length,1);
  await click(()=>point(stage.ui.nextWaveBtn));
  await page.waitForFunction(()=>stage.flow.phase==='prepare'&&!stage.transitioning&&stage.flow.wave.encounterKind!=='specialShop');
  await page.evaluate(()=>{
   const uid=stage.owned.all()[0].uid;window.carryUid=uid;stage.levelSys.level=10;stage.levelSys.exp=0;
   stage.session.moveUnit(uid,{location:'board',x:3,y:3});
   ['bao_zero','turbo_fist_tiger','arc_repairer','rail_hunter_07','helion','saiph','kaeru'].forEach((id,i)=>{
    if(!stage.pool.take(id))throw Error('missing card');const unit=stage.owned.forceAdd(id);stage.owned.move(unit.uid,{location:'board',x:i,y:i<4?2:1});});
   stage.resetBattle(false);stage.refreshRunUI();stage.showOwnedDetail(uid);});
  await click(()=>point(stage.ui.sideTabs[1]));
  await click(()=>point(stage.ui.backpackSlots.find(slot=>slot.index===0).node));
  report.pending=await page.evaluate(()=>({choice:stage.session.pendingTraitChoice,root:stage.stageRewards.root?.name,fight:stage.ui.fightBtn.activeInHierarchy}));assert.equal(report.pending.root,'equipmentTraitChoice');assert.equal(report.pending.choice.candidates.length,4);assert.equal(report.pending.fight,false);assert.deepEqual(report.pending.choice.candidates.slice(0,2),['mechanical_pioneer','sunlight']);
  await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'four-trait-choice.png')});
  await page.reload({waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.ccTest=window.cc||await System.import('cc');});
  await page.waitForFunction(()=>ccTest.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>{window.menu=ccTest.find('Canvas').getComponentInChildren('MainMenu');window.point=node=>{const p=ccTest.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new ccTest.Vec3()));const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};});
  await click(()=>point(menu.node.getChildByName('continueGame')));
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded);
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{window.stage=ccTest.find('Canvas/Stage').getComponent('BattleStage');window.carryUid=stage.session.pendingTraitChoice.uid;window.point=node=>{const p=ccTest.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new ccTest.Vec3()));const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};});
  assert.deepEqual(await page.evaluate(()=>stage.session.pendingTraitChoice),report.pending.choice,'reload preserves exact choices');
  await click(()=>point(stage.stageRewards.root.getChildByName('traitChoiceCard_0').getChildByName('equipmentTrait_0')));
  report.bound=await page.evaluate(()=>({equipment:stage.owned.get(carryUid).equipment,pending:stage.session.pendingTraitChoice??null,detail:stage.ui.currentDetail,traits:stage.sim.units.find(u=>u.side===0).cfg.grantedTraitIds}));assert.equal(report.bound.pending,null);assert.ok(report.bound.equipment[0].includes('__'));assert.deepEqual(report.bound.traits,[report.pending.choice.candidates[0]]);
  await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'bound-carrier.png')});
  await click(()=>point(stage.ui.equipmentSlots[0].node));
  report.unequipped=await page.evaluate(()=>({reserve:stage.owned.equipmentReserve,traits:stage.sim.units.find(u=>u.side===0).cfg.grantedTraitIds}));assert.deepEqual(report.unequipped.traits,[]);assert.equal(report.unequipped.reserve[0],report.bound.equipment[0]);
  await page.evaluate(()=>{const other=stage.owned.all().find(u=>u.uid!==carryUid);window.nextUid=other.uid;stage.showOwnedDetail(other.uid);stage.ui.setSideTab('backpack');});
  await click(()=>point(stage.ui.backpackSlots.find(slot=>slot.index===0).node));
  report.transferred=await page.evaluate(()=>({equipment:stage.owned.get(nextUid).equipment,pending:stage.session.pendingTraitChoice??null,unlocked:stage.save.unlockedUnits}));assert.deepEqual(report.transferred.equipment,report.bound.equipment);assert.equal(report.transferred.pending,null);
  await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'transferred-carrier.png')});
  report.errors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS actual Cocos preview: generated emblem catalogue/art, natural special offers, pointer purchases/unlock, backpack equip, four choices, reload, pointer choice, carrier detail/trait, pointer unequip and transfer without reselection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
