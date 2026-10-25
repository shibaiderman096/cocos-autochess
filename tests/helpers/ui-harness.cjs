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
  static EventType = { TOUCH_START:'start', TOUCH_END:'end', TOUCH_MOVE:'move', TOUCH_CANCEL:'cancel', MOUSE_ENTER:'enter', MOUSE_LEAVE:'leave', MOUSE_WHEEL:'wheel' };
  addChild(n) { n.parent=this; this.children.push(n); }
  removeFromParent() { if(this.parent) this.parent.children=this.parent.children.filter(n=>n!==this); this.parent=null; }
  getChildByName(name) { return this.children.find(n=>n.name===name); }
  addComponent(T) {
    if(T===Graphics&&!this.getComponent(UITransform)) this.addComponent(UITransform).setContentSize(100,100);
    const c=new T(); c.node=this; if(!this.components.has(T)) this.components.set(T,c); return c;
  }
  getComponent(T) { return this.components.get(T); }
  setPosition(x,y,z) { this.position={x,y,z}; }
  setScale(x,y,z) { this.scale={x,y,z}; }
  setRotationFromEuler(x,y,z) { this.rotation={x,y,z}; }
  setSiblingIndex(i) { const list=this.parent.children; list.splice(list.indexOf(this),1); list.splice(i,0,this); }
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
    if(frame?.name?.startsWith('art/equipment/')&&this.sizeMode!==Sprite.SizeMode.CUSTOM) this.node.getComponent(UITransform).setContentSize(64,64);
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
class Label { static HorizontalAlign={LEFT:0,CENTER:1,RIGHT:2}; static VerticalAlign={TOP:0}; static Overflow={CLAMP:1,RESIZE_HEIGHT:3}; updateRenderData() {
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
class Vec3 { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} }
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
const cc={Node,UITransform,Sprite,Label,LabelOutline:class LabelOutline{},RichText,Color,Graphics,Mask,ScrollView,Vec2,Vec3,Rect,Size,UIOpacity:class{},BlockInputEvents:class{},Tween:class{static stopAllByTarget(){}},SpriteFrame:class{},SpriteAtlas:class{spriteFrames={};},JsonAsset:class{},Component:class{isValid=true},
  tween:target=>({to(_seconds,props,options){this.props=props;this.options=options;return this;},start(){Object.assign(target,this.props);this.options?.onUpdate?.();return this;}}),
  input,Input,isValid:(value,strict)=>!!value&&value.isValid!==false&&(!strict||!value.destroyQueued),
  ResolutionPolicy:{EXACT_FIT:0,SHOW_ALL:1},view:{setDesignResolutionSize:(width,height,policy)=>Object.assign(screenSetup,{width,height,policy}),resizeWithBrowserSize:resize=>screenSetup.resize=resize},
  director:{loadScene:(name,callback)=>{sceneLoads.push(name); if(sceneError) callback(sceneError); return sceneAccepted;}},
  resources:{load:(name,T,cb)=>{const finish=()=>cb(null,name.startsWith('config/')?{json:JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/resources',name+'.json'),'utf8'))}:{name,rect:{x:0,y:0,width:/trait_badges|trait_portrait_frames/.test(name)?2172:1536,height:/trait_badges|trait_portrait_frames/.test(name)?724:1024},texture:{}});finish.path=name;pending.push(finish);}},_decorator:{ccclass:()=>c=>c,property:()=>{},executionOrder:()=>c=>c}};
const cache=new Map();
function load(file) {
  file=path.resolve(file); if(cache.has(file)) return cache.get(file);
  const out={}; cache.set(file,out);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
  new Function('require','exports',code)(id=>id==='cc'?cc:load(path.resolve(path.dirname(file),id+'.ts')),out); return out;
}

module.exports={load,Node,Sprite,Label,UITransform,pending};
