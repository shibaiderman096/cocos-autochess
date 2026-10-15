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
  static SizeMode={CUSTOM:0,RAW:1,TRIMMED:2}; static Type={SIMPLE:0,SLICED:1,FILLED:2}; static FillType={HORIZONTAL:0};
  sizeMode=Sprite.SizeMode.TRIMMED;
  set spriteFrame(frame) {
    this.frame=frame;
    // Creator automatically applies an equipment texture's 64px dimensions
    // unless CUSTOM was selected before assigning its frame.
    if(frame?.name?.startsWith('art/equipment/')&&this.sizeMode!==Sprite.SizeMode.CUSTOM) this.node.getComponent(UITransform).setContentSize(64,64);
  }
  get spriteFrame() { return this.frame; }
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
const cc={Node,UITransform,Sprite,Label,RichText:class{},Color,Graphics,UIOpacity:class{},SpriteFrame:class{},JsonAsset:class{},Component:class{isValid=true},
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
const {colorDamageText}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
assert.equal(colorDamageText('112点物理伤害，30魔法伤害，2%的真实伤害，50%攻速加成'),'<color=#ff9740>112点物理伤害</color>，<color=#50b4ff>30魔法伤害</color>，<color=#ffffff>2%的真实伤害</color>，50%攻速加成');
const {LevelSystem}=load(path.join(__dirname,'../assets/scripts/core/LevelSystem.ts'));
const {SHOP_DROP_AREA}=load(path.join(__dirname,'../assets/scripts/ui/BattleUILayout.ts'));
const flush=()=>{ while(pending.length) pending.shift()(); };
const ui=new BattleUI(); ui.node=new Node('UI'); new Node('Canvas').addChild(ui.node); ui.init();
assert.equal(ui.node.getChildByName('settlement'),undefined,'no report modal or full-screen shield');
assert.equal(ui.resultPanel.parent,ui.node.getChildByName('roundBar'));
assert.equal(ui.resultLabel.node.position.y,-78,'outcome appears below the stage header and wave track');
ui.showResult(0,null,0,0,1);assert.equal(ui.resultLabel.string,'胜利');assert.equal(ui.resultPanel.active,true);
ui.update(.5);assert.equal(ui.resultPanel.active,true);ui.update(.5);assert.equal(ui.resultPanel.active,false);
ui.showResult(1,null,0,0,1);assert.equal(ui.resultLabel.string,'失败');ui.hideResult();
ui.showResult(1,null,0,0,1,{runResult:'defeat'});ui.update(1);
assert.equal(ui.resultPanel.active,false);assert.equal(ui.runEndActions.active,true,'run-end navigation remains available after the outcome fades');
ui.hideResult();ui.waveIdle=0;
ui.refreshCombatStats([{id:1,name:'战士',side:0,star:1,damage:50,taken:30,healing:10,
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
ui.combatSideButtons[0].events.get('end')();assert.equal(ui.combatStatBars[0].value.string,'10');
assert.equal(ui.combatStatBars[0].bar.fillColor.g,203,'healing bars use green');
ui.combatMetricButtons[0].events.get('end')();
assert.equal(ui.combatStatsPanel.active,true);
ui.closeUnitDetail();assert.equal(ui.combatStatsPanel.active,true);
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
const {FloatText}=load(path.join(__dirname,'../assets/scripts/view/FloatText.ts'));
assert.deepEqual(['physical','magic','true'].map(type=>{const c=FloatText.colorForType(type);return [c.r,c.g,c.b];}),[[255,151,64],[80,180,255],[255,255,255]]);
const warriorDetail={name:'战士',star:1,cost:1,artId:'warrior',side:0,hp:350,maxHp:700,mana:20,maxMana:100,atk:55,armor:30,mr:20,atkSpeed:1,range:1,spellPower:150,critChance:.25,lifesteal:.1,damageAmp:.2,damageReduction:.3,skillName:'斩击',skillDescription:'造成伤害'};
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
ui.showUnitDetail({...warriorDetail,cost:4});assert.equal(ui.unitCost.string,'5金');
ui.showUnitDetail({...warriorDetail,cost:5});assert.equal(ui.unitCost.string,'8金');
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
assert.deepEqual(ui.equipmentSlots[0].icon.node.getComponent(UITransform).contentSize,{width:24,height:24},'asynchronous equipment texture cannot replace slot dimensions');
assert.equal(ui.equipmentSlots[1].text.string,'');
assert.match(ui.equipmentInfo.string,/叠层：4/);
ui.refreshBackpack([{...guinsoo,kind:'equipment'}],true);flush();
assert.equal(ui.backpackSlots[0].icon.node.getComponent(UITransform).contentSize.width,24);
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
let bagClicks=0;ui.onBackpack=()=>bagClicks++;ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_END)();assert.equal(bagClicks,1);
ui.refreshBackpack([],false);assert.equal(ui.backpackSlots[0].index,-1);
let equipmentClicks=0;ui.onEquipment=()=>equipmentClicks++;
ui.equipmentSlots[0].node.events.get(Node.EventType.TOUCH_END)();assert.equal(equipmentClicks,1);
ui.showEquipment([guinsoo],false,5);ui.equipmentSlots[0].node.events.get(Node.EventType.TOUCH_END)();assert.equal(equipmentClicks,1);
const totem=require('../assets/resources/config/equipment.json').find(item=>item.id==='totem_of_undying');
ui.refreshBackpack([{...totem,kind:'equipment'}],true);flush();
assert.equal(ui.backpackSlots[0].icon.spriteFrame.name,totem.icon);
ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_START)();
assert.equal(ui.equipmentTooltip.active,true);assert.equal(ui.equipmentTooltipTitle.string,'不死图腾');
assert.match(ui.equipmentTooltipText.string,/200生命/);assert.match(ui.equipmentTooltipText.string,/5秒/);
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
ui.node.getChildByName('debugToggle').events.get(Node.EventType.TOUCH_END)();flush();
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
  assert.equal(ui.equipmentTooltipTitle.string,item.name);assert.match(ui.equipmentTooltipText.string,/35%暴击率/);
  ui.backpackSlots[0].node.events.get(Node.EventType.TOUCH_CANCEL)();
  ui.showEquipment([item],true,0);flush();assert.equal(ui.equipmentSlots[0].icon.spriteFrame.name,item.icon);
  const count=grants.length;ui.refreshBackpack([],false);grant.events.get(Node.EventType.TOUCH_END)();assert.equal(grants.length,count);
}
const clickDebugTab=tab=>ui.debugPanel.getChildByName('debugTab_'+tab).events.get(Node.EventType.TOUCH_END)();
const clickDebug=name=>ui.debugContent.getChildByName(name).events.get(Node.EventType.TOUCH_END)();
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

assert.equal(ui.combatStatsPanel.active,false,'unit details temporarily replace statistics');
ui.showUnitDetail({...warriorDetail,skillName:'黑炎 · 150物理伤害',skillDescription:'造成150点物理伤害，每秒造成最大生命值2%的真实伤害。'});
assert.match(ui.unitDetail.string,/<color=#ff9740>150点物理伤害<\/color>/);
assert.match(ui.unitDetail.string,/<color=#ffffff>2%的真实伤害<\/color>/);
assert.equal(ui.unitDetail.handleTouchEvent,false);
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
assert.equal(ui.unitStats[3].string,'2.5');assert.equal(pending.length,0,'live detail refresh does not reload portraits or stars');
ui.showUnitDetail(warriorDetail);
assert.equal(ui.hpMeter.fill.fillStart,0);assert.equal(ui.manaMeter.fill.fillStart,0,'detail bars also begin at the left');
assert.equal(ui.hpMeter.value.string,'350 / 700');assert.equal(ui.unitStats[4].string,'1格');assert.equal(ui.unitStats[4].node.position.y,158);
assert.deepEqual(ui.unitStats.slice(0,4).map(l=>l.string),['55','30','20','1']);
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
const boardUnit=new UnitView();boardUnit.node=new Node('boardUnit');boardUnit.setup('warrior',0,2,56,'warrior',undefined,1.3);
const boardBody=boardUnit.bodySprite.node, boardSize=boardBody.getComponent(UITransform).contentSize;
assert.deepEqual(boardSize,{width:56*1.3,height:56*1.3},'board portraits occupy 1.3 display cells');
assert.ok(Math.abs(boardBody.position.y-boardSize.height/2+56*.82/2)<1e-8,'enlarging preserves the original foot position');
assert.ok(boardUnit.hpBarBg.position.y>boardBody.position.y+boardSize.height/2,'health bar stays above the enlarged portrait');
unitView.setEquipment([guinsoo,guinsoo,guinsoo]);flush();
assert.equal(unitView.equipmentIcons.length,3);
for(const icon of unitView.equipmentIcons) {
 assert.equal(icon.parent,unitView.hpBarBg);assert.equal(icon.position.y,-17);
 assert.equal(icon.getComponent(UITransform).contentSize.width,12);assert.ok(icon.getComponent(Sprite).spriteFrame);
}
unitView.setEquipment([]);assert.equal(unitView.equipmentIcons.length,0);
unitView.sync({hp:10,maxHp:100,mana:0,maxMana:0,shield:10,untargetable:true},{x:0,y:0},64,0);
assert.equal(unitView.shieldRing.active,true);assert.equal(unitView.bodyOpacity.opacity,80);
unitView.sync({hp:10,maxHp:100,mana:0,maxMana:0,shield:0,untargetable:false},{x:0,y:0},64,0);
assert.equal(unitView.shieldRing.active,false);assert.equal(unitView.bodyOpacity.opacity,255);
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
