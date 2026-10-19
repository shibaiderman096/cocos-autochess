const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
function methods(file,names){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.ES2020,true);const cls=source.statements.find(ts.isClassDeclaration);return cls.members.filter(n=>names.includes(n.name?.getText(source))).map(n=>n.getText(source)).join('\n');}
const stageCode=methods('assets/scripts/view/BattleStage.ts',['refreshOwnedViews']);
const Stage=new Function(ts.transpileModule(`class Stage {${stageCode}}; return Stage;`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)();
for(const phase of ['prepare','battle','settlement']){
 let plays=0;const stage=new Stage();const units=[{uid:1,star:2},{uid:2,star:3}];
 const make=star=>({displayedStar:star,setStar(s){this.displayedStar=s;},playStarUpgrade(){plays++;}});
 Object.assign(stage,{flow:{phase},owned:{all:()=>units,get:uid=>units.find(u=>u.uid===uid)},ownedViews:new Map([[1,make(1)]]),benchViews:new Set([1,2]),boardNode:{getChildByName(){}},bindOwnedTouch(){},cfgUnits(){return[];},ui:{refreshFormation(){}},resetBattle(){this.ownedViews=new Map(units.map(u=>[u.uid,make(u.star)]));},createBenchViews(){this.resetBattle();}});
 stage.refreshOwnedViews();assert.equal(plays,1,'only existing upgraded UID animates in '+phase);
 stage.refreshOwnedViews();assert.equal(plays,1,'ordinary refresh does not replay');
}
const viewCode=methods('assets/scripts/view/UnitView.ts',['playStarUpgrade','update']);
class Node{constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;}addChild(n){this.children.push(n);}addComponent(T){const c=new T();this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}getChildByName(n){return this.children.find(c=>c.name===n);}setPosition(x,y,z){this.position={x,y,z};}destroy(){this.isValid=false;}}
class UITransform{setContentSize(){}}class Graphics{clear(){}ellipse(){}stroke(){}moveTo(){}lineTo(){}close(){}fill(){}}class UIOpacity{}class Label{}class LabelOutline{}class Color{constructor(...rgba){this.rgba=rgba;}}
const V=new Function('Node','UITransform','Graphics','UIOpacity','Label','LabelOutline','Color',ts.transpileModule(`class V {${viewCode}};return V;`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)(Node,UITransform,Graphics,UIOpacity,Label,LabelOutline,Color);
for(const star of [2,3]){const v=new V();Object.assign(v,{node:new Node('unit'),displayedStar:star,cellSize:64});v.playStarUpgrade();const first=v.upgradeEffect;assert.equal(first.getChildByName('upgradeCaption').getComponent(Label).string,star+'星升级');v.update(.8);assert.ok(first.getComponent(UIOpacity).opacity<255);v.playStarUpgrade();assert.equal(first.isValid,false,'retrigger cleans up old effect');const final=v.upgradeEffect;v.update(1.2);assert.equal(final.isValid,false);assert.equal(v.upgradeEffect,null);}
console.log('PASS star upgrade: actual refresh paths, initial/new units excluded, no replay, 2/3 star effects and cleanup');
