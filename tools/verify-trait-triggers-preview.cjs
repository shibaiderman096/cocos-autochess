const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BLOODFIEND_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/trait-triggers-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],report={};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
  await page.evaluate(async()=>window.cc=window.cc||await System.import('cc'));
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
  await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
  await page.evaluate(()=>{
   const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
   if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
   s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);
   const ids=['crimson_riftclaw','bloodline_earl','ripsaw_spider','bao_zero','turbo_fist_tiger','arc_repairer','rail_hunter_07'];
   const owned=ids.map((unitId,i)=>({uid:i+1,unitId,star:1,location:'board',x:i,y:3,equipment:[]}));
   s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
   s.session.createPreview=()=>{
    const enemy={...s.cfg.getUnit('helion'),hp:1000000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0};
    const sim=new Sim(s.cfg,[...owned.map(o=>({cfg:{...s.cfg.getUnit(o.unitId),critChance:0},side:0,x:o.x,y:o.y})),
     ...[1,3,5].map(x=>({cfg:enemy,side:1,x,y:6}))],{seed:88});
    sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {sim,battleIds:new Map(owned.map(o=>[o.uid,o.uid]))};
   };
   s.resetBattle(false);s.replayer.bloodfiendArt();s.replayer.mechanicalArt();s.ui.setSideTab('traits');s.refreshEconomyUI();
   window.advance=t=>{while(s.sim.tick<Math.floor(t)){s.sim.step();s.replayer.consumeEvents();}s.replayer.syncViews(0,t-Math.floor(t));};
   window.kill=i=>{s.sim.damage(s.sim.units[2],s.sim.units[i],99999999,'true');s.sim.resolveDamage();s.sim.pendingDamage.length=0;s.replayer.consumeEvents();};
   window.fxState=()=>({tick:s.sim.tick,stacks:s.sim.units[2].bloodfiendStackCount,speed:s.sim.units[2].attackSpeed,
    blood:s.replayer.bloodfiendSprites.slots.filter(x=>x.layer&&x.node.active).map(x=>({art:x.layer.art,owner:x.layer.owner,frame:x.frame,p:x.node.position.clone(),alpha:x.opacity.opacity,blend:x.blends.map(b=>b.opacity)})),
    mechanical:s.replayer.mechanicalSprites.slots.filter(x=>x.layer&&x.node.active).map(x=>({activation:!!x.layer.activation,owner:x.layer.follow,p:x.node.position.clone(),alpha:x.opacity.opacity,size:x.art[0].node.getComponent('cc.UITransform').width}))});
  });
  await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.bloodfiendSprites?.frames.size===8&&stage.replayer.mechanicalSprites?.activationFrames.length===8);
  await page.evaluate(()=>advance(126.5));await page.waitForTimeout(160);
  report.timed=await page.evaluate(()=>fxState());assert.equal(report.timed.mechanical.filter(s=>s.activation).length,5);
  await page.screenshot({path:path.join(output,'mechanical-timed.png')});
  await page.evaluate(()=>{advance(145);kill(7);advance(151.5);});await page.waitForTimeout(160);
  report.blood=await page.evaluate(()=>fxState());assert.equal(report.blood.blood.filter(s=>s.art==='bloodfiendRevel').length,3);
  await page.screenshot({path:path.join(output,'blood-revel.png')});
  // Five-mechanical emergency refresh and a second allied kill overlap on the spider.
  await page.evaluate(()=>{advance(161);stage.sim.units[2].hp=Math.floor(stage.sim.units[2].cfg.hp*.49);advance(162);kill(8);advance(168.5);});
  await page.waitForTimeout(160);report.both=await page.evaluate(()=>fxState());
  report.emergencySize=await page.evaluate(()=>stage.replayer.cellSize*2.05);
  assert.equal(report.both.stacks,2);assert.ok(report.both.blood.some(s=>s.owner===3));
  assert.ok(report.both.mechanical.some(s=>s.activation&&s.owner===3&&Math.abs(s.size-report.emergencySize)<.01));
  await page.screenshot({path:path.join(output,'shared-spider-emergency.png')});
  const frozen=await page.evaluate(()=>fxState());await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>fxState()),frozen);
  const labels=await page.evaluate(()=>[...cc.find('Canvas').getComponentsInChildren('cc.Label')].filter(l=>l.node.activeInHierarchy).map(l=>l.string));
  assert.ok(!labels.some(s=>['鲜血狂欢','超频','应急超频'].includes(s)));
  await page.evaluate(()=>advance(180.5));report.slowed=await page.evaluate(()=>fxState());
  assert.ok(report.slowed.blood.some(s=>s.art==='bloodfiendRevel'),'revel remains visible after its former lifetime');
  assert.ok(report.slowed.mechanical.some(s=>s.activation),'overclock activation remains visible after its former lifetime');
  await page.evaluate(()=>advance(190.5));report.expired=await page.evaluate(()=>fxState());
  assert.equal(report.expired.stacks,2);assert.equal(report.expired.blood.length,0);assert.ok(!report.expired.mechanical.some(s=>s.activation));
  await page.evaluate(()=>{stage.sim.end(0);stage.replayer.consumeEvents();stage.replayer.syncViews(0);});
  report.end=await page.evaluate(()=>fxState());assert.equal(report.end.blood.length+report.end.mechanical.length,0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,errors},null,2));
  console.log('PASS Cocos preview: timed/emergency overclock, allied-kill revel, both painted effects on spider, independent stacks, no trait floating text, pause/expiry/end cleanup, zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
