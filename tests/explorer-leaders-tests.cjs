require('tsx/cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {inCompassSector}=require('../assets/scripts/battle/SandCompass.ts');
const {ropeHuntPoint,ropeHuntEdge,ropeHuntHookProgress}=require('../assets/scripts/battle/RopeHunt.ts');
const {hexDist,hexNeighbors,offsetToWorld}=require('../assets/scripts/battle/HexMath.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs(),clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function config(traits=[]){const c=new ConfigManager();c.setUnits(input.units);c.setSkills(input.skills);c.setEquipment(input.equipment);c.setBattle({...input.battle,traits});return c;}
const cfg=config(),sand=cfg.getUnit('sandsea_navigator'),ranger=cfg.getUnit('hushrope_ranger');
const dummy={...sand,id:'test_dummy',name:'dummy',hp:2000000,atk:0,armor:0,mr:0,range:1,maxMana:0,startMana:0,manaPerHit:0,skillId:undefined,critChance:0};
const place=(cfg,side,x,y,star=1)=>({cfg,side,x,y,star});
function battle(placements){const s=new BattleSim(config(),placements,{seed:1027});for(const u of s.units){u.atkCd=10000;u.moveCd=10000;u.cfg.critChance=0;}return s;}
function begin(s,u){u.mana=u.cfg.maxMana;u.atkCd=0;s.step();assert.ok(u.pendingCast);return s.tick;}
function release(s,u,ticks){const start=begin(s,u);for(let n=1;n<ticks;n++){s.step();assert.ok(u.pendingCast);}s.step();assert.equal(s.tick,start+ticks);assert.equal(u.pendingCast,null);return s.tick;}
function hit(s,src,dst,raw,type='true'){s.pendingDamage.length=0;s.damage(src,dst,raw,type);s.resolveDamage();}
assert.deepEqual([sand.cost,sand.role,sand.damageType,sand.range,sand.startMana,sand.maxMana],[4,'caster','physical',1,40,100]);
assert.deepEqual([ranger.cost,ranger.role,ranger.damageType,ranger.range,ranger.startMana,ranger.maxMana],[5,'caster','physical',4,20,80]);
const traitStates=resolveTraits(input.battle.traits,input.units.map(u=>u.id),input.units);
for(const id of [sand.id,ranger.id])for(const trait of ['explorer','swiftmartialist'])assert.ok(traitStates.find(t=>t.config.id===trait).memberIds.includes(id));
const center={x:3,y:3},east={x:4,y:3};
assert.equal(inCompassSector(center,east,{x:3,y:5},3),true,'180-degree side boundary included');
assert.equal(inCompassSector(center,east,{x:2,y:3},3),false,'rear excluded');
assert.equal(inCompassSector(center,east,{x:7,y:3},3),false,'fourth hex excluded');
assert.equal(inCompassSector(center,east,center,3),false);
for(const facing of hexNeighbors(3,3)){
 assert.ok(inCompassSector(center,facing,facing,3));
 const a=offsetToWorld(3,3,1,0,0),b=offsetToWorld(facing.x,facing.y,1,0,0);
 const opposite=hexNeighbors(3,3).find(p=>{const q=offsetToWorld(p.x,p.y,1,0,0);return Math.abs(q.x+b.x-2*a.x)<1e-8&&Math.abs(q.y+b.y-2*a.y)<1e-8;});
 assert.equal(inCompassSector(center,facing,opposite,3),false,'all six orientations exclude their rear');
}
for(const side of [0,1])for(const star of [1,2,3])for(const ap of [0,100]){
 const s=battle([place(sand,side,3,3,star),place(dummy,1-side,4,3),place(dummy,side,0,3),place(dummy,side,0,0),place(dummy,1-side,2,3),place(dummy,1-side,6,3)]);
 const [u,front,nearAlly,farAlly,rear,edge]=s.units;u.cfg.spellPower=ap;u.cfg.physicalPower=50;u.cfg.damageAmp=.2;
 const stats=new CombatStatistics();stats.begin(s.units);const end=release(s,u,10),shield=[220,330,1000][star-1]*(1+ap/100);
 assert.equal(u.shield,shield);assert.equal(nearAlly.shield,shield);assert.equal(farAlly.shield,0);assert.equal(front.shield,0);
 const amount=Math.round([280,420,1500][star-1]*1.5*1.2);assert.equal(front.cfg.hp-front.hp,amount);assert.equal(edge.cfg.hp-edge.hp,amount);assert.equal(rear.hp,rear.cfg.hp);
 const shieldIndex=s.events.findIndex(e=>e.t==='shield'&&e.source===u.id),hitIndex=s.events.findIndex(e=>e.t==='hit'&&e.source===u.id);assert.ok(shieldIndex<hitIndex);
 stats.consume(s.events);assert.equal(stats.snapshot().find(r=>r.id===u.id).shielding,2*shield);assert.equal(stats.snapshot().find(r=>r.id===u.id).damageByType.physical,amount*2);
 u.atkCd=10000;while(s.tick<end+99)s.step();assert.equal(nearAlly.shield,shield);s.step();assert.equal(nearAlly.shield,0);
}
{
 const s=battle([place(sand,0,3,3),place(dummy,1,4,3),place(dummy,0,2,3),place(dummy,1,6,3)]),[u,enemy,ally]=s.units;
 release(s,u,10);const first=s.tick;u.atkCd=10000;for(let n=0;n<20;n++)s.step();release(s,u,10);const second=s.tick;u.atkCd=10000;assert.equal(ally.shield,440);
 // A different tracked shield absorbs once, then this skill's earliest layer, preserving permanent shield.
 ally.shield+=110;ally.stellarShield={remaining:60,untilTick:s.tick+200};hit(s,enemy,ally,100);assert.equal(ally.shield,450);
 while(s.tick<first+100)s.step();assert.equal(ally.shield,270,'only first layer remainder expires');
 while(s.tick<second+100)s.step();assert.equal(ally.shield,50,'remaining permanent shield survives both expirations');
 assert.equal(s.sandCompass.layers.length,0);
 release(s,u,10);hit(s,enemy,u,1000000);assert.equal(ally.shield,270,'caster death preserves its already granted ally shield');
 s.end(1);assert.equal(ally.shield,50);assert.equal(s.sandCompass.layers.length,0);
}
for(const mode of ['stun','fear','death']){
 const s=battle([place(sand,0,3,3),place(dummy,1,4,3),place(dummy,0,2,3)]),u=s.units[0];begin(s,u);
 if(mode==='stun')u.stunnedUntilTick=s.tick+20;else if(mode==='fear')u.fearUntilTick=s.tick+20;else hit(s,s.units[1],u,1000000);
 for(let n=0;n<15;n++)s.step();assert.equal(s.events.filter(e=>e.t==='sand_compass').length,0);assert.equal(s.sandCompass.layers.length,0);
}
console.log('PASS sand compass: all stars/sides, AP-only shields and AD-only damage, radius/180-degree boundaries, shield-before-hit, statistics, independent expiry/absorption, permanent/stellar shield coexistence, caster death and interrupts');
{
 const s=battle([place(sand,0,3,3),place(dummy,1,4,3),place(dummy,0,0,3),place(dummy,0,0,0),place(dummy,1,6,3)]),[u,enemy,leaving,entering]=s.units;
 begin(s,u);leaving.x=0;leaving.y=0;entering.x=2;entering.y=3;hit(s,u,enemy,10000000);
 for(let n=0;n<10;n++)s.step();assert.equal(leaving.shield,0);assert.equal(entering.shield,220,'recipients use release-time positions');
 assert.equal(s.events.filter(e=>e.t==='sand_compass').length,1,'original target death does not cancel the locked sector');
}
for(const mode of ['stun','fear','death']){
 const s=battle([place(ranger,0,3,3),place(dummy,1,5,3),place(dummy,0,2,2)]),[u,enemy]=s.units;begin(s,u);
 if(mode==='stun')u.stunnedUntilTick=s.tick+20;else if(mode==='fear')u.fearUntilTick=s.tick+20;else hit(s,enemy,u,10000000);
 for(let n=0;n<10;n++)s.step();assert.equal(u.ropeHunt,null);assert.equal(s.events.filter(e=>e.t==='rope_shot').length,0);
}
for(const side of [0,1])for(const star of [1,2,3]){
 const s=battle([place(ranger,side,3,3,star),place(dummy,1-side,5,3),place(dummy,1-side,6,7)]),[u,enemy]=s.units;enemy.hp=enemy.cfg.hp/2;
 u.cfg.spellPower=100;u.cfg.physicalPower=50;u.cfg.damageAmp=.2;
 const start=release(s,u,8),state={...u.ropeHunt};assert.ok(state);assert.equal(state.endTick-start,60);assert.equal(u.mana,0);assert.ok(s.targetable(u));
 const origin=offsetToWorld(state.from.x,state.from.y,1,0,0),edge=offsetToWorld(state.edge.x,state.edge.y,1,0,0);
 const latched=start+state.hookTicks,turn=(latched+state.endTick)/2;
 assert.equal(state.hookTicks,6);near(ropeHuntPoint(state,start).x,origin.x);near(ropeHuntPoint(state,latched).y,origin.y);
 near(ropeHuntPoint(state,turn).x,edge.x);near(ropeHuntPoint(state,turn).y,edge.y);near(ropeHuntPoint(state,start+60).y,origin.y);
 assert.equal(s.events.find(e=>e.t==='rope_swing').hookTicks,state.hookTicks);
 const hp=u.hp;hit(s,enemy,u,77);assert.equal(u.hp,hp-77,'swinging unit takes targeted damage');
 for(let n=0;n<59;n++){u.gainMana(99);assert.equal(u.mana,0);s.step();assert.ok(u.ropeHunt);assert.ok(s.targetable(u));assert.equal(new Set(s.units.filter(v=>v.alive).map(v=>`${v.x}:${v.y}`)).size,s.units.filter(v=>v.alive).length);}
 s.step();assert.equal(u.ropeHunt,null);assert.deepEqual(u.pos,state.from);
 const shots=s.events.filter(e=>e.t==='rope_shot');assert.equal(shots.length,10);assert.equal(shots[0].tick,start+6);assert.equal(shots.at(-1).tick,start+60);
 assert.ok(shots.every(e=>e.target===enemy.id));assert.equal(s.events.filter(e=>e.t==='attack'&&e.id===u.id).length,0);
 const hits=s.events.filter(e=>e.t==='hit'&&e.source===u.id);assert.ok(hits.every(e=>e.dmgType==='physical'&&e.dmg===Math.round([90,135,3000][star-1]*1.5*1.2)));
 u.gainMana(10);assert.ok(u.mana>=10,'mana resumes after landing');
}
for(let y=0;y<8;y++)for(let x=0;x<7;x++){
 const from={x,y},edge=ropeHuntEdge(from,7,8),a=offsetToWorld(x,y,1,0,0),b=offsetToWorld(edge.x,edge.y,1,0,0),distance=Math.hypot(b.x-a.x,b.y-a.y);
 assert.ok(edge.x===0||edge.x===6||edge.y===0||edge.y===7);
 assert.ok(Math.min(Math.abs(b.x-a.x),Math.abs(b.y-a.y))/distance>=Math.sin(Math.PI/9)-1e-9,'anchor is at least 20 degrees off either axis');
 const cells=Array.from({length:56},(_,n)=>({x:n%7,y:Math.floor(n/7)})).filter(p=>p.x===0||p.x===6||p.y===0||p.y===7);
 for(const cell of cells){const p=offsetToWorld(cell.x,cell.y,1,0,0),d=Math.hypot(p.x-a.x,p.y-a.y);if(d&&Math.min(Math.abs(p.x-a.x),Math.abs(p.y-a.y))/d>=Math.sin(Math.PI/9))assert.ok(d<=distance+1e-9,'farthest valid diagonal anchor');}
 const state={from,edge,startTick:0,hookTicks:6,endTick:60};
 for(let tick=0;tick<=6;tick++){assert.deepEqual(ropeHuntPoint(state,tick),a);near(ropeHuntHookProgress(state,tick),tick/6);}
 const ropeLength=tick=>{const p=ropeHuntPoint(state,tick);return Math.hypot(p.x-b.x,p.y-b.y);};
 assert.ok(ropeLength(15)<ropeLength(6));assert.ok(ropeLength(25)<ropeLength(15),'rope retracts while pulling the carrier');
}
console.log('PASS grappling path: all 56 origins use distant diagonal borders, hook flies before movement, reel-in shortens the tether, exact edge and return');
for(const mode of ['stun','fear','death','occupied','end']){
 const s=battle([place(ranger,0,3,3),place(dummy,1,5,3),place(dummy,0,1,6)]),[u,enemy,ally]=s.units;release(s,u,8);
 for(let n=0;n<20;n++)s.step();const shots=s.events.filter(e=>e.t==='rope_shot').length,origin={...u.ropeHunt.from};
 if(mode==='stun')u.stunnedUntilTick=s.tick+20;
 if(mode==='fear')u.fearUntilTick=s.tick+20;
 if(mode==='death')hit(s,enemy,u,1000000);
 if(mode==='occupied'){ally.x=origin.x;ally.y=origin.y;while(u.ropeHunt)s.step();assert.equal(hexDist(u.pos,origin),1);assert.notDeepEqual(u.pos,ally.pos);}
 else if(mode==='end')s.end(0);else{s.step();assert.equal(u.ropeHunt,null);assert.equal(s.events.filter(e=>e.t==='rope_shot').length,shots);}
 if(mode==='stun'||mode==='fear'||mode==='end')assert.deepEqual(u.pos,origin);
}
{
 const s=battle([place(ranger,0,3,3),place(dummy,1,5,3),place(dummy,1,6,7)]),[u,a,b]=s.units;release(s,u,8);a.hp=a.cfg.hp*.1;b.hp=b.cfg.hp*.5;
 for(let n=0;n<6;n++)s.step();assert.equal(s.events.filter(e=>e.t==='rope_shot').at(-1).target,a.id);
 a.hp=a.cfg.hp;b.hp=b.cfg.hp*.1;for(let n=0;n<6;n++)s.step();assert.equal(s.events.filter(e=>e.t==='rope_shot').at(-1).target,b.id);
 b.untargetableUntilTick=s.tick+100;b.hp=1;for(let n=0;n<6;n++)s.step();assert.equal(s.events.filter(e=>e.t==='rope_shot').at(-1).target,a.id,'untargetable weakest enemy is skipped');
}
for(const unit of [sand,ranger]){
 const skills=clone(input.skills);skills[unit.skillId].castSeconds=-1;assert.throws(()=>new ConfigManager().setSkills(skills));
}
const {load}=require('./helpers/ui-harness.cjs'),{buildUnitDetailData}=load(path.resolve('assets/scripts/ui/UnitDetailPresentation.ts'));
cfg.setBattle(input.battle);
for(const star of [1,2,3]){
 const s=buildUnitDetailData(cfg,{...cfg.scaleUnit(sand,star),spellPower:100,physicalPower:50},star);
 assert.ok(s.traits.includes('探险家'));assert.ok(s.traits.includes('迅武师'));assert.equal(s.skillStats[0].current,String([440,660,2000][star-1]));assert.equal(s.skillStats[1].current,String([420,630,2250][star-1]));
 assert.match(s.skillDescription,new RegExp(`${[440,660,2000][star-1]}.*护盾`));assert.match(s.skillDescription,new RegExp(`${[420,630,2250][star-1]}.*物理伤害`));
 const r=buildUnitDetailData(cfg,cfg.scaleUnit(ranger,star),star);assert.equal(r.range,4);assert.equal(r.skillStats[0].current,String([90,135,3000][star-1]));assert.equal(r.skillStats[1].current,'10');
}
for(const id of ['sandsea_navigator','hushrope_ranger']){
 const p=`assets/resources/art/units/explorer/${id}.png`;
 assert.equal(JSON.parse(fs.readFileSync(p+'.meta','utf8')).subMetas.f9941.userData.trimType,'none');
}
const placements=[place(sand,0,3,3),place(ranger,0,2,2),place(dummy,1,4,3),place(dummy,1,5,5)];
const a=battle(placements),b=battle(placements);for(const s of [a,b]){for(const u of s.units.slice(0,2)){u.mana=u.cfg.maxMana;u.atkCd=0;}for(let n=0;n<200;n++)s.step();}assert.deepEqual(a.events,b.events);
console.log('PASS rope hunt: all stars/sides, targetable/takes damage, 0.4s windup, closed edge arc, 10 timed physical shots, global health-percent priority, no attack/mana, controls/death/occupied return, cleanup, UI/original art and determinism');
