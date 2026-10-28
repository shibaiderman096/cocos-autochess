require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const base={id:'attacker',name:'attacker',hp:100000,atk:1,armor:0,mr:0,atkSpeed:1,range:4,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0,role:'marksman'};
const dummy={...base,id:'enemy',atk:0,range:10,role:'caster'};
function make(units,patch={}){const cfg=new ConfigManager();cfg.setBattle({movementCellsPerSecond:2,...patch});return new BattleSim(cfg,units,{seed:17,maxTicks:4000});}
function quiet(sim){for(const u of sim.units.slice(1))u.atkCd=u.moveCd=100000;}
const lastAttack=(sim,id=1)=>sim.events.filter(e=>e.t==='attack'&&e.id===id).at(-1);
for(const side of [0,1]){
 const s=make([{cfg:base,side,x:3,y:2},{cfg:dummy,side:1-side,x:3,y:3},{cfg:{...dummy,role:'tank'},side:1-side,x:3,y:4}]);quiet(s);s.step();
 assert.equal(lastAttack(s).target,3,'a tank one cell farther wins a new lock');assert.equal(s.units[0].attackTargetId,3);
 const t=make([{cfg:{...base,range:1},side,x:3,y:2},{cfg:dummy,side:1-side,x:3,y:3},{cfg:{...dummy,role:'tank'},side:1-side,x:3,y:4}]);quiet(t);t.step();assert.equal(lastAttack(t).target,2,'available melee victim beats an out-of-range tank');
}
{
 const s=make([{cfg:base,side:0,x:0,y:0},{cfg:dummy,side:1,x:2,y:0},{cfg:dummy,side:1,x:5,y:0}]);quiet(s);s.step();const u=s.units[0];assert.equal(u.attackTargetId,2);
 s.units[2].x=1;s.units[2].cfg.role='tank';u.atkCd=0;s.step();assert.equal(lastAttack(s).target,2,'closer tank does not steal a valid existing lock');
 s.units[1].x=6;u.atkCd=0;s.step();assert.equal(u.attackTargetId,2,'pursuit retains a living target outside range');assert.ok(s.events.some(e=>e.t==='move'&&e.id===1));
}
for(const tickMs of [25,50])for(const speed of [.5,1,2,5]){
 const s=make([{cfg:{...base,atkSpeed:speed},side:0,x:0,y:0},{cfg:dummy,side:1,x:2,y:0},{cfg:dummy,side:1,x:3,y:0}],{tickMs});quiet(s);s.step();const u=s.units[0];u.atkCd=0;
 s.units[1].alive=false;s.units[1].hp=0;s.step();const lost=s.tick,interval=Math.round(500/tickMs);assert.equal(u.attackTargetId,null);assert.equal(u.retargetAtTick,lost+interval);
 while(s.tick<lost+interval-1){s.step();assert.equal(u.attackTargetId,null);}
 s.step();assert.equal(u.attackTargetId,3);assert.equal(lastAttack(s).tick,lost+interval,'reacquisition occurs exactly 0.5 seconds after loss regardless of attack speed');
}
{
 const s=make([{cfg:base,side:0,x:0,y:0},{cfg:dummy,side:1,x:2,y:0},{cfg:dummy,side:1,x:3,y:0}]);quiet(s);s.step();const u=s.units[0];
 s.units[1].untargetableUntilTick=10;s.step();assert.equal(u.retargetAtTick,12);
 while(s.tick<11)s.step();assert.equal(u.attackTargetId,null,'brief invisibility does not bypass reacquisition delay');s.step();assert.equal(u.attackTargetId,2);
 u.attackSpeedBonus=1;s.units[1].alive=false;s.units[1].hp=0;s.step();assert.equal(u.retargetAtTick,s.tick+10,'attack-speed bonuses do not change the fixed lost-target delay');
 u.tauntSourceId=3;u.atkCd=0;s.step();assert.equal(u.attackTargetId,3,'taunt overrides a pending lock delay');
}
{
 const s=make([{cfg:base,side:0,x:0,y:0},{cfg:dummy,side:1,x:2,y:0},{cfg:dummy,side:1,x:3,y:0}]);quiet(s);s.step();const u=s.units[0];
 u.priorityTarget=3;u.atkCd=0;s.step();assert.equal(u.attackTargetId,3,'explicit skill priority overrides an ordinary lock');
 u.priorityTarget=null;u.atkCd=0;s.step();assert.equal(u.attackTargetId,3,'finishing empowerment does not cause an arbitrary switch');
}
{
 const tank={cfg:{...dummy,role:'tank',range:1},side:1,x:2,y:1};
 const walls=hexNeighbors(2,1).map(p=>({cfg:dummy,side:0,...p}));
 const s=make([{cfg:{...base,range:1},side:0,x:0,y:1},tank,{cfg:dummy,side:1,x:0,y:3},...walls]);quiet(s);s.step();assert.equal(s.units[0].attackTargetId,3,'unreachable tank does not cause a permanent initial lock');
}
{
 const walls=hexNeighbors(2,1).map(p=>({cfg:dummy,side:0,...p}));
 const s=make([{cfg:{...base,range:1},side:0,x:0,y:1},{cfg:{...dummy,role:'tank'},side:1,x:2,y:1},{cfg:dummy,side:1,x:0,y:3},...walls]);quiet(s);
 const u=s.units[0];u.attackTargetId=2;s.step();assert.equal(u.attackTargetId,2,'brief path blockage retains a valid lock');
 while(s.tick<20)s.step();assert.equal(u.attackTargetId,2);s.step();assert.equal(u.attackTargetId,null,'persistent blockage releases the lock after an attack interval');assert.equal(u.retargetAtTick,31);
 while(s.tick<31)s.step();assert.equal(u.attackTargetId,3,'a reachable replacement is acquired after the normal delay');
}
{
 const s=make([{cfg:{...base,range:1},side:0,x:0,y:0},{cfg:dummy,side:1,x:6,y:0}]);quiet(s);while(s.tick<22)s.step();
 const moves=s.events.filter(e=>e.t==='move'&&e.id===1);assert.deepEqual(moves.map(e=>e.tick),[1,11,21]);assert.ok(moves.every(e=>e.durationTicks===10));
 const other=make([{cfg:{...base,range:1},side:0,x:0,y:0},{cfg:dummy,side:1,x:6,y:0}],{tickMs:25});quiet(other);other.step();assert.equal(other.events.find(e=>e.t==='move').durationTicks,20,'movement speed is independent of Tick length');
}
{
 const cfg=new ConfigManager();for(const speed of [0,-1,NaN,Infinity])assert.throws(()=>cfg.setBattle({movementCellsPerSecond:speed}));
 assert.throws(()=>cfg.setBattle({targeting:{tankDistanceBias:-1}}));
 for(const retargetSeconds of [0,-1,NaN,Infinity])assert.throws(()=>cfg.setBattle({targeting:{tankDistanceBias:1,retargetSeconds}}));
}
{
 const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs(),deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
 const {RunSession}=require('../assets/scripts/core/RunSession.ts');
 function session(save){const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);return new RunSession(cfg,input.run,input.waves,{...deps,runSeed:17,stageCount:3,...(save?{save}:{})});}
 const original=session(),restored=session(original.snapshot());assert.deepEqual(restored.snapshot(),original.snapshot());
}
const replay=()=>{const s=make([{cfg:{...base,range:1},side:0,x:0,y:0},{cfg:dummy,side:1,x:5,y:4},{cfg:{...dummy,role:'tank'},side:1,x:4,y:4}]);return s.run();};assert.deepEqual(replay(),replay());
console.log('PASS target locks: tank preference/both sides, range guard, sticky pursuit, death/untargetability, fixed 0.5s retarget delay across attack speeds and Tick lengths, taunt/skill overrides, unreachable targets, 2-cell/s movement/events, deterministic replay and current-save continuation');
