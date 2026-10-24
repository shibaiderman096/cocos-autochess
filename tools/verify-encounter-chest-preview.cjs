const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('docs/evidence/encounter-chest');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   const cc=window.cc||await System.import('cc');window.ccTest=cc;
   if(!cc.find('Canvas/Stage')?.getComponent('BattleStage')&&!cc.find('Canvas')?.getComponentInChildren('MainMenu'))
    await new Promise((resolve,reject)=>cc.director.loadScene('main',e=>e?reject(e):resolve()));
   window.point=node=>{const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()));const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};
  });
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded||ccTest.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  const start=await page.evaluate(()=>{const menu=ccTest.find('Canvas')?.getComponentInChildren('MainMenu');return menu?point(menu.node.getChildByName('startGame')):null;});
  if(start)await page.mouse.click(start.x,start.y);
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded,null,{timeout:45000});
  const report={};
  report.initial=await page.evaluate(()=>{
   window.stage=ccTest.find('Canvas/Stage').getComponent('BattleStage');
   window.makeRun=seed=>new stage.session.constructor(stage.cfg,stage.runConfig,stage.waveTemplates,{runSeed:seed,stageCount:6,enemyGenerationMode:'legacy',equipmentPolicy:stage.equipmentPolicy,enemyRoles:stage.enemyRoles,formationConfig:stage.formationConfig,enemyDifficulty:stage.enemyDifficulty,enemyPower:stage.enemyPower});
   stage.session=makeRun(7);stage.resetBattle(false);stage.refreshShopUI();stage.refreshEconomyUI();stage.refreshRunUI();
   return{health:stage.flow.health,label:stage.ui.healthLabel.string};
  });
  assert.deepEqual(report.initial,{health:100,label:'100 / 100'});
  await page.waitForFunction(()=>!!ccTest.director.getScene().getChildByName('FloatingRuinsEnvironment'));
  await page.waitForTimeout(1200);
  await page.screenshot({path:path.join(output,'01-health-100.png')});
  await page.evaluate(()=>{
   const w=stage.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');stage.session.debugJump(2,w.round);
   stage.resetBattle(false);stage.refreshShopUI();stage.refreshRunUI();
   window.outgoingWave=stage.flow.wave.id;window.shopFrames=[];window.watchingShop=false;
   window.watchShop=()=>{shopFrames.push({wave:stage.flow.wave.id,transitioning:stage.transitioning,normal:stage.ui.shopSlots.some(c=>c.node.activeInHierarchy),header:stage.ui.shopHeader.activeInHierarchy,controls:stage.ui.economyControls.activeInHierarchy});if(watchingShop&&shopFrames.length<2000)requestAnimationFrame(watchShop);};
  });
  await page.waitForFunction(()=>!!stage.shopVisitor?.model);
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(output,'02-special-shop.png')});
  await page.evaluate(()=>{watchingShop=true;requestAnimationFrame(watchShop);});
  const next=await page.evaluate(()=>point(stage.ui.nextWaveBtn));await page.mouse.click(next.x,next.y);
  await page.waitForFunction(()=>stage.flow.wave.id!==outgoingWave&&!stage.transitioning);
  report.shop=await page.evaluate(()=>{watchingShop=false;return{outgoing:shopFrames.filter(f=>f.wave===outgoingWave),incoming:shopFrames.filter(f=>f.wave!==outgoingWave),current:stage.flow.wave.id,normal:stage.ui.shopSlots.every(c=>c.node.activeInHierarchy)};});
  assert.ok(report.shop.outgoing.length>0);assert.ok(report.shop.outgoing.every(f=>!f.normal&&!f.header&&!f.controls),'outgoing shop must never reveal ordinary shop cards or controls');
  assert.ok(report.shop.outgoing.some(f=>f.transitioning),'sampling includes the departure animation');
  assert.ok(report.shop.incoming.length>0,'sampling crosses the fully covered wave swap');
  assert.ok(report.shop.normal,'normal shop restored after transition');
  await page.screenshot({path:path.join(output,'03-next-wave-shop.png')});
  report.boss=[];
  const seeds=await page.evaluate(()=>{
   const found={};for(let seed=1;seed<=100;seed++){
    const run=makeRun(seed),boss=run.waves.find(w=>w.stage===4&&w.encounterKind==='boss');
    const kind=['units','equipment','health'][run.random.stream('reward',boss.id,4300).int(0,2)];found[kind]??=seed;
    if(Object.keys(found).length===3)break;
   }return found;
  });
  for(const [kind,seed]of Object.entries(seeds)){
   await page.evaluate(({seed})=>{
    stage.nextWaveRemaining=null;stage.session=makeRun(seed);
    const boss=stage.waves.find(w=>w.stage===4&&w.encounterKind==='boss');stage.session.debugJump(4,boss.round);
    stage.flow.state.health=60;
    const unit=stage.owned.all()[0];stage.session.moveUnit(unit.uid,{location:'board',x:3,y:3});
    const sim=stage.session.startBattle();sim.end(0);stage.session.settleBattle();
    stage.resultShown=true;stage.fighting=false;stage.resetBattle(false);stage.refreshShopUI();stage.refreshEconomyUI();stage.refreshRunUI();
    window.lastGrant=null;const original=stage.session.claimStageReward.bind(stage.session);
    stage.session.claimStageReward=action=>{const result=original(action);lastGrant=result.stageReward;return result;};
   },{seed});
   await page.waitForFunction(()=>stage.bossChest?.model&&stage.bossChest.root.activeInHierarchy);
   assert.equal(await page.evaluate(()=>stage.stageRewards.root?.activeInHierarchy??false),false,'boss choice panel stays hidden before opening');
   await page.screenshot({path:path.join(output,`04-${kind}-unopened.png`)});
   const chest=await page.evaluate(()=>point(stage.bossChest.root));await page.mouse.click(chest.x,chest.y);
   await page.waitForFunction(()=>!!lastGrant,null,{timeout:10000});
   const result=await page.evaluate(()=>({grant:lastGrant,health:stage.flow.health,label:stage.ui.healthLabel.string,pending:stage.session.pendingStageReward??null,equipment:[...stage.owned.equipmentReserve],flight:!!stage.rewardFlight}));
   assert.equal(result.grant.kind,kind);assert.equal(result.pending,null);
   if(kind==='health'){assert.equal(result.health,65);assert.equal(result.label,'65 / 100');}
   if(kind==='equipment')assert.ok(result.equipment.includes(result.grant.equipmentId));
   if(kind==='units')assert.ok(result.grant.units.length>0);
   report.boss.push({seed,...result});
   await page.screenshot({path:path.join(output,`05-${kind}-opened.png`)});
   await page.waitForFunction(()=>!stage.rewardFlight);
   await page.evaluate(()=>{stage.nextWaveRemaining=null;});
  }
  report.errors=errors;assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS actual browser pointer interactions: 100 health, frame-by-frame special-shop exit, three random boss rewards, direct equipment delivery, +5 health and unit flight');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
