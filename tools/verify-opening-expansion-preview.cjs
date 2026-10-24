const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('docs/evidence/opening-expansion');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ENCOUNTER_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
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
  await page.waitForFunction(()=>ccTest.find('Canvas')?.getComponent('FloatingRuinsBoard')?.ready,null,{timeout:45000});
  await page.evaluate(()=>{
   window.stage=ccTest.find('Canvas/Stage').getComponent('BattleStage');
   window.makeRun=(seed,save)=>new stage.session.constructor(stage.cfg,stage.runConfig,stage.waveTemplates,{runSeed:save?.runSeed??seed,stageCount:6,enemyGenerationMode:'legacy',openingEncounter:true,equipmentPolicy:stage.equipmentPolicy,enemyRoles:stage.enemyRoles,formationConfig:stage.formationConfig,enemyDifficulty:stage.enemyDifficulty,enemyPower:stage.enemyPower,...(save?{save}:{})});
   window.bind=s=>{stage.nextWaveRemaining=null;stage.stageRewards.hide();stage.ui.hideOpeningEncounter();stage.ui.hideEquipmentReward();stage.session=s;stage.resetBattle(false);stage.refreshShopUI();stage.refreshEconomyUI();stage.refreshRunUI();};
  });
  const report={cases:[]};
  for(const id of ['study','bounty','renewal']){
   const initial=await page.evaluate(()=>{
    const s=makeRun(11),save=s.snapshot();save.round.health=90;bind(makeRun(11,save));
    return{offered:stage.session.openingEncounterOptions,health:stage.flow.health};
   });
   assert.deepEqual(initial.offered.map(c=>c.id),['study','bounty','renewal']);
   await page.waitForTimeout(400);
   const layout=await page.evaluate(()=>{
    const root=stage.ui.openingEncounterPanel;
    return{cards:root.children.filter(n=>n.name.startsWith('encounter_')).map(n=>({id:n.name.slice(10),position:{x:n.position.x,y:n.position.y},size:n.getComponent('cc.UITransform').contentSize,center:point(n),texts:n.getComponentsInChildren('cc.Label').map(l=>l.string)})),normal:stage.ui.shopSlots.some(c=>c.node.activeInHierarchy),opacity:root.getComponent('cc.UIOpacity').opacity,scale:root.scale.x};
   });
   assert.equal(layout.cards.length,3);assert.equal(layout.normal,false);assert.equal(layout.opacity,255);assert.equal(layout.scale,1);
   for(const card of layout.cards){assert.ok(card.center.x>0&&card.center.x<1280&&card.center.y>0&&card.center.y<720);assert.equal(card.size.width,248);assert.ok(card.texts.some(t=>t.includes('额外')||t.includes('恢复')));}
   if(id==='study')await page.screenshot({path:path.join(output,'01-new-choices.png')});
   const p=layout.cards.find(c=>c.id===id).center;await page.mouse.click(p.x,p.y);
   const selected=await page.evaluate(()=>({selected:stage.save.openingEncounter.selected,pending:stage.session.pendingOpeningEncounter,locked:stage.session.openingShopLocked,normal:stage.ui.shopSlots.some(c=>c.node.activeInHierarchy)}));
   assert.equal(selected.selected,id);assert.equal(selected.pending,false);assert.equal(selected.locked,true);assert.equal(selected.normal,false);
   const result=await page.evaluate(()=>{
    const reloaded=makeRun(11,stage.session.snapshot());bind(reloaded);
    const u=stage.owned.all()[0];stage.session.moveUnit(u.uid,{location:'board',x:3,y:3});
    const sim=stage.session.startBattle();sim.end(0);const settlement=stage.session.settleBattle();
    stage.resetBattle(false);stage.refreshEconomyUI();stage.refreshRunUI();
    return{selected:stage.save.openingEncounter.selected,offered:stage.save.openingEncounter.offered,health:stage.flow.health,healthText:stage.ui.healthLabel.string,gold:stage.economy.gold,goldText:stage.ui.goldLabel.string,xpText:stage.ui.expLabel.string,reward:settlement.reward,round:settlement.round};
   });
   assert.deepEqual(result.offered,['study','bounty','renewal']);assert.equal(result.selected,id);
   assert.equal(result.reward.expGained,id==='study'?3:2);assert.equal(result.gold,id==='bounty'?3:1);
   assert.equal(result.health,id==='renewal'?93:90);assert.equal(result.healthText,`${result.health} / 100`);assert.equal(result.goldText,String(result.gold));assert.equal(result.xpText,id==='study'?'1 / 2':'0 / 2');
   await page.screenshot({path:path.join(output,`02-${id}-result.png`)});
   report.cases.push({id,initial,layout,selected,result});
  }
  report.mixed=await page.evaluate(()=>{const s=makeRun(1);bind(s);return{seed:s.save.runSeed,offered:s.openingEncounterOptions.map(c=>c.id)};});
  assert.notDeepEqual(report.mixed.offered,['study','bounty','renewal']);await page.waitForTimeout(400);
  await page.screenshot({path:path.join(output,'03-mixed-pool.png')});
  report.errors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS actual Cocos preview: three new card texts/layout, three pointer selections, stable reload, one-round shop lock, gold/XP/healing settlement and HUD, mixed seeded pool; no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
