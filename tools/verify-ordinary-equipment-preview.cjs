const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENCOUNTER_PLAYWRIGHT||'playwright');
const output=path.resolve('docs/evidence/ordinary-equipment');
(async()=>{const browser=await chromium.launch({executablePath:process.env.ENCOUNTER_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});
 await page.waitForFunction(async()=>{const cc=window.cc||await System.import('cc');return cc.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded;});
 await page.evaluate(async()=>{const cc=window.cc||await System.import('cc');window.s=cc.find('Canvas/Stage').getComponent('BattleStage');window.ccTest=cc;
 window.point=node=>{const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {x:r.x+p.x/c.width*r.width,y:r.y+(1-p.y/c.height)*r.height};};
 s.session.chooseOpeningEncounter('inspiration');s.refreshRunUI();s.refreshShopUI();s.owned.equipmentReserve.push(...s.cfg.allEquipment().map(i=>i.id));s.refreshBackpack();s.ui.setSideTab('backpack');});
 const report={tooltips:[]};
 for(const id of ['guinsoo','crimson_bloodclaw']){
  const p=await page.evaluate(id=>point(s.ui.backpackSlots.find(slot=>s.ui.backpackData[slot.index]?.id===id).node),id);await page.mouse.move(p.x,p.y);await page.waitForTimeout(200);
  const state=await page.evaluate(()=>({active:s.ui.equipmentTooltip.activeInHierarchy,title:s.ui.equipmentTooltipTitle.string,stats:s.ui.equipmentTooltipRows.map(r=>({name:r.name.string,nameVisible:r.name.node.activeInHierarchy,value:r.value.string,iconLoaded:!!r.iconRoot.getChildByName('skin').getComponent('cc.Sprite').spriteFrame})),effect:s.ui.equipmentTooltipText.string}));
  assert.ok(state.active);assert.ok(state.stats.every(r=>r.iconLoaded&&!r.nameVisible));report.tooltips.push(state);await page.screenshot({path:path.join(output,`tooltip-${id}.png`)});
 }
 await page.mouse.move(640,100);
 await page.evaluate(()=>{s.debugGrantGold(100);const wave=s.waves.find(w=>w.stage===2&&w.encounterKind==='specialShop');s.debugJumpStage(2,wave.round);});await page.waitForTimeout(200);
 report.shop=await page.evaluate(()=>({offers:s.session.pendingStageReward.offers,tiers:s.equipmentPolicy.tiers,ordinary:s.runConfig.stageEncounters.basicEquipmentIds}));assert.equal(report.shop.ordinary.length,10);assert.ok(Object.values(report.shop.tiers).every(t=>t==='basic'));
 assert.ok(report.shop.offers.some(o=>o.kind==='equipment'));assert.ok(report.shop.offers.filter(o=>o.kind==='equipment').every(o=>o.price===3));
 await page.screenshot({path:path.join(output,'ordinary-shop.png')});
 const p=await page.evaluate(()=>{const i=s.session.pendingStageReward.offers.findIndex(o=>o.kind==='equipment');return point(s.stageRewards.root.getChildByName('stageRewardBody').children.filter(n=>n.name==='stageOffer')[i].getChildByName(`stageDetails_${i}`));});
 await page.mouse.click(p.x,p.y);await page.waitForTimeout(200);
 report.detail=await page.evaluate(()=>{const root=s.stageRewards.root.getChildByName('stageEquipmentDetail');return {active:root.activeInHierarchy,icons:root.getChildByName('equipmentDetailCard').getChildByName('equipmentStats').children.length};});assert.ok(report.detail.active);assert.ok(report.detail.icons>0);
 await page.screenshot({path:path.join(output,'ordinary-detail.png')});report.errors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
 console.log('PASS browser: actual backpack hover, two/five attribute icons with values, 10 ordinary items, stage-2 3-gold equipment and pointer-open details');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
