require('tsx/cjs');
const assert=require('node:assert/strict');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const roster=require('../assets/resources/config/units.json'),battle=require('../assets/resources/config/battle.json');
for(const trait of battle.traits.filter(t=>!t.selector)){
 if(trait.pendingMembers && trait.members.length===0){
  const state=resolveTraits([trait],roster.map(u=>u.id),roster)[0];
  assert.equal(state.count,0);assert.equal(state.active,null);continue;
 }
 // 星穹 has seven authored members; later members are not invented to fill tiers.
 assert.equal(trait.members.length,trait.id==='astral'?7:trait.id==='mechanical_pioneer'?7:8);
 for(let n=0;n<=trait.members.length;n++){
  const ids=trait.members.slice(0,n),state=resolveTraits([trait],[...ids,...ids],roster)[0];
  assert.equal(state.count,n,'duplicate copies count once');
  assert.equal(state.active?.count??0,trait.breakpoints.filter(t=>t.count<=n).at(-1)?.count??0);
  assert.equal(state.next,trait.breakpoints.find(t=>t.count>n)?.count??null);
 }
 for(const id of trait.members)assert.ok(roster.some(u=>u.id===id));
}
assert.ok(resolveTraits(battle.traits,[],roster).every(t=>t.count===0&&!t.active));
assert.deepEqual(resolveTraits(battle.traits,roster.map(u=>u.id),roster),resolveTraits(battle.traits,[...roster,...roster].map(u=>u.id),roster));
console.log('PASS traits: authored roster sizes including seven-member Astral, all reachable thresholds, unique IDs, empty board and selector counting');
