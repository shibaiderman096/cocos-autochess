const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const pending=[];
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}}
class N {
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.position=new V();}
 addChild(n){n.parent=this;this.children.push(n);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
 setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new V(x,y,z);}setScale(x,y,z){this.scale=new V(x,y,z);}destroy(){this.isValid=false;}
}
class S {static SizeMode={CUSTOM:1};}class U {setContentSize(width,height){this.contentSize={width,height};}}class O {opacity=255;}
const cc={Node:N,Sprite:S,UITransform:U,UIOpacity:O,Vec3:V};
function load(file,imports){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText)(id=>id==='cc'?cc:imports[id]??{},out);return out;}
const {astralSprite}=load('assets/scripts/view/AstralArt.ts',{'./ArtSpriteLoader':{loadArtSprite:(path,cb)=>pending.push(()=>cb(null,{path}))}});
const {FX_SPRITE}=require('tsx/cjs')&&require('../assets/scripts/view/ArtPaths.ts');
const {AstralUnitVfx}=load('assets/scripts/view/AstralUnitVfx.ts',{'./AstralArt':{astralSprite},'./ArtPaths':{FX_SPRITE}});
const project=(x,y)=>new V(x*50,y*30),root=new N('fx'),target=new N('target');target.setPosition(100,90,0);
const fx=new AstralUnitVfx(root,50,50,project,()=>target,id=>id===1?'stellar_bulwark':'milu_star_leap');
const dash={t:'dash',tick:1,id:1,from:{x:2,y:3},to:{x:4,y:3},durationTicks:6};
const jump={t:'teleport',tick:1,id:2,from:{x:5,y:2},to:{x:6,y:2}};
const impact={t:'skill_impact',tick:1,id:2,target:3,skillId:'milu_star_leap'};
fx.play(dash);fx.play(jump);fx.play(impact);while(pending.length)pending.shift()();fx.update(3);
assert.equal(fx.slots.length,3);assert.ok(fx.slots.every(s=>s.sprite.node.active&&s.sprite.spriteFrame));
const snapshot=()=>JSON.stringify(fx.slots.map(s=>({position:s.sprite.node.position,scale:s.sprite.node.scale,angle:s.sprite.node.angle,opacity:s.sprite.node.getComponent(O).opacity})));
const before=snapshot();fx.update(3);assert.equal(snapshot(),before,'pause freezes every effect transform');
assert.equal(fx.slots.find(s=>s.path===FX_SPRITE.miluStarTrail).sprite.node.angle,0,'trail follows projected movement vector');
fx.play({t:'teleport',tick:3,id:1,from:{x:3,y:3},to:{x:2,y:3}});assert.equal(fx.slots.filter(s=>s.motion?.source===1).length,0,'interrupted guard rush clears');
fx.play({t:'death',tick:3,id:2});assert.ok(fx.slots.every(s=>!s.motion));
for(let i=0;i<20;i++){fx.play({...dash,tick:i*20});fx.play({...jump,tick:i*20});fx.play({...impact,tick:i*20});fx.update(i*20+15);}
assert.equal(fx.slots.length,3,'same-scene casts reuse native-alpha sprite nodes');
fx.play({...impact,tick:401});fx.play({t:'end',tick:401,winner:0});fx.update(402);assert.ok(fx.slots.every(s=>!s.motion&&!s.sprite.node.active));
fx.play({...impact,tick:402});assert.ok(fx.slots.every(s=>!s.motion),'settled scene cannot restart effects');
const late=new AstralUnitVfx(root,50,50,project,()=>target,()=> 'milu_star_leap');late.play(impact);const node=late.slots[0].sprite.node;late.destroy();while(pending.length)pending.shift()();assert.equal(node.isValid,false);assert.equal(late.slots.length,0);
console.log('PASS Astral painted unit effects: correct assets and trajectory, pause/expiry, guard interruption, death/end, fixed pool reuse and asynchronous destroy cleanup');
