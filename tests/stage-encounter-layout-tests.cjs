require('tsx/cjs');
const assert=require('node:assert/strict');
const {planStageEncounters}=require('../assets/scripts/core/StageEncounters.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const layouts=new Set();
const earlySlots={2:{monster:new Set(),specialShop:new Set()},3:{monster:new Set(),specialShop:new Set()}};
for(let seed=1;seed<=100;seed++) {
 const random=new RunRandomContext(seed);
 assert.deepEqual(planStageEncounters(1,3,random),['monster','monster','monster']);
 for(const [stage,rounds] of [[2,5],[3,6]]){
  const early=planStageEncounters(stage,rounds,random);
  assert.equal(early.filter(k=>k==='monster').length,1);
  assert.equal(early.filter(k=>k==='specialShop').length,1);
  assert.ok(!early.includes('boss')&&!early.includes('elite'));
  for(const kind of ['monster','specialShop'])earlySlots[stage][kind].add(early.indexOf(kind));
  assert.deepEqual(planStageEncounters(stage,rounds,new RunRandomContext(seed)),early);
  random.stream('shop',8).next();random.stream('battle',4).next();
  assert.deepEqual(planStageEncounters(stage,rounds,random),early,'other systems do not reroll early encounters');
  const legacy=planStageEncounters(stage,rounds,random,4,false);
  assert.ok(legacy.indexOf('monster')<Math.floor(rounds/3));
  assert.equal(legacy.filter(k=>k==='specialShop').length,stage===3?1:0);
 }
 for(let rounds=5;rounds<=10;rounds++) {
  const layout=planStageEncounters(4,rounds,random);
  for(const kind of ['monster','elite','specialShop','boss'])assert.equal(layout.filter(k=>k===kind).length,1);
  assert.equal(layout.at(-1),'boss');
  assert.ok(layout.indexOf('monster')<Math.floor(rounds/3));
  for(const kind of ['elite','specialShop'])assert.ok(layout.indexOf(kind)>=Math.floor(rounds/3)&&layout.indexOf(kind)<Math.ceil(rounds*2/3));
  random.stream('shop',1).next();random.stream('battle',4).next();
  assert.deepEqual(planStageEncounters(4,rounds,random),layout,'unrelated RNG calls cannot reroll stage layout');
  layouts.add(layout.join(','));
 }
}
for(const [stage,rounds] of [[2,5],[3,6]])for(const kind of ['monster','specialShop'])assert.equal(earlySlots[stage][kind].size,rounds,'each early-stage round can hold '+kind);
assert.ok(layouts.size>12,'seeds produce varied legal layouts');
assert.throws(()=>planStageEncounters(4,4,new RunRandomContext(1)),/at least five/);
console.log('PASS stage layout: stage1 all monsters, stages2/3 one monster and shop across all round positions, saved legacy layout, late-stage positions and deterministic RNG');
