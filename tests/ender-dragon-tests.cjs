require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {buildMonsterUnits,buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const run=require('../assets/resources/config/run.json'),units=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),templates=require('../assets/resources/config/waves.json');
const cfg=new ConfigManager();cfg.setUnits(units);cfg.setSkills(skills);cfg.setEnemyUnits(buildMonsterUnits(run,units));
const dragon=cfg.getUnit('ender_dragon');
assert.equal(dragon.hp,4500);assert.equal(dragon.skillId,'dragon_breath');
assert.equal(cfg.allUnits().some(u=>u.id===dragon.id),false);assert.equal(new CardPool(cfg.allUnits()).count(dragon.id),0);
const old=JSON.parse(JSON.stringify(run));old.monsters=old.monsters.filter(m=>m.id!==dragon.id);delete old.stageEncounters.strongMonster;
const short=buildRunWaves(4,run,templates,units),long=buildRunWaves(10,run,templates,units);
assert.deepEqual(short.slice(0,14),buildRunWaves(3,old,templates,units),'first three stages stay identical');
assert.deepEqual(short,long.slice(0,short.length),'campaign length never changes earlier encounters');
const encounters=long.filter(w=>w.enemies.some(e=>e.unitId===dragon.id));
assert.deepEqual(encounters.map(w=>w.stage),[4,7,10]);
assert.ok(encounters.every(w=>w.encounterKind==='monster'&&w.enemies.length===1&&w.enemies[0].star===1));
assert.deepEqual(long,buildRunWaves(10,run,templates,units));
assert.throws(()=>buildRunWaves(4,{...run,stageEncounters:{...run.stageEncounters,strongMonster:{...run.stageEncounters.strongMonster,everyStages:0}}},templates,units),/Invalid strong/);
const dummy={...units[0],hp:10000,armor:0,mr:100,atk:0,critChance:0};
const area=new BattleSim(cfg,[{cfg:dragon,side:1,x:3,y:4},{cfg:dummy,side:0,x:3,y:3},{cfg:dummy,side:0,x:4,y:3},{cfg:dummy,side:0,x:0,y:0}]);
area.units[0].mana=100;for(const u of area.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}
for(let i=0;i<13;i++)area.step();
const hits=area.events.filter(e=>e.t==='hit');assert.equal(hits.length,2);assert.ok(hits.every(e=>e.dmg===160&&e.dmgType==='magic'&&e.tick===13));
function battle(ids,star,seed){return new BattleSim(cfg,[...ids.map((id,i)=>({cfg:cfg.getUnit(id),side:0,star,x:i+1,y:2})),{cfg:dragon,side:1,x:3,y:6}],{seed}).run();}
for(let seed=1;seed<=10;seed++){
 assert.equal(battle(['helion'],1,seed).winner,1,'strong monster defeats lone starter');
 assert.equal(battle(['helion','leon','saiph','celine'],2,seed).winner,0,'developed four-unit team can defeat dragon');
}
console.log('PASS ender dragon: enemy-only roster, strong stats/skill, stage 4/7/10 spawn, unchanged early stages, deterministic layouts, AoE timing and 20 strength simulations');
