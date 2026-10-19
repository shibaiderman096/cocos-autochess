require('tsx/cjs');
const assert=require('node:assert/strict');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const roster=require('../assets/resources/config/units.json'),battle=require('../assets/resources/config/battle.json');
for(const trait of battle.traits.filter(t=>!t.selector)){
 assert.equal(trait.members.length,10);
 for(let n=0;n<=10;n++){
  const ids=trait.members.slice(0,n),state=resolveTraits([trait],[...ids,...ids],roster)[0];
  assert.equal(state.count,n,'duplicate copies count once');
  assert.equal(state.active?.count??0,trait.breakpoints.filter(t=>t.count<=n).at(-1)?.count??0);
  assert.equal(state.next,trait.breakpoints.find(t=>t.count>n)?.count??null);
 }
 for(const id of trait.members)assert.ok(roster.some(u=>u.id===id));
}
assert.ok(resolveTraits(battle.traits,[],roster).every(t=>t.count===0&&!t.active));
assert.deepEqual(resolveTraits(battle.traits,roster.map(u=>u.id),roster),resolveTraits(battle.traits,[...roster,...roster].map(u=>u.id),roster));
console.log('PASS traits: both ten-member factions, all thresholds, unique IDs, empty board, current members and selector counting');
