// Run against the installed debug APK's native V8 inspector, forwarded over ADB.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const port=process.env.ANDROID_DEBUG_PORT||43086;
 const [target]=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let seq=0;
 ws.onmessage=e=>{const r=JSON.parse(e.data);if(pending.has(r.id)){pending.get(r.id)(r);pending.delete(r.id);}};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const evaluate=async(fn,arg)=>{
  const id=++seq,r=await new Promise(resolve=>{pending.set(id,resolve);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:`(${fn.toString()})(${JSON.stringify(arg)??''})`,returnByValue:true,awaitPromise:true}}));});
  if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value;
 };
 const wait=async fn=>{for(let i=0;i<100;i++){if(await evaluate(fn))return;await pause(100);}throw Error('Native resource readiness timeout');};
 const report={platform:'Android native APK',viewport:'2400x1080'};
 try{
  await wait(()=>cc.find('Canvas')?.getComponentInChildren('BattleStage')?.loaded);
  await evaluate(()=>{
   const s=globalThis.fxStage=cc.find('Canvas').getComponentInChildren('BattleStage');s.enabled=false;
   s.ui.closeUnitDetail();s.stageRewards.hide();s.ui.hideEquipmentReward();s.ui.hideOpeningEncounter();
   const Sim=s.sim.constructor;
   globalThis.installNativeFx=id=>{
    const owned=[{uid:1,unitId:id,star:1,location:'board',x:3,y:3,equipment:[]}];
    s.owned.all().splice(0,s.owned.all().length,...owned);
    s.session.createPreview=()=>{
     const sim=new Sim(s.cfg,[{cfg:{...s.cfg.getUnit(id),critChance:0},side:0,x:3,y:3},
      {cfg:{...s.cfg.getUnit('helion'),hp:20000,atk:0,maxMana:0,startMana:0,skillId:undefined,armor:0,mr:0,critChance:0},side:1,x:4,y:3}],{seed:1024});
     sim.units.forEach(u=>u.atkCd=u.moveCd=100000);sim.units[0].mana=sim.units[0].cfg.maxMana;sim.units[0].atkCd=0;
     return{sim,battleIds:new Map([[1,1]])};
    };s.resetBattle(false);s.replayer.damageNumbers=false;s.replayer.healingNumbers=false;
   };
   globalThis.advanceNativeFx=t=>{while(s.sim.tick<Math.floor(t)){s.sim.step();if(s.sim.tick===1)s.sim.units[0].atkCd=100000;}s.replayer.consumeEvents();s.replayer.syncViews(0,t-Math.floor(t));};
   globalThis.nativeFxVisual=()=>({tick:s.sim.tick,slots:s.replayer.astralUnitVfx.slots.map(f=>({active:f.node.active,phase:f.frameIndex,loaded:!!f.sprite.spriteFrame,clip:f.firstFrame,position:{x:f.node.position.x,y:f.node.position.y},opacity:f.node.getComponent('cc.UIOpacity').opacity})),barrier:{active:s.views.get(1).stellarAura?.active??false,phase:s.views.get(1).stellarFrameIndex,loaded:!!s.views.get(1).stellarAura?.getComponent('cc.Sprite').spriteFrame}});
  });
  for(const id of ['milu','star_armor_guard']){
   await evaluate(id=>{installNativeFx(id);advanceNativeFx(1.1);},id);
   await wait(()=>fxStage.views.get(1).visualReady&&fxStage.replayer.astralUnitVfx.slots.length>0&&fxStage.replayer.astralUnitVfx.slots.every(s=>s.frames.filter(Boolean).length===8));
   if(id==='star_armor_guard')await wait(()=>fxStage.views.get(1).stellarFrames.filter(Boolean).length===8);
   const start=await evaluate(()=>nativeFxVisual());await pause(300);assert.deepEqual(await evaluate(()=>nativeFxVisual()),start,'native pause freezes visual state');
   const phases=[];for(const t of [2.5,4.5,6.5,8]){await evaluate(t=>advanceNativeFx(t),t);phases.push(await evaluate(()=>nativeFxVisual()));}
   assert.ok(new Set(phases.flatMap(p=>p.slots.filter(s=>s.active).map(s=>s.phase))).size>=3);
   const events=await evaluate(()=>fxStage.sim.events);assert.ok(events.some(e=>e.t===(id==='milu'?'teleport':'dash')));
   if(id==='star_armor_guard'){
    assert.ok(phases.every(p=>p.barrier.active&&p.barrier.loaded));
    await evaluate(()=>{fxStage.sim.units[0].stellarShield=null;fxStage.replayer.syncViews(0);});assert.equal((await evaluate(()=>nativeFxVisual())).barrier.active,false);
   }
   const speeds=await evaluate(id=>{const sample=(speed,n)=>{installNativeFx(id);for(let i=0;i<n;i++)fxStage.driver.advance(speed/60);fxStage.replayer.consumeEvents();fxStage.replayer.syncViews(0,fxStage.driver.interpolation,speed);return nativeFxVisual();};return[sample(1,12),sample(2,6)];},id);
   assert.deepEqual(speeds[0],speeds[1]);
   await evaluate(()=>{fxStage.sim.end(-1);fxStage.replayer.consumeEvents();fxStage.replayer.syncViews(0);});
   const ended=await evaluate(()=>nativeFxVisual());assert.ok(ended.slots.every(s=>!s.active));assert.equal(ended.barrier.active,false);
   await evaluate(id=>installNativeFx(id),id);assert.equal((await evaluate(()=>nativeFxVisual())).slots.length,0);
   report[id]={start,phases,events,pause:'pass',speed:'pass',endAndRebind:'pass'};
  }
  report.audio=await evaluate(()=>{const a=cc.director.getScene().getComponentInChildren('GameAudio');return{loaded:a.clips.size,variants:['click_2','click_3'].map(k=>a.clips.has(k))};});
  assert.equal(report.audio.loaded,45);assert.deepEqual(report.audio.variants,[true,true]);
  report.resolution=await evaluate(()=>({x:cc.view.getScaleX(),y:cc.view.getScaleY(),viewport:cc.view.getViewportRect()}));
  assert.equal(report.resolution.x,report.resolution.y);
  const out=path.resolve('temp/android-device-test/native-vfx.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
  await evaluate(()=>{installNativeFx('star_armor_guard');advanceNativeFx(4.5);});
  console.log('PASS Android native: two real casts, painted frames, pause, 1x/2x, shield break, end/rebind, 45 decoded sounds and uniform touch scale');
 }finally{ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
