// Isolated local browser only: runtime fixtures never touch project config or the user's saved game.
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.ASTRAL_PLAYWRIGHT||'playwright');
const output=path.resolve(__dirname,'../docs/evidence/astral-trait');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.ASTRAL_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:7456/',{waitUntil:'networkidle'});
    await page.waitForTimeout(1500);
    await page.evaluate(async()=>{
      const cc=window.cc??await window.System.import('cc');
      window.astralCC=cc;
      const stage=cc.find('Canvas/Stage').getComponent('BattleStage');
      if(!stage.loaded)throw Error('BattleStage has not loaded');
      stage.enabled=false;window.astralStage=stage;
      window.astralSim=stage.sim.constructor;
      window.astralMembers=stage.cfg.allUnits().slice(0,10);
      window.astralTrait=stage.cfg.battle.traits.find(t=>t.id==='astral');
      stage.cfg.battle.traits=[window.astralTrait];
      window.installAstralFixture=n=>{
        const members=window.astralMembers,trait=window.astralTrait;
        trait.members=members.map(u=>u.id);trait.pendingMembers=false;
        const owned=members.slice(0,n).map((u,i)=>({uid:i+1,unitId:u.id,star:1,location:'board',x:i%7,y:Math.floor(i/7),equipment:[]}));
        stage.owned.all().splice(0,stage.owned.all().length,...owned);
        const blank=u=>({...u,hp:100000,atk:0,skillId:undefined,maxMana:0,startMana:0,armor:0,mr:0});
        stage.session.createPreview=()=>{
          const placements=[...[{x:2,y:6},{x:3,y:6},{x:2,y:5}].map(p=>({cfg:blank(members[0]),side:1,...p})),
            ...owned.map((u,i)=>({cfg:blank(members[i]),side:0,x:u.x,y:u.y,star:u.star}))];
          const sim=new window.astralSim(stage.cfg,placements,{seed:1022});
          sim.units.forEach(u=>u.stunnedUntilTick=1000000);
          return {sim,battleIds:new Map(owned.map((u,i)=>[u.uid,i+4]))};
        };
        stage.resetBattle(false);stage.ui.setSideTab('traits');
        stage.combatStats.begin(stage.sim.units);
        stage.ui.refreshCombatStats(stage.combatStats.snapshot());
        return {tiles:stage.sim.astralFields[0].cells.length,
          active:stage.ui.traitPanel.states[0].active.count,
          overlay:stage.boardNode.getChildByName('astralCells').activeInHierarchy};
      };
      window.astralPoint=node=>{
        const world=node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
        const camera=cc.find('Canvas').getComponent('cc.Canvas').cameraComponent;
        const screen=camera.worldToScreen(world),canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
        return {x:rect.x+screen.x/canvas.width*rect.width,y:rect.y+(1-screen.y/canvas.height)*rect.height};
      };
    });
    const report={tiers:[],errors};
    for(const n of [3,5,7,10]){
      const state=await page.evaluate(n=>window.installAstralFixture(n),n);
      assert.equal(state.tiles,n===10?28:n===7?21:n===5?14:7);assert.equal(state.active,n);assert.equal(state.overlay,true);
      await page.waitForTimeout(160);
      await page.screenshot({path:path.join(output,`tiles-${n}.png`)});
      const point=await page.evaluate(()=>window.astralPoint(window.astralStage.ui.traitPanel.rows.children[0]));
      await page.mouse.click(point.x,point.y);await page.waitForTimeout(120);
      const detail=await page.evaluate(()=>{
        const panel=window.astralStage.ui.traitPanel,card=panel.detail,cc=window.astralCC;
        if(!card)return null;
        const size=card.getComponent('cc.UITransform').contentSize;
        return {selected:panel.selected,width:size.width,height:size.height,
          texts:card.getComponentsInChildren('cc.RichText').map(c=>c.string)};
      });
      assert.ok(detail,'real pointer click opens the trait detail');assert.equal(detail.selected,'astral');assert.ok(detail.height<688);
      await page.screenshot({path:path.join(output,`detail-${n}.png`)});
      const close=await page.evaluate(()=>window.astralPoint(window.astralStage.ui.traitPanel.detail.children.find(n=>n.name==='button')));
      await page.mouse.click(close.x,close.y);
      assert.equal(await page.evaluate(()=>window.astralStage.ui.traitPanel.detail===null),true,'real close click');
      report.tiers.push({...state,detail});
    }
    report.meteor=await page.evaluate(()=>{
      const s=window.astralStage;while(s.sim.tick<99)s.sim.step();
      const before=s.sim.events.filter(e=>e.t==='astral_meteor').length;
      s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0);
      s.combatStats.consume(s.sim.events);s.ui.refreshCombatStats(s.combatStats.snapshot());
      return {before,tick:s.sim.tick,hits:s.sim.events.filter(e=>e.astralMeteorSide===0),
        impacts:s.boardNode.getChildByName('fx').children.filter(n=>n.name==='astralMeteor').length,
        statistics:s.combatStats.snapshot().filter(r=>r.sourceKind)};
    });
    assert.equal(report.meteor.before,0);assert.equal(report.meteor.impacts,1);assert.equal(report.meteor.hits.length,3);
    assert.ok(report.meteor.hits.every(e=>e.dmg===3000));assert.equal(report.meteor.statistics[0].damage,9000);
    await page.waitForTimeout(80);await page.screenshot({path:path.join(output,'meteor-5s.png')});
    report.pause=await page.evaluate(()=>{
      const s=window.astralStage,node=s.boardNode.getChildByName('fx').getChildByName('astralMeteor');
      const first=node.getComponent('cc.UIOpacity').opacity;
      s.replayer.syncViews(0,0,0);
      return {first,paused:node.getComponent('cc.UIOpacity').opacity};
    });assert.equal(report.pause.first,report.pause.paused);
    report.cleanup=await page.evaluate(()=>{
      const s=window.astralStage;while(s.sim.tick<124)s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0);
      const expired=s.boardNode.getChildByName('fx').children.filter(n=>n.name==='astralMeteor'&&n.isValid).length;
      const debug={tick:s.sim.tick,renderTick:s.replayer.renderTick,impacts:s.replayer.astralVfx?.slots.filter(s=>s.event).map(s=>s.event.tick)};
      while(s.sim.tick<200)s.sim.step();s.replayer.consumeEvents();s.replayer.syncViews(0);
      const second=s.sim.events.filter(e=>e.t==='astral_meteor').length;
      s.sim.end(-1);s.replayer.consumeEvents();
      return {expired,second,end:s.boardNode.getChildByName('fx').children.filter(n=>n.name==='astralMeteor'&&n.isValid).length,debug};
    });fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
    assert.equal(report.cleanup.expired,0);assert.equal(report.cleanup.second,2);assert.equal(report.cleanup.end,0);
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-acceptance.json'),JSON.stringify(report,null,2));
    console.log('PASS actual Cocos browser: four tile counts, pointer-open/close, 3000 x 3 magic hits at 5s, 9000 independent statistics, pause and cleanup');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
