const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DEMON_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/demon-roster-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const report=[],errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.cc=await System.import('cc');});
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
  await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
  const setup=()=>{
   const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
   if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
   s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);const Sim=s.sim.constructor;
   window.install=id=>{
    const owned=[{uid:1,unitId:id,star:1,location:'board',x:2,y:3,equipment:[]}];s.owned.all().splice(0,s.owned.all().length,...owned);
    s.session.createPreview=()=>{
     const blank={...s.cfg.getUnit('helion'),hp:100000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0};
     const sim=new Sim(s.cfg,[{cfg:{...s.cfg.getUnit(id),critChance:0},side:0,x:2,y:3},
      {cfg:{...blank,spellPower:40},side:1,x:id==='thornchain_succubus'?4:3,y:3},{cfg:blank,side:1,x:6,y:7}],{seed:88});
     sim.units.forEach(u=>u.atkCd=u.moveCd=100000);sim.units[0].mana=sim.units[0].cfg.maxMana;sim.units[0].atkCd=0;
     return {sim,battleIds:new Map([[1,1]])};
    };
    s.resetBattle(false);s.replayer.damageNumbers=false;s.replayer.healingNumbers=false;
   };
   window.advance=t=>{while(s.sim.tick<Math.floor(t)){s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0,.2);}s.replayer.syncViews(0,t-Math.floor(t));};
   window.visual=()=>({tick:s.sim.tick,pose:stage.views.get(1).attackMotion.angle,
    events:s.sim.events.filter(e=>e.t==='thorn_pull'),slots:s.replayer.demonRosterVfx.slots.filter(s=>s.node.active).map(s=>({key:s.key,opacity:s.opacity.opacity,angle:s.node.angle,
     frame:!!s.sprites[0].spriteFrame,position:s.node.position.clone(),size:s.sprites[0].node.getComponent('cc.UITransform').contentSize}))});
  };await page.evaluate(setup);
  const specs=[['redhorn_imp','redhornFervor',9.5],['hellflame_hound','hellhoundBreath',13.5],['saien','abyssVerdict',15.5],
   ['infernal_axe_guard','infernalAxe',14.5],['raven_succubus','ravenTheft',13.5],['crimson_gunslinger','demonGunfire',28.5],['thornchain_succubus','thornPull',9.5]];
  for(const [id,atlas,tick]of specs){
   await page.evaluate(id=>install(id),id);
   await page.waitForFunction(atlas=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.demonRosterVfx?.frames.has(atlas),atlas);
   await page.evaluate(()=>advance(4.5));const charge=await page.evaluate(()=>visual());assert.ok(charge.slots.some(s=>s.frame&&s.opacity>0),id+' charge');
   await page.evaluate(tick=>advance(tick),tick);const release=await page.evaluate(()=>visual());assert.ok(release.slots.some(s=>s.frame&&s.opacity>0),id+' release');
   const frozen=await page.evaluate(()=>JSON.stringify(visual()));await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>JSON.stringify(visual())),frozen,'painted spells pause with the clock');
   if(id==='thornchain_succubus'){
    assert.equal(release.events.length,1);assert.ok(await page.evaluate(()=>stage.replayer.moves.has(2)),'target visibly travels instead of snapping');
    await page.screenshot({path:path.join(output,'thornchain-desktop.png')});
    await page.evaluate(()=>advance(12.5));
    const retract=await page.evaluate(()=>visual());
    assert.ok(retract.slots.find(s=>s.key.startsWith('1:9:')).size.width<release.slots.find(s=>s.key.startsWith('1:9:')).size.width,'tether follows the pulled target and shrinks');
    await page.setViewportSize({width:960,height:540});await page.reload({waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.cc=await System.import('cc');});
    await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
    await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
    await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
    await page.evaluate(setup);await page.evaluate(()=>install('thornchain_succubus'));
    await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.demonRosterVfx?.frames.has('thornPull'));
    await page.evaluate(()=>advance(9.5));assert.ok((await page.evaluate(()=>visual())).slots.some(s=>s.frame&&s.opacity>0));
    await page.waitForTimeout(140);await page.screenshot({path:path.join(output,'thornchain-mobile-layout.png')});
   }
   report.push({id,charge,release});
   await page.evaluate(()=>{stage.sim.end(0);stage.replayer.consumeEvents();});assert.equal(await page.evaluate(()=>stage.replayer.demonRosterVfx.slots.filter(s=>s.node.active).length),0);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({report,errors},null,2));
  console.log('PASS actual Cocos preview: seven portraits and painted spell sets, charge/release, pause/end, whip target travel, desktop and compact landscape layout; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
