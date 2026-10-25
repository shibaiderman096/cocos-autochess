const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BLOODFIEND_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/blood-reign-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),report={},errors=[];
 try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.cc=window.cc||await System.import('cc');window.point=node=>{const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()),screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world),canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};};window.text=node=>[...node.getComponentsInChildren('cc.Label'),...node.getComponentsInChildren('cc.RichText')].map(l=>l.string).join('\n');});
 await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);await page.evaluate(()=>window.menu=cc.find('Canvas').getComponentInChildren('MainMenu'));
 async function click(fn,arg){const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(140);}
 await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection')));await click(()=>point(menu.collection.body.getChildByName('collectionTab_units')));
 report.catalog={};report.catalogStats={};
 for(const id of ['crimson_demon_knight','ripsaw_spider','oris','blackstar_warlock']){
  await page.evaluate(id=>{const c=menu.collection,i=c.entries().findIndex(e=>e.id===id);if(i<0)throw Error(id+' missing');c.page=Math.floor(i/8);c.selected=c.page*8;c.render();},id);
  await click(id=>point(menu.collection.body.getChildByName('collectionEntry_'+id)),id);
  await page.waitForFunction(id=>menu.collection.body.getChildByName('collectionEntry_'+id).getComponentsInChildren('cc.Sprite').every(s=>s.spriteFrame),id);
  report.catalog[id]=[];report.catalogStats[id]=[];
  for(const star of ['crimson_demon_knight','ripsaw_spider'].includes(id)?[1,2,3]:[1]){
   await click(star=>point(menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_'+star)),star);
   report.catalog[id].push(await page.evaluate(()=>text(menu.collection.body.getChildByName('collectionDetail'))));
   const stats=await page.evaluate(()=>{const inspector=menu.collection.body.getChildByName('collectionDetail').getComponent('BattleUI');return {star:inspector.currentDetail.star,atk:inspector.currentDetail.atk,shownAttack:inspector.unitStats[0].string};});
   const expected=Math.round(({crimson_demon_knight:90,ripsaw_spider:70,oris:50,blackstar_warlock:50}[id])*[1,1.2,1.5][star-1]);assert.equal(stats.atk,expected);assert.equal(stats.shownAttack,String(expected));report.catalogStats[id].push(stats);
   await page.screenshot({path:path.join(output,`${id}-${star}-catalog.png`)});
  }
 }
 assert.ok(report.catalog.ripsaw_spider[0].includes('血魔'));assert.ok(report.catalog.ripsaw_spider[0].includes('机械先驱'));assert.ok(report.catalog.crimson_demon_knight.every(t=>t.includes('蚀血魔君')&&t.includes('0 / 30')));
 await click(()=>point(menu.collection.body.getChildByName('collectionTab_traits')));
 await page.evaluate(()=>{const c=menu.collection,i=c.entries().findIndex(e=>e.id==='bloodfiend');c.page=Math.floor(i/8);c.selected=c.page*8;c.render();});
 await click(()=>point(menu.collection.body.getChildByName('collectionEntry_bloodfiend')));
 report.traitCopy=await page.evaluate(()=>text(menu.collection.traitPanel.detail));assert.ok(report.traitCopy.includes('每层分别持续4秒'));
 report.traitPortraits=await page.evaluate(()=>menu.collection.traitPanel.detail.children.filter(n=>n.name.startsWith('traitOwner_')).map(n=>n.name));
 for(const id of ['crimson_demon_knight','ripsaw_spider'])assert.ok(report.traitPortraits.includes('traitOwner_'+id));
 await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'bloodfiend-seven-members.png')});
 await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
 await page.evaluate(()=>{
  const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);
  const ids=['crimson_demon_knight','bloodline_earl','crimson_riftclaw','crimson_devourer','scarlet_enchantress','voidscar_reaver','ripsaw_spider'],owned=ids.map((unitId,i)=>({uid:i+1,unitId,star:1,location:'board',x:i===0?1:i-1,y:i===0?3:0,equipment:[]}));s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
  s.session.createPreview=()=>{const enemy={...s.cfg.getUnit('helion'),hp:1000000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0};const sim=new Sim(s.cfg,[...owned.map(o=>({cfg:{...s.cfg.getUnit(o.unitId),critChance:0},side:0,x:o.x,y:o.y})),...[[2,3],[3,3],[4,4],[5,4]].map(([x,y])=>({cfg:enemy,side:1,x,y}))],{seed:88});sim.units.forEach(u=>u.atkCd=u.moveCd=100000);return {sim,battleIds:new Map(owned.map(o=>[o.uid,o.uid]))};};
  s.resetBattle(false);s.replayer.bloodfiendArt();s.ui.setSideTab('traits');s.refreshEconomyUI();
  window.fxState=()=>s.replayer.bloodfiendSprites.slots.filter(x=>x.node.active&&x.layer).map(x=>({art:x.layer.art,motion:x.layer.motion,frame:x.frame,pos:x.node.position.clone(),angle:x.node.angle,scale:x.node.scale.clone(),alpha:x.opacity.opacity,blends:x.blends.map(b=>b.opacity)}));
  window.advance=t=>{while(s.sim.tick<Math.floor(t)){s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0,.4);}s.replayer.syncViews(0,t-Math.floor(t));};
  window.state=()=>{const u=s.sim.units[0];return {tick:s.sim.tick,hp:u.hp,maxHp:u.cfg.hp,shield:u.shield,pos:u.pos,mana:u.mana,rebirth:!!u.bloodRebirth,ready:u.bloodCleaveReady,stacks:u.bloodfiendStackCount,speed:u.attackSpeed,expiries:u.bloodfiendStackExpiries.slice(),fx:fxState()};};
 });
 await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady)&&stage.replayer.bloodfiendSprites?.frames.size===8);
 report.members=await page.evaluate(()=>stage.cfg.battle.traits.find(t=>t.id==='bloodfiend').members);assert.equal(report.members.length,7);
 await click(()=>point(stage.views.get(1).node));await click(()=>point(stage.ui.skillIconNode));report.skill=await page.evaluate(()=>text(stage.ui.detailPopup));assert.doesNotMatch(report.skill,/\{[^}]+\}|NaN|undefined/);assert.ok(report.skill.includes('被动'));assert.ok(report.skill.includes('主动'));assert.ok(report.skill.includes('斩击距离'));await page.screenshot({path:path.join(output,'skill-panel.png')});await click(()=>point(stage.ui.detailPopupClose));await page.evaluate(()=>stage.ui.closeUnitDetail());
 await page.evaluate(()=>{stage.sim.units[0].mana=30;stage.sim.units[0].atkCd=0;advance(1.5);});report.cast=await page.evaluate(()=>state());assert.equal(report.cast.maxHp,1500);assert.equal(report.cast.ready,true);
 await page.evaluate(()=>advance(7.5));report.windup=await page.evaluate(()=>({state:state(),pending:stage.sim.units[0].bloodCleaveWindup,pose:stage.views.get(1).attackMotion.position.clone(),angle:stage.views.get(1).attackMotion.angle}));assert.equal(report.windup.state.ready,true);assert.ok(report.windup.pending);assert.ok(Math.abs(report.windup.angle)>0);assert.ok(!await page.evaluate(()=>stage.sim.events.some(e=>e.t==='attack'&&e.id===1)));const frozenPose=report.windup.pose;await page.waitForTimeout(200);assert.deepEqual(await page.evaluate(()=>stage.views.get(1).attackMotion.position.clone()),frozenPose);await page.screenshot({path:path.join(output,'cleave-windup.png')});await page.evaluate(()=>advance(14.5));report.cleave=await page.evaluate(()=>state());assert.equal(report.cleave.ready,false);assert.ok(report.cleave.fx.some(f=>f.art==='bloodCleave'));report.cleaveHit=await page.evaluate(()=>stage.sim.events.find(e=>e.t==='blood_cleave'));assert.equal(report.cleaveHit.length,2);report.cleaveExtent=await page.evaluate(()=>{const l=stage.replayer.bloodfiendSprites.slots.find(s=>s.layer?.art==='bloodCleave'&&s.layer.motion==='roar').layer,e=stage.sim.events.find(e=>e.t==='blood_cleave'),a=stage.replayer.boardView.cellToWorld(e.from.x,e.from.y),b=stage.replayer.boardView.lineEndToWorld(e.from,e.toward,4);return {size:l.size,expected:Math.hypot(b.x-a.x,b.y-a.y)/stage.replayer.cellSize};});assert.equal(report.cleaveExtent.size,report.cleaveExtent.expected);await page.screenshot({path:path.join(output,'cleave.png')});
 await page.evaluate(()=>{advance(20);stage.sim.damage(stage.sim.units[7],stage.sim.units[0],9999999,'true');stage.sim.resolveDamage();stage.sim.pendingDamage.length=0;stage.replayer.consumeEvents();stage.replayer.syncViews(0,.5);});report.rebirthStart=await page.evaluate(()=>state());assert.equal(report.rebirthStart.hp,1);assert.equal(report.rebirthStart.rebirth,true);
 await page.evaluate(()=>advance(35.5));report.rebirthMiddle=await page.evaluate(()=>state());assert.equal(report.rebirthMiddle.hp,751);assert.ok(report.rebirthMiddle.fx.some(f=>f.art==='bloodRebirth'));await page.screenshot({path:path.join(output,'rebirth.png')});const frozen=await page.evaluate(()=>fxState());await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>fxState()),frozen);
 await page.evaluate(()=>{advance(50.5);stage.sim.units[0].atkCd=100000;stage.sim.units[0].mana=0;});report.rebirthEnd=await page.evaluate(()=>state());assert.equal(report.rebirthEnd.hp,1500);assert.equal(report.rebirthEnd.rebirth,false);assert.equal(report.rebirthEnd.shield,1);
 for(const [t,victim] of [[61,7],[71,8]])await page.evaluate(([t,victim])=>{advance(t);stage.sim.damage(stage.sim.units[1],stage.sim.units[victim],9999999,'true');stage.sim.resolveDamage();stage.sim.pendingDamage.length=0;stage.replayer.consumeEvents();stage.replayer.syncViews(0);},[t,victim]);
 report.stackTimeline=[];for(const t of [71,140,141,150,151]){await page.evaluate(t=>advance(t),t);report.stackTimeline.push(await page.evaluate(()=>state()));}assert.deepEqual(report.stackTimeline.map(s=>s.stacks),[2,2,1,1,0]);assert.deepEqual(report.stackTimeline.map(s=>s.speed),[1.8,1.8,1.3,1.3,.8]);
 report.events=await page.evaluate(()=>stage.sim.events);assert.equal(report.events.filter(e=>e.t==='blood_rebirth').length,1);assert.ok(!report.events.some(e=>e.id===1&&['attack','cast','move'].includes(e.t)&&e.tick>=20&&e.tick<50));
 await page.evaluate(()=>{stage.sim.end(0);stage.replayer.consumeEvents();stage.replayer.syncViews(0);});assert.equal(await page.evaluate(()=>fxState().length),0);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,errors},null,2));console.log('PASS Cocos preview: four portraits, knight three-star catalogue and six-row skill panel, natural seven bloodfiends, actual health/cleave/lethal recovery, independent 4s stack expiry, painted effects, pause/end cleanup; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
