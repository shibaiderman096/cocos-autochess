// Isolated browser fixtures: no project roster or user save is modified.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BLOODFIEND_PLAYWRIGHT||'playwright');
const output=path.resolve('.test-build/bloodfiend-preview');fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BLOODFIEND_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const errors=[],report={};
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:7456/?scene=e3041672-7bfd-46bb-a833-416a349ab97b',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.cc=window.cc||await System.import('cc');});
    await page.waitForFunction(()=>cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
    await page.evaluate(()=>{
      window.menu=cc.find('Canvas').getComponentInChildren('MainMenu');
      window.point=node=>{
        const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
        const screen=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
        const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
        return {x:r.x+screen.x/canvas.width*r.width,y:r.y+(1-screen.y/canvas.height)*r.height};
      };
    });
    async function click(fn){const p=await page.evaluate(fn);await page.mouse.click(p.x,p.y);await page.waitForTimeout(120);}
    await click(()=>point(menu.node.getChildByName('menuHeader').getChildByName('openCollection')));
    await click(()=>point(menu.collection.body.getChildByName('collectionTab_traits')));
    // Navigate catalogue pages and then select the actual bloodfiend tile by pointer.
    const index=await page.evaluate(()=>menu.collection.entries().findIndex(e=>e.id==='bloodfiend'));assert.ok(index>=0);
    for(let i=0;i<Math.floor(index/8);i++)await click(()=>point(menu.collection.body.getChildByName('collectionNext')));
    await click(()=>point(menu.collection.body.getChildByName('collectionEntry_bloodfiend')));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    report.catalogue=await page.evaluate(()=>{
      const card=menu.collection.traitPanel.detail;
      return {pending:menu.collection.traits.find(t=>t.config.id==='bloodfiend').config.pendingMembers,
        height:card.getComponent('cc.UITransform').contentSize.height,
        description:card.getChildByName('traitDescription').getComponent('cc.RichText').string,
        rows:card.children.filter(n=>n.name==='traitBreakpoint').map(n=>n.getChildByName('bloodfiendEffect').getComponent('cc.RichText').string)};
    });
    assert.equal(report.catalogue.pending,false);assert.equal(report.catalogue.rows.length,3);assert.ok(report.catalogue.height<600);
    await page.screenshot({path:path.join(output,'catalogue.png')});
    for(const count of [3,5,7]){
      await page.evaluate(count=>{
        const p=menu.collection.traitPanel,state=menu.collection.traits.find(t=>t.config.id==='bloodfiend');
        p.inspectForCatalog({...state,count,active:state.config.breakpoints.find(t=>t.count===count)},menu.cfg.allUnits());
      },count);
      await page.waitForTimeout(150);await page.screenshot({path:path.join(output,`tier-${count}.png`)});
    }
    await page.evaluate(()=>new Promise((resolve,reject)=>cc.director.loadScene('floating-ruins',e=>e?reject(e):resolve())));
    await page.waitForFunction(()=>{
      const s=cc.find('Canvas')?.getComponentInChildren('BattleStage');return s?.loaded&&!s.loadScreen;
    });
    report.combat=await page.evaluate(()=>{
      const s=window.stage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
      if(s.session.pendingOpeningEncounter)s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
      s.ui.hideOpeningEncounter();s.ui.setShopContentOccupied(false);
      const members=s.cfg.allUnits().slice(0,7),trait=s.cfg.battle.traits.find(t=>t.id==='bloodfiend');
      trait.members=members.map(u=>u.id);trait.pendingMembers=false;s.cfg.battle.traits=[trait];
      const owned=members.map((u,i)=>({uid:i+1,unitId:u.id,star:1,location:'board',x:i,y:2,equipment:[]}));
      s.owned.all().splice(0,s.owned.all().length,...owned);const Sim=s.sim.constructor;
      const blank=u=>({...u,hp:1000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0});
      s.session.createPreview=()=>({sim:new Sim(s.cfg,[...owned.map((o,i)=>({cfg:blank(members[i]),side:0,x:o.x,y:o.y})),
        ...[0,1].map(i=>({cfg:blank(members[0]),side:1,x:i+3,y:5}))],{seed:25}),battleIds:new Map(owned.map(o=>[o.uid,o.uid]))});
      s.resetBattle(false);s.ui.setSideTab('traits');s.combatStats.begin(s.sim.units);
      const source=s.sim.units[0],target=s.sim.units[7];source.hp=950;
      s.sim.damage(source,target,1000,'true');s.sim.resolveDamage();s.sim.pendingDamage.length=0;
      s.replayer.consumeEvents();s.replayer.syncViews(0);s.combatStats.consume(s.sim.events);s.ui.refreshCombatStats(s.combatStats.snapshot());
      const state=s.ui.traitPanel.states.find(t=>t.config.id==='bloodfiend');s.ui.traitPanel.showDetail('bloodfiend');
      return {active:state.active.count,hp:source.hp,shield:source.shield,attackSpeed:source.attackSpeed,baseAttackSpeed:source.cfg.atkSpeed,
        revels:s.sim.events.filter(e=>e.t==='bloodfiend_revel').length,statistics:s.combatStats.snapshot()};
    });
    assert.equal(report.combat.active,7);assert.equal(report.combat.hp,1000);assert.equal(report.combat.shield,200);
    assert.equal(report.combat.revels,7);assert.equal(report.combat.attackSpeed,report.combat.baseAttackSpeed+.5);
    await page.waitForFunction(()=>Array.from(stage.views.values()).every(v=>v.visualReady));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:path.join(output,'combat-revel.png')});
    assert.deepEqual(errors,[]);report.errors=errors;
    fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));
    console.log('PASS Cocos preview: pointer catalogue navigation, pending roster, three rendered tiers, seven-member runtime fixture, innate vamp/revel/shields/statistics and no page errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
