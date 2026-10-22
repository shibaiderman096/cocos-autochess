require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {freshSaveV2}=require('../assets/scripts/core/ShopSave.ts');
const {COST_PRICE}=require('../assets/scripts/core/ShopConfig.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const {load,Node,Label,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.resolve('assets/scripts/ui/BattleUI.ts'));
const inputs=loadRunInputs();
const copy=(uid,star=1,location='bench',unitId='leon')=>({uid,unitId,star,location,x:location==='board'?3:-1,y:location==='board'?3:uid-1,equipment:['forest_sanctuary']});
for(const [units,expected] of [[[],null],[[copy(1)],null],[[copy(1),copy(2,1,'board')],2],
 [[copy(1,2,'board'),copy(2,2),copy(3),copy(4)],3],[[copy(1,3,'board')],null],
 [[copy(1),copy(2,1,'bench','helion')],null]]){
 const owned=new OwnedUnits(units),before=owned.snapshot(),uid=owned.nextUnitUid;
 assert.equal(owned.purchaseUpgradeStar('leon'),expected);assert.deepEqual(owned.snapshot(),before);assert.equal(owned.nextUnitUid,uid);assert.deepEqual(owned.equipmentReserve,[]);
}
let fighting=true;
const deferred=new OwnedUnits([copy(1),copy(2),copy(3)],undefined,()=>!fighting);
assert.equal(deferred.purchaseUpgradeStar('leon'),null,'an existing deferred triple is not earned by another purchase');
assert.equal(deferred.all().length,3,'preview does not flush deferred materials');
const chain=new OwnedUnits([copy(1,2,'board'),copy(2,2),copy(3),copy(4)],undefined,()=>false);
assert.equal(chain.purchaseUpgradeStar('leon'),3);assert.equal(chain.all().length,4);assert.equal(chain.get(1).star,2);
// Exercise the production Stage producer and UI consumer with real purchase/merge transactions.
const source=ts.createSourceFile('BattleStage.ts',fs.readFileSync('assets/scripts/view/BattleStage.ts','utf8'),ts.ScriptTarget.ES2020,true);
const method=source.statements.find(ts.isClassDeclaration).members.find(m=>m.name?.getText(source)==='refreshShopUI').getText(source);
const Stage=new Function('COST_PRICE',ts.transpileModule(`class Stage {${method}};return Stage;`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)(COST_PRICE);
const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
const save=freshSaveV2(3,45,'legacy');save.gold=100;save.shopReserved=true;save.benchSlots=9;
save.owned=[copy(1,1,'board'),copy(2),copy(3,2,'board','helion'),copy(4,2,'bench','helion'),copy(5,1,'bench','helion'),copy(6,1,'bench','helion')];save.owned[2].x=4;
save.shop=[{unitId:'leon'},{unitId:'helion'},{unitId:'saiph'},{unitId:'leon'},{unitId:null}];
const session=new RunSession(cfg,inputs.run,inputs.waves,{save,enemyGenerationMode:'legacy'});
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();ui.setShopVisible(true);
const stage=Object.assign(new Stage(),{shop:session.shop,owned:session.owned,pool:session.pool,unitMap:()=>new Map(cfg.allUnits().map(u=>[u.id,u])),ui});
const flush=()=>{while(pending.length)pending.shift()();};
const hints=()=>ui.shopSlots.map(card=>{const n=card.node.getChildByName('upgradeBadge');return n.active?n.getChildByName('text').getComponent(Label).string:'';});
stage.refreshShopUI();flush();assert.deepEqual(hints(),['★★','★★★','','★★','']);
for(const card of ui.shopSlots){const badge=card.node.getChildByName('upgradeBadge'),size=badge.getComponent(UITransform).contentSize;
 assert.ok(badge.position.x>0&&badge.position.y>0);assert.ok(badge.position.x+size.width/2<=82&&badge.position.y+size.height/2<=52);}
ui.onBuy=slot=>{assert.equal(session.buyShopSlot(slot).ok,true);stage.refreshShopUI();};
ui.shopSlots[0].node.events.get('end')();flush();assert.deepEqual(hints(),['','★★★','','','']);assert.equal(session.owned.onBoard().find(u=>u.unitId==='leon').star,2);
ui.shopSlots[1].node.events.get('end')();flush();assert.deepEqual(hints(),['','','','','']);assert.equal(session.owned.onBoard().find(u=>u.unitId==='helion').star,3);
// Replacing a card, refreshing, selling materials and clearing slots remove stale markers.
session.owned.forceAdd('saiph');session.owned.forceAdd('saiph');stage.refreshShopUI();assert.equal(hints()[2],'★★');
const material=session.owned.all().find(u=>u.unitId==='saiph');session.owned.remove(material.uid);stage.refreshShopUI();assert.equal(hints()[2],'');
session.shop.slots[2].unitId=null;stage.refreshShopUI();assert.equal(hints()[2],'');
console.log('PASS shop upgrade hints: pure merge prediction, board/bench, chained 3-star, deferred safety, real Stage/UI purchase and merge, duplicate offers, material sale, empty/reused slots and top-right bounds');
