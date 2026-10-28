const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('docs/evidence/shop-dock-popup');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   const cc=window.cc||await System.import('cc');window.ccTest=cc;
   if(!cc.find('Canvas/Stage')?.getComponent('BattleStage')&&!cc.find('Canvas')?.getComponentInChildren('MainMenu'))await new Promise((resolve,reject)=>cc.director.loadScene('main',e=>e?reject(e):resolve()));
   window.point=node=>{const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()));const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};
  });
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded||ccTest.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  const start=await page.evaluate(()=>{const menu=ccTest.find('Canvas')?.getComponentInChildren('MainMenu');return menu?point(menu.node.getChildByName('startGame')):null;});if(start)await page.mouse.click(start.x,start.y);
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded,null,{timeout:45000});
  await page.evaluate(()=>{
   window.stage=ccTest.find('Canvas/Stage').getComponent('BattleStage');window.samples={};
   window.makeRun=(seed,level=1,opening=false)=>{const s=new stage.session.constructor(stage.cfg,stage.runConfig,stage.waveTemplates,{runSeed:seed,stageCount:6,enemyGenerationMode:'budget-v1',openingEncounter:opening,equipmentPolicy:stage.equipmentPolicy,enemyRoles:stage.enemyRoles,formationConfig:stage.formationConfig,enemyDifficulty:stage.enemyDifficulty,enemyPower:stage.enemyPower});s.level.level=level;return s;};
   window.measure=kind=>{const root=kind==='opening'?stage.ui.openingEncounterPanel:kind==='equipment'?stage.ui.equipmentRewardPanel:stage.stageRewards.root;if(!root)return null;return{y:root.position.y,scale:root.scale.x,opacity:root.getComponent('cc.UIOpacity')?.opacity,normal:stage.ui.shopSlots.some(c=>c.node.activeInHierarchy)};};
   window.record=kind=>{samples[kind]=[];const start=performance.now();const frame=()=>{const s=measure(kind);if(s)samples[kind].push({time:performance.now()-start,...s});if(performance.now()-start<650)requestAnimationFrame(frame);};requestAnimationFrame(frame);};
   window.bind=s=>{stage.nextWaveRemaining=null;stage.stageRewards.hide();stage.ui.hideOpeningEncounter();stage.ui.hideEquipmentReward();stage.session=s;stage.resetBattle(false);stage.refreshShopUI();stage.refreshEconomyUI();};
  });
  const report={};
  report.openingStart=await page.evaluate(()=>{bind(makeRun(11,1,true));stage.refreshRunUI();record('opening');return measure('opening');});
  assert.equal(report.openingStart.opacity,0);assert.equal(report.openingStart.y,-309);
  await page.waitForTimeout(80);await page.screenshot({path:path.join(output,'01-opening-entering.png')});
  await page.waitForTimeout(650);
  report.openingEnd=await page.evaluate(()=>measure('opening'));assert.equal(report.openingEnd.y,-281);assert.equal(report.openingEnd.scale,1);assert.equal(report.openingEnd.opacity,255);
  let p=await page.evaluate(()=>point(stage.ui.openingEncounterPanel.children.find(n=>n.name.startsWith('encounter_'))));await page.mouse.click(p.x,p.y);
  assert.equal(await page.evaluate(()=>stage.session.pendingOpeningEncounter),false);
  report.lowLevel=await page.evaluate(()=>{const s=makeRun(7,1);const w=s.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');s.debugJump(2,w.round);return s.pendingStageReward.offers;});assert.ok(report.lowLevel.every(o=>o.kind==='equipment'));
  report.shopStart=await page.evaluate(()=>{
   let chosen;for(let seed=1;seed<=100;seed++){const s=makeRun(seed,10),w=s.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');s.debugJump(2,w.round);if(s.pendingStageReward.offers.some(o=>o.kind==='unit')&&s.pendingStageReward.offers.some(o=>o.kind==='equipment')){chosen=s;break;}}
   if(!chosen)throw Error('no shop fixture');bind(chosen);stage.economy.add(100);stage.refreshEconomyUI();stage.refreshRunUI();
   window.initialShopProgress=stage.stageRewards.dockPopup.progress;record('shop');
   window.shopRefresh=setInterval(()=>stage.refreshRunUI(),35);setTimeout(()=>clearInterval(shopRefresh),190);
   return{...measure('shop'),offers:stage.session.pendingStageReward.offers,level:stage.levelSys.level,seed:stage.save.runSeed};
  });
  assert.equal(report.shopStart.opacity,0);assert.equal(report.shopStart.y,-309);
  await page.waitForTimeout(80);await page.screenshot({path:path.join(output,'02-merchant-entering.png')});await page.waitForTimeout(650);
  report.shopEnd=await page.evaluate(()=>({...measure('shop'),sameProgress:initialShopProgress===stage.stageRewards.dockPopup.progress}));assert.equal(report.shopEnd.sameProgress,true);assert.equal(report.shopEnd.opacity,255);assert.equal(report.shopEnd.y,-281);assert.equal(report.shopEnd.normal,false);
  const index=report.shopStart.offers.findIndex(o=>o.kind==='unit');
  p=await page.evaluate(i=>point(stage.stageRewards.root.getChildByName('stageRewardBody').children.find(n=>n.getChildByName('stageChoice_'+i))?.getChildByName('stageChoice_'+i)),index);await page.mouse.click(p.x,p.y);
  report.purchase=await page.evaluate(i=>({...measure('shop'),bought:stage.session.pendingStageReward.offers[i].bought,unlocked:stage.save.unlockedUnits,sameProgress:initialShopProgress===stage.stageRewards.dockPopup.progress}),index);
  assert.equal(report.purchase.bought,true);assert.equal(report.purchase.opacity,255);assert.equal(report.purchase.y,-281);assert.equal(report.purchase.sameProgress,true);
  await page.screenshot({path:path.join(output,'03-merchant-purchased.png')});
  p=await page.evaluate(()=>point(stage.ui.nextWaveBtn));await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>!stage.transitioning&&stage.flow.phase==='prepare'&&stage.flow.wave.encounterKind!=='specialShop');
  report.equipmentStart=await page.evaluate(()=>{
   const w=stage.flow.wave,ids=stage.runConfig.stageEncounters.basicEquipmentIds.slice(0,3);
   stage.save.equipmentProgress.pending={rewardId:'preview-legacy-equipment',waveId:w.id,stage:w.stage,round:w.round,source:'boss',candidates:ids,claimed:false,diagnostics:[]};
   stage.refreshRunUI();stage.showEquipmentReward();record('equipment');return measure('equipment');
  });
  assert.equal(report.equipmentStart.opacity,0);await page.waitForTimeout(700);
  p=await page.evaluate(()=>point(stage.ui.equipmentRewardPanel.children.find(n=>n.name==='rewardCandidate').children.find(n=>n.name==='button')));await page.mouse.click(p.x,p.y);
  assert.equal(await page.evaluate(()=>!!stage.session.pendingEquipmentReward),false);
  report.traitStart=await page.evaluate(()=>{
   const u=stage.owned.all()[0];stage.owned.equipmentReserve.push('trait_emblem');stage.session.equipItem(u.uid,stage.owned.equipmentReserve.length-1);
   stage.refreshRunUI();window.traitProgress=stage.stageRewards.dockPopup.progress;record('trait');
   window.traitRefresh=setInterval(()=>stage.refreshRunUI(),35);setTimeout(()=>clearInterval(traitRefresh),190);
   return measure('trait');
  });
  assert.equal(report.traitStart.opacity,0);await page.waitForTimeout(700);
  report.traitEnd=await page.evaluate(()=>({...measure('trait'),sameProgress:traitProgress===stage.stageRewards.dockPopup.progress,kind:stage.stageRewards.root.name}));assert.equal(report.traitEnd.sameProgress,true);assert.equal(report.traitEnd.opacity,255);assert.equal(report.traitEnd.kind,'equipmentTraitChoice');
  await page.screenshot({path:path.join(output,'04-trait-choice.png')});
  p=await page.evaluate(()=>point(stage.stageRewards.root.getChildByName('traitChoiceCard_0').getChildByName('equipmentTrait_0')));await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>!!stage.session.pendingTraitChoice),false);
  report.samples=await page.evaluate(()=>samples);
  for(const [kind,frames]of Object.entries(report.samples)){
   assert.ok(frames.some(f=>f.y>-309&&f.y<-281),kind+': actual intermediate movement');
   assert.ok(frames.some(f=>f.scale<1),kind+': actual scale animation');
   assert.ok(frames.some(f=>f.opacity>0&&f.opacity<255),kind+': actual fade');
   assert.ok(frames.every(f=>!f.normal),kind+': ordinary shop stays hidden');
  }
  report.errors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS actual browser: four dock entrances move/scale/fade; repeated refresh continues the same animation; pointer opening, special-card purchase, equipment claim and trait choice; early zero-rate exclusives absent; no ordinary-shop overlap');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
