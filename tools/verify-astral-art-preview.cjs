// Real Creator preview in an isolated browser. All extended rosters live only in memory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ASTRAL_PLAYWRIGHT||'playwright');
const output=path.resolve(__dirname,'../docs/evidence/astral-v2');
fs.mkdirSync(path.join(output,'frames'),{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.ASTRAL_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const errors=[],report={errors,tiers:[]};
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});await page.waitForTimeout(1500);
    await page.evaluate(async()=>{
      const cc=window.cc??await window.System.import('cc');window.astralCC=cc;
      const stage=cc.find('Canvas/Stage').getComponent('BattleStage');
      if(!stage.loaded)throw Error('BattleStage has not loaded');stage.enabled=false;
      window.astralStage=stage;window.astralSim=stage.sim.constructor;
      const roster=stage.cfg.allUnits();
      window.astralMembers=['oris','blackstar_warlock',...roster.filter(u=>!['oris','blackstar_warlock'].includes(u.id)).slice(0,8).map(u=>u.id)].map(id=>roster.find(u=>u.id===id));
      window.astralTrait=stage.cfg.battle.traits.find(t=>t.id==='astral');
      window.authoredAstralMembers=[...window.astralTrait.members];
      window.originalAffiliations=stage.cfg.battle.traits.filter(t=>t.id!=='astral'&&t.members?.some(id=>window.authoredAstralMembers.includes(id))).map(t=>({id:t.id,members:t.members.filter(id=>window.authoredAstralMembers.includes(id))}));
      stage.cfg.battle.traits=[window.astralTrait];
      window.installAstralFixture=(n,both=false)=>{
        const members=window.astralMembers,trait=window.astralTrait;
        trait.members=n===2?[...window.authoredAstralMembers]:members.map(u=>u.id);
        const owned=members.slice(0,n).map((u,i)=>({uid:i+1,unitId:u.id,star:1,location:'board',x:i%7,y:Math.floor(i/7),equipment:[]}));
        stage.owned.all().splice(0,stage.owned.all().length,...owned);
        const blank=u=>({...u,hp:100000,atk:0,skillId:undefined,maxMana:0,startMana:0,armor:0,mr:0});
        stage.session.createPreview=()=>{
          const enemies=both?members.map((u,i)=>({cfg:blank(u),side:1,x:i%7,y:7-Math.floor(i/7)})):
            [{x:2,y:6},{x:3,y:6},{x:2,y:5}].map(p=>({cfg:blank(members[0]),side:1,...p}));
          const placements=[...enemies,
            ...owned.map((u,i)=>({cfg:blank(members[i]),side:0,x:u.x,y:u.y,star:1}))];
          const sim=new window.astralSim(stage.cfg,placements,{seed:1022});sim.units.forEach(u=>u.stunnedUntilTick=1000000);
          return {sim,battleIds:new Map(owned.map((u,i)=>[u.uid,i+enemies.length+1]))};
        };
        stage.resetBattle(false);stage.ui.setSideTab('traits');stage.combatStats.begin(stage.sim.units);
        stage.ui.refreshCombatStats(stage.combatStats.snapshot());
        return {tiles:stage.sim.astralFields[0]?.cells.length??0,active:stage.ui.traitPanel.states[0].active?.count??0};
      };
      window.astralPoint=node=>{
        const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
        const camera=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent,screen=camera.worldToScreen(world);
        const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
        return {x:rect.x+screen.x/canvas.width*rect.width,y:rect.y+(1-screen.y/canvas.height)*rect.height};
      };
      window.advanceAstral=tick=>{
        while(stage.sim.tick<Math.floor(tick))stage.sim.step();
        stage.replayer.consumeEvents();stage.replayer.syncViews(0,tick-Math.floor(tick));
        stage.ui.setCombatActive(true);stage.ui.hideFightBtn();stage.ui.setBattleTimer(stage.sim.clockState);
        stage.combatStats.consume(stage.sim.events);stage.ui.refreshCombatStats(stage.combatStats.snapshot());
      };
      window.astralVisual=()=>{
        const fx=stage.boardNode.getChildByName('fx'),field=stage.boardNode.getChildByName('astralCells');
        return {tick:stage.sim.tick,renderTick:stage.replayer.renderTick,
          tiles:field.children.filter(n=>n.name==='astralTile').map(n=>({position:{x:n.position.x,y:n.position.y},loaded:!!n.getComponent('cc.Sprite').spriteFrame,opacity:n.getComponent('cc.UIOpacity').opacity})),
          fieldRing:field.getComponentsInChildren('cc.Sprite').filter(s=>s.node.name==='astralFieldRing').map(s=>({active:s.node.active,loaded:!!s.spriteFrame,angle:s.node.angle})),
          fx:fx.children.filter(n=>n.name.startsWith('astral')).map(n=>({name:n.name,active:n.active,
            children:n.children.map(c=>({name:c.name,active:c.active,loaded:!!c.getComponent('cc.Sprite').spriteFrame,
              position:{x:c.position.x,y:c.position.y},scale:c.scale.x,opacity:c.getComponent('cc.UIOpacity').opacity}))}))};
      };
    });
    report.authored=await page.evaluate(()=>({members:window.authoredAstralMembers,affiliations:window.originalAffiliations,...window.installAstralFixture(2)}));
    assert.deepEqual(report.authored.members,['oris','blackstar_warlock','star_armor_guard','milu']);assert.equal(report.authored.tiles,0);
    await page.waitForTimeout(400);await page.screenshot({path:path.join(output,'authored-members.png')});
    const point=await page.evaluate(()=>window.astralPoint(window.astralStage.ui.traitPanel.rows.children[0]));
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(250);
    report.authored.detail=await page.evaluate(()=>{
      const card=window.astralStage.ui.traitPanel.detail;
      return {height:card.getComponent('cc.UITransform').contentSize.height,texts:card.getComponentsInChildren('cc.Label').map(l=>l.string)};
    });
    await page.screenshot({path:path.join(output,'authored-detail.png')});
    const close=await page.evaluate(()=>window.astralPoint(window.astralStage.ui.traitPanel.detail.children.find(n=>n.name==='button')));
    await page.mouse.click(close.x,close.y);
    assert.equal(await page.evaluate(()=>window.astralStage.ui.traitPanel.detail===null),true,'real close click clears the board for VFX inspection');
    for(const n of [3,5,7,10]){
      const state=await page.evaluate(n=>window.installAstralFixture(n),n);
      await page.waitForTimeout(350);
      const visual=await page.evaluate(()=>window.astralVisual());
      assert.equal(visual.tiles.length,n===10?28:n===7?21:n===5?14:7);assert.ok(visual.tiles.every(t=>t.loaded));
      assert.equal(visual.fieldRing.length,n===10?1:0);assert.ok(visual.fieldRing.every(r=>r.loaded));
      await page.screenshot({path:path.join(output,`tiles-${n}.png`)});report.tiers.push({...state,visual});
    }
    report.approach=[];
    // These screenshots are frames of the production renderer, sampled at 30 replay frames/sec.
    for(let i=0;i<61;i++){
      const tick=86+i*2/3;
      await page.evaluate(tick=>window.advanceAstral(tick),tick);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(output,'frames',String(i).padStart(3,'0')+'.png')});
      if([6,12,18,21,28,36,54,60].includes(i))report.approach.push(await page.evaluate(()=>window.astralVisual()));
      if(i===12)await page.screenshot({path:path.join(output,'meteor-approach.png')});
      if(i===21)await page.screenshot({path:path.join(output,'meteor-impact.png')});
      if(i===28)await page.screenshot({path:path.join(output,'meteor-shockwave.png')});
    }
    assert.ok(report.approach.find(s=>s.tick===94).fx.some(n=>n.name==='astralWarning'&&n.active));
    assert.ok(report.approach.find(s=>s.tick===100).fx.some(n=>n.name==='astralMeteor'&&n.active));
    report.meteor=await page.evaluate(()=>{
      const s=window.astralStage;
      return {events:s.sim.events.filter(e=>e.t==='astral_meteor'),hits:s.sim.events.filter(e=>e.astralMeteorSide===0),
        stats:s.combatStats.snapshot().filter(r=>r.sourceKind==='astralMeteor')};
    });
    assert.equal(report.meteor.events.length,1);assert.equal(report.meteor.events[0].tick,100);
    assert.equal(report.meteor.hits.length,3);assert.ok(report.meteor.hits.every(h=>h.dmg===3000));assert.equal(report.meteor.stats[0].damage,9000);
    report.expired=await page.evaluate(()=>window.astralVisual());assert.ok(report.expired.fx.every(n=>!n.active));
    await page.evaluate(()=>window.advanceAstral(194));
    report.pause={before:await page.evaluate(()=>window.astralVisual())};
    await page.waitForTimeout(300);await page.evaluate(()=>window.astralStage.replayer.syncViews(0,0,0));
    report.pause.after=await page.evaluate(()=>window.astralVisual());assert.deepEqual(report.pause.before,report.pause.after,'pause freezes comet, tile glow and field rotation');
    report.pool=await page.evaluate(()=>{
      const s=window.astralStage,before=s.replayer.astralVfx.slots.length;
      window.advanceAstral(200);const impact=window.astralVisual();
      window.advanceAstral(224);return {before,after:s.replayer.astralVfx.slots.length,impact,events:s.sim.events.filter(e=>e.t==='astral_meteor').length};
    });assert.equal(report.pool.before,report.pool.after);assert.equal(report.pool.events,2);
    report.cleanup=await page.evaluate(()=>{
      const s=window.astralStage;s.sim.end(-1);s.replayer.consumeEvents();s.replayer.syncViews(0);
      return window.astralVisual();
    });assert.equal(report.cleanup.fx.length,0);assert.ok(report.cleanup.fieldRing.every(r=>!r.active));
    // Remove and rebuild before old asset callbacks can complete, then wait for all asynchronous loads.
    await page.evaluate(()=>{window.installAstralFixture(10);window.installAstralFixture(2);});await page.waitForTimeout(400);
    report.rebind=await page.evaluate(()=>window.astralVisual());assert.equal(report.rebind.tiles.length,0);assert.equal(report.rebind.fx.length,0);
    await page.evaluate(()=>{window.installAstralFixture(10,true);window.advanceAstral(94);});await page.waitForTimeout(300);
    report.both={approach:await page.evaluate(()=>window.astralVisual())};
    assert.equal(report.both.approach.tiles.length,56);
    assert.equal(report.both.approach.fx.filter(n=>n.name==='astralWarning'&&n.active).length,2);
    await page.evaluate(()=>window.advanceAstral(100));
    report.both.impact=await page.evaluate(()=>window.astralVisual());
    assert.equal(report.both.impact.fx.filter(n=>n.name==='astralMeteor'&&n.active).length,2);
    report.both.stats=await page.evaluate(()=>window.astralStage.combatStats.snapshot().filter(r=>r.sourceKind==='astralMeteor'));
    assert.deepEqual(report.both.stats.map(s=>s.side).sort(),[0,1]);
    await page.evaluate(()=>{window.installAstralFixture(10);window.advanceAstral(94);});
    report.cancel=await page.evaluate(()=>{
      const s=window.astralStage,before=window.astralVisual();
      s.sim.units.filter(u=>u.side===1).forEach(u=>u.skillUntargetable=true);s.replayer.syncViews(0);
      return {before,after:window.astralVisual(),events:s.sim.events.filter(e=>e.t==='astral_meteor').length};
    });
    assert.ok(report.cancel.before.fx.some(n=>n.name==='astralWarning'&&n.active));
    assert.ok(report.cancel.after.fx.every(n=>!n.active));assert.equal(report.cancel.events,0,'cosmetic approach cannot cause damage or target an untargetable army');
    report.speed=await page.evaluate(()=>{
      const s=window.astralStage;
      const sample=(speed,frames)=>{
        window.installAstralFixture(10);
        for(let i=0;i<frames;i++)s.driver.advance(speed/60);
        s.replayer.consumeEvents();s.replayer.syncViews(1/60,s.driver.interpolation,speed);
        const visual=window.astralVisual(),comet=visual.fx.find(n=>n.name==='astralWarning'&&n.active)?.children.find(c=>c.name==='astralComet');
        return {renderTick:visual.renderTick,position:comet?.position,tiles:visual.tiles.map(t=>t.opacity),ring:visual.fieldRing.map(r=>r.angle)};
      };
      return {normal:sample(1,282),double:sample(2,141),sameWallNormal:sample(1,141)};
    });
    assert.ok(Math.abs(report.speed.normal.renderTick-report.speed.double.renderTick)<1e-8);
    assert.ok(Math.abs(report.speed.normal.position.x-report.speed.double.position.x)<1e-6);
    assert.deepEqual(report.speed.normal.tiles,report.speed.double.tiles);
    assert.ok(Math.abs(report.speed.double.renderTick-report.speed.sameWallNormal.renderTick*2)<1e-8);
    await page.evaluate(()=>window.installAstralFixture(2));await page.waitForTimeout(250);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
    console.log('PASS Creator browser: authored memberships, four painted tile counts, loaded sprites, approach/impact/fade, pause and 2x, both sides, target cancellation, pool reuse, 3000 x 3, cleanup and rapid rebind.');
  }catch(error){fs.writeFileSync(path.join(output,'browser-acceptance-failure.json'),JSON.stringify({...report,error:error.stack},null,2));throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
