const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/forge-batch-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:960,height:540}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,
    ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'}:{})});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
   await page.evaluate(async()=>{window.cc=await System.import('cc');});
   await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
   await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
   await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
   await page.evaluate(()=>{
    const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
    if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
    s.ui.hideOpeningEncounter();const wave=s.session.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');s.session.debugJump(4,wave.round);
    s.session.economy.gold=30;s.session.owned.equipmentReserve.push('basic_iron_shield');
    s.resetBattle(false);s.refreshShopUI();s.refreshRunUI();s.refreshBackpack();s.refreshEconomyUI();s.openStageReward();
    window.point=node=>{const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()));return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};
    window.find=name=>s.ui.node.getComponentsInChildren('cc.UITransform').map(t=>t.node).find(n=>n.name===name&&n.activeInHierarchy);
   });
   const click=async name=>{const p=await page.evaluate(n=>point(find(n)),name);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
   await page.waitForFunction(()=>!!find('merchantTab_forge'));
   await page.waitForTimeout(500);
   await click('merchantTab_forge');
   await page.waitForFunction(()=>!!find('forgeDropTarget'));
   await page.evaluate(()=>{const p=stage.stageRewards.services;p.selected='basic_iron_shield';stage.refreshEconomyUI();});
   await page.waitForFunction(()=>!!find('forgeEnhanceTen'),null,{timeout:7000});
   const before=await page.evaluate(()=>{const nodes=['forgeEnhance','forgeEnhanceTen'].map(name=>find(name));return{mobile:cc.sys.isMobile,gold:stage.economy.gold,boxes:nodes.map(n=>{const t=n.getComponent('cc.UITransform'),p=point(n);return{x:p.x,y:p.y,w:t.width,h:t.height,text:n.getChildByName('text').getComponent('cc.Label').string};})};});
   assert.equal(before.mobile,mobile);assert.equal(before.gold,30);assert.ok(before.boxes[1].text.includes('强化10次'));
   assert.ok(before.boxes[0].y<before.boxes[1].y);assert.ok(before.boxes.every(b=>b.x>0&&b.x<(mobile?960:1280)&&b.y>0&&b.y<(mobile?540:720)));
   await click('forgeEnhanceTen');
   await page.waitForFunction(()=>stage.session.forgeLevel(stage.owned.equipmentReserve[0])===10);
   assert.equal(await page.evaluate(()=>stage.economy.gold),0);
   await click('forgeEnhanceTen');assert.equal(await page.evaluate(()=>stage.session.forgeLevel(stage.owned.equipmentReserve[0])),10,'disabled button never upgrades');
   await page.screenshot({path:path.join(output,mobile?'mobile.png':'desktop.png')});
   assert.deepEqual(errors,[]);console.log(`PASS ${mobile?'mobile touch':'desktop mouse'} preview: two readable buttons, ten real upgrades, 30 gold deducted, insufficient-funds button inert, zero page errors`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
