require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const equipment=require('../assets/resources/config/equipment.json'),CODEX='arcane_overflow_codex';
const cfg=new ConfigManager();cfg.setEquipment(equipment);cfg.setSkills({
 pulse:{id:'pulse',power:100,radius:4,dmgType:'true'},
 shield:{id:'shield',power:0,radius:0,dmgType:'physical',effect:'hydraulicBulwark',hydraulicBulwark:{durationSeconds:2,resistanceBonuses:[1,1,1],healAmounts:[0,0,0]}},
 delayed:{id:'delayed',power:0,starDamage:[0,0,0],radius:2,dmgType:'true',effect:'delayedDamage',castSeconds:.5},
});
const base={id:'test',name:'test',hp:10000,atk:0,armor:0,mr:0,atkSpeed:1,range:10,moveTicks:1,maxMana:50,startMana:0,manaPerHit:0,critChance:0};
function make(items=[CODEX],source={},extra=[]){return new BattleSim(cfg,[{cfg:{...base,...source},equipment:items,side:0,x:1,y:2},
 {cfg:{...base,maxMana:0},side:1,x:2,y:2},...extra],{seed:17,maxTicks:300});}
const stats=(items,patch={})=>cfg.equipmentStats({...base,...patch},items);
const advance=(s,n)=>{for(let i=0;i<n;i++)s.step();};
for(const [count,maxMana,rate] of [[1,40,5],[2,30,10],[3,20,15]]){
 const items=Array(count).fill(CODEX),value=stats(items);assert.equal(value.maxMana,maxMana);assert.equal(value.manaPerSecond,rate);
 assert.equal(value.physicalPower,10*count);assert.equal(value.spellPower,10*count);
 const s=make(items),u=s.units[0];u.stunnedUntilTick=999;advance(s,20);assert.equal(u.mana,rate,'per-second mana uses the fixed clock, including stun');
}
assert.equal(stats([CODEX,CODEX,CODEX],{maxMana:20,startMana:20}).maxMana,10);
assert.equal(stats([CODEX,CODEX,CODEX],{maxMana:20,startMana:20}).startMana,10,'starting mana is clamped to the new cap');
assert.equal(stats([CODEX],{maxMana:0}).maxMana,0,'a mana-less unit stays mana-less');
assert.equal(stats([CODEX],{maxMana:50,startMana:15}).startMana,15,'start mana is not subtracted');
const caster=make([CODEX],{role:'caster'}),casterUnit=caster.units[0];casterUnit.stunnedUntilTick=999;advance(caster,20);assert.equal(casterUnit.mana,7,'equipment regen adds to role regen');
const noMana=make([CODEX],{maxMana:0}),noManaUnit=noMana.units[0];advance(noMana,20);assert.equal(noManaUnit.mana,0);
{
 const s=make([CODEX],{skillId:'pulse',startMana:50},[{cfg:{...base,maxMana:0},side:1,x:3,y:2}]);s.step();
 const hits=s.events.filter(e=>e.t==='hit'&&e.source===1&&e.dmgType==='magic');assert.equal(hits.length,1,'AoE casts trigger overflow once, on one target');
 assert.equal(hits[0].id,2);assert.equal(hits[0].dmg,110,'40 final mana x 250% x 110% spell power');assert.equal(hits[0].dmgType,'magic');
 assert.equal(s.events.filter(e=>e.t==='cast'&&e.id===1).length,1);
 const report=new CombatStatistics();report.begin(s.units);report.consume(s.events);assert.equal(report.snapshot().find(row=>row.id===1).damage,310);
}
{
 const s=make([CODEX,CODEX],{skillId:'shield',startMana:50},[{cfg:{...base,maxMana:0},side:1,x:3,y:2}]);
 s.units[0].priorityTarget=3;s.step();const cast=s.events.find(e=>e.t==='cast'&&e.id===1),hit=s.events.find(e=>e.t==='hit'&&e.source===1&&e.dmg>0);
 assert.equal(cast.target,1,'shield skill targets the carrier');assert.equal(hit.id,3,'overflow uses the current attack target, never the friendly skill target');
 assert.equal(hit.dmg,180,'two copies: 30 final mana x 500% x 120% spell power');
}
{
 const s=make([CODEX],{skillId:'delayed',startMana:50});advance(s,15);
 assert.equal(s.events.filter(e=>e.t==='cast'&&e.id===1).length,1);
 assert.equal(s.events.filter(e=>e.t==='hit'&&e.source===1&&e.dmgType==='magic').length,1,'cast completion and skill impacts do not trigger overflow again');
}
{
 const s=make([CODEX],{skillId:'pulse',startMana:50});s.units[1].cfg.mr=100;s.step();
 assert.equal(s.events.find(e=>e.t==='hit'&&e.dmg>0).dmg,55,'overflow follows normal magic resistance');
 const replay=()=>make([CODEX],{skillId:'pulse'}).run();assert.deepEqual(replay(),replay());
}
console.log('PASS codex: fixed-clock additive mana regen, double bonuses, flat mana reduction/10 floor/no-mana units, final-mana magic damage, cast-only single enemy targeting, friendly/AoE/delayed skills, stacks, resistance, statistics and deterministic replay');
