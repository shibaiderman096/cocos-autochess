// Isolated browser fixtures; saved expeditions are not changed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BLOODFIEND_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/scarlet-enchantress-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),errors=[],report={};
 try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.cc=window.cc||await System.import('cc');window.point=node=>{const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()),screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world),canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};};window.text=node=>[...node.getComponentsInChildren('cc.Label'),...node.getComponentsInChildren('cc.RichText')].map(l=>l.string).join('\n');});
 await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);await page.evaluate(()=>window.menu=cc.find('Canvas').getComponentInChildren('MainMenu'));
 async function click(fn,arg){const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(130);}
 await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection')));
 await click(()=>point(menu.collection.body.getChildByName('collectionTab_units')));
 await page.evaluate(()=>{const c=menu.collection,i=c.entries().findIndex(e=>e.id==='scarlet_enchantress');if(i<0)throw Error('enchantress missing');c.page=Math.floor(i/8);c.selected=c.page*8;c.render();});
 await click(()=>point(menu.collection.body.getChildByName('collectionEntry_scarlet_enchantress')));
 await page.waitForFunction(()=>menu.collection.body.getChildByName('collectionEntry_scarlet_enchantress').getComponentsInChildren('cc.Sprite').every(s=>s.spriteFrame));
 report.catalog=[];
 for(const star of [1,2,3]){await click(star=>point(menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_'+star)),star);const state=await page.evaluate(()=>({star:menu.collection.star,text:text(menu.collection.body.getChildByName('collectionDetail'))}));assert.ok(state.text.includes('绯血妖姬'));assert.doesNotMatch(state.text,/\{[^}]+\}|NaN|undefined/);report.catalog.push(state);await page.screenshot({path:path.join(output,`catalog-${star}.png`)});}
 await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
 await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
 await page.evaluate(()=>{
 const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);
 const placements=[['scarlet_enchantress',0,1],['crimson_devourer',5,4],['bloodline_earl',0,0],['crimson_riftclaw',1,0],['voidscar_reaver',2,0]],owned=placements.map(([unitId,x,y],i)=>({uid:i+1,unitId,star:1,location:'board',x,y,equipment:[]}));s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
 s.session.createPreview=()=>{const enemy={...s.cfg.getUnit('helion'),hp:100000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0};const sim=new Sim(s.cfg,[...owned.map(o=>({cfg:{...s.cfg.getUnit(o.unitId),critChance:0},side:0,x:o.x,y:o.y})),{cfg:enemy,side:1,x:6,y:4}],{seed:88});sim.units.forEach(u=>u.atkCd=u.moveCd=100000);sim.units[1].hp=100;return {sim,battleIds:new Map(owned.map(o=>[o.uid,o.uid]))};};
 s.resetBattle(false);s.replayer.bloodfiendArt();s.ui.setSideTab('traits');s.refreshEconomyUI();
 window.advance=t=>{if(s.sim.tick===0&&t>0){const u=s.sim.units[0];u.mana=u.cfg.maxMana;u.atkCd=0;}while(s.sim.tick<Math.floor(t)){s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0,.4);}s.replayer.syncViews(0,t-Math.floor(t));};
 window.fxState=()=>s.replayer.bloodfiendSprites.slots.filter(x=>x.node.active&&x.layer).map(x=>({art:x.layer.art,motion:x.layer.motion,frame:x.frame,pos:x.node.position.clone(),angle:x.node.angle,scale:x.node.scale.clone(),alpha:x.opacity.opacity,blends:x.blends.map(b=>b.opacity)}));
 window.state=()=>({tick:s.sim.tick,source:{pos:s.sim.units[0].pos,until:s.sim.units[0].bloodAidUntilTick,mana:s.sim.units[0].mana},ally:{hp:s.sim.units[1].hp,armor:s.sim.units[1].armor,mr:s.sim.units[1].mr},fx:fxState()});
 });
 await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.bloodfiendSprites?.frames.size===8);
 report.traits=await page.evaluate(()=>({members:stage.cfg.battle.traits.find(t=>t.id==='bloodfiend').members,swift:stage.cfg.getUnit('scarlet_enchantress').classTraitId,ui:text(stage.ui.node)}));assert.equal(report.traits.members.length,7);assert.equal(report.traits.swift,'swift_marksman');
 await click(()=>point(stage.views.get(1).node));await click(()=>point(stage.ui.skillIconNode));
 report.skill=await page.evaluate(()=>text(stage.ui.detailPopup));assert.doesNotMatch(report.skill,/\{[^}]+\}|NaN|undefined/);for(const word of ['绯血援舞','普攻附伤','双抗','4'])assert.ok(report.skill.includes(word),word);
 await page.screenshot({path:path.join(output,'skill-panel.png')});await click(()=>point(stage.ui.detailPopupClose));await page.evaluate(()=>stage.ui.closeUnitDetail());
 for(const [t,name] of [[4.5,'arrival'],[25.5,'empowered-basic'],[60.5,'ward'],[81.5,'return']]){await page.evaluate(t=>advance(t),t);report[name]=await page.evaluate(()=>state());await page.screenshot({path:path.join(output,name+'.png')});if(name==='ward'){const before=await page.evaluate(()=>fxState());await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>fxState()),before,'paused ward and sprite blend remain frozen');}}
 assert.deepEqual(report.arrival.ally,{hp:300,armor:80,mr:80});assert.equal(report.arrival.source.until,81);assert.ok(report.arrival.fx.some(f=>f.art==='scarletAid'));
 assert.deepEqual(report.return.source.pos,{x:0,y:1});assert.equal(report.return.source.until,0);assert.equal(report.return.ally.armor,50);assert.equal(report.return.ally.mr,50);
 report.events=await page.evaluate(()=>stage.sim.events);assert.ok(report.events.some(e=>e.t==='attack'&&e.id===1&&e.tick>1&&e.tick<81));const bonus=report.events.filter(e=>e.t==='hit'&&e.source===1&&e.dmgType==='magic');assert.ok(bonus.length>0);assert.ok(bonus.every(e=>e.dmg===30&&e.tick<81));assert.deepEqual(report.events.filter(e=>e.t==='blood_aid').map(e=>[e.phase,e.tick]),[['arrive',1],['return',81]]);
 await page.evaluate(()=>{stage.sim.end(0);stage.replayer.consumeEvents();stage.replayer.syncViews(0);});assert.equal(await page.evaluate(()=>fxState().length),0);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,errors},null,2));console.log('PASS Cocos preview: three-star catalogue, skill panel, five-member trait, actual healing/resistance, basic attacks and 30 magic on-hit during four-second visit, return/expiry, painted arrival/ward/impact/return, pause and end cleanup; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
