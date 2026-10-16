require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const ids=['archer','guardian','duelist','ranger','mage','sorcerer','shaman'];
assert.deepEqual(ids.map(id=>cfg.getUnit(id).cost),[1,1,2,2,3,3,2]);
for(const id of ids) {
 const u=cfg.getUnit(id);assert.ok(u.skillId);assert.equal(u.manaPerHit,10);
 if(u.range>1)assert.ok(u.basicAttackFx,'ranged basic attack VFX: '+id);
}
function make(id,star=1,bonus=0) {
 const card=cfg.getUnit(id);
 const dummy={...cfg.getUnit('guardian'),hp:100000,armor:0,mr:0,atk:0,skillId:undefined,maxMana:0,startMana:0,critChance:0};
 const sim=new BattleSim(cfg,[{cfg:{...card,physicalPower:bonus,spellPower:bonus,critChance:0},star,side:0,x:2,y:3},
  {cfg:dummy,side:1,x:3,y:3},{cfg:dummy,side:1,x:4,y:3},{cfg:dummy,side:0,x:2,y:4}]);
 const src=sim.units[0];for(const u of sim.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}
 return {sim,src};
}
for(const id of ['archer','duelist','ranger','mage','sorcerer'])for(const star of [1,2,3])for(const bonus of [0,50]) {
 const {sim,src}=make(id,star,bonus);const skill=cfg.getSkill(src.cfg.skillId);
 if(id==='ranger')sim.units[2].hp=10000;
 src.mana=src.cfg.maxMana;sim.step();
 const cast=sim.events.find(e=>e.t==='cast');assert.equal(cast.duration,skill.castSeconds);
 const ticks=Math.round(skill.castSeconds*20);
 for(let i=0;i<ticks-1;i++)sim.step();assert.equal(sim.events.filter(e=>e.t==='hit').length,0,id+' cast delay');
 sim.step();const hits=sim.events.filter(e=>e.t==='hit');
 assert.equal(hits.length,skill.effect==='delayedArea'?2:1);
 for(const hit of hits) {assert.equal(hit.dmg,Math.round(skill.starDamage[star-1]*(1+bonus/100)));assert.equal(hit.dmgType,skill.dmgType);}
 if(id==='ranger')assert.equal(hits[0].id,3,'sniper selects lowest HP ratio in range');
 if(id==='sorcerer') {
  const dst=sim.units[1];assert.equal(dst.burns.length,1);src.atkCd=10000;
  const next=dst.burns[0].nextTick;while(sim.tick<next)sim.step();
  assert.equal(sim.events.filter(e=>e.t==='hit'&&e.tick===next)[0].dmg,Math.round(100000*.015*(1+bonus/100)));
  src.mana=src.cfg.maxMana;src.atkCd=0;for(let i=0;i<=ticks;i++)sim.step();
  assert.equal(dst.burns.length,1,'curse refreshes without stacking');
 }
}
for(const star of [1,2,3]) {
 const guard=make('guardian',star,50);guard.src.mana=guard.src.cfg.maxMana;for(let i=0;i<6;i++)guard.sim.step();
 assert.equal(guard.src.shield,Math.round([160,240,360][star-1]*1.5));
 const {sim,src}=make('shaman',star,50);src.mana=src.cfg.maxMana;src.hp=Math.round(src.cfg.hp*.8);sim.units[3].hp=1000;
 for(let i=0;i<7;i++)sim.step();
 const heal=sim.events.find(e=>e.t==='heal');assert.equal(heal.id,4);assert.equal(heal.amount,Math.round([180,270,420][star-1]*1.5));
 assert.equal(sim.events.filter(e=>e.t==='hit').length,0,'healing does not attack enemies');
 const capped=make('shaman',star);capped.src.mana=capped.src.cfg.maxMana;capped.src.hp-=1;for(let i=0;i<7;i++)capped.sim.step();
 assert.equal(capped.sim.events.find(e=>e.t==='heal').amount,1,'healing capped at missing HP');
}
const full=make('shaman');full.src.mana=full.src.cfg.maxMana;full.sim.step();assert.equal(full.src.pendingCast,null);assert.equal(full.src.mana,full.src.cfg.maxMana);
const dead=make('shaman');dead.src.mana=dead.src.cfg.maxMana;dead.sim.units[3].hp=1;dead.sim.step();dead.sim.units[3].alive=false;
for(let i=0;i<6;i++)dead.sim.step();assert.ok(!dead.sim.events.some(e=>e.t==='heal'),'dead ally is not resurrected');
for(const id of ids)assert.deepEqual(make(id).sim.run(),make(id).sim.run());
console.log('PASS seven roles: unchanged costs, all-star damage/shields/heals, cast delays, area, sniper, curse/refresh, ally targeting, overheal/death, projectiles and determinism');
