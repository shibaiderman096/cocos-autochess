const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ASTRAL_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/new-astral-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[];const report={};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:7456/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.cc=window.cc||await System.import('cc');window.point=node=>{
   const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()),screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
   const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};};});
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>window.menu=cc.find('Canvas').getComponentInChildren('MainMenu'));
  async function click(fn,arg){const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(180);}
  await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection_units')));
  for(const id of ['xiya','nebula_weaver','gravity_executor']){
   await page.evaluate(id=>{const c=menu.collection,i=c.entries().findIndex(e=>e.id===id);c.page=Math.floor(i/8);c.selected=c.page*8;c.render();},id);
   await click(id=>point(menu.collection.body.getChildByName('collectionEntry_'+id)),id);
   await page.waitForFunction(id=>{const n=menu.collection.body.getChildByName('collectionEntry_'+id);return n.getComponentsInChildren('cc.Sprite').every(s=>!!s.spriteFrame);},id);
   report[id+'Catalog']=await page.evaluate(()=>{const c=menu.collection;return {id:c.entries()[c.selected].id,text:c.body.getChildByName('collectionDetail').getComponentsInChildren('cc.Label').map(l=>l.string).join('\n')};});
   assert.equal(report[id+'Catalog'].id,id);await page.screenshot({path:path.join(output,id+'-catalog.png')});
   await click(()=>point(menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_3')));
   assert.equal(await page.evaluate(()=>menu.collection.star),3);
  }
  await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('BattleStage')?.loaded);
  await page.evaluate(()=>{
   const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
   if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
   s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);s.levelSys.addExp(100);
   const ids=['xiya','nebula_weaver','gravity_executor','milu','star_armor_guard','oris','blackstar_warlock'];
   const positions=[{x:1,y:3},{x:2,y:2},{x:3,y:3},{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}];
   const owned=ids.map((unitId,i)=>({uid:i+1,unitId,star:1,location:'board',...positions[i],equipment:[]}));
   s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
   s.session.createPreview=()=>{
    const blank=id=>({...s.cfg.getUnit(id),hp:20000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0});
    const sim=new Sim(s.cfg,[...owned.map((o,i)=>({cfg:i<3?{...s.cfg.getUnit(o.unitId),critChance:0}:blank(o.unitId),side:0,x:o.x,y:o.y})),
     ...[{x:4,y:3},{x:5,y:3},{x:4,y:4}].map(p=>({cfg:blank('helion'),side:1,...p}))],{seed:1024});
    sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {sim,battleIds:new Map(owned.map((o,i)=>[o.uid,i+1]))};
   };
   window.install=()=>{s.resetBattle(false);s.ui.setSideTab('traits');s.refreshEconomyUI();};install();
   window.advance=t=>{if(s.sim.tick===0&&t>0)for(const u of s.sim.units.slice(0,3)){u.mana=u.cfg.maxMana;u.atkCd=0;}
    while(s.sim.tick<Math.floor(t)){s.sim.step();if(s.sim.tick===7)s.sim.units.slice(0,3).forEach(u=>u.atkCd=100000);}
    s.replayer.consumeEvents();s.replayer.syncViews(0,t-Math.floor(t));};
   window.visual=()=>({tick:s.sim.tick,arrows:s.replayer.astralUnitVfx.moonSlots.map(s=>({active:s.node.active,position:s.node.position,angle:s.node.angle,opacity:s.node.getComponent('cc.UIOpacity').opacity,frame:s.frameIndex,loaded:!!s.sprite.spriteFrame})),
    fields:s.replayer.astralUnitVfx.nebulaSlots.map(s=>({active:s.node.active,position:s.node.position,opacity:s.node.getComponent('cc.UIOpacity').opacity,frame:s.frameIndex,loaded:!!s.sprite.spriteFrame}))});
  });
  await page.waitForFunction(()=>[1,2,3].every(id=>!!stage.views.get(id).node.getChildByName('attackMotion').getChildByName('body').getComponent('cc.Sprite').spriteFrame));
  for(const [id,name]of [[1,'xiya'],[2,'nebula_weaver'],[3,'gravity_executor']]){
   await click(id=>point(stage.views.get(id).node),id);
   report[name+'Detail']=await page.evaluate(()=>({visible:stage.ui.unitDetailVisible,data:stage.ui.currentDetail,portrait:!!stage.ui.unitPortrait.spriteFrame}));
   assert.equal(report[name+'Detail'].visible,true);assert.equal(report[name+'Detail'].portrait,true);
   await click(()=>point(stage.ui.skillIconNode));assert.equal(await page.evaluate(()=>stage.ui.detailPopup.active),true);
   await page.screenshot({path:path.join(output,name+'-skill.png')});
   await click(()=>point(stage.ui.detailPopupClose));await page.evaluate(()=>stage.ui.closeUnitDetail());
  }
  for(const t of [5.5,8.5,11.5,17.5,67,87]){
   await page.evaluate(t=>advance(t),t);
   await page.waitForFunction(()=>{const fx=stage.replayer.astralUnitVfx;return [...fx.moonSlots,...fx.nebulaSlots].every(s=>s.frames.filter(Boolean).length===8);});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   report['tick'+t]=await page.evaluate(()=>visual());
   if(t===17.5){
    report.liveGravity=await page.evaluate(()=>({armor:stage.sim.units[2].armor,mr:stage.sim.units[2].mr,bonus:stage.sim.units[2].gravityResistanceBonus,taunts:stage.sim.units.filter(u=>u.side===1).map(u=>u.tauntSourceId)}));
    assert.equal(report.liveGravity.bonus,30);assert.equal(report.liveGravity.armor,85);assert.equal(report.liveGravity.mr,85);assert.deepEqual(report.liveGravity.taunts,[3,3,3]);
   }
   if(t===8.5){const before=await page.evaluate(()=>visual());await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>visual()),before,'pause holds arrows and nebula');await page.screenshot({path:path.join(output,'arrows-and-nebula.png')});}
  }
  assert.ok(report['tick8.5'].arrows.some(s=>s.active));assert.ok(report['tick8.5'].fields.some(s=>s.active));assert.ok(report.tick87.fields.every(s=>!s.active));
  assert.ok(report['tick8.5'].arrows.filter(s=>s.active).every(s=>s.loaded),'painted arrow frames load in Creator');
  assert.ok(report['tick8.5'].fields.every(s=>s.loaded),'painted field frames load in Creator');
  assert.notEqual(report['tick8.5'].fields[0].frame,report['tick11.5'].fields[0].frame,'field changes painted phase');
  report.fieldLayer=await page.evaluate(()=>{const fx=stage.replayer.astralUnitVfx;return {ground:fx.groundRoot.getSiblingIndex(),units:fx.groundRoot.parent.getChildByName('units').getSiblingIndex()};});
  assert.ok(report.fieldLayer.ground<report.fieldLayer.units);
  report.events=await page.evaluate(()=>stage.sim.events);assert.equal(report.events.filter(e=>e.t==='moon_arrow').length,3);assert.equal(report.events.filter(e=>e.t==='nebula').length,1);
  assert.equal(report.events.filter(e=>e.t==='gravity_field').length,1);
  report.speed=await page.evaluate(()=>{const sample=(speed,frames)=>{install();for(const u of stage.sim.units.slice(0,3)){u.mana=u.cfg.maxMana;u.atkCd=0;}for(let i=0;i<frames;i++)stage.driver.advance(speed/60);stage.replayer.consumeEvents();stage.replayer.syncViews(0,stage.driver.interpolation,speed);return visual();};return {normal:sample(1,24),double:sample(2,12)};});
  assert.deepEqual(report.speed.normal,report.speed.double,'same simulated time produces identical arrow and field visuals at 1x and 2x');
  if(process.env.ASTRAL_RECORD==='1'){
   for(const [id,name]of [[1,'xiya'],[2,'nebula_weaver'],[3,'gravity_executor']]){
    const frames=path.join(output,'animation-'+name);fs.mkdirSync(frames,{recursive:true});
    await page.evaluate(id=>{install();for(const u of stage.sim.units.slice(0,3))if(u.id!==id){u.cfg={...u.cfg,skillId:undefined,maxMana:0};u.mana=0;}advance(0);},id);
    for(let i=0;i<60;i++){
     await page.evaluate(t=>advance(t),i*4/3);
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     await page.screenshot({path:path.join(frames,String(i).padStart(3,'0')+'.png'),clip:{x:290,y:150,width:700,height:400}});
    }
   }
  }
  await page.evaluate(()=>{stage.sim.end(-1);stage.replayer.consumeEvents();stage.replayer.syncViews(0);});assert.ok((await page.evaluate(()=>visual())).fields.every(s=>!s.active));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,errors},null,2));
  console.log('PASS Creator 1280x720: three catalogue portraits/star clicks, deployed portraits/detail/skill clicks, three silver moon arrows, 3-second nebula, 4-second gravity field, pause and cleanup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
