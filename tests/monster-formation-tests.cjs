require('tsx/cjs');
const assert=require('node:assert/strict');
const {buildRunWaves,buildLegacyRunWaves,monsterFormationGroups}=require('../assets/scripts/core/RunSetup.ts');
const {offsetToWorld}=require('../assets/scripts/battle/HexMath.ts');
const run=require('../assets/resources/config/run.json'),units=require('../assets/resources/config/units.json'),templates=require('../assets/resources/config/waves.json'),battle=require('../assets/resources/config/battle.json');
const layout=run.stageEncounters.monsterFormation,strong=run.stageEncounters.strongMonster,roster=new Map(run.monsters.map(m=>[m.id,m]));
const raw=p=>offsetToWorld(p.x,p.y,1,0,0),axis=raw(layout.center).x;
function check(wave,matchKinds=true){
 const enemies=wave.enemies;assert.equal(new Set(enemies.map(e=>`${e.x},${e.y}`)).size,enemies.length);
 for(const e of enemies){
  assert.ok(e.x>=0&&e.x<battle.boardWidth&&e.y>=battle.ownRows&&e.y<battle.boardHeight,'legal enemy cell');
  const twin=enemies.find(t=>t.y===e.y&&Math.abs(raw(t).x+raw(e).x-2*axis)<1e-9);
  assert.ok(twin,`${wave.stage}-${wave.round}: mirror missing for ${e.x},${e.y}`);
  if(matchKinds)assert.equal(twin.unitId,e.unitId,'mirror cells carry the same monster');
 }
}
for(let count=1;count<=10;count++){
 const groups=monsterFormationGroups(count,layout);assert.equal(groups.flat().length,count);
 assert.equal(groups.filter(g=>g.length===1).length,count%2);
 check({enemies:groups.flat().map(p=>({...p,unitId:'same'}))});
}
const bad=[{...layout,center:{x:NaN,y:6}},{...layout,pairs:layout.pairs.slice(0,1)},
 {...layout,pairs:[[{x:2,y:4},{x:5,y:4}],...layout.pairs.slice(1)]},
 {...layout,pairs:[[{x:3,y:6},{x:3,y:6}],...layout.pairs.slice(1)]}];
for(const l of bad)assert.throws(()=>monsterFormationGroups(10,l),/Invalid monster formation/);
for(const n of [0,1.5,12,NaN])assert.throws(()=>monsterFormationGroups(n,layout),/Invalid monster formation/);
const ordinaryCounts=new Set(),seenLeaders=new Set();
for(let seed=1;seed<=30;seed++){
 const waves=buildRunWaves(99,run,templates,units,{mode:'legacy',runSeed:seed});
 const before=buildLegacyRunWaves(99,run,templates,units);
 assert.deepEqual(buildRunWaves(4,run,templates,units,{mode:'legacy',runSeed:seed}),waves.filter(w=>w.stage<=4),'campaign length cannot reroll an encounter');
 for(const w of waves){
  if(w.encounterKind!=='monster')continue;
  check(w,w.stage>1);
  if(w.stage===1)continue;
  const leader=w.enemies.find(e=>roster.get(e.unitId).monsterTier==='strong');
  if(leader){
   seenLeaders.add(leader.unitId);const count=Math.min(strong.escorts.maxCount,strong.escorts.initialCount+(w.stage-strong.startStage)/strong.everyStages*strong.escorts.countPerEncounter);
   assert.equal(w.enemies.length,count+1);assert.deepEqual({x:leader.x,y:leader.y},layout.center);
   assert.equal(leader.statMultiplier,1+(w.stage-strong.startStage)*strong.statGrowth);
   for(const e of w.enemies.filter(e=>e!==leader)){
    assert.ok(strong.escorts.unitIdsByLeader[leader.unitId].includes(e.unitId),'same-family configured escort');
    assert.equal(roster.get(e.unitId).range,1);assert.ok(e.y<leader.y,'melee escorts screen the ranged leader');
    assert.equal(e.statMultiplier,1+(w.stage-1)*run.stageEncounters.monsterStatGrowth);
   }
  }else{
   ordinaryCounts.add(w.enemies.length);assert.equal(w.enemies.length,before[w.id-1].enemies.length,'ordinary population curve unchanged');
   for(const e of w.enemies)assert.equal(roster.get(e.unitId).range===1,e.y<layout.center.y,'melee front, ranged back');
  }
 }
}
assert.deepEqual(seenLeaders,new Set(strong.unitIds));assert.ok(ordinaryCounts.has(10));
const difficulty=require('../assets/resources/config/enemy-difficulty.json'),power=require('../assets/resources/config/enemy-power.json');
for(const seed of [5,37]){
 const waves=buildRunWaves(10,run,templates,units,{mode:'budget-v1',runSeed:seed,difficulty,power});
 const expected=buildRunWaves(10,run,templates,units,{mode:'legacy',runSeed:seed}).filter(w=>w.encounterKind==='monster');
 const formation=w=>({id:w.id,stage:w.stage,round:w.round,name:w.name,enemies:w.enemies});
 assert.deepEqual(waves.filter(w=>w.encounterKind==='monster').map(formation),expected.map(formation),'budget and legacy consume the same authored monster formations');
}
for(const escortPatch of [{initialCount:3},{countPerEncounter:1},{maxCount:10},{unitIdsByLeader:{}},{pairs:[[{x:2,y:6},{x:4,y:6}],...strong.escorts.pairs.slice(1)]}]){
 const config={...run,stageEncounters:{...run.stageEncounters,strongMonster:{...strong,escorts:{...strong.escorts,...escortPatch}}}};
 assert.throws(()=>buildRunWaves(4,config,templates,units),/Invalid/);
}
console.log('PASS monster formations: populations 1-10, real hex mirrors, legal unique cells, front/back roles, 30 seeds through stage 99, five escorted leaders, 2/4/6 guard scaling, deterministic prefixes and invalid configs');
