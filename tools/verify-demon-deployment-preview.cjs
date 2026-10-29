const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.DEMON_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/demon-deployment-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.cc=await System.import('cc');});
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
  await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
  await page.evaluate(()=>{
   const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
   if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
   s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);s.session.level.level=3;
   s.owned.all().splice(0,s.owned.all().length);
   ['redhorn_imp','hellflame_hound','saien'].forEach((id,i)=>{const u=s.owned.addToBench(id,12);u.location='board';u.x=i+1;u.y=1;});
   s.resetBattle(false);
   window.summon=()=>s.sim.units.find(u=>u.side===0&&u.cfg.summonOnly);
   window.point=(x,y)=>{
    const board=s.boardNode,bv=board.getComponent('BoardView');
    const world=board.getComponent('cc.UITransform').convertToWorldSpaceAR(bv.cellToWorld(x,y));
    const screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
    const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
    return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};
   };
  });
  await page.waitForFunction(()=>stage.views.get(summon().id)?.visualReady);
  assert.equal(await page.evaluate(()=>stage.views.get(summon().id).node.active),true);
  const drag=async to=>{
   const start=await page.evaluate(()=>point(summon().x,summon().y)),end=await page.evaluate(p=>point(p.x,p.y),to);
   await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:15});await page.mouse.up();
   await page.waitForTimeout(160);
  };
  await drag({x:6,y:2});assert.deepEqual(await page.evaluate(()=>summon().pos),{x:6,y:2});
  await drag({x:1,y:1});assert.deepEqual(await page.evaluate(()=>summon().pos),{x:1,y:1});
  assert.deepEqual(await page.evaluate(()=>{const u=stage.owned.all()[0];return {x:u.x,y:u.y};}),{x:6,y:2});
  const click=await page.evaluate(()=>point(summon().x,summon().y));await page.mouse.click(click.x,click.y);await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>stage.ui.unitCost.string),'0金');
  await page.screenshot({path:path.join(output,'preparation-detail.png')});
  await page.evaluate(()=>{stage.ui.closeUnitDetail();stage.startFight();});
  assert.equal(await page.evaluate(()=>stage.flow.phase),'battle');
  assert.deepEqual(await page.evaluate(()=>summon().pos),{x:1,y:1});
  await page.waitForTimeout(160);await page.screenshot({path:path.join(output,'battle-deployment.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS actual Cocos preview: preparation summon visible, mouse drag, occupied-cell swap, 0金 detail, combat starts at chosen cell; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
