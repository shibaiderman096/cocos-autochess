require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const card=cfg.getUnit('itachi');
assert.deepEqual([card.cost,card.atkSpeed,card.startMana,card.maxMana],[4,.8,20,70]);
function make(star=1,reverse=false,bonus={}){
 const source={cfg:{...card,critChance:0,...bonus},star,side:0,x:2,y:2};
 const target={cfg:{...cfg.getUnit('warrior'),hp:100000,mr:100,range:4},side:1,x:4,y:2};
 const sim=new BattleSim(cfg,reverse?[target,source]:[source,target]);
 const src=sim.units.find(u=>u.side===0),dst=sim.units.find(u=>u.side===1);
 src.mana=70;dst.atkCd=10000;dst.moveCd=10000;return {sim,src,dst};
}
for(const star of [1,2,3])for(const reverse of [false,true]){
 const {sim,src,dst}=make(star,reverse);sim.step();
 assert.equal(sim.events.find(e=>e.t==='cast').duration,.45);
 for(let i=0;i<8;i++)sim.step();
 assert.equal(sim.events.filter(e=>e.t==='hit'||e.t==='stun').length,0);
 sim.step();assert.equal(sim.tick,10);
 const hit=sim.events.find(e=>e.t==='hit');assert.equal(hit.dmg,[60,90,250][star-1]);assert.equal(hit.dmgType,'magic');
 assert.equal(sim.events.find(e=>e.t==='stun').duration,[.3,.5,5][star-1]);
 dst.atkCd=0;dst.moveCd=0;
 const end=10+[6,10,100][star-1]+1;
 while(sim.tick<end-1)sim.step();
 assert.equal(sim.events.filter(e=>e.t==='attack'&&e.id===dst.id).length,0);
 sim.step();assert.equal(sim.events.find(e=>e.t==='attack'&&e.id===dst.id).tick,end,'resumes at exact duration regardless of unit order');
 assert.ok(src.mana<70);
}
const interrupted=make();interrupted.dst.pendingCast={skillId:'healing_channel',remainingTicks:100,nextHealTick:100};
for(let i=0;i<10;i++)interrupted.sim.step();assert.equal(interrupted.dst.pendingCast,null,'stun cancels channel');
const bonuses=make(1,false,{spellPower:100,physicalPower:999});for(let i=0;i<10;i++)bonuses.sim.step();
assert.equal(bonuses.sim.events.find(e=>e.t==='hit').dmg,120,'only spell bonus affects damage');
const dead=make();dead.sim.step();dead.dst.alive=false;dead.dst.hp=0;dead.sim.step();
assert.equal(dead.sim.events.filter(e=>e.t==='stun').length,0,'dead target gets no stun');
const fresh=make();assert.equal(fresh.dst.stunnedUntilTick,0);
assert.deepEqual(make().sim.run(),make().sim.run());
console.log('PASS Itachi: config, nine-tick cast, all star damage and stun durations, action suppression, interruption, ordering and determinism');
