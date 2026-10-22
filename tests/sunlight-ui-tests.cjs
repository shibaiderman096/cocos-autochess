const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript');
const {load,Node,Sprite,Label,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.join(__dirname,'../assets/scripts/battle/Traits.ts'));
const trait=require('../assets/resources/config/battle.json').traits.find(t=>t.id==='sunlight'),roster=require('../assets/resources/config/units.json');
const {UNIT_PORTRAIT}=load(path.join(__dirname,'../assets/scripts/view/ArtPaths.ts'));
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();};
const offers=trait.members.map(id=>({...roster.find(u=>u.id===id),unitId:id,price:1,poolLeft:10}));
const framePath=id=>UNIT_PORTRAIT[id];
// Before any head textures are cached, reuse every slot while the old requests are pending.
ui.refreshShop(offers.slice(0,5));ui.refreshShop(offers.slice(5));flush();
ui.shopSlots.forEach((card,i)=>assert.equal(card.portrait.spriteFrame.name,framePath(offers[5+i].unitId),'old portrait callback cannot replace a reused slot'));
for(const count of [1,3,5,7,10]){
 const state=resolveTraits([trait],trait.members.slice(0,count),roster)[0];ui.refreshTraits([state],roster);flush();
 ui.traitPanel.rows.getChildByName('trait_sunlight').events.get('end')();
 const loadingIntro=[...ui.traitPanel.detail.getChildByName('sunlightDescription').components.values()].find(c=>c.string!==undefined);
 assert.ok(!loadingIntro.string.includes('<img'),'do not reference icons before their frames load');flush();
 const card=ui.traitPanel.detail,rows=card.children.filter(n=>n.name==='sunlightBreakpoint');assert.equal(rows.length,4);
 const size=card.getComponent(UITransform).contentSize;
 for(const n of [...rows,...card.children.filter(n=>n.name.startsWith('traitOwner_'))])assert.ok(Math.abs(n.position.y)+n.getComponent(UITransform).contentSize.height/2<=size.height/2);
 assert.equal(card.children.filter(n=>n.name.startsWith('traitOwner_')).length,10);
 for(const id of trait.members)assert.equal(card.getChildByName(`traitOwner_${id}`).children.find(n=>n.getComponent(Sprite)).getComponent(Sprite).spriteFrame.name,UNIT_PORTRAIT[id]);
 const intro=[...card.getChildByName('sunlightDescription').components.values()].find(c=>c.string!==undefined);
 assert.equal(intro.string.replace(/<[^>]+>/g,''),trait.description,'intro comes from the configured description');
 assert.ok(intro.string.includes("src='sun_shield'"));
 for(const row of rows){const effect=[...row.getChildByName('sunlightEffect').components.values()].find(c=>c.string!==undefined);assert.ok(effect.string.includes('<img'),'every tier has inline icons, including inactive tiers');assert.ok(effect.imageAtlas.spriteFrames.sun_hp);}
 const text=rows.flatMap(r=>r.children.flatMap(n=>[...n.components.values()].map(c=>c.string??''))).join('\n').replace(/<[^>]+>/g,'').replace(/\s/g,'');
 for(const expected of ['20%','35%','50%','300%','100%','12秒','200真实伤害','1000＋目标最大生命值10%','眩晕1秒','每1秒随机审判1名敌人'])assert.ok(text.includes(expected),expected);
 assert.doesNotMatch(text,/破盾|未受审判|1\.5秒|5%的真实|秒后开始/);
 ui.traitPanel.hideDetail();assert.equal(ui.traitPanel.detail,null);
}
// Closing or changing cards while images load never restores a stale card.
ui.traitPanel.rows.getChildByName('trait_sunlight').events.get('end')();ui.traitPanel.hideDetail();flush();assert.equal(ui.traitPanel.detail,null);
assert.equal(trait.description,'日辉棋子获取太阳的力量。战斗开始时，日辉棋子获得护盾。');
assert.equal(trait.glyph,'日','badge uses the same single-character convention as other traits');
// Shop cards reuse the same cropped heads as trait owners, including slot reuse and buying.
for(let page=0;page<2;page++){
 ui.refreshShop(offers.slice(page*5,page*5+5));flush();
 ui.shopSlots.forEach((card,i)=>assert.equal(card.portrait.spriteFrame.name,framePath(offers[page*5+i].unitId)));
}
let bought;ui.onBuy=slot=>bought=slot;ui.setShopVisible(true);ui.shopSlots[2].node.events.get('end')();assert.equal(bought,2);
ui.refreshShop(offers.slice(0,5));ui.refreshShop(offers.slice(5));flush();
ui.shopSlots.forEach((card,i)=>assert.equal(card.portrait.spriteFrame.name,framePath(offers[5+i].unitId),'old portrait callback cannot replace a reused slot'));
ui.refreshShop([]);flush();assert.ok(ui.shopSlots.every(card=>!card.portrait.node.active&&card.portrait.spriteFrame===null));
ui.refreshCombatStats([{id:-3,name:'日辉羁绊',side:0,star:3,sourceKind:'sunlightJudgment',damage:200,taken:0,healing:0,shielding:0,damageByType:{physical:0,magic:0,true:200},takenByType:{physical:0,magic:0,true:0}}]);
assert.equal(ui.combatStatBars[0].name.string,'日辉羁绊 3★');assert.equal(ui.combatStatBars[0].value.string,'200');
ui.refreshCombatStats([{id:-3,name:'日辉羁绊',side:0,star:4,sourceKind:'sunlightJudgment',damage:1234,taken:0,healing:0,shielding:0,damageByType:{physical:0,magic:0,true:1234},takenByType:{physical:0,magic:0,true:0}}]);
assert.equal(ui.combatStatBars[0].name.string,'日辉羁绊 4★');assert.equal(ui.combatStatBars[0].value.string,'1234');
for(const metric of ['taken','healing']){ui.combatStatMetric=metric;ui.renderCombatStats();assert.ok(ui.combatStatBars.every(b=>!b.node.active));}
// Exercise actual vector timelines with an instrumented renderer, without a Cocos runtime.
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}}
class G {constructor(){this.ops=[];}clear(){this.ops=[];}moveTo(...v){this.ops.push(['move',...v]);}lineTo(...v){this.ops.push(['line',...v]);}ellipse(...v){this.ops.push(['ellipse',...v]);}arc(...v){this.ops.push(['arc',...v]);}rect(...v){this.ops.push(['rect',...v]);}fill(){this.ops.push(['fill']);}stroke(){this.ops.push(['stroke']);}}
class N {isValid=true;active=true;children=[];position=new V();constructor(name){this.name=name;}addChild(n){this.children.push(n);}addComponent(T){return new T();}setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new V(x,y,z);}setScale(x,y,z){this.scale=[x,y,z];}destroy(){this.isValid=false;}}
const out={},cc={Node:N,Graphics:G,Color:class{constructor(...v){this.values=v;}},UITransform:class{setContentSize(){}},Vec3:V};
new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/scripts/view/SunlightVfx.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(id=>{assert.equal(id,'cc');return cc;},out);
const root=new N('root'),owner=new N('owner'),fx=new out.SunlightVfx(root,50,50,(x,y)=>new V(x*50,y*25),()=>owner);
const base={t:'sun_pulse',tick:10,id:1,effect:'burst',center:{x:2,y:2},radius:1,duration:1};
for(const effect of ['shield','burst','judgment','warning','formation','board','prayer','bolt','slash','flare']){
 fx.play({...base,effect,from:{x:0,y:0}});fx.update(15);const slot=fx.slots.find(s=>s.pulse);assert.ok(slot.graphics.ops.length>0,effect);
 assert.doesNotMatch(JSON.stringify(slot.graphics.ops),/null|NaN/);const before=JSON.stringify(slot.graphics.ops);fx.update(15);assert.equal(JSON.stringify(slot.graphics.ops),before,'pause preserves timeline');fx.clear();
}
for(const effect of ['bolt','slash'])for(const [x,y] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
 fx.play({...base,effect,center:{x,y},from:{x:0,y:0}});fx.update(12);assert.equal(fx.slots[0].node.angle,Math.atan2(y*25,x*50)*180/Math.PI);fx.clear();
}
fx.play({...base,effect:'shield'});owner.setPosition(44,88,0);fx.update(15);assert.deepEqual(fx.slots[0].node.position,owner.position);
fx.update(30);assert.ok(fx.slots.every(s=>!s.pulse&&!s.node.active));
for(let i=0;i<110;i++)fx.play(base);assert.equal(fx.slots.length,96);fx.clear();fx.play(base);assert.equal(fx.slots.length,96);assert.equal(fx.slots[0].node.angle,0);fx.destroy();assert.equal(fx.slots.length,0);
// Exercise the production persistent animation method at fixed replay timestamps.
const sourceFile=ts.createSourceFile('UnitView.ts',fs.readFileSync(path.join(__dirname,'../assets/scripts/view/UnitView.ts'),'utf8'),ts.ScriptTarget.ES2020,true);
const method=sourceFile.statements.find(ts.isClassDeclaration).members.find(m=>m.name?.getText(sourceFile)==='animateSunlight').getText(sourceFile);
const Op=class{},Animation=new Function('Graphics','UIOpacity','Color',ts.transpileModule(`class Animation {${method}};return Animation;`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)(G,Op,cc.Color);
const a=new Animation();a.unitId=2;a.cellSize=56;
const aura=new N('shield'),g=new G(),opacity={};
aura.getComponent=T=>T===G?g:opacity;a.sunlightAura=aura;
const state=()=>JSON.stringify([g.ops,aura.scale,opacity]);
a.animateSunlight(10,50);const initial=state();a.animateSunlight(10,50);assert.equal(state(),initial,'pause freezes shield sparks');
a.animateSunlight(20,50);assert.notEqual(state(),initial,'shield animation advances with replay ticks');
aura.active=false;const hidden=state();a.animateSunlight(40,50);assert.equal(state(),hidden,'inactive/dead effects stay dormant');
assert.ok(fs.readFileSync(path.join(__dirname,'../assets/scripts/view/BattleReplayer.ts'),'utf8').includes('uv.animateSunlight?.(this.renderTick,this.tickMs,this.cellSize)'),'real replay calls persistent animation');
console.log('PASS sunlight UI/VFX: four fitted tier rows, ten portraits, accurate numerical copy, open/close, all ten effects, eight travel directions, replay pause/expiry/follow, bounded pool and reset');
