require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const t=require('../tools/run-simulation.ts'),inputs=t.loadRunInputs();
const deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
function make(save){
 const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
 return new RunSession(cfg,inputs.run,inputs.waves,{...deps,...(save?{save}:{runSeed:217})});
}
for(const [wins,losses]of [[0,0],[3,0],[0,4]])for(const winner of [0,1,-1]){
 const s=make();s.economy.winStreak=wins;s.economy.loseStreak=losses;s.economy.gold=20;
 assert.equal(s.flow.wave.encounterKind,'monster');
 const preview=s.incomePreview;
 for(const outcome of [preview.win,preview.loss])assert.deepEqual([outcome.winStreak,outcome.loseStreak],[wins,losses],'neutral income previews preserve streaks');
 assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
 const sim=s.startBattle();const survivors=sim.units.filter(u=>u.side===1&&u.alive).length;
 const health=s.flow.health;sim.end(winner);const result=s.settleBattle();
 assert.deepEqual([s.economy.winStreak,s.economy.loseStreak],[wins,losses],'neutral win/loss/draw neither increments nor resets streaks');
 assert.equal(result.round.healthLost,winner===0?0:Math.min(health,survivors*inputs.battle.lossPerEnemy),'neutral losses and draws still deal survivor damage');
 assert.equal(s.flow.health,health-result.round.healthLost);
 assert.equal(result.reward.breakdown.interest,2,'neutral interest is unchanged');
 assert.equal(result.reward.breakdown.winBonus,winner===0?1:0,'existing victory gold is unchanged');
 assert.equal(result.reward.breakdown.streakBonus,Math.min(6,Math.max(wins,losses)));
 const after=s.snapshot();assert.equal(s.settleBattle(),null);assert.deepEqual(s.snapshot(),after,'one settlement only');
 const restored=make(after);assert.deepEqual([restored.economy.winStreak,restored.economy.loseStreak,restored.flow.health],[wins,losses,s.flow.health],'saved neutral result preserves HP and streaks');
 if(restored.pendingStageReward)assert.ok(restored.claimStageReward({type:'stageChoice',rewardId:restored.pendingStageReward.id,choice:'claim'}).ok);
 const normal=restored.waves.find(w=>w.encounterKind==='normal');assert.ok(restored.debugJump(normal.stage,normal.round));
 assert.ok(restored.moveUnit(restored.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
 const next=restored.startBattle();next.end(winner===1?0:1);restored.settleBattle();
 assert.deepEqual([restored.economy.winStreak,restored.economy.loseStreak],winner===1?[wins+1,0]:[0,losses+1],'next PvP-style round updates the preserved streak normally');
}
{
 const wallet=new EconomySystem(undefined,{gold:20,winStreak:2,loseStreak:0});
 wallet.settleBattle(1,{winner:1,countsForStreak:false});
 assert.deepEqual([wallet.winStreak,wallet.loseStreak],[2,0]);
 wallet.settleBattle(1,{winner:0});assert.equal(wallet.winStreak,3,'existing callers still count regular battles');
 const s=make();s.economy.loseStreak=5;
 assert.ok(s.debugJump(1,2));
 assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
 const sim=s.startBattle();s.flow.state.health=1;sim.end(1);const result=s.settleBattle();
 assert.equal(result.round.healthLost,1);assert.equal(s.flow.health,0);assert.equal(s.flow.result,'defeat');assert.equal(s.economy.loseStreak,5,'lethal monster loss ends run without changing streak');
}
console.log('PASS neutral encounters: win/loss/draw preserve both streaks, unchanged income, survivor HP damage including lethal, truthful income previews, save/reload, idempotency and next normal battle');
