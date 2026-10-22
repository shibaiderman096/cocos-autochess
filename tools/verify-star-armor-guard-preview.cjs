// Isolated real Creator preview; fixture positions/config copies never enter persistent saves.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ASTRAL_PLAYWRIGHT||'playwright');
const output=path.resolve(__dirname,'../docs/evidence/star-armor-guard');fs.mkdirSync(path.join(output,'frames'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const report={errors:[]};
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});await page.waitForTimeout(1500);
  report.setup=await page.evaluate(async()=>{
   const cc=window.cc??await window.System.import('cc'),s=cc.find('Canvas/Stage').getComponent('BattleStage');s.enabled=false;
   window.guardStage=s;window.guardCC=cc;const Sim=s.sim.constructor;
   s.levelSys.addExp(4);s.refreshEconomyUI();
   const ids=['star_armor_guard','oris','blackstar_warlock'];
   const owned=ids.map((id,i)=>({uid:i+1,unitId:id,star:1,location:'board',x:i?i-1:2,y:i?0:3,equipment:[]}));
   s.owned.all().splice(0,s.owned.all().length,...owned);
   s.session.createPreview=()=>{
    const blank=u=>({...u,atk:0,skillId:undefined,maxMana:0,startMana:0,hp:10000,critChance:0});
    const placements=[...owned.map((o,i)=>({cfg:i?blank(s.cfg.getUnit(o.unitId)):{...s.cfg.getUnit(o.unitId)},side:0,x:o.x,y:o.y})),
      {cfg:blank(s.cfg.getUnit('helion')),side:1,x:3,y:3}];
    const sim=new Sim(s.cfg,placements,{seed:1022});sim.units.forEach(u=>{u.atkCd=100000;u.moveCd=100000;});
    return {sim,battleIds:new Map(owned.map((o,i)=>[o.uid,i+1]))};
   };
   s.resetBattle(false);s.ui.setSideTab('traits');s.combatStats.begin(s.sim.units);
   window.guardPoint=node=>{
    const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
    const screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
    const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
    return {x:rect.x+screen.x/canvas.width*rect.width,y:rect.y+(1-screen.y/canvas.height)*rect.height};
   };
   window.guardAdvance=tick=>{
    if(tick>0&&s.sim.tick===0){const u=s.sim.units[0];u.cfg.atk=0;u.cfg.critChance=0;u.mana=100;u.atkCd=0;}
    while(s.sim.tick<Math.floor(tick))s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0,tick-Math.floor(tick));
    s.ui.setCombatActive(true);s.ui.hideFightBtn();s.ui.setBattleTimer(s.sim.clockState);
    s.combatStats.consume(s.sim.events);s.ui.refreshCombatStats(s.combatStats.snapshot());
   };
   window.guardVisual=()=>{
    const view=s.views.get(1),enemy=s.views.get(4),aura=view.node.getChildByName('stellarBarrier');
    const body=view.node.getChildByName('attackMotion').getChildByName('body'),enemyBody=enemy.node.getChildByName('attackMotion').getChildByName('body');
    return {tick:s.sim.tick,renderTick:s.replayer.renderTick,position:{x:view.node.position.x,y:view.node.position.y},
     bodyLoaded:!!body.getComponent('cc.Sprite').spriteFrame,bodySize:body.getComponent('cc.UITransform').contentSize,
     shield:s.sim.units[0].shield,aura:aura?{active:aura.active,loaded:!!aura.getComponent('cc.Sprite').spriteFrame,angle:aura.angle}:null,
     enemyBodyY:enemyBody.position.y,charge:!!s.sim.units[0].stellarCharge,knockups:s.sim.events.filter(e=>e.t==='knockup')};
   };
   return {members:s.cfg.battle.traits.find(t=>t.id==='astral').members,tiles:s.sim.astralFields[0].cells.length,
    active:s.ui.traitPanel.states.find(t=>t.config.id==='astral').active.count,unit:s.cfg.getUnit(ids[0])};
  });
  assert.equal(report.setup.active,3);assert.equal(report.setup.tiles,7);
  await page.waitForTimeout(500);report.initial=await page.evaluate(()=>window.guardVisual());assert.ok(report.initial.bodyLoaded);
  await page.screenshot({path:path.join(output,'01-roster-three-astral.png')});
  // Select the actual piece, then open and close its actual skill button with mouse input.
  const unitPoint=await page.evaluate(()=>window.guardPoint(window.guardStage.views.get(1).node));
  await page.mouse.click(unitPoint.x,unitPoint.y);await page.waitForTimeout(200);
  report.detail=await page.evaluate(()=>({visible:window.guardStage.ui.unitDetailVisible,data:window.guardStage.ui.currentDetail,
   portrait:!!window.guardStage.ui.unitPortrait.spriteFrame}));assert.equal(report.detail.visible,true);assert.equal(report.detail.data.name,'星铠守卫');
  await page.screenshot({path:path.join(output,'02-unit-detail.png')});
  const skillPoint=await page.evaluate(()=>window.guardPoint(window.guardStage.ui.skillIconNode));
  await page.mouse.click(skillPoint.x,skillPoint.y);await page.waitForTimeout(300);
  report.skill=await page.evaluate(()=>({active:window.guardStage.ui.detailPopup.active,
   text:window.guardStage.ui.unitDetail.string,rows:window.guardStage.ui.currentDetail.skillStats,
   height:window.guardStage.ui.detailPopup.getComponent('cc.UITransform').contentSize.height}));
  assert.equal(report.skill.active,true);assert.ok(report.skill.text.includes('0.75'));assert.equal(report.skill.rows.length,4);
  assert.equal(report.detail.data.atk,30);assert.equal(report.detail.data.mana,40);assert.ok(report.detail.data.skillName.includes('250护盾'));
  await page.screenshot({path:path.join(output,'03-stellar-bulwark-skill.png')});
  const close=await page.evaluate(()=>window.guardPoint(window.guardStage.ui.detailPopupClose));await page.mouse.click(close.x,close.y);
  assert.equal(await page.evaluate(()=>window.guardStage.ui.detailPopup.active),false);
  await page.evaluate(()=>window.guardStage.ui.closeUnitDetail());
  for(let i=0;i<49;i++) {
   await page.evaluate(t=>window.guardAdvance(t),i*.5);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   if(i===10) {
    await page.waitForTimeout(200);report.airborne=await page.evaluate(()=>window.guardVisual());
    await page.screenshot({path:path.join(output,'04-charge-and-knockup.png')});
    await page.waitForTimeout(500);report.paused=await page.evaluate(()=>window.guardVisual());assert.deepEqual(report.paused,report.airborne);
   }
   await page.screenshot({path:path.join(output,'frames',String(i).padStart(3,'0')+'.png')});
  }
  report.after=await page.evaluate(()=>window.guardVisual());assert.equal(report.after.knockups.length,1);assert.equal(report.after.knockups[0].duration,.75);
  assert.ok(report.airborne.aura.active&&report.airborne.aura.loaded);assert.ok(report.airborne.enemyBodyY>report.initial.enemyBodyY);
  assert.equal(report.after.charge,false);assert.equal(report.after.enemyBodyY,report.initial.enemyBodyY);
  report.events=await page.evaluate(()=>window.guardStage.sim.events);assert.equal(report.events.filter(e=>e.t==='hit').length,0);
  await page.evaluate(()=>window.guardAdvance(81));report.expired=await page.evaluate(()=>window.guardVisual());
  assert.equal(report.expired.shield,0);assert.equal(report.expired.aura.active,false);
  await page.evaluate(()=>{window.guardStage.sim.end(-1);window.guardStage.replayer.consumeEvents();window.guardStage.replayer.syncViews(0);});
  report.end=await page.evaluate(()=>window.guardVisual());assert.equal(report.end.aura.active,false);
  await page.evaluate(()=>window.guardStage.resetBattle(false));await page.waitForTimeout(200);
  report.rebind=await page.evaluate(()=>window.guardVisual());assert.equal(report.rebind.aura,null);assert.equal(report.rebind.knockups.length,0);
  report.speed=await page.evaluate(()=>{
   const s=window.guardStage;
   const sample=(speed,frames)=>{
    s.resetBattle(false);const u=s.sim.units[0];u.cfg.atk=0;u.cfg.critChance=0;u.mana=100;u.atkCd=0;
    for(let i=0;i<frames;i++)s.driver.advance(speed/60);
    s.replayer.consumeEvents();s.replayer.syncViews(0,s.driver.interpolation,speed);
    return window.guardVisual();
   };
   return {normal:sample(1,24),double:sample(2,12)};
  });
  assert.ok(Math.abs(report.speed.normal.renderTick-report.speed.double.renderTick)<1e-8);
  assert.ok(Math.abs(report.speed.normal.enemyBodyY-report.speed.double.enemyBodyY)<1e-6);
  assert.ok(Math.abs(report.speed.normal.aura.angle-report.speed.double.aura.angle)<1e-6);
  report.activeEnd=await page.evaluate(()=>{
   const s=window.guardStage;s.sim.end(-1);s.replayer.consumeEvents();s.replayer.syncViews(0);return window.guardVisual();
  });
  assert.equal(report.activeEnd.aura.active,false);assert.equal(report.activeEnd.enemyBodyY,report.initial.enemyBodyY);
  assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS real Creator preview: natural 3 Astral, supplied art, actual unit/skill clicks, charge, painted shield, fixed knockup, pause, expiry/end/rebind.');
 }catch(e){fs.writeFileSync(path.join(output,'browser-failure.json'),JSON.stringify({...report,error:e.stack},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

