// Actual component methods, asynchronous asset callbacks, no renderer/GPU.
const assert=require('node:assert/strict'),path=require('node:path'),{performance}=require('node:perf_hooks');
const h=require('./helpers/ui-harness.cjs'),{cc,Node,UITransform,Sprite,Label,pending,metrics}=h;
const source=f=>h.load(path.resolve('assets/scripts',f));
const baseline=!!process.env.UI_BASELINE_REF;
const check=(...args)=>{if(!baseline)assert.ok(...args);};
const flush=()=>{while(pending.length)pending.shift()();};
const reports=[];
function measure(name,action){flush();const before={...metrics},start=performance.now();action();flush();reports.push({name,created:metrics.created-before.created,destroyed:metrics.destroyed-before.destroyed,resourceLoadCalls:metrics.requests-before.requests,ms:+(performance.now()-start).toFixed(3)});}
const {BattleUI}=source('ui/BattleUI.ts'),{ConfigManager}=source('core/ConfigManager.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));cfg.setBattle(require('../assets/resources/config/battle.json'));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
for(const mobile of [false,true]){
 cc.sys.isMobile=mobile;
 const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();flush();
 const id=cfg.allUnits()[0].id;
 const cards=Array.from({length:5},()=>({unitId:id,name:'test',cost:1,price:1,poolLeft:20}));
 ui.refreshShop(cards);flush();const frame=ui.shopSlots[0].portrait.spriteFrame;
 measure(`shop unchanged x20 mobile=${mobile}`,()=>{for(let i=0;i<20;i++)ui.refreshShop(cards);});
 check(ui.shopSlots[0].portrait.spriteFrame===frame,'unchanged portrait identity');
 // Same unit with different artwork, A -> B -> A, reverse completion order.
 ui.refreshShop(cards.map(c=>({...c,artId:'helion'})));const older=pending.splice(0);
 ui.refreshShop(cards.map(c=>({...c,artId:'xiya'})));flush();older.forEach(cb=>cb());
 if(!baseline){const {UNIT_PORTRAIT,UNIT_SPRITE}=source('view/ArtPaths.ts');assert.equal(ui.shopSlots[0].portrait.spriteFrame.name,UNIT_PORTRAIT.xiya??UNIT_SPRITE.xiya_ally);}
 ui.refreshShop(cards.map(c=>({...c,unitId:null})));flush();assert.equal(ui.shopSlots[0].portrait.spriteFrame,null);
 const info={stage:2,round:1,roundsInStage:10},plan=Array(10).fill('normal');
 ui.refreshRun(100,100,1,10,'test',info,10,plan);flush();const track=[...ui.waveTrack.children];
 measure(`run health/round x20 mobile=${mobile}`,()=>{for(let i=0;i<20;i++)ui.refreshRun(100-i,100,1,10,'test',{...info,round:1+i%10},10,plan);});
 check(track.every(n=>ui.waveTrack.children.includes(n)),'progress track identity');
 ui.setShopVisible(true);ui.showSellPreview('test',1,false);flush();measure(`drag x20 mobile=${mobile}`,()=>{for(let i=0;i<20;i++)ui.showSellPreview('test',1,i%2===0);});ui.clearSellPreview();
 const {StageRewardPanel}=source('ui/StageRewardPanel.ts');const actions=[];
 const panel=new StageRewardPanel(ui.node,cfg,a=>actions.push(a));
 const offer={kind:'equipment',id:'basic_sword',price:3,bought:false};
 // Choose an authored basic equipment ID.
 offer.id=require('../assets/resources/config/run.json').stageEncounters.basicEquipmentIds[0];
 const reward={id:'shop-1',waveId:1,kind:'specialShop',refreshes:0,offers:[offer]};
 panel.show(reward,10);flush();const root=panel.root;
 measure(`merchant gold x20 mobile=${mobile}`,()=>{for(let i=0;i<20;i++)panel.show(reward,i%2?10:0);});
 check(root===panel.root,'merchant retained');
 const button=panel.root.getChildByName('stageRewardBody').children.find(n=>n.name==='stageOffer').getChildByName('stageChoice_0');
 panel.show(reward,0);button.events.get('end')();if(!baseline)assert.equal(actions.length,0,'old callback sees zero funds');
 panel.show(reward,10);
 const live=panel.root.getChildByName('stageRewardBody').children.find(n=>n.name==='stageOffer').getChildByName('stageChoice_0');live.events.get('end')();if(!baseline)assert.equal(actions.length,1);
 panel.show({...reward,offers:[{...offer,bought:true}]},10);live.events.get('end')();if(!baseline)assert.equal(actions.length,1,'sold offer rejects duplicate purchase');panel.hide();live.events.get('end')();if(!baseline)assert.equal(actions.length,1);
}
if (!baseline) {
 cc.Graphics.prototype.circle=function(){};
 const {StageRewardPanel}=source('ui/StageRewardPanel.ts');
 const basic=require('../assets/resources/config/run.json').stageEncounters.basicEquipmentIds[0];
 const state={gold:30,items:[basic]};let enhances=0,bets=0;
 const port={read:()=>state,level:()=>0,eligible:()=>true,enhance(){enhances++;},bet(){bets++;},settle(){},refresh(){panel.show(reward,state.gold);},inspect(){}};
 const reward={id:'services',waveId:2,kind:'specialShop',offers:[],refreshes:0};
 const panel=new StageRewardPanel(new Node('services'),cfg,()=>{},undefined,undefined,undefined,undefined,undefined,port);
 panel.show(reward,state.gold);panel.services.tab='forge';panel.services.selected=basic;panel.show(reward,state.gold);flush();
 let root=panel.root;const forge=panel.root.getChildByName('stageRewardBody').getChildByName('forgeEnhance');
 state.gold=0;panel.show(reward,0);assert.equal(panel.root,root);forge.events.get('end')();assert.equal(enhances,0);
 state.gold=30;panel.show(reward,30);forge.events.get('end')();assert.equal(enhances,1);
 panel.services.tab='lucky';panel.show(reward,state.gold);flush();root=panel.root;
 const roll=root.getChildByName('stageRewardBody').getChildByName('diceRoll');state.gold=0;panel.show(reward,0);assert.equal(panel.root,root);roll.events.get('end')();assert.equal(bets,0);
 state.gold=30;panel.show(reward,30);roll.events.get('end')();assert.equal(bets,1);
}
cc.sys.isMobile=false;
const {BattleStage}=source('view/BattleStage.ts'),{BoardView}=source('view/BoardView.ts');
const stage=new BattleStage();stage.node=new Node('stage');stage.cfg=cfg;stage.boardNode=new Node('board');
const bv=stage.boardNode.addComponent(BoardView);bv.boardPixelW=400;bv.boardPixelH=400;bv.cellToWorld=(x,y)=>({x:x*56,y:y*56,z:0});
stage.benchSlotWorld=i=>({x:i*64,y:-100,z:0});
let units=[{uid:1,unitId:cfg.allUnits()[0].id,location:'board',x:0,y:0,star:1,equipment:[]},{uid:2,unitId:cfg.allUnits()[1].id,location:'bench',x:-1,y:0,star:1,equipment:[]}];
const owned={all:()=>units,onBoard:()=>units.filter(u=>u.location==='board'),inBench:()=>units.filter(u=>u.location==='bench'),get:uid=>units.find(u=>u.uid===uid)};
stage.session={owned,save:{benchSlots:9},flow:{phase:'prepare',wave:{id:1}}};
let made=0;stage.makeUnitView=(root,cfgId,side,unitId,pos)=>{made++;const node=new Node('piece');root.addChild(node);node.setPosition(pos);return {node,cfgId,side,unitId,setStar(star){this.displayedStar=star;},setEquipment(){},sync(){},setVitalsVisible(){},setMaxHealthAppearance(){}};};
function preview(){stage.battleIds=new Map(owned.onBoard().map((u,i)=>[u.uid,i+1]));stage.sim={tick:0,units:[...owned.onBoard().map((u,i)=>({id:i+1,cfg:{id:u.unitId},side:0,x:u.x,y:u.y,star:u.star,equipment:[],snapshot:()=>({})})),{id:100,cfg:{id:cfg.allUnits()[2].id},side:1,x:3,y:6,star:1,equipment:[],snapshot:()=>({})}]};}
preview();stage.createViews();let keep=stage.ownedViews.get(1);
measure('prepare move/equipment/star x20',()=>{for(let i=0;i<20;i++){units[0].x=i%4;units[0].star=i>10?2:1;preview();stage.createViews();}});check(stage.ownedViews.get(1)===keep,'board identity');
measure('purchase one reserve',()=>{units.push({uid:3,unitId:units[1].unitId,location:'bench',x:-1,y:1,star:1,equipment:[]});preview();stage.createViews();});
// Merge removes UID 2; surviving UID 3 and board units must retain identity.
keep=stage.ownedViews.get(3);units=units.filter(u=>u.uid!==2);units.find(u=>u.uid===3).star=2;preview();stage.createViews();check(stage.ownedViews.get(3)===keep,'merge survivor identity');
// Board/bench boundary uses the existing separate portrait geometry; only affected pieces replaced.
units[0].location='bench';units[0].y=0;units.find(u=>u.uid===3).location='board';units.find(u=>u.uid===3).x=2;preview();stage.createViews();assert.equal(stage.ownedViews.size,2);
// Simulation IDs can change without changing owned identities.
keep=stage.ownedViews.get(3);stage.sim.units[0].id=7;stage.battleIds.set(3,7);stage.createViews();check(stage.views.get(7)===keep,'UID remap');
const army=stage.views.get(7);stage.session.flow.phase='battle';const simBefore=stage.sim;stage.createBenchViews(stage.boardNode.getChildByName('units'));assert.equal(stage.sim,simBefore);assert.equal(stage.views.get(7),army,'reserve update preserves combat');
stage.createViews();check(stage.views.get(7)!==army,'combat entry rebuilds');
const {BattleReplayer}=source('view/BattleReplayer.ts');const replay=new BattleReplayer();replay.eventCursor=12;replay.moves.set(1,{});if(!baseline){replay.bindPreview({tick:0},new Map());assert.equal(replay.eventCursor,0);assert.equal(replay.moves.size,0);}
if (!baseline) {
 stage.session.flow.phase='prepare'; preview(); stage.createViews();
 const fx=new Node('fx');stage.boardNode.addChild(fx);
 let previewBinds=0,fullBinds=0,fieldBuilds=0;
 stage.session.createPreview=()=>({sim:stage.sim,battleIds:stage.battleIds});
 stage.ui={closeUnitDetail(){},refreshFormation(){},refreshTraits(){}};
 stage.refreshEconomyUI=()=>{};stage.cfgUnits=()=>cfg.allUnits();
 stage.replayer={bindPreview(){previewBinds++;},bind(){fullBinds++;},setFxRoot(){}};
 bv.showAstralFields=()=>fieldBuilds++;
 stage.sim.astralFields=[];stage.sim.resolvedTraits=[[]];
 stage.resetBattle(false);stage.resetBattle(false);
 assert.equal(previewBinds,2);assert.equal(fullBinds,0);assert.equal(fieldBuilds,1);
 assert.equal(stage.boardNode.getChildByName('fx'),fx);
 const enemy=stage.views.get(100);let inspected;
 stage.showBattleDetail=id=>inspected=id;enemy.unitId=101;
 enemy.node.events.get('end')();assert.equal(inspected,101,'enemy input uses current simulation ID');
 const view=stage.ownedViews.get(3);const size=view.node.events.size;stage.setupTouchEvents();assert.equal(view.node.events.size,size);
}
assert.equal(h.cc.director===undefined,false);
const {TraitPanel}=source('ui/TraitPanel.ts'),{resolveTraits}=source('battle/Traits.ts');
const trait=cfg.battle.traits.find(t=>t.id==='mechanical_pioneer');
const traits=new TraitPanel(new Node('traitsHost'));
traits.refresh(resolveTraits([trait],trait.members.slice(0,1)),cfg.allUnits());flush();
const row=traits.rows.getChildByName(`trait_${trait.id}`);
measure('trait reorder/count x20',()=>{for(let i=0;i<20;i++)traits.refresh(resolveTraits([trait],trait.members.slice(0,i%2+1)),cfg.allUnits());});
check(traits.rows.getChildByName(`trait_${trait.id}`)===row,'trait row identity');
if (!baseline) {
 for (const report of reports) if (!report.name.startsWith('purchase')) {
  assert.equal(report.created,0,report.name+' creates no nodes');
  assert.equal(report.destroyed,0,report.name+' destroys no nodes');
 }
 for (const report of reports.filter(r=>r.name.startsWith('shop unchanged'))) assert.equal(report.resourceLoadCalls,0);
}
console.log(JSON.stringify({mode:baseline?'baseline':'after',scope:'Node component doubles; resource load calls are not network requests; timings include mock callbacks, no GPU',reports},null,2));
console.log(baseline ? 'BASELINE measurements complete; optimization assertions disabled' : 'PASS incremental UI: desktop/mobile, portraits/races, progress, drag, merchant current gold/stock, UID movement/merge/remap, reserve during combat and phase reset');
