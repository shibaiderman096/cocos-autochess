require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const card=cfg.getUnit('iron_golem');
assert.deepEqual([card.cost,card.role,card.atkSpeed,card.startMana,card.maxMana],[4,'tank',.6,20,60]);
const {EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts');
const {buildEnemyCandidates}=require('../assets/scripts/core/EnemyCandidates.ts');
const model=new EnemyPowerModel(require('../assets/resources/config/enemy-power.json'));
const candidates=buildEnemyCandidates(10,'normal',cfg.allUnits(),model,require('../assets/resources/config/enemy-difficulty.json'));
assert.ok(candidates.candidates.some(c=>c.unitId==='iron_golem'&&c.power>0),'uncalibrated new units use explicit cost fallback in enemy roster');
function make(star=1,reverse=false){
 const source={cfg:{...card,critChance:0},star,side:0,x:2,y:2};
 const target={cfg:{...cfg.getUnit('warrior'),hp:100000,atk:160,armor:100,range:1,critChance:0},side:1,x:3,y:2};
 const sim=new BattleSim(cfg,reverse?[target,source]:[source,target]);
 const src=sim.units.find(u=>u.side===0),dst=sim.units.find(u=>u.side===1);
 src.mana=src.cfg.maxMana;dst.atkCd=10000;dst.moveCd=10000;return {sim,src,dst};
}
for(const star of [1,2,3])for(const reverse of [false,true]){
 const {sim,src,dst}=make(star,reverse);sim.step();assert.equal(sim.events.find(e=>e.t==='cast').duration,.3);
 for(let i=0;i<5;i++)sim.step();assert.equal(sim.events.filter(e=>e.t==='hit'||e.t==='guard').length,0);
 // An enemy attack queued on the completion tick must see the new guard, in either unit order.
 dst.atkCd=0;sim.step();assert.equal(sim.tick,7);
 const raw=[250,400,1500][star-1];
 assert.equal(sim.events.find(e=>e.t==='hit'&&e.id===dst.id).dmg,Math.round(raw/2));
 const reduction=[.3,.4,.6][star-1],duration=[3,4,6][star-1];
 assert.equal(sim.events.find(e=>e.t==='hit'&&e.id===src.id).dmg,Math.round(160*(1-reduction)/(1+src.cfg.armor/100)));
 assert.equal(sim.events.find(e=>e.t==='knockup').duration,.5);
 assert.equal(src.guardUntilTick,7+duration*20);assert.equal(src.damageReductionAt(sim.tick),reduction);
 assert.equal(src.damageReductionAt(src.guardUntilTick),0);assert.equal(src.cfg.damageReduction,0,'base config stays unchanged');
 dst.atkCd=0;src.atkCd=10000;
 while(sim.tick<17)sim.step();
 assert.equal(sim.events.filter(e=>e.t==='attack'&&e.id===dst.id&&e.tick>7).length,0);
 sim.step();assert.equal(sim.events.find(e=>e.t==='attack'&&e.id===dst.id&&e.tick>7).tick,18);
 const end=src.guardUntilTick;dst.atkCd=10000;while(sim.tick<end-1)sim.step();dst.atkCd=0;sim.step();
 assert.equal(sim.events.filter(e=>e.t==='hit'&&e.id===src.id).at(-1).dmg,Math.round(160/(1+src.cfg.armor/100)),'guard expires at exact tick');
}
const refresh=make();for(let i=0;i<7;i++)refresh.sim.step();const old=refresh.src.guardUntilTick;
refresh.src.mana=refresh.src.cfg.maxMana;refresh.src.atkCd=0;for(let i=0;i<7;i++)refresh.sim.step();
assert.equal(refresh.src.guardReduction,.3);assert.ok(refresh.src.guardUntilTick>old,'recast refreshes without stacking');
assert.deepEqual(make().sim.run(),make().sim.run());
console.log('PASS iron golem: cast, configured damage, knockup, all-star guard, completion order, exact expiry, refresh and determinism');
