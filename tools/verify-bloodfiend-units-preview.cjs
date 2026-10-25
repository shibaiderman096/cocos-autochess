// Browser-only fixtures; authored roster and user saves are never changed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BLOODFIEND_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/bloodfiend-units-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],report={};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.cc=window.cc||await System.import('cc');window.point=node=>{
   const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()),screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
   const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};};});
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>window.menu=cc.find('Canvas').getComponentInChildren('MainMenu'));
  async function click(fn,arg){const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(140);}
  await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection')));
  await click(()=>point(menu.collection.body.getChildByName('collectionTab_units')));
  for(const id of ['crimson_riftclaw','bloodline_earl']){
   await page.evaluate(id=>{const c=menu.collection,i=c.entries().findIndex(e=>e.id===id);if(i<0)throw new Error('Missing unit in preview: '+id+'; '+c.entries().map(e=>e.id).join(','));c.page=Math.floor(i/8);c.selected=c.page*8;c.render();},id);
   await click(id=>point(menu.collection.body.getChildByName('collectionEntry_'+id)),id);
   await page.waitForFunction(id=>menu.collection.body.getChildByName('collectionEntry_'+id).getComponentsInChildren('cc.Sprite').every(s=>!!s.spriteFrame),id);
   report[id]=[];
   for(const star of [1,2,3]){
    await click(star=>point(menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_'+star)),star);
    report[id].push(await page.evaluate(()=>({star:menu.collection.star,text:menu.collection.body.getChildByName('collectionDetail').getComponentsInChildren('cc.Label').map(l=>l.string).join('\n')})));
    await page.screenshot({path:path.join(output,`${id}-${star}-catalog.png`)});
   }
  }
  await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
  await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
  await page.evaluate(()=>{
   const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
   if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
   s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);
   const owned=[{uid:1,unitId:'crimson_riftclaw',star:1,location:'board',x:2,y:3,equipment:[]},{uid:2,unitId:'bloodline_earl',star:1,location:'board',x:4,y:3,equipment:[],permanentSpellPower:10}];
   s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
   s.session.createPreview=()=>{
    const blank={...s.cfg.getUnit('helion'),hp:10000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0};
    const sim=new Sim(s.cfg,[...owned.map(o=>({cfg:{...s.cfg.getUnit(o.unitId),critChance:0},side:0,x:o.x,y:o.y,permanentSpellPower:o.permanentSpellPower})),
     {cfg:blank,side:1,x:2,y:4},{cfg:blank,side:1,x:4,y:4}],{seed:77});
    sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {sim,battleIds:new Map([[1,1],[2,2]])};
   };
   window.install=()=>{s.resetBattle(false);s.replayer.bloodfiendArt();s.ui.setSideTab('traits');s.refreshEconomyUI();};install();
   window.advance=t=>{if(s.sim.tick===0&&t>0)for(const u of s.sim.units.slice(0,2)){u.mana=u.cfg.maxMana;u.atkCd=0;}
    while(s.sim.tick<Math.floor(t))s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0,t-Math.floor(t));};
   window.chargeState=()=>{const g=s.replayer.bloodfiendSprites?.slots.find(v=>v.layer?.motion==='charge'&&v.layer.owner===1);return {tick:s.sim.tick,active:g?.node.active??false,body:s.views.get(3).node.getChildByName('attackMotion').getChildByName('body').position.clone()};};
  });
  await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.bloodfiendSprites?.frames.size===8);
  for(const id of [1,2]){
   await click(id=>point(stage.views.get(id).node),id);
   report['detail'+id]=await page.evaluate(()=>({visible:stage.ui.unitDetailVisible,data:stage.ui.currentDetail,portrait:!!stage.ui.unitPortrait.spriteFrame}));
   assert.equal(report['detail'+id].portrait,true);
   await click(()=>point(stage.ui.skillIconNode));assert.equal(await page.evaluate(()=>stage.ui.detailPopup.active),true);
   await page.screenshot({path:path.join(output,`skill-${id}.png`)});
   await click(()=>point(stage.ui.detailPopupClose));await page.evaluate(()=>stage.ui.closeUnitDetail());
  }
  await page.evaluate(()=>{stage.sim.units[1].hp=200;advance(9.5);});
  report.charge=await page.evaluate(()=>chargeState());assert.equal(report.charge.active,true);
  await page.waitForTimeout(220);assert.deepEqual(await page.evaluate(()=>chargeState()),report.charge,'charge pauses with the simulation');
  await page.screenshot({path:path.join(output,'charge.png')});
  await page.evaluate(()=>advance(27));report.airborne=await page.evaluate(()=>chargeState());assert.equal(report.airborne.active,false);assert.ok(report.airborne.body.y>report.charge.body.y);
  await page.screenshot({path:path.join(output,'single-knockup.png')});
  report.kill=await page.evaluate(()=>{const s=stage,earl=s.sim.units[1],target=s.sim.units[3];s.sim.damage(earl,target,target.hp,'true');s.sim.resolveDamage();s.sim.pendingDamage.length=0;s.replayer.consumeEvents();s.replayer.syncViews(0);s.showBattleDetail(2);return {power:earl.permanentSpellPower,range:earl.cfg.range,data:s.ui.currentDetail};});
  assert.equal(report.kill.power,12);assert.equal(report.kill.range,2);
  await click(()=>point(stage.ui.skillIconNode));await page.screenshot({path:path.join(output,'earl-permanent-power.png')});
  report.events=await page.evaluate(()=>stage.sim.events);assert.equal(report.events.filter(e=>e.t==='knockup').length,1);assert.equal(report.events.find(e=>e.t==='knockup').id,3);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,errors},null,2));
  console.log('PASS Cocos preview: two supplied portraits, catalogue 1/2/3-star switching, deployed skill panels, paused charge, single knockup, range 2 and permanent power 10 -> 12');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
