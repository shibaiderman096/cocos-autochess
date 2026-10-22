const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const pending=[];
class Component {isValid=true;enabledInHierarchy=true;getComponent(T){return this.node.getComponent(T);}}
class Sprite {}
class Animation {isValid=true;addClip(c){this.clip=c;}play(){this.played=true;}pause(){this.paused=true;}resume(){this.paused=false;}stop(){this.stopped=true;}removeClip(c,force){assert.equal(c,this.clip);assert.equal(force,true);this.removed=true;}}
class AnimationClip {static WrapMode={Loop:2};static createWithSpriteFrames(frames,sample){const c=new AnimationClip();c.frames=frames;c.sample=sample;c.duration=frames.length/sample;return c;}destroy(){this.destroyed=true;}}
const cc={Component,Sprite,Animation,AnimationClip,_decorator:{ccclass:()=>c=>c}};
const out={};const source=fs.readFileSync(path.join(__dirname,'../assets/scripts/view/SkyBackgroundAnimation.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
const skin={node:{layer:1<<30}};
new Function('require','exports',code)(id=>id==='cc'?cc:id==='./ArtPaths'?{SKY_BACKGROUND_SPRITE:{loop:'art/arena/sky_islands_30/spriteFrame'}}:id==='./ArtSpriteLoader'?{loadArtSprite:(p,cb)=>pending.push({p,cb})}:{setUISkin:()=>skin},out);
out.setSkyBackground({layer:1<<25},{},{});assert.equal(skin.node.layer,1<<25,'2D background must be invisible to the DEFAULT-only 3D RT camera');
function make(){const s=new Sprite(),components=new Map([[Sprite,s]]),node={getComponent:T=>components.get(T),addComponent:T=>{assert.ok(!components.has(T));const c=new T();components.set(T,c);return c;}};const c=new out.SkyBackgroundAnimation();c.node=node;return {c,s,components};}
for(let round=0;round<20;round++){
 const {c,s,components}=make();c.start();assert.equal(pending.length,30);
 const requests=pending.splice(0);requests.reverse().forEach(({p,cb})=>{assert.match(p, /#\d+,5,6$/);cb(null,{index:Number(p.match(/#(\d+)/)[1])});});
 const a=components.get(Animation),clip=a.clip;assert.equal(clip.duration,2);assert.equal(clip.sample,15);assert.equal(clip.wrapMode,2);
 assert.deepEqual(clip.frames.map(x=>x.index),Array.from({length:30},(_,i)=>i));assert.equal(s.spriteFrame.index,0);assert.ok(a.played);
 c.onDisable();assert.ok(a.paused);c.onEnable();assert.equal(a.paused,false);c.onDestroy();assert.ok(a.stopped&&a.removed&&clip.destroyed);
}
const late=make();late.c.start();late.c.onDestroy();pending.splice(0).forEach(x=>x.cb(null,{}));assert.equal(late.components.has(Animation),false);
const failed=make();failed.c.start();const requests=pending.splice(0);const oldWarn=console.warn;let warnings=0;console.warn=()=>warnings++;
try {requests.forEach(x=>x.cb(new Error('missing atlas')));}finally{console.warn=oldWarn;}
assert.equal(warnings,1);assert.equal(failed.components.has(Animation),false);
const root=path.join(__dirname,'..'),atlas=fs.readFileSync(path.join(root,'assets/resources/art/arena/sky_islands_30.png'));
assert.deepEqual([atlas.readUInt32BE(16),atlas.readUInt32BE(20)],[3200,2160]);
assert.deepEqual(atlas,fs.readFileSync(path.join(root,'art-source/sky-islands-30-v2/runtime-atlas.png')),'runtime uses the accepted drawn 30-frame atlas');
assert.deepEqual(fs.readFileSync(path.join(root,'assets/resources/art/arena/sky_islands_30_poster.png')),fs.readFileSync(path.join(root,'art-source/sky-islands-30-v2/animation/frames/frame-00.png')),'loading poster exactly matches first frame');
const qa=JSON.parse(fs.readFileSync(path.join(root,'art-source/sky-islands-30-v2/finish-qa.json'),'utf8'));
assert.equal(qa.frames,30);assert.equal(new Set(qa.pixel_hashes).size,30,'30 distinct phases, no repeated holds');
assert.equal(qa.protected_core_max_delta,0,'fixed island cores cannot shimmer');
assert.ok(qa.wrap_ratio<=1&&qa.all_30_rgb_mae_steps.every(step=>step>0&&step<=3),'all transitions and wrap are bounded');
console.log('PASS sky background: 30 ordered native clip frames, 15fps/2s, 20 enter/disable/resume/destroy cycles, async teardown, failure fallback, exact source atlas/poster');
