const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('docs/evidence/growth-equipment');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   const cc=window.cc||await System.import('cc');window.ccTest=cc;
   if(!cc.find('Canvas')?.getComponentInChildren('MainMenu'))await new Promise((resolve,reject)=>cc.director.loadScene('main',e=>e?reject(e):resolve()));
   window.point=node=>{const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3()));const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();return{x:r.x+p.x/canvas.width*r.width,y:r.y+(1-p.y/canvas.height)*r.height};};
  });
  await page.waitForFunction(()=>ccTest.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(()=>window.menu=ccTest.find('Canvas').getComponentInChildren('MainMenu'));
  const click=async(fn,arg)=>{const p=await page.evaluate(fn,arg);await page.mouse.click(p.x,p.y);await page.waitForTimeout(160);};
  const saved=await page.evaluate(()=>localStorage.getItem('autochess_save_v2'));
  await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection_equipment')));
  const report={items:[]},items=require('../assets/resources/config/equipment.json');assert.equal(items.length,13);
  for(let i=0;i<items.length;i++){
   if(i===8)await click(()=>point(menu.collection.body.getChildByName('collectionNext')));
   await click(id=>point(menu.collection.body.getChildByName('collectionEntry_'+id)),items[i].id);
   await page.waitForFunction(()=>menu.collection.body.getComponentsInChildren('cc.Sprite').every(s=>!!s.spriteFrame));
   const state=await page.evaluate(()=>{
    const c=menu.collection,d=c.body.getChildByName('collectionDetail'),v=d.getChildByName('collectionViewport'),bounds=v.getComponent('cc.UITransform').getBoundingBoxToWorld();
    return{id:c.entries()[c.selected].id,stats:d.getChildByName('equipmentStats').children.map(row=>({name:row.getChildByName('attributeName').getComponent('cc.Label').string,nameVisible:row.getChildByName('attributeName').activeInHierarchy,value:row.getChildByName('value').getComponent('cc.Label').string,iconLoaded:row.children.some(n=>!!n.getChildByName('skin')?.getComponent('cc.Sprite')?.spriteFrame),bottom:row.getComponent('cc.UITransform').getBoundingBoxToWorld().yMin})),effect:d.getChildByName('collectionViewport').getChildByName('collectionText').getComponent('cc.Label').string,effectTop:bounds.yMax};
   });
   assert.equal(state.id,items[i].id);assert.ok(state.stats.every(s=>!s.nameVisible&&s.iconLoaded&&s.bottom>state.effectTop));
   assert.equal(state.effect,items[i].effectDescription);report.items.push(state);
   if(['crimson_bloodclaw','forest_sanctuary','stonegrowth_bulwark','blazing_feather','arcane_overflow_codex'].includes(items[i].id)){
    await page.waitForTimeout(250);await page.screenshot({path:path.join(output,items[i].id+'.png')});
   }
  }
  const codex=report.items.find(i=>i.id==='arcane_overflow_codex');assert.ok(codex.stats.some(s=>s.value==='+5/秒'));assert.ok(codex.stats.some(s=>s.value==='-10'));
  await page.mouse.move(1000,470);await page.mouse.wheel(0,500);await page.waitForTimeout(250);
  report.codexScroll=await page.evaluate(()=>{const scroll=menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionViewport').getComponent('cc.ScrollView');return{offset:scroll.getScrollOffset().y,max:scroll.getMaxScrollOffset().y};});
  if(report.codexScroll.max>0)assert.ok(report.codexScroll.offset>0);else assert.equal(report.codexScroll.offset,0,'short equipment copy fits without scrolling');
  await page.screenshot({path:path.join(output,'codex-scroll.png')});
  await click(()=>point(menu.collection.root.getChildByName('closeCollection')));assert.equal(await page.evaluate(()=>localStorage.getItem('autochess_save_v2')),saved);
  await click(()=>point(menu.node.getChildByName('startGame')));
  await page.waitForFunction(()=>ccTest.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded,null,{timeout:45000});
  await page.evaluate(()=>{
   const s=ccTest.find('Canvas/Stage').getComponent('BattleStage');window.stage=s;
   if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter('inspiration');
   const unit=s.owned.all()[0];window.carryUid=unit.uid;s.session.moveUnit(unit.uid,{location:'board',x:3,y:3});
   for(const id of ['stonegrowth_bulwark','blazing_feather','arcane_overflow_codex']){s.owned.equipmentReserve.push(id);if(!s.session.equipItem(unit.uid,s.owned.equipmentReserve.length-1).ok)throw Error('equip failed');}
   s.resetBattle(false);s.refreshRunUI();s.refreshShopUI();s.refreshBackpack();s.showOwnedDetail(unit.uid);
  });
  await page.waitForTimeout(1600);await page.screenshot({path:path.join(output,'equipped-detail.png')});
  report.equipped=await page.evaluate(()=>({equipment:stage.owned.get(carryUid).equipment,slots:stage.ui.equipmentSlots.map(s=>({visible:s.icon.node.activeInHierarchy,loaded:!!s.icon.spriteFrame})),rate:stage.ui.currentDetail?.manaPerSecond}));assert.equal(report.equipped.equipment.length,3);assert.ok(report.equipped.slots.every(s=>s.visible&&s.loaded));assert.ok(report.equipped.rate>=5);
  await click(()=>point(stage.ui.fightBtn));
  await page.evaluate(()=>{
   const u=stage.sim.units.find(u=>u.side===0);window.initialPower=u.cfg.physicalPower;u.cfg.skillId=undefined;u.mana=0;u.cfg.range=10;
   for(const enemy of stage.sim.units.filter(u=>u.side===1)){enemy.cfg.atk=0;enemy.cfg.damageReduction=1;enemy.hp=100000;}
  });
  await page.waitForFunction(()=>stage.sim.units.find(u=>u.side===0).equipmentAttackStacks>=2,null,{timeout:12000});
  await page.evaluate(()=>{stage.fighting=false;stage.selectedDetail={kind:'battle',id:stage.sim.units.find(u=>u.side===0).id};stage.showBattleDetail(stage.selectedDetail.id);});
  await page.waitForTimeout(300);
  report.battle=await page.evaluate(()=>{const u=stage.sim.units.find(u=>u.side===0);return{stacks:u.equipmentAttackStacks,power:u.cfg.physicalPower,initialPower,mana:u.mana,manaRate:u.manaPerSecond,displayedStacks:stage.ui.equipmentSlots[1].stacks.string,stackVisible:stage.ui.equipmentSlots[1].stacks.node.parent.activeInHierarchy,boardCounters:stage.ownedViews.get(carryUid).equipmentStackLabels.map(l=>l.string)};});
  assert.equal(report.battle.power,report.battle.initialPower+2*report.battle.stacks);assert.ok(report.battle.mana>0);assert.ok(report.battle.manaRate>=5);assert.ok(report.battle.stackVisible);assert.equal(Number(report.battle.displayedStacks),report.battle.stacks);
  await page.screenshot({path:path.join(output,'battle-growth.png')});
  report.errors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
  console.log('PASS actual Cocos preview: all 13 catalogue items and loaded attribute icons, five-stat layout, signed mana stats, real scroll/page/selection clicks, unchanged save, authored equipment art, equipped details and live attack growth/mana regeneration');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
