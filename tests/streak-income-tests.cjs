require('tsx/cjs');
const assert=require('node:assert/strict');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
for(const winner of [0,1]){
 const economy=new EconomySystem();
 for(let n=1;n<=10;n++){
  const before=economy.snapshot(),preview=economy.preview(1);assert.deepEqual(economy.snapshot(),before);
  const expected=preview[winner===0?'win':'loss'],result=economy.settleBattle(1,{winner});
  assert.deepEqual(result,expected,'income preview follows actual payment');assert.equal(result.streakBonus,Math.min(n,6));
  const after=economy.preview(1);assert.equal(after.progress,Math.min(n,6));assert.equal(after.progressMax,6);assert.equal(after.streakBonus,Math.min(n,6));
 }
 const neutral=economy.settleBattle(1,{winner:1-winner,countsForStreak:false});assert.equal(neutral.streakBonus,6);assert.equal(Math.max(neutral.winStreak,neutral.loseStreak),10);
 const switched=economy.settleBattle(1,{winner:1-winner});assert.equal(switched.streakBonus,1);assert.equal(Math.max(switched.winStreak,switched.loseStreak),1);
 const draw=economy.settleBattle(1,{winner:-1});assert.equal(draw.streakBonus,1);
}
console.log('PASS streak income: 1 gold per win/loss streak step, 6-gold cap, exact preview/payment, six-step progress, neutral preservation and result switches');
