require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillDescription,buildSkillStatRows}=require('../assets/scripts/ui/SkillPresentation.ts');
const {validCost,unitPrice,sellPrice,POOL_STOCK}=require('../assets/scripts/core/ShopConfig.ts');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {ShopSystem}=require('../assets/scripts/core/ShopSystem.ts');
const {Rng}=require('../assets/scripts/core/Rng.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const units=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
function config(traits=[]){const cfg=new ConfigManager();cfg.setUnits(structuredClone(units));cfg.setSkills(structuredClone(skills));cfg.setEquipment(require('../assets/resources/config/equipment.json'));cfg.setBattle({...structuredClone(battle),traits,roleMana:{casterPerSecond:0,damageTakenFraction:0}});return cfg;}
const dummy={id:'dummy',name:'dummy',hp:100000,atk:0,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function fixture(star=1,side=0){const cfg=config(),sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit('star_ring_sage'),spellPower:20,physicalPower:999,critChance:0},star,side,x:0,y:3},...[1,2,3,4,5,6].map(x=>({cfg:{...dummy,id:'target'+x},side:1-side,x,y:3})),{cfg:{...dummy,id:'offLine'},side:1-side,x:2,y:2}],{seed:83});sim.units.forEach(u=>u.moveCd=u.atkCd=100000);return {cfg,sim,src:sim.units[0]};}
function step(f,n){for(let i=0;i<n;i++){f.sim.tick++;f.sim.updateUnit(f.src);f.sim.resolveDamage();f.sim.resolveStuns();f.sim.pendingDamage.length=f.sim.pendingStuns.length=0;}}
function cast(f){f.src.atkCd=0;f.src.mana=30;step(f,1);assert.ok(f.src.pendingCast);return f.sim.tick;}
for(const star of [1,2,3])for(const side of [0,1]){
 const f=fixture(star,side),spec=skills.runic_arcana.runicArcana,before=f.src.cfg.spellPower;
 for(let n=1;n<=3;n++){
  const start=cast(f),hits=f.sim.events.filter(e=>e.t==='hit'&&e.source===1).length;
  step(f,7);assert.equal(f.src.runicRunes,n-1);assert.equal(f.sim.events.filter(e=>e.t==='hit'&&e.source===1).length,hits);
  step(f,1);const impact=f.sim.events.filter(e=>e.t==='hit'&&e.source===1).slice(hits);
  assert.equal(impact.length,3);assert.ok(impact.every(e=>e.tick===start+8&&e.dmg===Math.round(skills.runic_arcana.starDamage[star-1]*(1+(before+(n-1)*spec.spellPowerPerRune[star-1])/100))));
  assert.equal(f.src.runicRunes,n);assert.equal(f.src.cfg.spellPower,before+n*spec.spellPowerPerRune[star-1]);
 }
 const start=cast(f);assert.equal(f.src.pendingCast.runicWave,true);step(f,29);assert.equal(f.src.runicRunes,3);assert.equal(f.sim.events.some(e=>e.t==='runic_wave'),false);
 step(f,1);assert.equal(f.src.runicRunes,0);assert.equal(f.src.cfg.spellPower,before);
 const waveHits=f.sim.events.filter(e=>e.t==='hit'&&e.source===1&&e.tick===start+30);
 assert.equal(waveHits.length,6);assert.ok(waveHits.every(e=>e.dmg===Math.round(spec.waveDamage[star-1]*(1+(before+3*spec.spellPowerPerRune[star-1])/100))));
 assert.equal(f.sim.units.at(-1).hp,100000,'off-line target is not hit');
 cast(f);assert.equal(f.src.pendingCast.runicWave,false,'next cycle starts with missiles');
}
for(const interrupt of ['stun','fear','death']){
 const f=fixture();f.src.runicRunes=3;f.src.runicPower=30;f.src.cfg.spellPower+=30;cast(f);f.src.atkCd=100000;
 if(interrupt==='stun')f.src.stunnedUntilTick=f.sim.tick+10;
 if(interrupt==='fear')f.src.fearUntilTick=f.sim.tick+10;
 if(interrupt==='death'){
  f.sim.damage(f.sim.units[1],f.src,1000000,'true',false,false,true);f.sim.resolveDamage();
  assert.equal(f.src.alive,false);assert.equal(f.src.pendingCast,null);f.sim.step();
 }else step(f,1);
 if(interrupt!=='death'){assert.equal(f.src.pendingCast,null);assert.equal(f.src.runicRunes,3);assert.equal(f.src.mana,0);}
 assert.equal(f.sim.events.some(e=>e.t==='runic_wave'),false);
}
// Natural traits, profession exclusion, stable ties, duplicates, equipment grants and battle binding.
const trait=(id,members,count=3,selector)=>({id,name:id,glyph:'X',description:'test',members,selector,breakpoints:[{count,tier:'bronze',power:10}]});
const a=trait('a',['a1','a2','a3','a4']),b=trait('b',['b1','b2','b3']),job=trait('job',[],1,{role:'caster'}),cfg=config([a,b,job]);
const line=ids=>resolveTraits([a,b,job],ids,cfg.allUnits());
assert.equal(line(['a1','a2','star_ring_sage']).find(t=>t.config.id==='a').count,2,'cannot activate a previously inactive faction');
assert.equal(line(['a1','a2','a3','b1','b2','b3','star_ring_sage']).find(t=>t.config.id==='a').count,4,'configuration order wins equal faction counts');
assert.equal(line(['a1','a2','a3','star_ring_sage','star_ring_sage']).find(t=>t.config.id==='a').count,4,'same identity counts once');
assert.equal(line(['b1','b2','b3','star_ring_sage']).find(t=>t.config.id==='b').count,4,'preparation changes recompute inheritance');
const inheritedByEquipment=['a1','a2','a3'].map(id=>({id:'wearer'+id,grantedTraitIds:['a']}));
assert.equal(line([...inheritedByEquipment,'star_ring_sage']).find(t=>t.config.id==='a').count,4);
const army=['a1','a2','a3'].map((id,x)=>({cfg:{...dummy,id},side:0,x,y:0}));
const sim=new BattleSim(cfg,[{cfg:cfg.getUnit('star_ring_sage'),side:0,x:3,y:0},...army,{cfg:dummy,side:1,x:0,y:7}],{seed:7});
assert.equal(sim.units[0].cfg.inheritedTraitId,'a');assert.equal(sim.units[0].cfg.spellPower,20);assert.equal(cfg.getUnit('star_ring_sage').grantedTraitIds,undefined,'authored roster is immutable');
const survivors=sim.units.filter(u=>u.side===0&&u.cfg.id!=='a1').map(u=>u.cfg);assert.ok(resolveTraits([a,b,job],survivors,cfg.allUnits()).find(t=>t.config.id==='a').memberIds.includes('star_ring_sage'),'battle binding survives loss of other members');
const full=config(battle.traits),blood=battle.traits.find(t=>t.id==='bloodfiend');
for(const granted of [[],['bloodfiend']]){
 const bloodSim=new BattleSim(full,[{cfg:{...full.getUnit('star_ring_sage'),grantedTraitIds:granted},side:0,x:3,y:2},
  ...blood.members.slice(0,3).map((id,x)=>({cfg:full.getUnit(id),side:0,x,y:2})),{cfg:dummy,side:1,x:0,y:7}]);
 assert.equal(bloodSim.units[0].cfg.inheritedTraitId,'bloodfiend');assert.equal(bloodSim.units[0].lifesteal,.1,'inherited innate lifesteal applies exactly once');
 assert.ok(bloodSim.units[0].bloodfiend,'inherited faction grants its active combat mechanism');
}
const ended=fixture();cast(ended);step(ended,8);ended.sim.end(0);assert.equal(ended.src.runicRunes,0);assert.equal(ended.src.cfg.spellPower,20,'battle-only rune power is removed on settlement');
// Seven gold is a real price, while stock/quality stay in the existing orange tier.
assert.equal(validCost(7),5);assert.equal(unitPrice(7),7);assert.equal(sellPrice(7,1),7);assert.equal(sellPrice(7,2),20);assert.equal(POOL_STOCK[7],9);
const c=config(),pool=new CardPool(c.allUnits()),owned=new OwnedUnits(),economy=new EconomySystem(undefined,{gold:1000,winStreak:0,loseStreak:0});
assert.equal(pool.canDraw('star_ring_sage'),false);
const run=structuredClone(require('../assets/resources/config/run.json')),rules=run.stageEncounters;rules.shop.qualityRates=[0,0,0,0,100];delete rules.shop.refreshQuality;
const progress=new StageProgression(rules,freshStageProgress(),c,pool,owned,economy,new RunRandomContext(21),9,require('../assets/resources/config/equipment-policy.json').tiers,()=>10);
let offer,pending;
for(let refresh=0;refresh<100&&!offer;refresh++){pending=progress.rollShop({id:100,stage:8,round:5,roundsInStage:10,encounterKind:'specialShop'},refresh);offer=pending.offers.find(o=>o.kind==='unit'&&o.id==='star_ring_sage');}
assert.ok(offer,'seven-cost orange card appears in merchant catalogue');assert.equal(offer.price,7);
progress.state.pending=pending;const merchantGold=economy.gold,merchantStock=pool.count('star_ring_sage');
const purchase=progress.act({type:'stageChoice',rewardId:pending.id,choice:'buy',index:pending.offers.indexOf(offer)},{id:100});
assert.equal(purchase.ok,true);assert.equal(economy.gold,merchantGold-7);assert.equal(pool.count('star_ring_sage'),merchantStock-1);
assert.equal(pool.canDraw('star_ring_sage'),true);assert.ok(owned.all().some(u=>u.unitId==='star_ring_sage'));assert.equal(offer.bought,true);
assert.equal(progress.act({type:'stageChoice',rewardId:pending.id,choice:'buy',index:pending.offers.indexOf(offer)},{id:100}).ok,false,'merchant purchase cannot be repeated');
const stock=pool.count('star_ring_sage');pool.unlock('star_ring_sage');pool.take('star_ring_sage');
const shop=new ShopSystem(pool,owned,economy,new Map(c.allUnits().map(u=>[u.id,u])),new Rng(1),()=>10,9,[{unitId:'star_ring_sage'},...Array.from({length:4},()=>({unitId:null}))]);
const gold=economy.gold;const bought=shop.buy(0);assert.equal(bought.error,undefined);assert.equal(economy.gold,gold-7);assert.equal(pool.count('star_ring_sage'),stock-1);assert.equal(shop.sell(bought.uid).gold,7);assert.equal(pool.count('star_ring_sage'),stock);
for(const star of [1,2,3]){const unit=c.scaleUnit(c.getUnit('star_ring_sage'),star),rows=buildSkillStatRows(c,unit,star,1),description=buildSkillDescription(c,unit,star,1,true);assert.equal(rows.length,3);assert.ok(description.includes('能量波'));assert.ok(!description.includes('{魔法'));}
const replay=()=>{const f=fixture();for(let i=0;i<4;i++){cast(f);step(f,i===3?30:8);}return f.sim.events;};assert.deepEqual(replay(),replay());
const normalBattle=()=>{const f=fixture();f.src.atkCd=0;f.sim.run();assert.ok(f.sim.events.some(e=>e.t==='runic_wave'),'normal mana/attack loop reaches the fourth cast');assert.equal(f.src.runicPower,0);return f.sim.getResult();};
assert.deepEqual(normalBattle(),normalBattle(),'normal simulation and cleanup are deterministic');
console.log('PASS runic arcana: all stars/both sides, exact windup and fourth-cast wave, rune power snapshot/consumption/interruption, faction adoption/counts/battle lock, 7-gold merchant/shop/sale, panels and deterministic events');
