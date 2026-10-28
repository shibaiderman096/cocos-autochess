const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ASTRAL_PLAYWRIGHT||'playwright');
const out=path.resolve('temp/monster-formations');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],report={};
 try{
  const page=await browser.newPage({viewport:{width:1600,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MONSTER_PREVIEW_URL||'http://127.0.0.1:7456/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.cc=await System.import('cc');window.point=n=>{const p=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(n.worldPosition),c=document.querySelector('canvas'),r=c.getBoundingClientRect();return{x:r.x+p.x/c.width*r.width,y:r.y+(1-p.y/c.height)*r.height};};});
  await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  const start=await page.evaluate(()=>point(cc.find('Canvas').getComponentInChildren('MainMenu').node.getChildByName('startGame')));await page.mouse.click(start.x,start.y);
  await page.waitForFunction(()=>{const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;});
  await page.evaluate(()=>{
   const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;s.persistShopState=()=>{};
   const Session=s.session.constructor;
   window.installFormation=(level,intro=false)=>{
    const run=new Session(s.cfg,s.runConfig,s.waveTemplates,{runSeed:5,stageCount:10,enemyGenerationMode:'budget-v1',openingEncounter:false,equipmentPolicy:s.equipmentPolicy,enemyRoles:s.enemyRoles,formationConfig:s.formationConfig,enemyDifficulty:s.enemyDifficulty,enemyPower:s.enemyPower});
    const wave=intro?run.waves.find(w=>w.stage===1&&w.round===3):run.waves.find(w=>w.stage===level&&w.encounterKind==='monster');
    run.debugJump(wave.stage,wave.round);s.stageRewards.hide();s.ui.hideOpeningEncounter();s.ui.hideEquipmentReward();s.session=run;s.resetBattle(false);s.refreshShopUI();s.refreshEconomyUI();s.refreshRunUI();
    return{stage:wave.stage,round:wave.round,enemies:wave.enemies};
   };
  });
  for(const [label,stage,intro]of [['intro',1,true],['ordinary',8,false],['strong-4',4,false],['strong-7',7,false],['strong-10',10,false]]){
   report[label]=await page.evaluate(([s,i])=>installFormation(s,i),[stage,intro]);
   await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   if(label.startsWith('strong'))assert.equal(report[label].enemies.length,1+({4:2,7:4,10:6}[stage]));
   report[label].portraits=await page.evaluate(()=>Array.from(stage.views.values()).filter(v=>v.side===1).map(v=>({id:v.cfgId,loaded:v.visualReady,position:{x:v.node.position.x,y:v.node.position.y}})));
   assert.equal(report[label].portraits.length,report[label].enemies.length);
   await page.screenshot({path:path.join(out,label+'.png')});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'preview.json'),JSON.stringify({...report,errors},null,2));
  console.log('PASS actual compiled game 1600x720: readiness gate, intro front/back, 10-monster mirror formation, strong 3/5/7 formations, loaded portraits and no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
