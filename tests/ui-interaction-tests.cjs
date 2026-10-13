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
  addComponent(T) { const c=new T(); c.node=this; this.components.set(T,c); return c; }
  getComponent(T) { return this.components.get(T); }
  setPosition(x,y,z) { this.position={x,y,z}; }
  setScale(x,y,z) { this.scale={x,y,z}; }
  setSiblingIndex(i) { const list=this.parent.children; list.splice(list.indexOf(this),1); list.splice(i,0,this); }
  on(type,fn) { this.events.set(type,fn); }
  destroy() { for(const c of this.components.values()) c.isValid=false; for(const n of this.children) n.destroy(); this.parent.children=this.parent.children.filter(n=>n!==this); }
}
class UITransform { setContentSize(width,height) { this.contentSize={width,height}; } }
class Sprite {
  static SizeMode={CUSTOM:0}; static Type={SIMPLE:0,SLICED:1,FILLED:2}; static FillType={HORIZONTAL:0};
  isValid=true;
  set fillRange(v) { if(this.type===2&&!this.spriteFrame) throw Error('filled range before image'); this.range=v; }
  get fillRange() { return this.range; }
}
class Label { static HorizontalAlign={LEFT:0}; static VerticalAlign={TOP:0}; static Overflow={CLAMP:1}; }
class Color {
  constructor(r=0,g=0,b=0,a=255) { Object.assign(this,{r,g,b,a}); }
  fromHEX() {} static WHITE=new Color(255,255,255);
}
class Graphics { isValid=true; clear(){} moveTo(){} lineTo(){} close(){} fill(){} stroke(){} rect(){} ellipse(){} }
const cc={Node,UITransform,Sprite,Label,Color,Graphics,UIOpacity:class{},SpriteFrame:class{},Component:class{},
  resources:{load:(name,T,cb)=>pending.push(()=>cb(null,{name}))},_decorator:{ccclass:()=>c=>c}};
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
ui.refreshTop(20,1,new LevelSystem({level:3,exp:2})); ui.refreshFormation([{unitId:'warrior',location:'board'}]);
ui.refreshShop(Array.from({length:5},()=>({unitId:'warrior',name:'战士',cost:1,price:1,poolLeft:20})));
flush(); assert.equal(ui.expFill.fillRange,2/6,'progress survives asynchronous image loading');
assert.equal(ui.capLabel.node.active,false,'population stays hidden outside a drag');
assert.equal(ui.node.getChildByName('formation'),undefined); assert.equal(ui.node.getChildByName('starLegend'),undefined);
ui.showUnitDetail('战士 · 1星','生命 700\n攻击 55');
assert.ok(ui.unitPanel.position.x>350); assert.equal(ui.node.getChildByName('detailShield'),undefined,'details do not block the board');
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
assert.equal(ui.isInSellArea(SHOP_DROP_AREA.x,SHOP_DROP_AREA.y),false,'combat disables the sale target');
ui.setShopVisible(true); assert.equal(ui.economyControls.active,true);
assert.ok(ui.node.getChildByName('command').position.y<-230);
console.log('PASS actual UI: async XP, non-modal sidebar, drag shop sale/population, cancellation, command exclusion, and combat lock');
