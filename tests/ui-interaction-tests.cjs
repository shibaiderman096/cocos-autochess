// Exercise the actual UI component with an asynchronous asset loader and no renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const pending = [];
class Node {
  set name(value) { if(!value.includes('/')) this.nodeName=value; }
  get name() { return this.nodeName; }
  constructor(name) { this.name=name; this.children=[]; this.components=new Map(); this.events=new Map(); this.active=true; }
  static EventType = { TOUCH_START:'start', TOUCH_END:'end', TOUCH_MOVE:'move', TOUCH_CANCEL:'cancel', MOUSE_ENTER:'enter', MOUSE_LEAVE:'leave' };
  addChild(n) { n.parent=this; this.children.push(n); }
  getChildByName(name) { return this.children.find(n=>n.name===name); }
  addComponent(T) {
    if(T===Graphics&&!this.getComponent(UITransform)) this.addComponent(UITransform).setContentSize(100,100);
    const c=new T(); c.node=this; if(!this.components.has(T)) this.components.set(T,c); return c;
  }
  getComponent(T) { return this.components.get(T); }
  getComponentsInChildren(T) { return [this.getComponent(T),...this.children.flatMap(n=>n.getComponentsInChildren(T))].filter(Boolean); }
  setPosition(x,y,z) { this.position={x,y,z}; }
  setScale(x,y,z) { this.scale={x,y,z}; }
  setRotationFromEuler(x,y,z) { this.rotation={x,y,z}; }
  setSiblingIndex(i) { const list=this.parent.children; list.splice(list.indexOf(this),1); list.splice(i,0,this); }
  getSiblingIndex() { return this.parent.children.indexOf(this); }
  on(type,fn) { this.events.set(type,fn); }
  destroy() { for(const c of this.components.values()) c.isValid=false; for(const n of this.children) n.destroy(); this.parent.children=this.parent.children.filter(n=>n!==this); }
}
class UITransform {
  contentSize={width:100,height:100};
  anchorPoint={x:.5,y:.5};
  setContentSize(width,height) { this.contentSize={width,height}; }
  setAnchorPoint(x,y) { this.anchorPoint={x,y}; }
}
class Sprite {
  static SizeMode={CUSTOM:0,RAW:1,TRIMMED:2}; static Type={SIMPLE:0,SLICED:1,FILLED:2}; static FillType={HORIZONTAL:0};
  sizeMode=Sprite.SizeMode.TRIMMED;
  set spriteFrame(frame) {
    this.frame=frame;
    // Creator automatically applies an equipment texture's 64px dimensions
    // unless CUSTOM was selected before assigning its frame.
    if(frame?.name?.startsWith('art/equipment/')&&this.sizeMode!==Sprite.SizeMode.CUSTOM) this.node.getComponent(UITransform).setContentSize(frame.rect.width,frame.rect.height);
  }
  get spriteFrame() { return this.frame; }
  isValid=true;
  set fillRange(v) { if(this.type===2&&!this.spriteFrame) throw Error('filled range before image'); this.range=v; }
  get fillRange() { return this.range; }
}
function textLines(text,width,size) {
  return text.replace(/<br\s*\/>/g,'\n').replace(/<img[^>]*\/>/g,'图').replace(/<[^>]+>/g,'').split('\n')
    .reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(c.charCodeAt(0)>255?1:.55),0)*size/width)),0);
}
class Label { static HorizontalAlign={LEFT:0,CENTER:1,RIGHT:2}; static VerticalAlign={TOP:0}; static Overflow={CLAMP:1,SHRINK:2,RESIZE_HEIGHT:3}; updateRenderData() {
  if(this.overflow===3){const t=this.node.getComponent(UITransform);t.setContentSize(t.contentSize.width,textLines(this.string,t.contentSize.width,this.fontSize)*this.lineHeight);}
} }
class RichText {
  set string(value){this.copy=value;const t=this.node.getComponent(UITransform);t.setContentSize(this.maxWidth,textLines(value,this.maxWidth,this.fontSize)*this.lineHeight);}
  get string(){return this.copy;}
}
class Color {
  constructor(r=0,g=0,b=0,a=255) { Object.assign(this,{r,g,b,a}); }
  fromHEX() {} static WHITE=new Color(255,255,255);
}
class Graphics { isValid=true; clear(){this.points=[];this.lastRect=null;} moveTo(x,y){this.points=[[x,y]];} lineTo(x,y){this.points.push([x,y]);} close(){} fill(){} stroke(){} rect(...args){this.lastRect=args;} roundRect(...args){this.roundedRect=args;} ellipse(){} }
class Mask { static Type={GRAPHICS_RECT:0,GRAPHICS_STENCIL:2}; }
class Vec2 { constructor(x=0,y=0){Object.assign(this,{x,y});} }
// Geometry-only ScrollView double: actual input/inertia is checked in the browser.
class ScrollView {
  static EventType={SCROLL_BEGAN:'scroll-began',SCROLL_ENDED:'scroll-ended'};
  getScrollOffset(){return new Vec2(0,this.content.position.y-this.content.parent.getComponent(UITransform).contentSize.height/2);}
  getMaxScrollOffset(){return new Vec2(0,Math.max(0,this.content.getComponent(UITransform).contentSize.height-this.content.parent.getComponent(UITransform).contentSize.height));}
  scrollToOffset(offset){this.content.setPosition(0,this.content.parent.getComponent(UITransform).contentSize.height/2+offset.y,0);}
  stopAutoScroll(){this.moving=false;}
  isScrolling(){return !!this.moving;}
  isAutoScrolling(){return !!this.moving;}
}
class Rect { constructor(x,y,width,height){Object.assign(this,{x,y,width,height});} }
class Size { constructor(width,height){Object.assign(this,{width,height});} }
const inputListeners=[];
const Input={EventType:{TOUCH_START:'touchStart',TOUCH_MOVE:'touchMove',MOUSE_DOWN:'mouseDown',KEY_DOWN:'keyDown'}};
const input={on:(type,callback,target)=>inputListeners.push({type,callback,target}),off:(type,callback,target)=>{
  const index=inputListeners.findIndex(l=>l.type===type&&l.callback===callback&&l.target===target);if(index>=0)inputListeners.splice(index,1);
}};
let sceneAccepted=true, sceneError=null; const sceneLoads=[];
const screenSetup={};
const cc={game:{frameRate:60},Node,UITransform,Sprite,Label,RichText,LabelOutline:class{},Color,Graphics,Mask,ScrollView,Vec2,Rect,Size,UIOpacity:class{},BlockInputEvents:class{},Tween:class{static stopAllByTarget(){}},SpriteFrame:class{},SpriteAtlas:class{spriteFrames={};},JsonAsset:class{},Component:class{isValid=true},
  tween:target=>({to(_seconds,props,options){this.props=props;this.options=options;return this;},start(){Object.assign(target,this.props);this.options?.onUpdate?.();return this;}}),
  input,Input,sys:{isNative:false,os:'web',OS:{ANDROID:'android'}},isValid:(value,strict)=>!!value&&value.isValid!==false&&(!strict||!value.destroyQueued),
  ResolutionPolicy:{EXACT_FIT:0,SHOW_ALL:1,FIXED_HEIGHT:2},view:{getVisibleSize:()=>({width:1280,height:720}),setDesignResolutionSize:(width,height,policy)=>Object.assign(screenSetup,{width,height,policy}),resizeWithBrowserSize:resize=>screenSetup.resize=resize},
  director:{loadScene:(name,callback)=>{sceneLoads.push(name); if(sceneError) callback(sceneError); return sceneAccepted;}},
  resources:{load:(name,T,cb)=>{const finish=()=>cb(null,name.startsWith('config/')?{json:JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources',name+'.json'),'utf8'))}:{name,rect:{x:0,y:0,width:name.includes('trait_badges')?2172:1536,height:name.includes('trait_badges')?724:1024},texture:{}});finish.path=name;pending.push(finish);}},_decorator:{ccclass:()=>c=>c,property:()=>{}}};
const cache=new Map();
function load(file) {
  file=path.resolve(file); if(cache.has(file)) return cache.get(file);
  const out={}; cache.set(file,out);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
  new Function('require','exports',code)(id=>id==='cc'?cc:load(path.resolve(path.dirname(file),id+'.ts')),out); return out;
}
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {colorDamageText}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
assert.equal(colorDamageText('112点物理伤害，30魔法伤害，2%的真实伤害，50%攻速加成'),'<color=#ff9740>112点物理伤害</color>，<color=#50b4ff>30魔法伤害</color>，<color=#ffffff>2%的真实伤害</color>，50%攻速加成');
const {LevelSystem}=load(path.join(__dirname,'../assets/scripts/core/LevelSystem.ts'));
const {SHOP_DROP_AREA}=load(path.join(__dirname,'../assets/scripts/ui/BattleUILayout.ts'));
const flush=()=>{ while(pending.length) pending.shift()(); };
const ui=new BattleUI(); ui.node=new Node('UI'); new Node('Canvas').addChild(ui.node); ui.init();
assert.equal(ui.node.getChildByName('settlement'),undefined,'no report modal or full-screen shield');
assert.equal(ui.resultPanel.parent,ui.node.getChildByName('roundBar'));
assert.equal(ui.resultLabel.node.position.y,-102,'outcome appears below the taller stage node track');
ui.setCombatActive(true);ui.showResult(0,null,0,0,1);assert.equal(ui.combatActive,false,'settlement permits return through the main menu');assert.equal(ui.resultLabel.string,'胜利');assert.equal(ui.resultPanel.active,true);
ui.update(.5);assert.equal(ui.resultPanel.active,true);ui.update(.5);assert.equal(ui.resultPanel.active,false);
ui.showResult(1,null,0,0,1);assert.equal(ui.resultLabel.string,'失败');ui.hideResult();
ui.showResult(1,null,0,0,1,{runResult:'defeat'});ui.update(1);
assert.equal(ui.resultPanel.active,false);assert.equal(ui.runEndActions.active,true,'run-end navigation remains available after the outcome fades');
ui.hideResult();ui.waveIdle=0;
ui.refreshCombatStats([{id:1,name:'战士',side:0,star:1,damage:50,taken:30,healing:10,shielding:40,
  damageByType:{physical:20,magic:20,true:10},takenByType:{physical:30,magic:0,true:0}},
  {id:2,name:'野怪',side:1,star:1,damage:30,taken:50,healing:0,
  damageByType:{physical:30,magic:0,true:0},takenByType:{physical:20,magic:20,true:10}}]);
assert.equal(ui.combatStatBars[0].name.string,'战士 1★');assert.equal(ui.combatStatBars[0].value.string,'50');
assert.equal(ui.combatStatBars[0].bar.lastRect[2],208*10/50,'true damage forms the last proportional segment');
ui.combatMetricButtons[1].events.get('end')();assert.equal(ui.combatStatBars[0].value.string,'30');
assert.equal(ui.combatStatBars[0].bar.lastRect[2],208);
ui.combatSideButtons[1].events.get('end')();assert.equal(ui.combatStatBars[0].name.string,'野怪 1★');
assert.equal(ui.combatStatBars[0].value.string,'50');assert.equal(ui.combatStatsTotal.string,'合计 50');
ui.combatMetricButtons[2].events.get('end')();assert.equal(ui.combatStatBars[0].value.string,'0');
ui.combatSideButtons[0].events.get('end')();assert.equal(ui.combatStatBars[0].value.string,'50');
assert.equal(ui.combatStatBars[0].bar.fillColor.g,186,'shield portion uses grey');
assert.equal(ui.combatStatsTotal.string,'合计 50');assert.equal(ui.combatStatsBreakdown.string,'治疗 10 · 护盾 40');
assert.deepEqual(ui.combatStatsLegend.filter(l=>l.node.active).map(l=>l.string),['治疗','护盾']);
ui.combatMetricButtons[0].events.get('end')();
assert.equal(ui.combatStatsPanel.active,true);
ui.closeUnitDetail();assert.equal(ui.combatStatsPanel.active,true);
assert.deepEqual(ui.backdrop.getComponent(UITransform).contentSize,{width:1280,height:720},'3D battle loading backdrop fills the viewport without a retired 2D board image');
assert.deepEqual(screenSetup,{width:1280,height:720,policy:1,resize:true},'uniform letterbox scaling keeps native touch coordinates aligned with the orthographic UI camera on ultrawide screens');
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'../settings/v2/packages/project.json'),'utf8')).general.designResolution,{width:1280,height:720,fitHeight:true},'project and UI design sizes match with height fitting');
ui.setBoardCenter(0,60);assert.equal(ui.capLabel.isBold,true);assert.equal(ui.capLabel.horizontalAlign,1);
// docs/combat-hud-overtime.md: population is 28px above the board center.
assert.deepEqual(ui.capLabel.node.position,{x:0,y:88,z:0});
ui.setBoardCenter(17,-40);assert.deepEqual(ui.capLabel.node.position,{x:17,y:-12,z:0});
ui.setBoardCenter(0,60);
assert.equal(ui.preparationBar.parent,ui.node.getChildByName('roundBar'),'preparation fill lives inside the stage header');
assert.deepEqual(ui.preparationBar.position,{x:0,y:-18,z:0});assert.equal(ui.node.getChildByName('preparationBar'),undefined,'no preparation modal covers the board');
ui.setCombatCountdown(1);assert.equal(ui.phaseLabel.string,'准备 1.0s');assert.equal(ui.preparationBar.active,true);assert.equal(ui.preparationFill.lastRect[2],0);
ui.setCombatCountdown(.5);assert.equal(ui.preparationFill.lastRect[2],140);
ui.setCombatCountdown(.2);assert.equal(ui.preparationFill.lastRect[2],224);
ui.setCombatCountdown(0);assert.equal(ui.phaseLabel.string,'准备','finishing preparation alone does not start combat');
ui.setCombatActive(true);ui.setCombatCountdown(0);assert.equal(ui.phaseLabel.string,'战斗');assert.equal(ui.preparationBar.active,false);
assert.equal(ui.waveTrack.active,false,'round details wait for a nearby touch');
const trackTrigger=ui.node.getChildByName('waveTrackTrigger');trackTrigger.events.get(Node.EventType.TOUCH_START).call(ui);
ui.update(.24);assert.equal(ui.waveTrack.position.y,0);ui.update(2.66);assert.equal(ui.waveTrack.active,true);ui.update(.1);assert.equal(ui.waveTrack.active,true);
ui.update(.12);assert.ok(ui.waveTrack.position.y>0&&ui.waveTrack.position.y<62,'round details rise into their clipped header');
ui.update(.12);assert.equal(ui.waveTrack.active,false);
trackTrigger.events.get(Node.EventType.TOUCH_START).call(ui);assert.equal(ui.waveTrack.active,true,'only nearby header touches wake round details');
ui.update(.12);assert.ok(ui.waveTrack.position.y>0&&ui.waveTrack.position.y<62,'activity slides details down');
ui.update(.12);assert.equal(ui.waveTrack.position.y,0);
ui.update(3.24);assert.equal(ui.waveTrack.active,false);ui.refreshRun(20,20,1,14,'测试关');assert.equal(ui.waveTrack.active,false,'refreshing the round does not expand its details');
const {BoardView}=load(path.join(__dirname,'../assets/scripts/view/BoardView.ts'));
const board=new BoardView();board.node=new Node('Board');board.node.getComponent=T=>board.node.components.get(T);board.getComponent=T=>board.node.getComponent(T);
board.initialize(7,8,48);board.highlightTarget({x:2,y:2});
assert.equal(board.highlight.points.length,6);assert.equal(board.highlight.fillColor.g,203);assert.equal(board.highlight.lineWidth,3);
board.highlightTarget({x:2,y:2},false);assert.equal(board.highlight.fillColor.r,229);
board.highlightTarget(null);assert.equal(board.highlight.points.length,0);
ui.refreshTop(20,1,new LevelSystem({level:3,exp:2})); ui.refreshFormation([{unitId:'helion',location:'board'}]);
ui.refreshShop(Array.from({length:5},()=>({unitId:'helion',name:'战士',cost:1,price:1,poolLeft:20})));
flush(); assert.equal(ui.expFill.fillRange,2/6,'progress survives asynchronous image loading');
assert.equal(ui.capLabel.node.active,false,'population stays hidden outside a drag');
assert.equal(ui.node.getChildByName('formation'),undefined); assert.equal(ui.node.getChildByName('starLegend'),undefined);
const {FloatText}=load(path.join(__dirname,'../assets/scripts/view/FloatText.ts'));
assert.deepEqual(['physical','magic','true'].map(type=>{const c=FloatText.colorForType(type);return [c.r,c.g,c.b];}),[[255,151,64],[80,180,255],[255,255,255]]);
const warriorDetail={name:'战士',star:1,cost:1,artId:'helion',side:0,hp:350,maxHp:700,mana:20,maxMana:100,atk:55,armor:30,mr:20,atkSpeed:1,range:1,spellPower:150,critChance:.25,lifesteal:.1,damageAmp:.2,damageReduction:.3,skillName:'斩击',skillDescription:'造成伤害'};
ui.showUnitDetail({...warriorDetail,physicalPower:20});
assert.equal(ui.unitStats[0].string,'66','attack panel includes physical bonus exactly once');
ui.showUnitDetail({...warriorDetail,atk:91.8,armor:53.49,mr:35.5});
assert.deepEqual(ui.unitStats.slice(0,3).map(l=>l.string),['92','53','36'],'computed attributes round for display');
ui.showUnitDetail(warriorDetail);
const firstStatRow=[0,5,6,1,2].map(i=>ui.unitStats[i].node.position);
const secondStatRow=[3,7,8,9,10].map(i=>ui.unitStats[i].node.position);
assert.equal(new Set(firstStatRow.map(p=>p.y)).size,1,'reference layout has five values in the first stat row');
assert.equal(new Set(firstStatRow.map(p=>p.x)).size,5);
assert.equal(new Set(secondStatRow.map(p=>p.y)).size,1);
assert.equal(ui.detailPopup.active,false,'skill descriptions stay collapsed until clicked');
ui.skillIconNode.events.get(Node.EventType.TOUCH_END)();assert.equal(ui.detailPopup.active,true);
ui.showUnitDetail({...warriorDetail,hp:250});assert.equal(ui.detailPopup.active,true,'live HP updates keep the popup open');
ui.skillIconNode.events.get(Node.EventType.TOUCH_END)();assert.equal(ui.detailPopup.active,false);
ui.attackSpeedIconNode.events.get(Node.EventType.TOUCH_END)();assert.match(ui.unitDetail.string,/\+5%.*\+0\.05/);
ui.closeUnitDetail();assert.equal(ui.detailPopup.active,false);
ui.showUnitDetail(warriorDetail);
ui.showUnitDetail({...warriorDetail,cost:4});assert.equal(ui.unitCost.string,'4金');
ui.showUnitDetail({...warriorDetail,cost:5});assert.equal(ui.unitCost.string,'5金');
for (const [cost, star, gold] of [[1,2,3],[1,3,9],[2,2,5],[4,2,11],[4,3,35],[5,3,44]]) {
  ui.showUnitDetail({...warriorDetail,cost,star});assert.equal(ui.unitCost.string,gold+'金');
}
ui.showUnitDetail({...warriorDetail,cost:undefined});assert.equal(ui.unitCost.string,'野怪');
ui.showUnitDetail(warriorDetail);
function screenRect(node) {
 let x=0,y=0;for(let n=node;n;n=n.parent){x+=n.position?.x??0;y+=n.position?.y??0;}
 const s=node.getComponent(UITransform).contentSize;
 return {left:x-s.width/2,right:x+s.width/2,bottom:y-s.height/2,top:y+s.height/2};
}
const equipmentRect=screenRect(ui.unitPanel.getChildByName('equipment'));
const commandRect=screenRect(ui.node.getChildByName('command'));
const detailRect=screenRect(ui.unitPanel);
assert.ok(equipmentRect.bottom>=detailRect.bottom&&equipmentRect.top<=detailRect.top,'equipment stays inside detail panel');
assert.ok(equipmentRect.bottom>commandRect.top,'equipment cannot cover command controls');
assert.ok(detailRect.top<=360&&detailRect.bottom>commandRect.top,'detail panel stays on screen above the command dock');
assert.ok(detailRect.top<screenRect(ui.node.getChildByName('healthPanel')).bottom,'detail panel leaves run health visible');
const guinsoo=require('../assets/resources/config/equipment.json')[0];
ui.showEquipment([guinsoo],true,4);flush();
assert.equal(ui.equipmentSlots.length,3);
assert.ok(ui.equipmentSlots[0].icon.spriteFrame);
assert.deepEqual(ui.equipmentSlots[0].icon.node.getComponent(UITransform).contentSize,{width:64,height:64},'asynchronous equipment texture cannot replace slot dimensions');
assert.equal(ui.equipmentSlots[1].node.getChildByName('text'),undefined,'empty equipment slots have no fallback text');
assert.equal(ui.equipmentSlots[0].stacks.string,'4');assert.equal(ui.equipmentSlots[0].stacks.node.parent.active,true);
assert.equal(ui.equipmentSlots[1].stacks.node.parent.active,false);
ui.refreshBackpack([{...guinsoo,kind:'equipment'}],true);flush();
assert.equal(ui.backpackSlots[0].icon.node.getComponent(UITransform).contentSize.width,52);
assert.ok(ui.backpackSlots[0].icon.spriteFrame);
assert.equal(ui.backpackSlots[0].icon.node.active,true);
assert.ok(!ui.backpackSlots[0].node.name.includes('/'),'resource paths are not used as node names');
const potionIcon={id:'test-potion',name:'测试道具',kind:'consumable',icon:'art/ui_m2/icon_exp/spriteFrame'};
ui.refreshBackpack([],false);
ui.refreshBackpack([{...guinsoo,kind:'equipment'}],true);
ui.refreshBackpack([potionIcon,{...guinsoo,kind:'equipment'}],true);
flush();
assert.equal(ui.backpackSlots[0].icon.spriteFrame.name,potionIcon.icon,'late callback cannot replace the current slot icon');
assert.equal(ui.backpackSlots[1].icon.spriteFrame.name,guinsoo.icon);
ui.refreshBackpack([{...guinsoo,kind:'equipment'}],true);flush();
assert.equal(ui.node.getChildByName('backpack').position.x,-510);
let bagClicks=0;ui.onInspectBackpack=()=>bagClicks++;ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_END)();assert.equal(bagClicks,1);
ui.refreshBackpack([],false);assert.equal(ui.backpackSlots[0].index,-1);
let equipmentClicks=0;ui.onEquipment=()=>equipmentClicks++;
ui.equipmentSlots[0].node.events.get(Node.EventType.TOUCH_END)();assert.equal(equipmentClicks,1);
ui.showEquipment([guinsoo],false,5);ui.equipmentSlots[0].node.events.get(Node.EventType.TOUCH_END)();assert.equal(equipmentClicks,1);
const totem=require('../assets/resources/config/equipment.json').find(item=>item.id==='totem_of_undying');
ui.refreshBackpack([{...totem,kind:'equipment'}],true);flush();
assert.equal(ui.backpackSlots[0].icon.spriteFrame.name,totem.icon);
ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_START)();
assert.equal(ui.equipmentTooltip.active,true);assert.equal(ui.equipmentTooltipTitle.string,'余烬命核');
assert.equal(ui.equipmentTooltipText.string.replace(/<[^>]+>/g,''),totem.effectDescription);assert.match(ui.equipmentTooltipText.string,/<b>5<\/b><\/color>秒/);
assert.deepEqual(ui.equipmentTooltipRows.filter(row=>row.node.active).map(row=>[row.name.string,row.value.string]),[['生命值','+200'],['护甲','+10'],['魔抗','+10']]);
assert.ok(!ui.equipmentTooltipText.string.includes('+200生命'),'base stats are separate from the effect paragraph');
flush();assert.equal(ui.equipmentTooltipIcon.spriteFrame.name,totem.icon);
ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_CANCEL)();assert.equal(ui.equipmentTooltip.active,false);
ui.showEquipment([totem],true,0);flush();
ui.equipmentSlots[0].node.events.get(Node.EventType.MOUSE_ENTER)();assert.equal(ui.equipmentTooltip.active,true);
ui.equipmentSlots[0].node.events.get(Node.EventType.MOUSE_LEAVE)();assert.equal(ui.equipmentTooltip.active,false);
const grants=[];ui.onGrantEquipment=id=>grants.push(id);
assert.equal(ui.debugPanel.active,false,'debug menu starts collapsed');
const debugEquipment=require('../assets/resources/config/equipment.json');
const debugUnits=require('../assets/resources/config/units.json');
ui.configureDebug({equipment:debugEquipment,units:debugUnits,roundsPerStage:[3,5,6]});
ui.refreshDebugState(1,1,3);
ui.homeButton.events.get(Node.EventType.TOUCH_END)();flush();
ui.mainMenuContent.getChildByName('debugToggle').events.get(Node.EventType.TOUCH_END)();flush();
assert.equal(ui.debugPanel.active,true);
assert.match(ui.debugStatus.string,/1-1/);
const totemGrant=ui.debugContent.getChildByName('debug_equipment_totem_of_undying');
totemGrant.events.get(Node.EventType.TOUCH_END)();assert.deepEqual(grants,['totem_of_undying']);
ui.refreshBackpack([],false);totemGrant.events.get(Node.EventType.TOUCH_END)();assert.equal(grants.length,1);
for(const [id,title] of [['jeweled_gauntlet','领取珠光'],['infinity_edge','领取无尽']]) {
  const item=require('../assets/resources/config/equipment.json').find(item=>item.id===id);
  const grant=ui.debugContent.getChildByName('debug_equipment_'+id);
  ui.refreshBackpack([],true);grant.events.get(Node.EventType.TOUCH_END)();assert.equal(grants.at(-1),id);
  ui.refreshBackpack([{...item,kind:'equipment'}],true);flush();
  assert.equal(ui.backpackSlots[0].icon.spriteFrame.name,item.icon);
  ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_START)();
  assert.equal(ui.equipmentTooltipTitle.string,item.name);assert.equal(ui.equipmentTooltipText.string.replace(/<[^>]+>/g,''),item.effectDescription);
  assert.ok(ui.equipmentTooltipRows.some(row=>row.node.active&&row.name.string==='暴击率'&&row.value.string==='+35%'));
  ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_CANCEL)();
  ui.showEquipment([item],true,0);flush();assert.equal(ui.equipmentSlots[0].icon.spriteFrame.name,item.icon);
  const count=grants.length;ui.refreshBackpack([],false);grant.events.get(Node.EventType.TOUCH_END)();assert.equal(grants.length,count);
}
// Rapid hover changes must keep the latest large portrait and clear unused stat rows.
ui.showEquipmentTooltip(totem,-216);ui.showEquipmentTooltip(guinsoo,-216);flush();
assert.equal(ui.equipmentTooltipIcon.spriteFrame.name,guinsoo.icon);
assert.deepEqual(ui.equipmentTooltipRows.filter(row=>row.node.active).map(row=>[row.name.string,row.value.string]),[['攻击速度','+10%'],['法术加成','+10%']]);
ui.showEquipmentTooltip(potionIcon,-216);flush();
assert.equal(ui.equipmentTooltipRows.filter(row=>row.node.active).length,0,'non-equipment items retain their description without stale stats');
ui.showEquipmentTooltip(undefined,-216);assert.equal(ui.equipmentTooltip.active,false,'empty slots clear the equipment card');
const clickDebugTab=tab=>ui.debugPanel.getChildByName('debugTab_'+tab).events.get(Node.EventType.TOUCH_END)();
const clickDebug=name=>ui.debugContent.getChildByName(name).events.get(Node.EventType.TOUCH_END)();
ui.refreshBackpack([],true);clickDebugTab('equipment');
for(let page=0;page<Math.ceil(debugEquipment.length/6);page++) {
  if(page)clickDebug('debugNextPage');flush();
  for(const item of debugEquipment.slice(page*6,page*6+6)) {
    const row=ui.debugContent.getChildByName('debug_equipment_'+item.id);
    assert.ok(row,'all configured equipment appears in debug pages');
    const icon=row.getChildByName('debugItemIcon');
    assert.equal(icon.getComponent(Sprite).spriteFrame.name,item.icon);
    assert.deepEqual(icon.getComponent(UITransform).contentSize,{width:24,height:24});
  }
}
const debugGold=[];ui.onDebugGold=amount=>debugGold.push(amount);clickDebugTab('gold');clickDebug('debugGold100');
assert.deepEqual(debugGold,[100]);
const debugGrantedUnits=[];ui.onDebugUnit=(id,star)=>debugGrantedUnits.push({id,star});clickDebugTab('unit');
clickDebug('debugStar3');const firstDebugUnit=ui.debugData.units[0];clickDebug('debug_unit_'+firstDebugUnit.id);
assert.deepEqual(debugGrantedUnits,[{id:firstDebugUnit.id,star:3}]);
clickDebug('debugNextPage');assert.equal(ui.debugPage,debugUnits.length>6?1:0);clickDebug('debugPrevPage');assert.equal(ui.debugPage,0);
const debugJumps=[];ui.onDebugStage=(stage,round)=>debugJumps.push({stage,round});clickDebugTab('stage');
clickDebug('debugStageMinus');assert.equal(ui.debugStage,1);clickDebug('debugRoundMinus');assert.equal(ui.debugRound,1);
clickDebug('debugStagePlus');clickDebug('debugRoundPlus');clickDebug('debugJump');
assert.deepEqual(debugJumps,[{stage:2,round:2}]);
clickDebug('debugStagePlus');clickDebug('debugStagePlus');assert.equal(ui.debugStage,3);assert.equal(ui.debugRound,1);
const debugRect=screenRect(ui.debugPanel);assert.ok(debugRect.top<=360&&debugRect.bottom>=-360,'debug menu stays on screen');
ui.debugPanel.getChildByName('debugClose').events.get(Node.EventType.TOUCH_END)();assert.equal(ui.debugPanel.active,false);
assert.ok(!ui.node.getChildByName('backpack').children.some(n=>n.getChildByName('text')?.getComponent(Label)?.string?.includes('领取')),'old test grant buttons moved out of backpack');

assert.equal(ui.combatStatsPanel.active,true,'main menu closes the previously selected unit detail');
ui.mainMenuContent.getChildByName('mainMenuClose').events.get(Node.EventType.TOUCH_END)();
ui.showUnitDetail({...warriorDetail,skillName:'黑炎 · 150物理伤害',skillDescription:'造成150点物理伤害，每秒造成最大生命值2%的真实伤害。'});
assert.match(ui.unitDetail.string,/<color=#ff9740>150点物理伤害<\/color>/);
assert.match(ui.unitDetail.string,/<color=#ffffff>2%的真实伤害<\/color>/);
assert.equal(ui.unitDetail.handleTouchEvent,false);
ui.showUnitDetail({...warriorDetail,skillDisplayName:'爆裂火球',skillIcon:'attr_spell_bonus',skillDescription:'第一段造成210点魔法伤害。第二段说明。',
  skillStats:[{label:'伤害',current:'315',stars:'210 / 315 / 500',tone:'magic'}]});
ui.skillIconNode.events.get(Node.EventType.TOUCH_END)();
assert.equal(ui.detailPopupTitle.string,'爆裂火球');
assert.equal(ui.detailPopup.getComponent(UITransform).contentSize.width,600);
assert.match(ui.detailPopupStatLabels[0].current.string,/>315<\/color>/);
assert.equal(ui.detailPopupStatLabels[0].stars.string,'210/315/500');
assert.match(ui.unitDetail.string,/。\n\n第二段/);
assert.match(ui.detailPopupStatLabels[0].current.string,/<color=#50b4ff>/);
assert.equal(ui.detailPopupIcon.node.parent.parent,ui.detailPopup,'skill icon stays inside the popup header');
assert.equal(ui.detailPopupIcon.node.parent.position.x,-250);
assert.ok(ui.detailPopupStatLabels.slice(1).every(row=>!row.root.active),'unused stat rows disappear');
const popupRect=screenRect(ui.detailPopup);assert.ok(popupRect.left>=-640&&popupRect.right<=640&&popupRect.top<=360&&popupRect.bottom>=-360);
ui.showUnitDetail({...warriorDetail,skillDisplayName:'忍术飞弹',
 skillRichDescription:'对目标造成<color=#50b4ff>232</color>点魔法伤害。',
 skillDescription:'对目标造成232点魔法伤害。',skillStats:[{label:'伤害',current:'232',
 currentRich:"<color=#50b4ff>232</color>（<img src='attr_phys_bonus' /><img src='attr_spell_bonus' />）",stars:'118 / 157 / 232',tone:'magic'}]});
assert.equal(ui.detailPopupRows.active,true,'rich body must keep the bottom stat table visible');
assert.match(ui.detailPopupStatLabels[0].current.string,/attr_phys_bonus.*attr_spell_bonus/);
assert.equal(ui.detailPopupStatLabels[0].stars.string,'118/157/232');
assert.equal(ui.detailPopupStatLabels[0].stars.horizontalAlign,Label.HorizontalAlign.RIGHT);
assert.equal(ui.detailPopupStatLabels[0].stars.overflow,Label.Overflow.SHRINK,'long star values fit their own column');
assert.equal(ui.detailPopupStatLabels[0].current.imageAtlas,ui.unitDetail.imageAtlas,'body and row images share loaded frames');
assert.ok(ui.detailPopupStatLabels[0].root.position.y===0,'first stat follows the body divider without column headers');
ui.attackSpeedIconNode.events.get(Node.EventType.TOUCH_END)();assert.equal(ui.detailPopupRows.active,false);
ui.closeDetailPopup();
ui.showUnitDetail(warriorDetail);
assert.deepEqual(ui.unitStats.slice(5).map(l=>l.string),['0%','150%','25%','10%','20%','30%']);
assert.ok(ui.unitPanel.position.x>350); assert.equal(ui.node.getChildByName('detailShield'),undefined,'details do not block the board');
flush(); assert.equal(ui.hpMeter.fill.fillRange,.5);assert.equal(ui.manaMeter.fill.fillRange,.2);
const attributeIcons=['attr_phys_atk','attr_armor','attr_mr','attr_aspd','attr_range','attr_phys_bonus','attr_spell_bonus','attr_crit','attr_lifesteal','attr_dmg_amp','attr_dmg_reduce'];
for(const icon of attributeIcons) {
  assert.equal(ui.unitPanel.getChildByName(icon).getChildByName('skin').getComponent(Sprite).spriteFrame.name,`art/ui_m2/${icon}/spriteFrame`);
  assert.ok(fs.existsSync(path.join(__dirname,`../assets/resources/art/ui_m2/${icon}.png`)));
}
ui.showUnitDetail({...warriorDetail,atkSpeed:2.5});
assert.equal(ui.unitStats[3].string,'250%');assert.equal(pending.length,0,'live detail refresh does not reload portraits or stars');
ui.showUnitDetail(warriorDetail);
assert.equal(ui.hpMeter.fill.fillStart,0);assert.equal(ui.manaMeter.fill.fillStart,0,'detail bars also begin at the left');
assert.equal(ui.hpMeter.value.string,'350 / 700');assert.equal(ui.unitStats[4].string,'1格');assert.equal(ui.unitStats[4].node.position.y,158);
assert.deepEqual(ui.unitStats.slice(0,4).map(l=>l.string),['55','30','20','100%']);
assert.equal(ui.unitStats[0].color.r,255);assert.equal(ui.unitStats[6].color.b,255);
ui.updateUnitVitals(0,700,0,0);assert.equal(ui.hpMeter.fill.fillRange,0);assert.equal(ui.manaMeter.fill.fillRange,0);
ui.updateUnitVitals(999,700,200,100);assert.equal(ui.hpMeter.fill.fillRange,1);assert.equal(ui.manaMeter.fill.fillRange,1);
assert.equal(ui.expLabel.node.parent,ui.buyExpBtn,'XP display is part of the purchase button');
assert.equal(ui.expFill.node.parent.parent.parent,ui.buyExpBtn,'XP bar is part of the purchase button');
assert.equal(ui.goldLabel.node.parent,ui.shopHeader);assert.ok(ui.goldLabel.node.position.y>ui.shopSlots[0].node.position.y);
assert.deepEqual(ui.rateLabels.map(l=>l.string),['75%','25%','0%','0%','0%']);
assert.equal(new Set(ui.rateLabels.map(l=>`${l.color.r},${l.color.g},${l.color.b}`)).size,5);
let bought=0; ui.onBuy=()=>bought++;
ui.showSellPreview('战士',1,false,4);
assert.equal(ui.capLabel.string,'4 / 3'); assert.equal(ui.capLabel.color.r,164,'over-cap preview turns dark red');
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
ui.setCombatActive(true);flush();assert.equal(ui.phaseLabel.string,'战斗');assert.equal(ui.shopRoot.active,true);assert.equal(ui.homeButton.active,true);
assert.equal(ui.isInSellArea(SHOP_DROP_AREA.x,SHOP_DROP_AREA.y),true,'combat keeps the reserve sale target enabled');
ui.setCombatActive(false);
assert.ok(ui.node.getChildByName('command').position.y<-230);
assert.equal(SHOP_DROP_AREA.height,182);
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
assert.equal(ui.floorLabel.string,'2-1'); assert.equal(ui.waveTrack.children.filter(n=>/^stage_node_(normal|boss)(_locked)?$/.test(n.name)).length,10);
ui.refreshTop(10,2,new LevelSystem()); assert.equal(ui.floorLabel.string,'2-1','economy updates retain stage-round header');
ui.refreshRun(20,20,1,23,'史莱姆营地',{stage:1,round:1,roundsInStage:3},3); flush();
assert.equal(ui.waveTrack.children.filter(n=>/^stage_node_(normal|boss)(_locked)?$/.test(n.name)).length,3);
const delayedUI=new BattleUI();delayedUI.node=new Node('delayedUI');new Node('Canvas').addChild(delayedUI.node);delayedUI.init();
delayedUI.showUnitDetail(warriorDetail);delayedUI.updateUnitVitals(175,700,60,100);flush();
assert.equal(delayedUI.hpMeter.fill.fillRange,.25);assert.equal(delayedUI.manaMeter.fill.fillRange,.6,'live values survive delayed texture loading');
console.log('PASS actual UI: merged XP, colored odds, gold header, range/live vitals, asynchronous bars, drag sale, and combat shop');

const {UnitView}=load(path.join(__dirname,'../assets/scripts/view/UnitView.ts'));
ui.showUnitDetail({...warriorDetail,manaPerSecond:2,maxMana:100});flush();
assert.equal(ui.manaRegen.value.string,'+2/s');assert.equal(ui.manaRegen.node.active,true);
assert.equal(ui.manaRegen.node.parent,ui.manaMeter.fill.node.parent);
assert.ok(ui.manaRegen.node.position.x>0,'mana regeneration is labelled at the right end');
assert.ok(ui.manaRegen.node.getChildByName('manaRegenIcon').getComponent(Sprite).spriteFrame,'uses the mana droplet icon');
ui.showUnitDetail({...warriorDetail,manaPerSecond:0});assert.equal(ui.manaRegen.node.active,false);
const unitView=new UnitView();unitView.node=new Node('unit');unitView.node.setPosition(0,0,0);
unitView.setup('helion',0,1,56);
assert.equal(unitView.bodySprite.node.getComponent(UITransform).contentSize.width,56*.82,'reserve portraits retain their slot size');
const boardUnit=new UnitView();boardUnit.node=new Node('boardUnit');boardUnit.setup('helion',0,2,56,'helion',undefined,1.3);
const boardBody=boardUnit.bodySprite.node, boardSize=boardBody.getComponent(UITransform).contentSize;
assert.deepEqual(boardSize,{width:56*1.3,height:56*1.3},'board portraits occupy 1.3 display cells');
assert.ok(Math.abs(boardBody.position.y-boardSize.height/2+56*.82/2)<1e-8,'enlarging preserves the original foot position');
assert.ok(boardUnit.hpBarBg.position.y>boardBody.position.y+boardSize.height/2,'health bar stays above the enlarged portrait');
unitView.setEquipment([guinsoo,guinsoo,guinsoo]);flush();
assert.equal(unitView.equipmentIcons.length,3);
for(const icon of unitView.equipmentIcons) {
 assert.equal(icon.parent,unitView.node,'equipment survives hidden bench vitals');assert.equal(icon.position.y,unitView.hpBarBg.position.y-17);
 assert.equal(icon.getComponent(UITransform).contentSize.width,12);assert.ok(icon.getComponent(Sprite).spriteFrame);
}
unitView.setVitalsVisible(false);assert.equal(unitView.hpBarBg.active,false);for(const icon of unitView.equipmentIcons){assert.equal(icon.active,true);assert.equal(icon.position.y,unitView.hpBarBg.position.y);}
unitView.setVitalsVisible(true);assert.equal(unitView.hpBarBg.active,true);for(const icon of unitView.equipmentIcons)assert.equal(icon.position.y,unitView.hpBarBg.position.y-17);
unitView.setEquipment([]);assert.equal(unitView.equipmentIcons.length,0);
unitView.sync({hp:10,maxHp:100,mana:0,maxMana:0,shield:10,untargetable:true},{x:0,y:0},64,0);
assert.equal(unitView.shieldRing.active,true);assert.equal(unitView.bodyOpacity.opacity,80);
unitView.sync({hp:10,maxHp:100,mana:0,maxMana:0,shield:0,untargetable:false},{x:0,y:0},64,0);
assert.equal(unitView.shieldRing.active,false);assert.equal(unitView.bodyOpacity.opacity,255);
const barWidth=unitView.hpBarContent.getComponent(UITransform).contentSize.width;
const checkBar=(sprite,ratio)=>{
  const barWidth=sprite===unitView.manaFill?unitView.hpBarBg.getComponent(UITransform).contentSize.width:unitView.hpBarContent.getComponent(UITransform).contentSize.width;
  const transform=sprite.node.getComponent(UITransform);
  const left=sprite.node.position.x-transform.anchorPoint.x*transform.contentSize.width;
  assert.ok(Math.abs(left+barWidth/2)<1e-8,'left edge stays fixed as HP or mana changes');
  assert.ok(Math.abs(left+transform.contentSize.width-(-barWidth/2+barWidth*ratio))<1e-8,'only the right edge moves');
};
assert.ok(barWidth<unitView.hpBarBg.getComponent(UITransform).contentSize.width,'health/shield stay inset from the outer frame');
assert.equal(unitView.hpFill.node.parent,unitView.shieldFill.node.parent);
assert.equal(unitView.hpBarContent.getComponent(Mask).type,Mask.Type.GRAPHICS_STENCIL);
assert.equal(unitView.hpBarContent.getComponent(Graphics).roundedRect[4],2,'inner edge clips to a rounded cap');
for(const [hp,mana,hpRatio,manaRatio] of [[100,100,1,1],[50,25,.5,.25],[25,50,.25,.5],[0,0,0,0],[150,120,1,1],[-1,-5,0,0]]) {
  unitView.sync({hp,maxHp:100,mana,maxMana:100},{x:0,y:0,z:0},56,.1);
  checkBar(unitView.hpFill,hpRatio);checkBar(unitView.manaFill,manaRatio);
}
unitView.sync({hp:25,maxHp:100,mana:50,maxMana:100},{x:0,y:0,z:0},56,.1);flush();
unitView.sync({hp:25,maxHp:100,mana:50,maxMana:100,manaPerSecond:2},{x:0,y:0,z:0},56,.1);
assert.ok(!unitView.hpBarBg.getChildByName('manaRegen'),'board units never create extra mana text, even for casters');
unitView.sync({hp:25,maxHp:100,mana:50,maxMana:100,manaPerSecond:0},{x:0,y:0,z:0},56,.1);
checkBar(unitView.hpFill,.25);checkBar(unitView.manaFill,.5);
unitView.sync({hp:0,maxHp:0,mana:0,maxMana:0},{x:0,y:0,z:0},56,.1);
checkBar(unitView.hpFill,0);checkBar(unitView.manaFill,0);assert.equal(unitView.manaFill.node.active,false);
// Shields occupy a grey segment after HP; overflow shares the available width.
for(const [hp,maxHp,shield,hpRatio,shieldRatio] of [[40,100,30,.4,.3],[100,100,50,2/3,1/3],[10,100,60,.1,.6],[10,100,0,.1,0],[10,100,-5,.1,0],[0,0,20,0,0]]) {
 unitView.sync({hp,maxHp,shield,mana:0,maxMana:0},{x:0,y:0,z:0},56,.1);
 checkBar(unitView.hpFill,hpRatio);
 const overlay=unitView.shieldFill,rect=overlay.node.getComponent(UITransform).contentSize;
 assert.equal(overlay.node.active,shieldRatio>0);
 assert.ok(Math.abs(rect.width-barWidth*shieldRatio)<1e-8);
 assert.ok(Math.abs(overlay.node.position.x-(-barWidth/2+barWidth*hpRatio))<1e-8,'shield begins exactly where HP ends');
 assert.ok(overlay.node.position.x+rect.width<=barWidth/2+1e-8,'shield stays within the bar');
 ui.updateUnitVitals(hp,maxHp,0,0,shield);
 assert.ok(Math.abs(ui.hpMeter.ratio-hpRatio)<1e-8);
 assert.equal(ui.hpMeter.shield.node.active,shieldRatio>0);
 assert.ok(Math.abs(ui.hpMeter.shield.node.getComponent(UITransform).contentSize.width-246*shieldRatio)<1e-8);
 if(shieldRatio>0)assert.match(ui.hpMeter.value.string,new RegExp(`\\+${shield}护盾`));
 else assert.ok(!ui.hpMeter.value.string.includes('护盾'));
}
flush();assert.equal(unitView.shieldFill.spriteFrame.name,'art/ui/shield_fill/spriteFrame','uses the supplied grey shield texture');
const shieldDelayedUI=new BattleUI();shieldDelayedUI.node=new Node('shieldDelayedUI');new Node('Canvas').addChild(shieldDelayedUI.node);shieldDelayedUI.init();
shieldDelayedUI.showUnitDetail({...warriorDetail,hp:700,shield:350});flush();
assert.ok(Math.abs(shieldDelayedUI.hpMeter.fill.fillRange-2/3)<1e-8,'shield scaling survives delayed textures');
console.log('PASS grey shields: acquisition, absorption, disappearance, excess shield, invalid bounds, detail text and texture callbacks');
console.log('PASS actual UnitView: fixed left edges, independent HP/mana widths, clamped values, and delayed texture loading');
unitView.animateStellar(true,null,4,50);while(pending.length)pending.pop()();
const stellarSprite=unitView.stellarAura.getComponent(Sprite),stellarFrame=stellarSprite.spriteFrame;
assert.equal(unitView.stellarFrameIndex,2);assert.equal(unitView.stellarFrames.filter(Boolean).length,8);
assert.ok(unitView.stellarAura.getSiblingIndex()<unitView.hpBarBg.getSiblingIndex(),'painted shield stays below vitals');
assert.equal(unitView.shieldRing.active,false,'painted stellar ring replaces the generic gold ring');
unitView.animateStellar(true,null,4,50);assert.equal(stellarSprite.spriteFrame,stellarFrame,'paused guardian barrier retains its painted phase');
unitView.animateStellar(true,null,7,50);assert.notEqual(stellarSprite.spriteFrame,stellarFrame);
unitView.animateStellar(false,null,7,50);assert.equal(unitView.stellarAura.active,false,'broken/expired shield hides the animation');

const {MainMenu}=load(path.join(__dirname,'../assets/scripts/ui/MainMenu.ts'));
const {SAVE_KEY,freshRunSave,writeRunSave,loadRunSave}=load(path.join(__dirname,'../assets/scripts/core/ShopSave.ts'));
const storage=new Map(); global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const createMenu=()=>{const menu=new MainMenu();menu.node=new Node('MainMenu');new Node('Canvas').addChild(menu.node);menu.start();return menu;};
let menu=createMenu(); menu.startNewRun(); assert.equal(sceneLoads.length,0,'configuration must finish before starting');
assert.deepEqual(menu.node.getChildByName('menuBackground').getChildByName('skin').getComponent(UITransform).contentSize,{width:1280,height:720},'menu sky uses the full viewport');
const configIndex=pending.findIndex(f=>f.path==='config/run');pending.splice(configIndex,1)[0]();
for(const name of ['units','skills','battle','equipment']){const i=pending.findIndex(f=>f.path===`config/${name}`);pending.splice(i,1)[0]();}
assert.equal(menu.ready,false,'monster images must finish loading before the run is ready');
menu.startNewRun();assert.equal(sceneLoads.length,0,'do not enter a monster stage while its images are missing');
assert.equal(pending.filter(f=>f.path?.startsWith('art/units/monsters/')).length,30,'load all ordinary and strong monster SpriteFrames');
flush();assert.equal(menu.ready,true);
const setup=menu.node;
assert.equal(menu.stageCount,10);assert.equal(setup.getChildByName('runSetup'),undefined);
assert.ok(setup.getChildByName('startGame').position.x>0&&setup.getChildByName('startGame').position.y<0);
setup.getChildByName('startGame').events.get('end')();
assert.deepEqual(sceneLoads,['floating-ruins']); assert.equal(loadRunSave().stageCount,10); assert.equal(loadRunSave().round,null);
setup.getChildByName('startGame').events.get('end')(); assert.equal(sceneLoads.length,1,'double start is blocked');
const saved=freshRunSave(5);saved.gold=77;saved.round={phase:'prepare',waveIndex:3,health:18,result:null,lastSettlement:null};writeRunSave(saved);
menu=createMenu();flush(); assert.ok(menu.node.getChildByName('continueGame'));const before=storage.get(SAVE_KEY);
menu.node.getChildByName('continueGame').events.get('end')();assert.equal(storage.get(SAVE_KEY),before,'continue preserves exact saved run');
menu=createMenu();flush();sceneAccepted=false;menu.startNewRun();assert.equal(storage.get(SAVE_KEY),before,'scene failure restores previous run');assert.equal(menu.loading,false);
sceneAccepted=true;sceneError=new Error('launch error');menu.startNewRun();assert.equal(storage.get(SAVE_KEY),before);assert.match(menu.status.string,/加载失败/);
sceneError=null;menu.startNewRun();assert.equal(loadRunSave().stageCount,10);assert.equal(loadRunSave().gold,0);assert.equal(loadRunSave().round,null);
const main=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/main.scene'),'utf8'));
assert.equal(main[0]._name,'main');assert.ok(main.some(o=>o.__type__==='3d5ecIKFJdMUocoPL3jTL8c'));
assert.ok(!main.some(o=>o.__type__==='8f9eevK0PpKTosJ1ucemD33'),'menu contains no battle stage');
const checkRefs=o=>{if(!o||typeof o!=='object')return;if('__id__'in o) assert.ok(main[o.__id__]);for(const v of Object.values(o))checkRefs(v);};main.forEach(checkRefs);
const builder=JSON.parse(fs.readFileSync(path.join(__dirname,'../settings/v2/packages/builder.json'),'utf8'));
const assetScenes=fs.readdirSync(path.join(__dirname,'../assets'),{recursive:true}).filter(p=>/\.scene(?:\.meta)?$/.test(p)).sort();
assert.deepEqual(assetScenes,['floating-ruins.scene','floating-ruins.scene.meta','main.scene','main.scene.meta'],'only the two production scenes and their metadata remain');
assert.deepEqual(builder.scenes.map(s=>s.url).sort(),['db://assets/floating-ruins.scene','db://assets/main.scene']);
assert.ok(builder.scenes.some(s=>s.uuid===builder.startScene&&s.url==='db://assets/main.scene'));
assert.ok(builder.scenes.some(s=>s.url==='db://assets/floating-ruins.scene'));
assert.ok(!builder.scenes.some(s=>s.url==='db://assets/scene.scene'),'removed battle scene must not remain in a build');
const productionScene=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/floating-ruins.scene'),'utf8'));
const productionMeta=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/floating-ruins.scene.meta'),'utf8'));
assert.equal(productionScene[1]._id,productionMeta.uuid);
assert.ok(builder.scenes.some(s=>s.uuid===productionMeta.uuid&&s.url==='db://assets/floating-ruins.scene'));
const productionRefs=o=>{if(!o||typeof o!=='object')return;if('__id__'in o)assert.ok(productionScene[o.__id__]);for(const v of Object.values(o))productionRefs(v);};productionScene.forEach(productionRefs);
assert.ok(productionScene.some(o=>o.__type__==='8f9eevK0PpKTosJ1ucemD33'),'new board uses the real battle stage');
assert.ok(productionScene.some(o=>o.__type__==='cc.Node'&&o._name==='BoardCamera3D'),'new board contains its fixed RT camera');
console.log('PASS main menu: fixed ten stages, bottom-right start, asynchronous readiness, new/continue, duplicate click, failure recovery, and scene registration');
const rewardItems=require('../assets/resources/config/equipment.json').slice(0,3),choices=[];
ui.onClaimEquipmentReward=index=>choices.push(index);
ui.showEquipmentReward(rewardItems.slice(0,2));
let rewardRoot=ui.rewardDockRoot.getChildByName('equipmentReward'),cards=rewardRoot.children.filter(n=>n.name==='rewardCandidate');
assert.equal(cards.length,2);assert.ok(rewardRoot.children.some(n=>n.getComponent(Label)?.string==='装备奖励 · 2选一'));
for(let index=0;index<2;index++){const card=cards[index];assert.ok(card.children.some(n=>n.getComponent(Label)?.string===rewardItems[index].name));
 assert.ok(card.children.some(n=>n.getComponent(Label)?.string===rewardItems[index].description));}
cards[1].children.find(n=>n.name==='button').events.get('end')();assert.deepEqual(choices,[1]);
const modalEvent={};rewardRoot.events.get('start')(modalEvent);assert.equal(modalEvent.propagationStopped,true);
const oldIcon=cards[0].getChildByName('rewardIcon').getComponent(Sprite);ui.hideEquipmentReward();
ui.showEquipmentReward(rewardItems);flush();assert.equal(oldIcon.spriteFrame,undefined,'late icon callbacks cannot write into a destroyed reward');
rewardRoot=ui.rewardDockRoot.getChildByName('equipmentReward');cards=rewardRoot.children.filter(n=>n.name==='rewardCandidate');assert.equal(cards.length,3);
for(let index=0;index<3;index++)assert.equal(cards[index].getChildByName('rewardIcon').getComponent(Sprite).spriteFrame.name,rewardItems[index].icon);
ui.hideEquipmentReward();assert.equal(ui.rewardDockRoot.getChildByName('equipmentReward'),undefined);
console.log('PASS P3 actual BattleUI: two/three distinct cards, real names/descriptions/icons, dock input, choice callback and stale async protection');
ui.onDestroy();assert.equal(inputListeners.filter(l=>l.target===ui).length,0,'scene cleanup removes all idle wake listeners');
for(const backdrop of [{isValid:false},{isValid:true,destroyQueued:true}]){
 const cleanupUI=new BattleUI();cleanupUI.backdrop={...backdrop,destroy(){throw Error('duplicate backdrop destroy');}};
 cleanupUI.onDestroy();
}
console.log('PASS drag polygon highlight, centered bold population, animated preparation fill and idle wave visibility');

const {StageRewardPanel}=load(path.join(__dirname,'../assets/scripts/ui/StageRewardPanel.ts'));
const {ConfigManager:StageConfig}=load(path.join(__dirname,'../assets/scripts/core/ConfigManager.ts'));
const stageCfg=new StageConfig();stageCfg.setUnits(require('../assets/resources/config/units.json'));stageCfg.setEquipment(require('../assets/resources/config/equipment.json'));
let stageCloses=0;
const stageActions=[],stagePanel=new StageRewardPanel(ui.node,stageCfg,a=>stageActions.push(a),()=>{stageCloses++;stagePanel.hide();},item=>{
 if(item)ui.showEquipmentDetail(item);else ui.hideEquipmentDetail();
});
stagePanel.show({id:'boss',waveId:20,kind:'bossChoice',value:8},10);flush();
let stageBody=stagePanel.root.getChildByName('stageRewardBody');
assert.equal(stageBody.children.filter(n=>n.name==='bossChoice').length,0,'no manual reward category buttons');
const oldBossClick=stageBody.children.find(n=>n.name==='button').events.get('end');oldBossClick();assert.equal(stageActions.at(-1).choice,'claim');
const basicIds=require('../assets/resources/config/run.json').stageEncounters.basicEquipmentIds.slice(0,4);
stagePanel.show({id:'four',waveId:20,kind:'equipmentChoice',candidates:basicIds},10);flush();
stageBody=stagePanel.root.getChildByName('stageRewardBody');let stageCards=stageBody.children.filter(n=>n.name==='stageOffer');assert.equal(stageCards.length,4);
for(const [i,card]of stageCards.entries()){
 assert.ok(card.children.some(n=>n.getComponent(Label)?.string===stageCfg.getEquipmentReserve([basicIds[i]])[0].name));
 const frame=card.getChildByName('rewardArt').getComponent(Sprite).spriteFrame;
 assert.equal(frame.name,stageCfg.getEquipmentReserve([basicIds[i]])[0].icon);
}
stageCards[0].getChildByName('stageDetails_0').events.get('end')();flush();
const equipmentDetail=stagePanel.root.getChildByName('stageEquipmentDetail');assert.ok(equipmentDetail);
const equipmentCard=equipmentDetail.getChildByName('equipmentDetailCard');
assert.ok(equipmentCard.children.some(n=>n.getComponent(Label)?.string===stageCfg.getEquipmentReserve([basicIds[0]])[0].name));
assert.equal(equipmentCard.getChildByName('equipmentStats').children.filter(n=>n.name==='equipmentStat').length,2);
equipmentCard.children.find(n=>n.name==='button').events.get('end')();assert.equal(equipmentDetail.active,false);
let stageActionCount=stageActions.length;oldBossClick();assert.equal(stageActions.length,stageActionCount,'old category buttons cannot fire after changing panel');
stageCards[2].getChildByName('stageChoice_2').events.get('end')();assert.deepEqual(stageActions.at(-1),{type:'stageChoice',rewardId:'four',choice:'claim',index:2});
stagePanel.show({id:'shop',waveId:18,kind:'specialShop',offers:[{kind:'unit',id:'blackfeather_hunter',price:2,bought:false},...basicIds.map(id=>({kind:'equipment',id,price:3,bought:false}))]},8);flush();
stageBody=stagePanel.root.getChildByName('stageRewardBody');stageCards=stageBody.children.filter(n=>n.name==='stageOffer');assert.equal(stageCards.length,5);
const merchantRefresh=stageBody.getChildByName('stageShopRefresh');
assert.equal(merchantRefresh.getChildByName('text').getComponent(Label).string,'刷新 2 金币');
merchantRefresh.events.get('end')();assert.equal(stageActions.at(-1).choice,'refresh');
stageCards[0].getChildByName('stageChoice_0').events.get('end')();assert.equal(stageActions.at(-1).choice,'buy');
const merchantEquipment=stageCards[1],merchantInspect=merchantEquipment.events.get('end');
assert.equal(merchantEquipment.getChildByName('equipmentStats'),undefined,'shop cards hide equipment attributes');
assert.equal(merchantEquipment.getChildByName('stageDetails_1'),undefined,'shop cards use direct inspection');
merchantInspect({target:merchantEquipment});flush();
const rightEquipment=ui.equipmentDetail;assert.ok(rightEquipment?.active);
assert.deepEqual(rightEquipment.position,ui.unitPanel.position,'equipment shares the unit detail slot');
assert.deepEqual(rightEquipment.getComponent(UITransform).contentSize,ui.unitPanel.getComponent(UITransform).contentSize);
assert.equal(ui.unitPanel.active,false);ui.update(.01);assert.equal(ui.combatStatsPanel.active,false);
assert.equal(rightEquipment.getChildByName('equipmentDetailName').getComponent(Label).string,stageCfg.getEquipmentReserve([basicIds[0]])[0].name);
const merchantBuy=merchantEquipment.getChildByName('stageChoice_1');merchantBuy.events.get('end')();
merchantInspect({target:merchantBuy});assert.equal(ui.equipmentDetail,rightEquipment,'purchase bubbling cannot open another inspector');
rightEquipment.getChildByName('closeEquipmentDetail').events.get('end')();assert.equal(ui.equipmentDetail,null);
assert.equal(ui.combatStatsPanel.active,true);
assert.equal(stageCloses,0,'shop stays visible in the dock until next-wave is used');
stagePanel.hide();assert.equal(stagePanel.root,null);merchantInspect({target:merchantEquipment});assert.equal(ui.equipmentDetail,null,'stale cards cannot reopen details');
console.log('PASS stage reward UI: random chest button, four legacy equipment icons, item names, complete equipment detail/return, five shop cards, purchase/skip and stale-panel protection');
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const trait=JSON.parse(JSON.stringify(require('../assets/resources/config/battle.json').traits.find(t=>t.id==='sunlight')));

const traitRoster=require('../assets/resources/config/units.json');
// Synthetic membership checks all displayed tiers independently of authored roster size.
trait.members.push(...traitRoster.filter(u=>!trait.members.includes(u.id)).slice(0,2).map(u=>u.id));
ui.refreshTraits(resolveTraits([trait],[]),traitRoster);flush();
assert.equal(ui.traitPanel.rows.children.filter(node=>node.active).length,0,'no deployed owner means no trait row');
for(const [count,tier] of [[1,'inactive'],[2,'inactive'],[3,'bronze'],[5,'silver'],[7,'gold'],[10,'prismatic']]) {
  const state=resolveTraits([trait],trait.members.slice(0,count));ui.refreshTraits(state,traitRoster);flush();
  const row=ui.traitPanel.rows.children.find(node=>node.active&&node.name==='trait_sunlight');
  assert.ok(row.children.some(node=>node.getComponent(Label)?.string==='日'));
  assert.ok(row.children.find(node=>node.name==='traitArt').getComponent(Sprite).spriteFrame.name.includes('#rect,'));
  row.events.get('end')();flush();
  const card=ui.traitPanel.detail;
  assert.ok(card?.active);assert.equal(card.children.filter(node=>node.name==='sunlightBreakpoint').length,4);
  assert.equal(card.children.filter(node=>node.name.startsWith('traitOwner_')).length,10);
  assert.equal(state[0].active?.tier??'inactive',tier);
  const {TRAIT_BADGES}=load(path.join(__dirname,'../assets/scripts/ui/TraitPanel.ts'));
  assert.equal(row.getChildByName('traitArt').getComponent(Sprite).spriteFrame.name,TRAIT_BADGES[tier],'all five tier badges follow current activation');
  assert.ok(card.children.some(node=>node.getComponent(Label)?.string===count+'名上场 · 日辉棋子获得以下效果'));
  ui.node.getChildByName('backpackTab').events.get('end')();
  assert.equal(ui.backpackRoot.active,true);assert.equal(ui.traitPanel.root.active,false);assert.equal(ui.traitPanel.detail,null);
  ui.node.getChildByName('traitsTab').events.get('end')();
  assert.equal(ui.backpackRoot.active,false);assert.equal(ui.traitPanel.root.active,true);
}
ui.refreshTraits(resolveTraits([trait],trait.members.slice(0,1)),traitRoster);flush();
ui.traitPanel.rows.children.find(node=>node.active).events.get('end')();flush();
assert.ok(ui.traitPanel.detail?.active);
ui.refreshTraits(resolveTraits([trait],[]),traitRoster);flush();
assert.equal(ui.traitPanel.detail,null,'removing the last owner closes its pinned detail');
assert.equal(ui.traitPanel.selected,null);
assert.equal(ui.traitPanel.rows.children.filter(node=>node.active).length,0);
ui.refreshTraits(resolveTraits([trait],trait.members.slice(0,1)),traitRoster);flush();
ui.traitPanel.rows.children.find(node=>node.active).events.get('enter')();flush();
assert.ok(ui.traitPanel.detail?.active);
ui.refreshTraits(resolveTraits([trait],[]),traitRoster);flush();
assert.equal(ui.traitPanel.detail,null,'removing the last owner also closes hover details');
console.log('PASS trait UI: deployed owners only, inactive at 1/2, five badge regions, glyph, tiers, owners, switching and last-owner detail cleanup');

cc.sys.isMobile=true;cc.view.getVisibleSize=()=>({width:1600,height:720});
cc.sys.getSafeAreaRect=()=>({x:69.3333333333,y:0,width:1461.3333333334,height:720});
const mobileUI=new BattleUI();mobileUI.node=new Node('mobileUI');new Node('Canvas').addChild(mobileUI.node);mobileUI.init();flush();
assert.equal(screenSetup.policy,2,'mobile uses the full landscape screen');
const toggle=mobileUI.node.getChildByName('mobileShopToggle');
const safeLeft=-800+69.3333333333,safeRight=800-69.3333333333;
for(const node of [mobileUI.backpackRoot,mobileUI.traitPanel.root,mobileUI.node.getChildByName('healthPanel'),mobileUI.node.getChildByName('command')]){
 const bounds=screenRect(node);assert.ok(bounds.left>=safeLeft&&bounds.right<=safeRight,'mobile controls clear the cutout safe area');
}
assert.ok(mobileUI.sideTabs.every(n=>n.getComponent(UITransform).contentSize.height>=44),'side tabs have larger touch targets');
mobileUI.traitPanel.rows.setPosition(0,mobileUI.traitPanel.viewportHeight/2+36.5,0);
mobileUI.refreshTraits(resolveTraits([trait],trait.members.slice(0,1)),traitRoster);flush();
assert.equal(mobileUI.traitPanel.scrollView.getScrollOffset().y,0,'initial native resize offset must not clip the first trait');
const {battleUILayout}=load(path.join(__dirname,'../assets/scripts/ui/BattleUILayout.ts'));
for(const [width,left,right] of [[1600,69.3333,69.3333],[1600,104,0],[1280,60,0],[1280,0,60]]){
 const layout=battleUILayout(width,true,{left,right});
 assert.ok(layout.left-96>=-width/2+left&&layout.commandX+120<=width/2-right,'symmetric and one-sided cutouts keep controls inside');
 const scale=Math.min(1.25,(layout.shop.width-12)/884),center=layout.shop.x+48*scale;
 assert.ok(center-490*scale>=layout.shop.x-layout.shop.width/2&&center+394*scale<=layout.shop.x+layout.shop.width/2,'merchant tabs and five offers fit the dock together');
}
assert.equal(mobileUI.shopDock.active,false,'ordinary mobile shop starts collapsed');
toggle.events.get('end')();assert.equal(mobileUI.shopDock.active,true);
assert.equal(toggle.active,false,'opening the shop hides its entry icon');
const outside={getUILocation:()=>({x:400,y:400}),propagationStopped:false};
mobileUI.shopDismiss.events.get('start')(outside);mobileUI.shopDismiss.events.get('end')(outside);
assert.equal(mobileUI.shopDock.active,false);assert.equal(toggle.active,true);assert.equal(outside.propagationStopped,true);
mobileUI.setShopContentOccupied(true);assert.equal(mobileUI.rewardDockRoot.active,true);assert.equal(toggle.active,false,'new rewards open automatically');
mobileUI.shopDismiss.events.get('start')(outside);mobileUI.shopDismiss.events.get('end')(outside);
mobileUI.setShopContentOccupied(true);assert.equal(mobileUI.rewardDockRoot.active,false,'refreshing hidden rewards does not force them open');
toggle.events.get('end')();assert.equal(mobileUI.rewardDockRoot.active,true,'hidden rewards can be reopened');
mobileUI.setShopContentOccupied(false);
mobileUI.showSellPreview('战士',1,false);assert.equal(mobileUI.shopDock.active,false,'mobile drag keeps the shop closed');
assert.equal(toggle.active,true);assert.equal(mobileUI.sellNode.active,false);assert.equal(mobileUI.shopSaleHint.node.active,true);
assert.equal(mobileUI.isInSellArea(toggle.position.x,toggle.position.y),true);
assert.equal(mobileUI.isInSellArea(toggle.position.x+81,toggle.position.y),false,'sale target follows the round icon');
assert.equal(mobileUI.isInSellArea(mobileUI.layout.shop.x,mobileUI.layout.shop.y),false,'the old mobile dock is not a sale target');
mobileUI.clearSellPreview();assert.equal(mobileUI.shopDock.active,false,'drag end restores collapsed state');
for(const card of mobileUI.shopSlots){assert.ok(card.name.fontSize>=23);assert.ok(card.node.getComponent(UITransform).contentSize.height>=86);}
assert.equal(new Set(mobileUI.shopSlots.map(card=>card.node.position.y)).size,1,'mobile keeps all five cards in one row');
for(let i=1;i<mobileUI.shopSlots.length;i++)assert.ok(mobileUI.shopSlots[i].node.position.x-mobileUI.shopSlots[i-1].node.position.x>mobileUI.layout.cardWidth,'single-row cards do not overlap');
const captionTop=mobileUI.backpackCaption.node.position.y+mobileUI.backpackCaption.node.getComponent(UITransform).contentSize.height/2;
assert.ok(captionTop<mobileUI.backpackSlots[6].node.position.y-36,'backpack instructions clear the last equipment row');
assert.equal(toggle.position.x,mobileUI.backpackRoot.position.x,'shop icon is centered below the left panel');
assert.equal(toggle.getComponent(UITransform).contentSize.width,144);
assert.equal(screenRect(mobileUI.backpackRoot).top,screenRect(mobileUI.node.getChildByName('roundBar')).top,'left panel aligns with the stage header');
const healthBounds=screenRect(mobileUI.node.getChildByName('healthPanel'));
for(const text of [mobileUI.healthLabel,mobileUI.waveLabel]){const bounds=screenRect(text.node);assert.ok(bounds.top<=healthBounds.top&&bounds.bottom>=healthBounds.bottom&&bounds.left>=healthBounds.left&&bounds.right<=healthBounds.right,'health frame contains both text rows');}
mobileUI.refreshCombatStats([{id:1,name:'战士',side:0,star:1,damage:50,taken:30,healing:10,shielding:0,
 damageByType:{physical:50,magic:0,true:0},takenByType:{physical:30,magic:0,true:0}}]);
assert.ok(screenRect(mobileUI.combatStatBars[0].name.node).top<screenRect(mobileUI.combatMetricButtons[0]).bottom,'statistics rows leave the metric buttons clear');
const preferences=new Map();cc.sys.localStorage={getItem:k=>preferences.get(k)??null,setItem:(k,v)=>preferences.set(k,v)};
assert.equal(mobileUI.unitPanel.position.x,mobileUI.combatStatsPanel.position.x,'mobile inspector uses the statistics dock');
assert.equal(mobileUI.unitPanel.position.y,mobileUI.combatStatsPanel.position.y);
const equipmentColumn=mobileUI.unitPanel.getChildByName('equipment');
assert.ok(equipmentColumn.position.x+38<-140,'equipment clears the left edge of the detail card');
assert.equal(new Set(mobileUI.equipmentSlots.map(slot=>slot.node.position.x)).size,1);
assert.equal(new Set(mobileUI.equipmentSlots.map(slot=>slot.node.position.y)).size,3);
mobileUI.mainMenuContent.getChildByName('settingFrameRate90').events.get('end')();
assert.equal(mobileUI.getBattleSettings().frameRate,90);assert.equal(cc.game.frameRate,90);
mobileUI.setCameraZoom(1.1);assert.equal(JSON.parse(preferences.get('autochess.battleSettings')).cameraZoom,1.1);
const mode=mobileUI.mainMenuContent.getChildByName('settingUIMode');
mode.events.get('end')();assert.equal(mobileUI.getBattleSettings().uiMode,'desktop');assert.equal(mobileUI.shopDock.active,true);assert.equal(toggle.active,false);
assert.equal(mobileUI.isInSellArea(mobileUI.layout.shop.x,mobileUI.layout.shop.y),true);
mode.events.get('end')();assert.equal(mobileUI.getBattleSettings().uiMode,'mobile');assert.equal(mobileUI.shopDock.active,false);assert.equal(toggle.active,true);
assert.equal(JSON.parse(preferences.get('autochess.battleSettings')).uiMode,'mobile','interface choice persists');
mobileUI.setShopContentOccupied(true);mobileUI.shopExpanded=false;mobileUI.syncShopVisibility();
mobileUI.revealShopContent();assert.equal(mobileUI.shopDock.active,true,'a new trait choice reopens an already occupied mobile dock');
mobileUI.showUnitDetail(warriorDetail);mobileUI.skillIconNode.events.get('end')();
assert.equal(mobileUI.attackSpeedIconNode.name,'attr_aspd','only the attack speed icon opens its explanation');
assert.ok(mobileUI.detailPopup.getChildByName('skin'),'skill explanation has an opaque textured background');
const blankEvent={getUILocation:()=>({x:500,y:400})};
mobileUI.inspectorDismiss.events.get('start')(blankEvent);mobileUI.inspectorDismiss.events.get('end')(blankEvent);
assert.equal(mobileUI.detailPopup.active,false);assert.equal(mobileUI.unitDetailVisible,true,'first blank tap returns from skill details');
mobileUI.inspectorDismiss.events.get('start')(blankEvent);mobileUI.inspectorDismiss.events.get('end')(blankEvent);
assert.equal(mobileUI.unitDetailVisible,false,'next blank tap closes unit details');
let opened=0;const rates=[35,30,20,10,5];
mobileUI.showExplorerChest(320,rates,true,()=>opened++);
let inspector=mobileUI.explorerInspector,body=inspector.root.getChildByName('explorerChestInspectorBody');
assert.equal(body.getChildByName('explorerInspectorLayers').getComponent(Label).string,'320');
assert.deepEqual(body.children.filter(n=>n.name.startsWith('explorerOdds')).map(n=>n.getComponent(Label).string),rates.map(n=>`${n}%`));
mobileUI.update(3.9);assert.equal(inspector.visible,true);body.events.get('start')(blankEvent);
mobileUI.update(3.9);assert.equal(inspector.visible,true,'interaction resets idle dismissal');
mobileUI.update(.1);assert.equal(inspector.visible,false);assert.equal(opened,0,'inspection never claims a reward');
mobileUI.showExplorerChest(320,rates,false,()=>opened++);
inspector.root.getChildByName('explorerChestInspectorBody').getChildByName('openExplorerChest').events.get('end')();
assert.equal(opened,0,'combat/unavailable opening is blocked');
mobileUI.hideExplorerChest();mobileUI.showExplorerChest(320,rates,true,()=>opened++);
const open=inspector.root.getChildByName('explorerChestInspectorBody').getChildByName('openExplorerChest');
open.events.get('end')();open.events.get('end')();assert.equal(opened,1,'button is consumed once');
mobileUI.showExplorerChest(320,rates,true,()=>opened++);
mobileUI.shopDismiss.events.get('start')(blankEvent);mobileUI.shopDismiss.events.get('end')(blankEvent);
assert.equal(inspector.visible,false);assert.equal(opened,1,'outside tap only returns');
const {ShopVisitor}=load(path.join(__dirname,'../assets/scripts/view/ShopVisitor.ts'));
let inspected=0;const chest=new ShopVisitor(new Node('board'),{x:0,y:0,z:0},()=>inspected++,'chest',{inspectOnClick:true});
chest.setLootCaption(320,1.7);assert.equal(chest.caption.string,'320');
assert.equal(chest.root.getChildByName('explorerChestLayers').children.length,1,'idle chest only shows its numeric layer count');
assert.equal(chest.root.getChildByName('explorerChestLayers').getComponent(Graphics),undefined,'numeric chest caption has no background frame');
assert.equal(chest.caption.fontSize,18,'idle layer number stays compact');
chest.root.events.get('end')({});assert.equal(inspected,1);assert.equal(chest.opened,false,'chest tap only inspects');
chest.openChest(()=>opened++);chest.openChest(()=>opened++);assert.equal(opened,2,'explicit chest opening cannot grant twice');
mobileUI.onDestroy();cc.sys.isMobile=false;delete cc.view.getVisibleSize;
delete cc.sys.localStorage;
console.log('PASS mobile shop: icon, blank dismissal, reopen rewards, circular sale target, mode switching and persistence');
