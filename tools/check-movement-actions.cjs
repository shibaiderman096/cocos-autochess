const assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.COCOS_PROJECT||path.resolve(__dirname,'..');
require('node:module').createRequire(root+'/package.json')('tsx/cjs');
const {ConfigManager}=require(root+'/assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require(root+'/assets/scripts/battle/BattleSim.ts');
const {professionConfig}=require(root+'/assets/scripts/core/KnightProfession.ts');
const {loadRunInputs}=require(root+'/tools/run-simulation.ts'),input=loadRunInputs(root);
function config(tickMs=50){const c=new ConfigManager();c.setUnits(input.units);c.setSkills(input.skills);c.setBattle({...input.battle,tickMs,traits:[],movementCellsPerSecond:2});c.setEquipment(input.equipment);return c;}
const cfg=config(),base=cfg.getUnit('helion');
const plain={...base,skillId:undefined,atkSpeed:1,hp:1000000,range:1,maxMana:0,startMana:0,manaPerSecond:0,critChance:0};
function make(unit=plain,y=2,c=cfg){
 const s=new BattleSim(c,[{cfg:unit,side:0,x:3,y:4},{cfg:plain,side:1,x:3,y}],{seed:617});
 s.units[1].stunnedUntilTick=99999;s.start();return s;
}
const actions=s=>s.events.filter(e=>e.id===1&&(e.t==='attack'||e.t==='cast'));
const basics=s=>actions(s).filter(e=>e.t==='attack');
function advance(s,tick){while(s.tick<tick&&!s.finished)s.step();assert.equal(s.tick,tick);}
function firstBasic(s,max=250){while(!basics(s).length&&s.tick<max&&!s.finished)s.step();assert.ok(basics(s).length,'first basic');return basics(s)[0];}
let boundaries=0;
// The same full-cycle rule works across tick lengths, slow/fast units, and the attack-speed cap.
for(const tickMs of [25,50,100])for(const speed of [.25,.5,1,2,5,9]){
 const c=config(tickMs),unit={...plain,atkSpeed:speed},s=make(unit,3,c),period=s.attackCooldown(s.units[0]);
 advance(s,period-1);assert.equal(basics(s).length,0);s.step();assert.equal(basics(s)[0].tick,period);
 advance(s,period*3);assert.deepEqual(basics(s).map(e=>e.tick),[period,period*2,period*3]);
 const moving=make(unit,2,c);moving.step();const move=moving.events.find(e=>e.t==='move'&&e.id===1);assert.ok(move);
 const arrival=move.tick+move.durationTicks;advance(moving,arrival+period-1);assert.equal(actions(moving).length,0);
 moving.step();assert.equal(basics(moving)[0].tick,arrival+period);boundaries++;
}
// Consecutive steps restart the wait at the final landing, without adding idle pauses between steps.
const consecutive=make(plain,0);const first=firstBasic(consecutive),moves=consecutive.events.filter(e=>e.t==='move'&&e.id===1);
assert.ok(moves.length>=3);for(let i=1;i<moves.length;i++)assert.equal(moves[i].tick,moves[i-1].tick+moves[i-1].durationTicks);
const final=moves.at(-1);assert.equal(first.tick,final.tick+final.durationTicks+20);
// The attack period is sampled at the stop, after speed changes during the walk.
const boosted=make();boosted.step();boosted.units[0].attackSpeedBonus=1;assert.equal(firstBasic(boosted).tick,21);
// Root/stun/fear cannot turn a step into an early arrival or permit attacks between fear steps.
for(const condition of ['root','stun','fear']){
 const s=make(),u=s.units[0];s.step();const move=s.events.find(e=>e.t==='move'&&e.id===1),arrival=move.tick+move.durationTicks;
 if(condition==='root')u.hydraulicRooted=true;
 if(condition==='stun')u.stunnedUntilTick=arrival+4;
 if(condition==='fear'){u.soulFearUntilTick=arrival-1;u.fearOrigin=s.units[1].pos;}
 assert.equal(firstBasic(s).tick,arrival+s.attackCooldown(u));
}
const frightened=make(plain,3),fu=frightened.units[0];fu.soulFearUntilTick=3;fu.fearOrigin=frightened.units[1].pos;
frightened.step();const fearMove=frightened.events.find(e=>e.t==='move'&&e.id===1);assert.ok(fearMove);
advance(frightened,fearMove.tick+fearMove.durationTicks-1);assert.equal(actions(frightened).length,0);
// Revival clears a previous life’s movement lock and starts its own full stationary period.
const revived=make(),ru=revived.units[0];revived.step();advance(revived,5);ru.reviveAt({x:3,y:3},1);
assert.equal(ru.walkUntilTick,0);assert.equal(ru.basicAttackReadyTick,null);assert.equal(firstBasic(revived).tick,26);
// The added wait is only for basic attacks. Stationary full-mana skills remain available at tick 1.
const ready=make({...base,atkSpeed:1,startMana:base.maxMana},3);ready.step();assert.ok(actions(ready).some(e=>e.t==='cast'&&e.tick===1));
// Mana becoming full mid-step must not let any roster/stance bypass the shared movement gate.
const variants=cfg.allUnits().filter(u=>u.cost>0).flatMap(u=>u.id==='azure_oath_knight'?['warrior','caster','tank'].map(profession=>professionConfig(u,{profession})):[u]);
let roster=0,deterministic=0;
for(const v of variants){
 const trace=()=>{
  const s=make({...v,range:1,startMana:0,manaPerSecond:0,atkSpeed:1}),u=s.units[0];u.manaPerSecond=0;s.step();
  const move=s.events.find(e=>e.t==='move'&&e.id===1);assert.ok(move,v.id+' starts walking');u.mana=u.cfg.maxMana;
  const arrival=move.tick+move.durationTicks;advance(s,arrival-1);assert.equal(actions(s).length,0,v.id+' moving');
  advance(s,arrival+100);return JSON.stringify(s.events);
 };
 assert.equal(trace(),trace(),v.id+' deterministic');roster++;deterministic++;
}
const fullDuringWalk=make({...base,atkSpeed:1,startMana:0,manaPerSecond:0});fullDuringWalk.step();fullDuringWalk.units[0].mana=fullDuringWalk.units[0].cfg.maxMana;
advance(fullDuringWalk,10);assert.equal(actions(fullDuringWalk).length,0);fullDuringWalk.step();assert.ok(actions(fullDuringWalk).some(e=>e.t==='cast'&&e.tick===11));
console.log(JSON.stringify({passed:true,boundaries,roster,deterministic,stationaryFirstBasicTick:20,walkArrivalTick:11,walkingFirstBasicTick:31,consecutiveSteps:moves.length,revivalFirstBasicTick:26},null,2));
