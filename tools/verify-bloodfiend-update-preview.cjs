// Isolated Cocos browser fixtures; project roster and saved runs are not mutated.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BLOODFIEND_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/bloodfiend-update-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),errors=[],report={};
 try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.cc=window.cc||await System.import('cc');window.point=node=>{const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()),screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world),canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};};});
 await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);await page.evaluate(()=>window.menu=cc.find('Canvas').getComponentInChildren('MainMenu'));
 async function click(fn,arg){const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(130);}
 await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection')));
 await click(()=>point(menu.collection.body.getChildByName('collectionTab_units')));
 for(const id of ['crimson_devourer','voidscar_reaver','bloodline_earl']){
 await page.evaluate(id=>{const c=menu.collection,i=c.entries().findIndex(e=>e.id===id);if(i<0)throw Error(id+' missing');c.page=Math.floor(i/8);c.selected=c.page*8;c.render();},id);
 await click(id=>point(menu.collection.body.getChildByName('collectionEntry_'+id)),id);
 await page.waitForFunction(id=>menu.collection.body.getChildByName('collectionEntry_'+id).getComponentsInChildren('cc.Sprite').every(s=>s.spriteFrame),id);
 report[id]=[];
 for(const star of [1,2,3]){await click(star=>point(menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_'+star)),star);report[id].push(await page.evaluate(()=>({star:menu.collection.star,text:menu.collection.body.getChildByName('collectionDetail').getComponentsInChildren('cc.Label').map(l=>l.string).join('\n')})));await page.screenshot({path:path.join(output,`${id}-${star}-catalog.png`)});}
 }
 assert.ok(report.crimson_devourer.every(x=>x.text.includes('猩红巨噬兽')));
 await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
 await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
 await page.evaluate(()=>{
 const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);
 const ids=['crimson_riftclaw','bloodline_earl','crimson_devourer','voidscar_reaver'],owned=ids.map((unitId,i)=>({uid:i+1,unitId,star:1,location:'board',x:i*2,y:3,equipment:[]}));s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
 s.session.createPreview=()=>{const dummy={...s.cfg.getUnit('helion'),hp:100000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0};const sim=new Sim(s.cfg,[...owned.map(o=>({cfg:{...s.cfg.getUnit(o.unitId),critChance:0},side:0,x:o.x,y:o.y})),...[0,2,4,6].map(x=>({cfg:dummy,side:1,x,y:4}))],{seed:88});sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {sim,battleIds:new Map(owned.map(o=>[o.uid,o.uid]))};};
 s.resetBattle(false);s.replayer.bloodfiendArt();s.ui.setSideTab('traits');s.refreshEconomyUI();window.seenArt=new Set();
 window.advance=t=>{if(s.sim.tick===0&&t>0)for(const u of s.sim.units.slice(0,4)){u.mana=u.cfg.maxMana;u.atkCd=0;u.hp=300;}
 while(s.sim.tick<Math.floor(t)){s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0,.4);for(const slot of s.replayer.bloodfiendSprites.slots)if(slot.node.active&&slot.layer)seenArt.add(slot.layer.art);}s.replayer.syncViews(0,t-Math.floor(t));};
 window.fxState=()=>s.replayer.bloodfiendSprites.slots.filter(x=>x.node.active&&x.layer).map(x=>({art:x.layer.art,frame:x.frame,pos:x.node.position.clone(),angle:x.node.angle,scale:x.node.scale.clone(),alpha:x.opacity.opacity,blends:x.blends.map(b=>b.opacity)}));
 });
 await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.bloodfiendSprites?.frames.size===8);
 report.config=await page.evaluate(()=>({earl:[stage.cfg.getUnit('bloodline_earl').startMana,stage.cfg.getUnit('bloodline_earl').maxMana],locked:stage.cfg.getUnit('voidscar_reaver').specialShopUnlock,canDraw:stage.session.pool.canDraw('voidscar_reaver'),members:stage.cfg.battle.traits.find(t=>t.id==='bloodfiend').members}));assert.deepEqual(report.config.earl,[20,50]);assert.equal(report.config.locked,true);assert.equal(report.config.canDraw,false);assert.equal(report.config.members.length,7);
 await click(()=>point(stage.views.get(3).node));await click(()=>point(stage.ui.skillIconNode));await page.screenshot({path:path.join(output,'beast-skill.png')});await click(()=>point(stage.ui.detailPopupClose));await page.evaluate(()=>stage.ui.closeUnitDetail());
 for(const [t,name] of [[3.5,'blood-siphon'],[7.5,'charged-spells'],[13.5,'line-roar'],[18.5,'claw-knockup'],[24.5,'blood-void']]){await page.evaluate(t=>advance(t),t);await page.screenshot({path:path.join(output,name+'.png')});}
 report.arts=await page.evaluate(()=>[...seenArt]);assert.deepEqual(report.arts.sort(),['bloodlineSiphon','crimsonUpheaval','frostbloodRoar','voidscarTransit']);
 report.paused=await page.evaluate(()=>fxState());await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>fxState()),report.paused,'paused replay preserves painted frame and transforms');
 report.events=await page.evaluate(()=>stage.sim.events);assert.ok(report.events.some(e=>e.t==='line_roar'));assert.ok(report.events.some(e=>e.t==='fear'));assert.ok(report.events.some(e=>e.t==='knockup'));
 await page.evaluate(()=>{stage.sim.end(0);stage.replayer.consumeEvents();stage.replayer.syncViews(0);});assert.equal(await page.evaluate(()=>fxState().length),0);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,errors},null,2));console.log('PASS Cocos preview: new beast/revised void portraits, 1/2/3-star catalogue, earl 20/50, locked special-shop member, four painted skill timelines, pause and end cleanup; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
