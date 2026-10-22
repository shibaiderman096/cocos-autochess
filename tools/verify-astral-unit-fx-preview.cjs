const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ASTRAL_PLAYWRIGHT||'playwright');
const output=path.resolve(__dirname,'../docs/evidence/astral-unit-fx');fs.mkdirSync(path.join(output,'frames'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const report={errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});await page.waitForTimeout(1200);
  report.roster=await page.evaluate(async()=>{
   const cc=window.cc??await window.System.import('cc'),s=cc.find('Canvas/Stage').getComponent('BattleStage');s.enabled=false;
   window.starStage=s;window.starCC=cc;const Sim=s.sim.constructor;
   s.levelSys.addExp(10);s.refreshEconomyUI();
   const ids=['star_armor_guard','milu','oris','blackstar_warlock'],positions=[{x:2,y:3},{x:5,y:2},{x:0,y:0},{x:1,y:0}];
   const owned=ids.map((unitId,i)=>({uid:i+1,unitId,star:1,location:'board',...positions[i],equipment:[]}));
   s.owned.all().splice(0,s.owned.all().length,...owned);
   s.session.createPreview=()=>{
    const blank=id=>({...s.cfg.getUnit(id),hp:10000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0});
    const sim=new Sim(s.cfg,[...owned.map((o,i)=>({cfg:i<2?{...s.cfg.getUnit(o.unitId)}:blank(o.unitId),side:0,x:o.x,y:o.y})),
     {cfg:blank('helion'),side:1,x:3,y:3},{cfg:blank('abyss_iron_guard'),side:1,x:5,y:3}],{seed:1022});
    sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {sim,battleIds:new Map(owned.map((u,i)=>[u.uid,i+1]))};
   };
   window.starInstall=()=>{s.resetBattle(false);s.ui.setSideTab('traits');s.combatStats.begin(s.sim.units);};window.starInstall();
   window.starPoint=node=>{
    const w=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
    const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(w),canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
    return {x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};
   };
   window.starReady=()=>{for(const u of s.sim.units.slice(0,2)){u.mana=u.cfg.maxMana;u.atkCd=0;u.cfg.atk=0;u.cfg.critChance=0;}};
   window.starAdvance=t=>{
    if(t>0&&s.sim.tick===0)window.starReady();while(s.sim.tick<Math.floor(t))s.sim.step();
    s.replayer.consumeEvents();s.replayer.syncViews(0,t-Math.floor(t));s.ui.setCombatActive(true);s.ui.hideFightBtn();s.ui.setBattleTimer(s.sim.clockState);
    s.combatStats.consume(s.sim.events);s.ui.refreshCombatStats(s.combatStats.snapshot());
   };
   window.starVisual=()=>({tick:s.sim.tick,renderTick:s.replayer.renderTick,
    actors:s.sim.units.slice(0,2).map(u=>({id:u.id,pos:u.pos,shield:u.shield,mana:u.mana,
     node:{x:s.views.get(u.id).node.position.x,y:s.views.get(u.id).node.position.y},
     bodyLoaded:!!s.views.get(u.id).node.getChildByName('attackMotion').getChildByName('body').getComponent('cc.Sprite').spriteFrame,
     barrier:s.views.get(u.id).node.getChildByName('stellarBarrier')?.active??false})),
    effects:s.replayer.astralUnitVfx.slots.map(slot=>({path:slot.path,name:slot.sprite.node.name,active:slot.sprite.node.active,
     loaded:!!slot.sprite.spriteFrame,position:{x:slot.sprite.node.position.x,y:slot.sprite.node.position.y},
     scale:slot.sprite.node.scale.x,angle:slot.sprite.node.angle,opacity:slot.sprite.node.getComponent('cc.UIOpacity').opacity})),
    enemyY:s.views.get(5).node.getChildByName('attackMotion').getChildByName('body').position.y});
   return {formalMembers:s.cfg.battle.traits.find(t=>t.id==='astral').members,
    active:s.ui.traitPanel.states.find(t=>t.config.id==='astral').active.count,tiles:s.sim.astralFields[0].cells.length,
    level:s.levelSys.level,cap:s.levelSys.unitCap,units:ids.map(id=>s.cfg.getUnit(id))};
  });
  assert.equal(report.roster.formalMembers.length,4);assert.equal(report.roster.active,3);assert.equal(report.roster.cap,4);assert.equal(report.roster.tiles,7);
  await page.waitForTimeout(450);report.initial=await page.evaluate(()=>window.starVisual());assert.ok(report.initial.actors.every(a=>a.bodyLoaded));
  await page.screenshot({path:path.join(output,'01-four-formal-members.png')});
  for(const [id,name]of [[1,'guard'],[2,'milu']]){
   const point=await page.evaluate(id=>window.starPoint(window.starStage.views.get(id).node),id);await page.mouse.click(point.x,point.y);await page.waitForTimeout(160);
   const detail=await page.evaluate(()=>({visible:window.starStage.ui.unitDetailVisible,data:window.starStage.ui.currentDetail,portrait:!!window.starStage.ui.unitPortrait.spriteFrame}));
   assert.equal(detail.visible,true);assert.equal(detail.portrait,true);report[name+'Detail']=detail;
   await page.screenshot({path:path.join(output,`02-${name}-detail.png`)});
   const skill=await page.evaluate(()=>window.starPoint(window.starStage.ui.skillIconNode));await page.mouse.click(skill.x,skill.y);await page.waitForTimeout(200);
   assert.equal(await page.evaluate(()=>window.starStage.ui.detailPopup.active),true);
   await page.screenshot({path:path.join(output,`03-${name}-skill.png`)});
   const close=await page.evaluate(()=>window.starPoint(window.starStage.ui.detailPopupClose));await page.mouse.click(close.x,close.y);
   assert.equal(await page.evaluate(()=>window.starStage.ui.detailPopup.active),false);
   await page.evaluate(()=>window.starStage.ui.closeUnitDetail());
  }
  assert.equal(report.miluDetail.data.atk,40);assert.equal(report.miluDetail.data.mana,0);assert.equal(report.miluDetail.data.maxMana,60);
  assert.equal(report.miluDetail.data.skillStats[0].stars,'120 / 180 / 270');
  report.samples=[];
  for(let i=0;i<49;i++){
   const tick=i*.5;await page.evaluate(t=>window.starAdvance(t),tick);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   if([3,6,10,16,24,48].includes(i))report.samples.push(await page.evaluate(()=>window.starVisual()));
   if(i===6){
    await page.waitForTimeout(250);report.pauseBefore=await page.evaluate(()=>window.starVisual());await page.waitForTimeout(450);
    report.pauseAfter=await page.evaluate(()=>window.starVisual());assert.deepEqual(report.pauseBefore,report.pauseAfter);
    await page.screenshot({path:path.join(output,'04-both-painted-skills.png')});
   }
   await page.screenshot({path:path.join(output,'frames',String(i).padStart(3,'0')+'.png')});
  }
  const names=new Set(report.samples.flatMap(s=>s.effects.filter(e=>e.active&&e.loaded).map(e=>e.name)));
  assert.deepEqual([...names].sort(),['miluStarImpact','miluStarTrail','stellarRush']);assert.ok(report.samples.some(s=>s.actors[0].barrier));
  report.combat=await page.evaluate(()=>({events:window.starStage.sim.events,units:window.starStage.sim.units.map(u=>({id:u.id,pos:u.pos,hp:u.hp,mr:u.mr,spellPower:u.cfg.spellPower}))}));
  const hits=report.combat.events.filter(e=>e.t==='hit');assert.equal(hits.length,1);assert.equal(hits[0].source,2);assert.equal(hits[0].id,6);assert.equal(hits[0].dmgType,'magic');
  assert.equal(hits[0].dmg,Math.round(120*(1+report.combat.units[1].spellPower/100)*100/(100+report.combat.units[5].mr)));
  const knock=report.combat.events.filter(e=>e.t==='knockup');assert.equal(knock.length,1);assert.equal(knock[0].source,1);assert.equal(knock[0].duration,.75);
  // Integer frame counts compare exactly the same accumulated simulated time.
  report.speed=await page.evaluate(()=>{
   const s=window.starStage;const sample=(speed,frames)=>{window.starInstall();window.starReady();for(let i=0;i<frames;i++)s.driver.advance(speed/60);
    s.replayer.consumeEvents();s.replayer.syncViews(0,s.driver.interpolation,speed);return window.starVisual();};
   return {normal:sample(1,12),double:sample(2,6)};
  });
  assert.ok(Math.abs(report.speed.normal.renderTick-report.speed.double.renderTick)<1e-8);
  for(let i=0;i<3;i++){const a=report.speed.normal.effects[i],b=report.speed.double.effects[i];assert.equal(a.active,b.active);assert.ok(Math.abs(a.position.x-b.position.x)<1e-6);assert.ok(Math.abs(a.scale-b.scale)<1e-6);}
  report.interrupt=await page.evaluate(()=>{
   const s=window.starStage,u=s.sim.units[0],enemy=s.sim.units[4];
   s.sim.pendingStuns.push({src:enemy,dst:u,seconds:1});s.sim.resolveStuns();s.replayer.consumeEvents();s.replayer.syncViews(0);return window.starVisual();
  });
  assert.equal(report.interrupt.effects.find(e=>e.name==='stellarRush').active,false);
  report.activeEnd=await page.evaluate(()=>{const s=window.starStage;s.sim.end(-1);s.replayer.consumeEvents();s.replayer.syncViews(0);return window.starVisual();});
  assert.ok(report.activeEnd.effects.every(e=>!e.active));assert.equal(report.activeEnd.actors[0].barrier,false);assert.equal(report.activeEnd.enemyY,report.initial.enemyY);
  report.reuse=await page.evaluate(()=>{
   const s=window.starStage;window.starInstall();
   for(let i=0;i<12;i++){
    window.starReady();const until=s.sim.tick+12;while(s.sim.tick<until)s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0);
   }
   return {slots:s.replayer.astralUnitVfx.slots.length,castCount:s.sim.events.filter(e=>e.t==='cast').length};
  });
  assert.equal(report.reuse.slots,3);assert.equal(report.reuse.castCount,24);
  await page.evaluate(()=>window.starInstall());await page.waitForTimeout(150);report.rebind=await page.evaluate(()=>window.starVisual());assert.equal(report.rebind.effects.length,0);
  assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS actual Creator: four legal deployed members, both supplied portraits and skill mouse clicks, painted guard charge/barrier/knockup and Milu blink/trail/single magic hit, pause/2x, interruption/end/reuse/rebind.');
 }catch(e){fs.writeFileSync(path.join(output,'browser-failure.json'),JSON.stringify({...report,error:e.stack},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
