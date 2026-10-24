const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const active=new Map();
class Opacity {opacity=255;}
class Node {
 constructor(){this.position={x:-20,y:-281,z:0};this.opacity=new Opacity();}
 getComponent(){return this.opacity;}
 setPosition(x,y,z){assert.ok(!this.destroyed,'animation must never touch a destroyed old panel');this.position={x,y,z};}
 setScale(x,y,z){this.scale={x,y,z};}
}
const cc={Node,UIOpacity:Opacity,Tween:{stopAllByTarget:target=>active.delete(target)},tween:target=>({to(_duration,props,options){this.props=props;this.options=options;return this;},start(){active.set(target,this.options.onUpdate);return this;}})};
const out={},code=ts.transpileModule(fs.readFileSync(path.resolve('assets/scripts/ui/ShopDockPopup.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function('require','exports',code)(()=>cc,out);
const popup=new out.ShopDockPopup(),first=new Node();popup.play(first,'shop:1');
assert.equal(first.position.y,-309);assert.equal(first.opacity.opacity,0);assert.equal(active.size,1);
let [target,update]=[...active][0];target.value=.4;update();
const currentY=first.position.y;popup.clear(false);first.destroyed=true;
const purchased=new Node();popup.play(purchased,'shop:1');
assert.equal(purchased.position.y,currentY,'buy/rebuild keeps the current entrance progress');assert.equal(active.size,1,'same content does not create a second entrance');
target.value=1;update();assert.equal(purchased.position.y,-281);assert.equal(purchased.scale.x,1);assert.equal(purchased.opacity.opacity,255);
popup.clear();assert.equal(active.size,0);purchased.destroyed=true;update();
const next=new Node();popup.play(next,'trait:1');assert.equal(next.opacity.opacity,0);assert.equal(active.size,1,'new content gets a new entrance');
popup.clear();assert.equal(active.size,0);
console.log('PASS dock popup: real movement/fade/scale state, purchase rebuild continuity, new-content entrance and cleanup without stale-node writes');
