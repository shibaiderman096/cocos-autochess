// Exercise the actual UI component with an asynchronous asset loader and no renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const pending = [];
class Node {
  constructor(name) { this.name=name; this.children=[]; this.components=new Map(); this.events=new Map(); this.active=true; }
  static EventType = { TOUCH_START:'start', TOUCH_END:'end' };
  addChild(n) { n.parent=this; this.children.push(n); }
  getChildByName(name) { return this.children.find(n=>n.name===name); }
  addComponent(T) {
    if(T===Graphics&&!this.getComponent(UITransform)) this.addComponent(UITransform).setContentSize(100,100);
    const c=new T(); c.node=this; if(!this.components.has(T)) this.components.set(T,c); return c;
  }
  getComponent(T) { return this.components.get(T); }
  setPosition(x,y,z) { this.position={x,y,z}; }
  setScale(x,y,z) { this.scale={x,y,z}; }
  setSiblingIndex(i) { const list=this.parent.children; list.splice(list.indexOf(this),1); list.splice(i,0,this); }
  on(type,fn) { this.events.set(type,fn); }
  destroy() { for(const c of this.components.values()) c.isValid=false; for(const n of this.children) n.destroy(); this.parent.children=this.parent.children.filter(n=>n!==this); }
}
class UITransform {
  anchorPoint={x:.5,y:.5};
  setContentSize(width,height) { this.contentSize={width,height}; }
  setAnchorPoint(x,y) { this.anchorPoint={x,y}; }
}
class Sprite {
  static SizeMode={CUSTOM:0}; static Type={SIMPLE:0,SLICED:1,FILLED:2}; static FillType={HORIZONTAL:0};
  isValid=true;
  set fillRange(v) { if(this.type===2&&!this.spriteFrame) throw Error('filled range before image'); this.range=v; }
  get fillRange() { return this.range; }
}
class Label { static HorizontalAlign={LEFT:0,CENTER:1}; static VerticalAlign={TOP:0}; static Overflow={CLAMP:1}; }
class Color {
  constructor(r=0,g=0,b=0,a=255) { Object.assign(this,{r,g,b,a}); }
  fromHEX() {} static WHITE=new Color(255,255,255);
}
class Graphics { isValid=true; clear(){this.points=[];this.lastRect=null;} moveTo(x,y){this.points=[[x,y]];} lineTo(x,y){this.points.push([x,y]);} close(){} fill(){} stroke(){} rect(...args){this.lastRect=args;} ellipse(){} }
const inputListeners=[];
const Input={EventType:{TOUCH_START:'touchStart',TOUCH_MOVE:'touchMove',MOUSE_DOWN:'mouseDown',KEY_DOWN:'keyDown'}};
const input={on:(type,callback,target)=>inputListeners.push({type,callback,target}),off:(type,callback,target)=>{
  const index=inputListeners.findIndex(l=>l.type===type&&l.callback===callback&&l.target===target);if(index>=0)inputListeners.splice(index,1);
}};
let sceneAccepted=true, sceneError=null; const sceneLoads=[];
const screenSetup={};
const cc={Node,UITransform,Sprite,Label,Color,Graphics,UIOpacity:class{},SpriteFrame:class{},JsonAsset:class{},Component:class{isValid=true},
  input,Input,
  ResolutionPolicy:{EXACT_FIT:0},view:{setDesignResolutionSize:(width,height,policy)=>Object.assign(screenSetup,{width,height,policy}),resizeWithBrowserSize:resize=>screenSetup.resize=resize},
  director:{loadScene:(name,callback)=>{sceneLoads.push(name); if(sceneError) callback(sceneError); return sceneAccepted;}},
  resources:{load:(name,T,cb)=>{const finish=()=>cb(null,name.startsWith('config/')?{json:JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources',name+'.json'),'utf8'))}:{name});finish.path=name;pending.push(finish);}},_decorator:{ccclass:()=>c=>c,property:()=>{}}};
const cache=new Map();
function load(file) {
  file=path.resolve(file); if(cache.has(file)) return cache.get(file);
  const out={}; cache.set(file,out);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
  new Function('require','exports',code)(id=>id==='cc'?cc:load(path.resolve(path.dirname(file),id+'.ts')),out); return out;
}
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {LevelSystem}=load(path.join(__dirname,'../assets/scripts/core/LevelSystem.ts'));
const {SHOP_DROP_AREA}=load(path.join(__dirname,'../assets/scripts/ui/BattleUILayout.ts'));
const flush=()=>{ while(pending.length) pending.shift()(); };
const ui=new BattleUI(); ui.node=new Node('UI'); new Node('Canvas').addChild(ui.node); ui.init();
assert.deepEqual(ui.backdrop.getChildByName('skin').getComponent(UITransform).contentSize,{width:1280,height:720},'battle sky uses the full viewport, not the default Graphics transform');
assert.deepEqual(screenSetup,{width:1280,height:720,policy:0,resize:true},'battle fills the viewport and follows resize');
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'../settings/v2/packages/project.json'),'utf8')).general.designResolution,{width:1280,height:720},'project and UI design sizes match');
ui.setBoardCenter(0,60);assert.equal(ui.capLabel.isBold,true);assert.equal(ui.capLabel.horizontalAlign,1);
assert.deepEqual(ui.capLabel.node.position,{x:0,y:60,z:0});
assert.equal(ui.preparationBar.parent,ui.node.getChildByName('roundBar'),'preparation fill lives inside the stage header');
assert.deepEqual(ui.preparationBar.position,{x:0,y:-18,z:0});assert.equal(ui.node.getChildByName('preparationBar'),undefined,'no preparation modal covers the board');
ui.setCombatCountdown(1);assert.equal(ui.phaseLabel.string,'准备 1.0s');assert.equal(ui.preparationBar.active,true);assert.equal(ui.preparationFill.lastRect[2],0);
ui.setCombatCountdown(.5);assert.equal(ui.preparationFill.lastRect[2],140);
ui.setCombatCountdown(.2);assert.equal(ui.preparationFill.lastRect[2],224);
ui.setCombatCountdown(0);assert.equal(ui.phaseLabel.string,'战斗');assert.equal(ui.preparationBar.active,false);
ui.update(2.9);assert.equal(ui.waveTrack.active,true);ui.update(.1);assert.equal(ui.waveTrack.active,false);
inputListeners.find(l=>l.target===ui&&l.type===Input.EventType.TOUCH_START).callback.call(ui);assert.equal(ui.waveTrack.active,true);
ui.update(3);assert.equal(ui.waveTrack.active,false);ui.refreshRun(20,20,1,14,'测试关');assert.equal(ui.waveTrack.active,true);
const {BoardView}=load(path.join(__dirname,'../assets/scripts/view/BoardView.ts'));
const board=new BoardView();board.node=new Node('Board');board.node.getComponent=T=>board.node.components.get(T);board.getComponent=T=>board.node.getComponent(T);
board.initialize(7,8,48);board.highlightTarget({x:2,y:2});
assert.equal(board.highlight.points.length,6);assert.equal(board.highlight.fillColor.g,203);assert.equal(board.highlight.lineWidth,3);
board.highlightTarget({x:2,y:2},false);assert.equal(board.highlight.fillColor.r,229);
board.highlightTarget(null);assert.equal(board.highlight.points.length,0);
ui.refreshTop(20,1,new LevelSystem({level:3,exp:2})); ui.refreshFormation([{unitId:'warrior',location:'board'}]);
ui.refreshShop(Array.from({length:5},()=>({unitId:'warrior',name:'战士',cost:1,price:1,poolLeft:20})));
flush(); assert.equal(ui.expFill.fillRange,2/6,'progress survives asynchronous image loading');
assert.equal(ui.capLabel.node.active,false,'population stays hidden outside a drag');
assert.equal(ui.node.getChildByName('formation'),undefined); assert.equal(ui.node.getChildByName('starLegend'),undefined);
const warriorDetail={name:'战士',star:1,cost:1,artId:'warrior',side:0,hp:350,maxHp:700,mana:20,maxMana:100,atk:55,armor:30,mr:20,atkSpeed:1,range:1,spellPower:150,critChance:.25,lifesteal:.1,damageAmp:.2,damageReduction:.3,skillName:'斩击',skillDescription:'造成伤害'};
ui.showUnitDetail(warriorDetail);
assert.deepEqual(ui.unitStats.slice(5).map(l=>l.string),['法强 150%','暴击 25%','吸血 10%','增伤 20%','减伤 30%']);
assert.ok(ui.unitPanel.position.x>350); assert.equal(ui.node.getChildByName('detailShield'),undefined,'details do not block the board');
flush(); assert.equal(ui.hpMeter.fill.fillRange,.5);assert.equal(ui.manaMeter.fill.fillRange,.2);
assert.equal(ui.hpMeter.fill.fillStart,0);assert.equal(ui.manaMeter.fill.fillStart,0,'detail bars also begin at the left');
assert.equal(ui.hpMeter.value.string,'350 / 700');assert.match(ui.unitStats[4].string,/1格/);
ui.updateUnitVitals(0,700,0,0);assert.equal(ui.hpMeter.fill.fillRange,0);assert.equal(ui.manaMeter.fill.fillRange,0);
ui.updateUnitVitals(999,700,200,100);assert.equal(ui.hpMeter.fill.fillRange,1);assert.equal(ui.manaMeter.fill.fillRange,1);
assert.equal(ui.expLabel.node.parent,ui.buyExpBtn,'XP display is part of the purchase button');
assert.equal(ui.expFill.node.parent.parent.parent,ui.buyExpBtn,'XP bar is part of the purchase button');
assert.equal(ui.goldLabel.node.parent,ui.shopHeader);assert.ok(ui.goldLabel.node.position.y>ui.shopSlots[0].node.position.y);
assert.deepEqual(ui.rateLabels.map(l=>l.string),['75%','25%','0%','0%','0%']);
assert.equal(new Set(ui.rateLabels.map(l=>`${l.color.r},${l.color.g},${l.color.b}`)).size,5);
let bought=0; ui.onBuy=()=>bought++;
ui.showSellPreview('战士',1,false,4);
assert.equal(ui.capLabel.string,'4 / 3'); assert.equal(ui.capLabel.color.r,229,'over-cap preview turns red');
assert.equal(ui.shopRoot.active,false); assert.equal(ui.economyRoot.active,false); assert.equal(ui.sellNode.active,true);
assert.equal(ui.unitPanel.active,false); assert.equal(ui.capLabel.node.active,true);
ui.shopSlots[0].node.events.get('end')(); assert.equal(bought,0,'hidden cards cannot purchase while dragging');
assert.equal(ui.isInSellArea(SHOP_DROP_AREA.x,SHOP_DROP_AREA.y),true); assert.equal(ui.isInSellArea(482,-292),false,'command buttons are outside the sale target');
ui.showSellPreview('战士',1,true,0); assert.match(ui.sellLabel.string,/松手出售/);
ui.clearSellPreview(); flush();
assert.equal(ui.capLabel.node.active,false); assert.equal(ui.sellNode.active,false); assert.equal(ui.shopRoot.active,true); assert.equal(ui.economyRoot.active,true);
ui.shopSlots[0].node.events.get('end')(); assert.equal(bought,1);
ui.setShopVisible(false); ui.showSellPreview('战士',1,true,0); flush();
assert.equal(ui.sellNode.active,false); assert.equal(ui.shopRoot.active,false); assert.equal(ui.economyControls.active,false);
assert.equal(ui.isInSellArea(SHOP_DROP_AREA.x,SHOP_DROP_AREA.y),false,'settlement disables the sale target');
ui.setShopVisible(true); assert.equal(ui.economyControls.active,true);
ui.setCombatActive(true);flush();assert.equal(ui.phaseLabel.string,'战斗');assert.equal(ui.shopRoot.active,true);assert.equal(ui.homeButton.active,false);
assert.equal(ui.isInSellArea(SHOP_DROP_AREA.x,SHOP_DROP_AREA.y),true,'combat keeps the reserve sale target enabled');
ui.setCombatActive(false);
assert.ok(ui.node.getChildByName('command').position.y<-230);
assert.equal(SHOP_DROP_AREA.height,150);
for(const card of ui.shopSlots) {
  const size=card.node.getComponent(UITransform).contentSize;
  assert.ok(ui.isInSellArea(card.node.position.x-size.width*card.node.scale.x/2,card.node.position.y));
  assert.ok(ui.isInSellArea(card.node.position.x+size.width*card.node.scale.x/2,card.node.position.y));
}
assert.equal(ui.buyExpBtn.position.x,ui.economyControls.getChildByName('refresh').position.x,'TFT controls stack in left column');
const refreshButton=ui.economyControls.getChildByName('refresh');
assert.deepEqual(ui.buyExpBtn.getComponent(UITransform).contentSize,refreshButton.getComponent(UITransform).contentSize,'XP and refresh use equal hit areas');
for(const button of [ui.buyExpBtn,refreshButton]) {
  const size=button.getComponent(UITransform).contentSize;
  assert.ok(Math.abs(button.position.y)+size.height/2<=SHOP_DROP_AREA.height/2,'controls fit the compact dock');
  assert.ok(button.getChildByName('goldCost').getComponent(Sprite).spriteFrame,'cost uses the supplied coin image');
  assert.ok(!button.children.some(n=>/经验|刷新|金/.test(n.getComponent(Label)?.string??'')),'actions use icons instead of words');
}
assert.ok(ui.buyExpBtn.getChildByName('icon_exp'));assert.ok(refreshButton.getChildByName('icon_refresh'));
let xpBought=0,refreshed=0;ui.onBuyExp=()=>xpBought++;ui.onRefresh=()=>refreshed++;
ui.buyExpBtn.events.get('end')();refreshButton.events.get('end')();assert.equal(xpBought,1);assert.equal(refreshed,1);
ui.refreshTop(3,1,new LevelSystem());ui.buyExpBtn.events.get('end')();assert.equal(xpBought,1,'icon purchase still rejects insufficient gold');
ui.refreshRun(20,20,4,23,'边境哨卫',{stage:2,round:1,roundsInStage:10},3); flush();
assert.equal(ui.floorLabel.string,'2-1'); assert.equal(ui.waveTrack.children.filter(n=>n.name!=='skin').length,10);
ui.refreshTop(10,2,new LevelSystem()); assert.equal(ui.floorLabel.string,'2-1','economy updates retain stage-round header');
ui.refreshRun(20,20,1,23,'史莱姆营地',{stage:1,round:1,roundsInStage:3},3); flush();
assert.equal(ui.waveTrack.children.filter(n=>n.name!=='skin').length,3);
const delayedUI=new BattleUI();delayedUI.node=new Node('delayedUI');new Node('Canvas').addChild(delayedUI.node);delayedUI.init();
delayedUI.showUnitDetail(warriorDetail);delayedUI.updateUnitVitals(175,700,60,100);flush();
assert.equal(delayedUI.hpMeter.fill.fillRange,.25);assert.equal(delayedUI.manaMeter.fill.fillRange,.6,'live values survive delayed texture loading');
console.log('PASS actual UI: merged XP, colored odds, gold header, range/live vitals, asynchronous bars, drag sale, and combat shop');

const {UnitView}=load(path.join(__dirname,'../assets/scripts/view/UnitView.ts'));
const unitView=new UnitView();unitView.node=new Node('unit');unitView.node.setPosition(0,0,0);
unitView.setup('warrior',0,1,56);
assert.equal(unitView.bodySprite.node.getComponent(UITransform).contentSize.width,56*.82,'reserve portraits retain their slot size');
const boardUnit=new UnitView();boardUnit.node=new Node('boardUnit');boardUnit.setup('warrior',0,2,56,'warrior',undefined,1.5);
const boardBody=boardUnit.bodySprite.node, boardSize=boardBody.getComponent(UITransform).contentSize;
assert.deepEqual(boardSize,{width:84,height:84},'board portraits occupy 1.5 display cells');
assert.ok(Math.abs(boardBody.position.y-boardSize.height/2+56*.82/2)<1e-8,'enlarging preserves the original foot position');
assert.ok(boardUnit.hpBarBg.position.y>boardBody.position.y+boardSize.height/2,'health bar stays above the enlarged portrait');
const barWidth=unitView.hpBarBg.getComponent(UITransform).contentSize.width;
const checkBar=(sprite,ratio)=>{
  const transform=sprite.node.getComponent(UITransform);
  const left=sprite.node.position.x-transform.anchorPoint.x*transform.contentSize.width;
  assert.ok(Math.abs(left+barWidth/2)<1e-8,'left edge stays fixed as HP or mana changes');
  assert.ok(Math.abs(left+transform.contentSize.width-(-barWidth/2+barWidth*ratio))<1e-8,'only the right edge moves');
};
for(const [hp,mana,hpRatio,manaRatio] of [[100,100,1,1],[50,25,.5,.25],[25,50,.25,.5],[0,0,0,0],[150,120,1,1],[-1,-5,0,0]]) {
  unitView.sync({hp,maxHp:100,mana,maxMana:100},{x:0,y:0,z:0},56,.1);
  checkBar(unitView.hpFill,hpRatio);checkBar(unitView.manaFill,manaRatio);
}
unitView.sync({hp:25,maxHp:100,mana:50,maxMana:100},{x:0,y:0,z:0},56,.1);flush();
checkBar(unitView.hpFill,.25);checkBar(unitView.manaFill,.5);
unitView.sync({hp:0,maxHp:0,mana:0,maxMana:0},{x:0,y:0,z:0},56,.1);
checkBar(unitView.hpFill,0);checkBar(unitView.manaFill,0);assert.equal(unitView.manaFill.node.active,false);
console.log('PASS actual UnitView: fixed left edges, independent HP/mana widths, clamped values, and delayed texture loading');

const {MainMenu}=load(path.join(__dirname,'../assets/scripts/ui/MainMenu.ts'));
const {SAVE_KEY,freshSaveV2,writeSaveV2,loadSaveV2}=load(path.join(__dirname,'../assets/scripts/core/ShopSave.ts'));
const storage=new Map(); global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const createMenu=()=>{const menu=new MainMenu();menu.node=new Node('MainMenu');new Node('Canvas').addChild(menu.node);menu.start();return menu;};
let menu=createMenu(); menu.startNewRun(); assert.equal(sceneLoads.length,0,'configuration must finish before starting');
assert.deepEqual(menu.node.getChildByName('menuBackground').getChildByName('skin').getComponent(UITransform).contentSize,{width:1280,height:720},'menu sky uses the full viewport');
const configIndex=pending.findIndex(f=>f.path==='config/run');pending.splice(configIndex,1)[0]();
assert.equal(menu.ready,false,'monster images must finish loading before the run is ready');
menu.startNewRun();assert.equal(sceneLoads.length,0,'do not enter a monster stage while its images are missing');
assert.equal(pending.filter(f=>f.path?.startsWith('art/units/monsters/')).length,4,'load all four monster SpriteFrames');
flush();assert.equal(menu.ready,true);
const setup=menu.node.getChildByName('runSetup');
setup.getChildByName('fewerStages').events.get('end')(); assert.equal(menu.stageCount,3);
setup.getChildByName('moreStages').events.get('end')(); assert.equal(menu.stageCount,4); assert.match(menu.summary.string,/21/);
setup.getChildByName('startGame').events.get('end')();
assert.deepEqual(sceneLoads,['scene']); assert.equal(loadSaveV2().stageCount,4); assert.equal(loadSaveV2().round,null);
setup.getChildByName('startGame').events.get('end')(); assert.equal(sceneLoads.length,1,'double start is blocked');
const saved=freshSaveV2(5);saved.gold=77;saved.round={phase:'prepare',waveIndex:3,health:18,result:null,lastSettlement:null};writeSaveV2(saved);
menu=createMenu();flush(); assert.ok(menu.node.getChildByName('continueGame'));const before=storage.get(SAVE_KEY);
menu.node.getChildByName('continueGame').events.get('end')();assert.equal(storage.get(SAVE_KEY),before,'continue preserves exact saved run');
menu=createMenu();flush();sceneAccepted=false;menu.startNewRun();assert.equal(storage.get(SAVE_KEY),before,'scene failure restores previous run');assert.equal(menu.loading,false);
sceneAccepted=true;sceneError=new Error('launch error');menu.startNewRun();assert.equal(storage.get(SAVE_KEY),before);assert.match(menu.status.string,/加载失败/);
sceneError=null;menu.startNewRun();assert.equal(loadSaveV2().stageCount,5);assert.equal(loadSaveV2().gold,0);assert.equal(loadSaveV2().round,null);
const main=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/main.scene'),'utf8'));
assert.equal(main[0]._name,'main');assert.ok(main.some(o=>o.__type__==='3d5ecIKFJdMUocoPL3jTL8c'));
assert.ok(!main.some(o=>o.__type__==='8f9eevK0PpKTosJ1ucemD33'),'menu contains no battle stage');
const checkRefs=o=>{if(!o||typeof o!=='object')return;if('__id__'in o) assert.ok(main[o.__id__]);for(const v of Object.values(o))checkRefs(v);};main.forEach(checkRefs);
const builder=JSON.parse(fs.readFileSync(path.join(__dirname,'../settings/v2/packages/builder.json'),'utf8'));
assert.ok(builder.scenes.some(s=>s.uuid===builder.startScene&&s.url==='db://assets/main.scene'));
assert.ok(builder.scenes.some(s=>s.url==='db://assets/scene.scene'));
console.log('PASS main menu: stage selector/minimum, asynchronous readiness, new/continue, duplicate click, failure recovery, and scene registration');
ui.onDestroy();assert.equal(inputListeners.filter(l=>l.target===ui).length,0,'scene cleanup removes all idle wake listeners');
console.log('PASS drag polygon highlight, centered bold population, animated preparation fill and idle wave visibility');
