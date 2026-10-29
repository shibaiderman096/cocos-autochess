require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {maxHealthArtworkScale}=require('../assets/scripts/view/UnitHealthScale.ts');
const base={id:'tank',name:'tank',role:'tank',hp:1000,atk:1,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:6,startMana:0,maxMana:0,manaPerHit:0};
function fixture(options={},traits=[]){
 const cfg=new ConfigManager();cfg.setBattle({...require('../assets/resources/config/battle.json'),traits});
 cfg.setEquipment(require('../assets/resources/config/equipment.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
 const sim=new BattleSim(cfg,[{cfg:base,side:0,x:2,y:2,...options},{cfg:{...base,id:'enemy',role:'caster'},side:1,x:4,y:2}],{seed:17});
 return {cfg,sim,unit:sim.units[0]};
}
for(const role of ['tank','magicTank','frontline'])for(const [extra,expected]of [[0,1],[1000,1.5],[3000,2]]){
 const {unit}=fixture({cfg:{...base,role},permanentMaxHp:extra});const snap=unit.snapshot();
 assert.equal(snap.baseMaxHp,1000);assert.equal(maxHealthArtworkScale(snap.role,snap.baseMaxHp,snap.maxHp),expected);
 unit.hp=1;unit.shield=9000;assert.equal(maxHealthArtworkScale(snap.role,unit.baseMaxHp,unit.snapshot().maxHp),expected,'current HP and shields do not change size');
}
for(const star of [1,2,3]){
 const first=fixture({star}),baseline=first.unit.baseMaxHp;
 const grown=fixture({star,permanentMaxHp:baseline});assert.equal(grown.unit.cfg.hp,baseline*2);assert.equal(maxHealthArtworkScale('tank',baseline,grown.unit.cfg.hp),1.5,'same-star health is the baseline');
}
for(const role of ['warrior','caster','marksman','assassin',undefined])assert.equal(maxHealthArtworkScale(role,1000,4000),1,'growth applies to tanks only');
for(const [baseHp,maxHp]of [[0,1000],[NaN,1000],[1000,Infinity],[1000,900]])assert.equal(maxHealthArtworkScale('tank',baseHp,maxHp),1);
const equipped=fixture({permanentMaxHp:1000,equipment:['forest_sanctuary']});
const forest=equipped.cfg.getEquipment(['forest_sanctuary'])[0];
assert.equal(equipped.unit.cfg.hp,Math.round((2000+forest.hp)*(1+forest.maxHpBonus)));
assert.equal(equipped.unit.baseMaxHp,1000,'flat and percentage gear do not redefine base health');
assert.ok(maxHealthArtworkScale('tank',1000,equipped.unit.cfg.hp)>1.5);
const faction={id:'life',name:'life',glyph:'生',description:'fixture',members:['tank'],breakpoints:[{count:1,tier:'bronze',stats:{maxHpBonus:1}}]};
const trait=fixture({},[faction]);assert.equal(trait.unit.cfg.hp,2000);assert.equal(trait.unit.baseMaxHp,1000);
assert.equal(maxHealthArtworkScale('tank',1000,trait.unit.snapshot().maxHp),1.5);
const active=fixture({cfg:{...base,skillId:'blood_sovereignty',startMana:0,maxMana:50}});
active.sim.bloodReign.cast(active.unit,active.cfg.getSkill('blood_sovereignty'));
assert.ok(active.unit.cfg.hp>1000);assert.equal(active.unit.baseMaxHp,1000);assert.ok(maxHealthArtworkScale('tank',1000,active.unit.snapshot().maxHp)>1);
active.sim.end(0);assert.equal(active.unit.cfg.hp,1000);assert.equal(maxHealthArtworkScale('tank',1000,active.unit.snapshot().maxHp),1,'battle-local growth shrinks back on settlement');

// Exercise the actual renderer method, including shrink-back and existing airborne offsets.
const source=ts.createSourceFile('UnitView.ts',fs.readFileSync('assets/scripts/view/UnitView.ts','utf8'),ts.ScriptTarget.ES2020,true);
const cls=source.statements.find(ts.isClassDeclaration),method=cls.members.find(m=>m.name?.getText(source)==='setMaxHealthAppearance').getText(source);
const View=new Function('maxHealthArtworkScale',ts.transpileModule(`class V {healthScale=1;portraitHeight=80;equipmentIcons=[];${method}};return V;`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)(maxHealthArtworkScale);
class Node {constructor(y=0){this.position={x:0,y,z:0};this.scale={x:1,y:1,z:1};}setPosition(x,y,z){this.position={x,y,z};}setScale(x,y,z){this.scale={x,y,z};}}
const view=new View(),body=new Node(20),bar=new Node(50),star=new Node(85),icon=new Node(33),ring=new Node(20),root=new Node(100);
Object.assign(view,{bodySprite:{node:body},bodyBaseY:20,hpBarBg:bar,starBadge:star,equipmentIcons:[icon],shieldRing:ring,node:root});
const feet=()=>body.position.y-80*body.scale.y/2;
for(const [maxHp,scale]of [[2000,1.5],[4000,2],[1000,1],[2000,1.5]]){
 view.setMaxHealthAppearance('tank',1000,maxHp);assert.equal(body.scale.y,scale);assert.equal(feet(),-20,'art stays grounded while growing/shrinking');
 assert.equal(bar.position.y,50+80*(scale-1));assert.equal(star.position.y,85+80*(scale-1));assert.equal(icon.position.y,33+80*(scale-1));
 assert.equal(root.scale.x,1,'movement, input and formation root do not grow');assert.equal(bar.scale.x,1,'vitals remain readable at their original size');
}
body.position.y+=30;view.setMaxHealthAppearance('tank',1000,4000);assert.equal(feet(),10,'airborne offset survives a maximum-health change');
view.setMaxHealthAppearance('caster',1000,4000);assert.equal(body.scale.x,1);
console.log('PASS tank health sizing: exact +100%/+300% milestones, physical/magic tanks, same-star base, permanent items/gear/traits/active growth, HP/shield exclusion, settlement shrink, grounded art, readable UI and independent root');
