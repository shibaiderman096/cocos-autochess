const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.COCOS_PROJECT||path.resolve(__dirname,'..');
require('node:module').createRequire(root+'/package.json')('tsx/cjs');
const {ConfigManager}=require(root+'/assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require(root+'/assets/scripts/battle/BattleSim.ts');
const {professionConfig}=require(root+'/assets/scripts/core/KnightProfession.ts');
const {combatConfigurationIdentity}=require(root+'/assets/scripts/core/EnemyGenerationTypes.ts');
const {configIdentityHash,matchesConfigIdentity}=require(root+'/assets/scripts/core/ConfigIdentity.ts');
const {loadRunInputs}=require(root+'/tools/run-simulation.ts');
const inputs=loadRunInputs(root),cfg=new ConfigManager();
cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle({...inputs.battle,traits:[]});cfg.setEquipment(inputs.equipment);
const roster=cfg.allUnits().filter(u=>u.cost>0),variants=roster.flatMap(u=>u.id==='azure_oath_knight'?['warrior','caster','tank'].map(role=>professionConfig(u,{profession:role})):[u]);
const dummy={...cfg.getUnit('helion'),skillId:undefined,hp:10000000,atk:0,critChance:0,armor:0,mr:0,maxMana:0,manaPerHit:0,grantedTraitIds:[]};
function make(unit,star=1){
 if(typeof unit==='string')unit=cfg.getUnit(unit);
 const sim=new BattleSim(cfg,[{cfg:unit,side:0,x:3,y:4,star},{cfg:dummy,side:1,x:3,y:3},{cfg:dummy,side:1,x:4,y:3},{cfg:dummy,side:1,x:5,y:1},{cfg:dummy,side:0,x:2,y:4}],{seed:617});sim.start();
 for(const u of sim.units){u.manaPerSecond=0;u.cfg.manaPerHit=0;u.cfg.manaOnDamageMax=0;if(u.side===1)u.stunnedUntilTick=100000;}
 const u=sim.units[0];u.mana=u.cfg.maxMana;u.hp=Math.round(u.cfg.hp*.6);sim.units[4].hp=Math.round(sim.units[4].cfg.hp*.3);u.attackTargetId=2;u.retargetAtTick=0;return sim;
}
const hits=(s,id=1)=>s.events.filter(e=>e.t==='hit'&&e.source===id);
function until(s,p,max=200){while(!p()&&s.tick<max&&!s.finished)s.step();assert.ok(p(),'condition at '+s.tick);}
let checks=0;
const warrior=professionConfig(cfg.getUnit('azure_oath_knight'),{profession:'warrior'});
for(const star of [1,2,3]){
 const s=make(warrior,star),u=s.units[0];u.attackSpeedBonus=5;s.step();const move=s.events.find(e=>e.t==='move'&&e.id===1),land=move.tick+move.durationTicks;
 while(s.tick<land-1)s.step();assert.equal(hits(s).length,0);assert.equal(s.events.filter(e=>e.id===1&&e.t==='attack').length,0);assert.ok(u.manaLocked);
 s.step();assert.equal(u.knightLeap,null);assert.equal(u.manaLocked,false);assert.ok(hits(s).length);assert.ok(hits(s).every(e=>e.tick===land));assert.ok(s.events.some(e=>e.t==='stun'&&e.source===1&&e.tick===land));checks++;
}
for(const reason of ['stun','fear','death','end','revive']){
 const s=make(warrior),u=s.units[0];s.step();
 if(reason==='stun'||reason==='fear'){s.pendingStuns.push({src:s.units[1],dst:u,seconds:1,...(reason==='fear'?{fearOrigin:s.units[1].pos}:{})});s.resolveStuns();}
 if(reason==='death'){u.hp=0;s.resolveDamage();}
 if(reason==='end')s.end(0);
 if(reason==='revive')u.reviveAt(u.pos,1);
 assert.equal(u.knightLeap,null,reason);assert.equal(u.manaLocked,false,reason);const n=s.events.length;for(let i=0;i<8;i++)s.step();assert.ok(!s.events.slice(n).some(e=>e.t==='knight_action'&&e.kind==='leap'),reason);checks++;
}
const shadowFlights=roster.filter(u=>cfg.getSkill(u.skillId).projectile&&cfg.getSkill(u.skillId).shadow);
for(const unit of shadowFlights)for(const star of [1,2,3]){const s=make(unit,star);until(s,()=>s.events.some(e=>e.t==='skill_pulse'));const e=s.events.find(e=>e.t==='skill_pulse'),arrival=e.tick+e.flightTicks;while(s.tick<arrival-1)s.step();assert.equal(hits(s).length,0,unit.id);s.step();assert.ok(hits(s).length,unit.id+' arrival');checks++;}
const gunner=roster.find(u=>u.skillId==='infernal_gunfire');for(const star of [1,2,3]){const s=make(gunner,star);until(s,()=>s.events.some(e=>e.t==='demon_volley'));const e=s.events.find(e=>e.t==='demon_volley'),arrival=e.tick+e.flightTicks;while(s.tick<arrival-1)s.step();assert.equal(hits(s).length,0);s.step();assert.equal(hits(s).length,e.count);checks++;}
for(const id of ['xiya',roster.find(u=>u.skillId==='scarlet_aid_dance').id]){
 const s=make(id);until(s,()=>s.events.some(e=>e.t==='cast'&&e.id===1));const cast=s.events.find(e=>e.t==='cast'&&e.id===1);
 assert.equal(cast.windupTicks,id==='xiya'?Math.round(cfg.getSkill('moon_triple_arrow').castSeconds*1000/cfg.battle.tickMs):0);
 assert.ok(cast.duration*1000>cast.windupTicks*cfg.battle.tickMs);checks++;
}
const flightTypes={atlas:'missile',xiya:'moon_arrow',hushrope_ranger:'rope_shot',star_ring_sage:'runic_missiles',saiph:'sun_pulse'};
for(const [id,type]of Object.entries(flightTypes))for(const star of [1,2,3]){
 const s=make(id,star);until(s,()=>s.events.some(e=>e.t===type&&(type!=='sun_pulse'||e.effect==='bolt')));
 const launch=s.events.find(e=>e.t===type&&(type!=='sun_pulse'||e.effect==='bolt'));
 const flight=launch.flightTicks??Math.round(cfg.getSkill(s.units[0].cfg.skillId).projectile.flightSeconds*1000/cfg.battle.tickMs),arrival=launch.tick+flight;
 assert.ok(!hits(s).some(e=>e.tick>=launch.tick&&e.tick<arrival),id+' early hit');
 while(s.tick<arrival-1)s.step();assert.ok(!hits(s).some(e=>e.tick<arrival),id);s.step();assert.ok(hits(s).some(e=>e.tick===arrival),id+' arrival');checks++;
}
// Direct event-clock tests isolate lifecycle and stat snapshots from subsequent unit actions.
for(const reason of ['none','stun','sourceDeath','targetDeath','revive','untargetable','end']){
 const s=make('atlas'),u=s.units[0],v=s.units[1];s.step();const arrival=1+s.events.find(e=>e.t==='missile').flightTicks;
 if(reason==='stun')u.stunnedUntilTick=100;
 if(reason==='sourceDeath'){u.hp=0;s.resolveDamage();}
 if(reason==='targetDeath'){v.hp=0;s.resolveDamage();}
 if(reason==='revive'){v.reviveAt(v.pos,1);v.stunnedUntilTick=100;}
 if(reason==='untargetable')v.untargetableUntilTick=100;
 if(reason==='end')s.end(0);
 while(s.tick<arrival&&!s.finished)s.step();
 const targetHits=hits(s).filter(e=>e.id===v.id);
 if(['none','stun','sourceDeath'].includes(reason))assert.ok(targetHits.length,reason);else assert.equal(targetHits.length,0,reason);checks++;
}
for(const star of [1,2,3]){
 const s=make('star_ring_sage',star);until(s,()=>s.events.some(e=>e.t==='runic_missiles'));const launch=s.events.find(e=>e.t==='runic_missiles');
 s.units[0].cfg.spellPower=9999;while(s.tick<launch.tick+launch.flightTicks+2*launch.staggerTicks)s.step();
 const shotHits=hits(s).slice(0,3);assert.deepEqual(shotHits.map(e=>e.tick),[0,1,2].map(i=>launch.tick+launch.flightTicks+i*launch.staggerTicks));
 const control=make('star_ring_sage',star);while(control.tick<s.tick)control.step();assert.deepEqual(shotHits.map(e=>e.dmg),hits(control).slice(0,3).map(e=>e.dmg));assert.ok(shotHits.every(e=>Number.isFinite(e.dmg)&&e.dmg>0));checks++;
}
const healer=roster.find(u=>u.skillId==='repair_protocol');assert.ok(healer);
for(const reason of ['none','revive','death']){
 const s=make(healer),u=s.units[0];u.hp=u.cfg.hp;s.step();const shot=s.events.find(e=>e.t==='repair_shot');assert.ok(shot);const target=s.units.find(u=>u.id===shot.target),hp=target.hp;
 if(reason==='revive')target.reviveAt(target.pos,1);
 if(reason==='death'){target.hp=0;s.resolveDamage();}
 const before=target.hp;while(s.tick<shot.tick+shot.flightTicks-1)s.step();assert.equal(target.hp,before);s.step();
 if(reason==='none')assert.ok(target.hp>hp);else assert.equal(target.hp,before);checks++;
}
// End-of-channel cooldowns start at completion, irrespective of module update order.
for(const id of ['saiph','xiya','infernal_axe_guard']){
 const s=make(id),u=s.units[0];until(s,()=>s.events.some(e=>e.t==='attack'&&e.id===1));
 const attack=s.events.find(e=>e.t==='attack'&&e.id===1);
 const boundary=id==='xiya'?Math.max(...s.events.filter(e=>e.t==='moon_arrow').map(e=>e.tick)):id==='saiph'?Math.max(...s.events.filter(e=>e.t==='sun_pulse'&&e.effect==='bolt').map(e=>e.tick)):s.events.find(e=>e.t==='infernal_spin_end').tick;
 assert.equal(attack.tick-boundary,s.attackCooldown(u),id+' full recovery');checks++;
}
// Offensive stats are captured at release; resistance and reduction are evaluated on arrival.
{
 const s=make('atlas'),u=s.units[0],v=s.units[1];
 const expected=Math.round(100*(1+u.physicalPower/100)*(1+u.damageAmp)*.25);
 s.projectileDamage(u,v,100,'physical',cfg.getSkill('sky_annihilation'));assert.equal(s.pendingDamage.length,0);
 u.cfg.physicalPower=9999;v.cfg.armor=100;v.cfg.damageReduction=.5;
 s.tick=4;s.updateImpacts();assert.equal(s.pendingDamage.length,0);s.tick=5;s.updateImpacts();s.resolveDamage();assert.equal(hits(s)[0].dmg,expected);checks++;
}
let deterministic=0,interruptions=0;
for(const v of variants)for(const star of [1,2,3]){
 const trace=()=>{const s=make(v,star);for(let i=0;i<160&&!s.finished;i++)s.step();return JSON.stringify(s.events);};assert.equal(trace(),trace(),v.id);deterministic++;
 const s=make(v,star),u=s.units[0];for(let i=0;i<80&&!u.pendingCast&&!u.knightLeap&&!u.knightWave&&!u.knightSpin;i++)s.step();
 if(u.pendingCast||u.knightLeap||u.knightWave||u.knightSpin){s.pendingStuns.push({src:s.units[1],dst:u,seconds:1});s.resolveStuns();assert.equal(u.pendingCast,null);assert.equal(u.knightLeap,null);assert.equal(u.knightWave,null);assert.equal(u.knightSpin,null);assert.equal(u.manaLocked,false);interruptions++;}
}
let basics=0,chargedRunes=0;
for(const unit of roster){
 const s=make(unit),u=s.units[0];u.mana=0;until(s,()=>s.events.some(e=>e.t==='attack'&&e.id===1));
 const attack=s.events.find(e=>e.t==='attack'&&e.id===1);assert.equal(hits(s)[0].tick,attack.tick,unit.id);basics++;
}
for(const star of [1,2,3]){
 const s=make('star_ring_sage',star),u=s.units[0];u.runicRunes=3;s.step();
 const expected=s.tick+Math.round(cfg.getSkill(u.cfg.skillId).runicArcana.chargeSeconds*1000/cfg.battle.tickMs);
 while(s.tick<expected-1)s.step();assert.ok(!s.events.some(e=>e.t==='runic_wave'));s.step();
 assert.equal(s.events.find(e=>e.t==='runic_wave').tick,expected);assert.equal(u.runicRunes,0);
 const stopped=make('star_ring_sage',star),su=stopped.units[0];su.runicRunes=3;stopped.step();
 stopped.pendingStuns.push({src:stopped.units[1],dst:su,seconds:1});stopped.resolveStuns();for(let i=0;i<29;i++)stopped.step();
 assert.equal(su.runicRunes,3);assert.ok(!stopped.events.some(e=>e.t==='runic_wave'));chargedRunes++;
}
const oldSkills=structuredClone(inputs.skills);for(const s of Object.values(oldSkills))delete s.projectile;
const old=combatConfigurationIdentity({skills:oldSkills,units:inputs.units,battle:inputs.battle}),current=combatConfigurationIdentity({skills:inputs.skills,units:inputs.units,battle:inputs.battle});
assert.equal(current,old);assert.ok(matchesConfigIdentity(configIdentityHash(old),current,configIdentityHash(current)));
const changed=structuredClone(inputs.skills);changed.sky_annihilation.projectile.flightSeconds=.5;assert.notEqual(combatConfigurationIdentity({skills:changed,units:inputs.units,battle:inputs.battle}),current);
const damageChanged=structuredClone(inputs.skills);damageChanged.sky_annihilation.starDamage[0]++;assert.notEqual(combatConfigurationIdentity({skills:damageChanged,units:inputs.units,battle:inputs.battle}),current);
for(const value of [0,-1,NaN,Infinity]){const bad=structuredClone(inputs.skills);bad.sky_annihilation.projectile.flightSeconds=value;assert.throws(()=>new ConfigManager().setSkills(bad),/projectile/i);}
console.log(JSON.stringify({passed:true,focused:checks,deterministic,interruptions,basics,chargedRunes,legacyIdentity:true,invalidTiming:true},null,2));



