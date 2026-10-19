require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager,configuredShieldAmount}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {hexDist}=require('../assets/scripts/battle/HexMath.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const shadow=battle.traits.find(t=>t.id==='shadow'),clone=x=>JSON.parse(JSON.stringify(x));
const expected=[
 ['abyss_iron_guard',1,30,.55,1,40,100,[80,120,180]],['blackfeather_hunter',1,50,.9,4,0,50,[150,225,350]],
 ['nightmare_lamplighter',2,30,.6,1,40,110,null],['shadow_seam_assassin',2,60,.9,1,20,70,[90,135,210]],
 ['soulcleaver_general',3,65,.7,1,30,100,[260,390,650]],['ghostflame_blade',3,50,.8,1,0,60,[55,85,140]],
 ['eclipse_crossbow',4,65,.9,4,0,70,[360,560,2240]],['nether_lantern_witch',4,45,.75,4,30,100,[160,240,960]],
 ['blackstar_warlock',5,50,.75,4,30,120,[240,360,3000]],['voidscar_reaver',5,70,1,1,20,90,[100,150,1500]],
];
assert.deepEqual(shadow.members,expected.map(row=>row[0]));assert.equal(shadow.pendingMembers,false);
for(const [id,cost,atk,speed,range,start,max,damage] of expected) {
 const unit=roster.find(u=>u.id===id),skill=skills[unit.skillId];
 assert.deepEqual([unit.cost,unit.atk,unit.atkSpeed,unit.range,unit.startMana,unit.maxMana],[cost,atk,speed,range,start,max]);
 assert.deepEqual(skill.starDamage??null,damage);assert.equal(unit.critChance,.25);assert.equal(unit.manaPerHit,10);assert.equal(unit.moveTicks,6);
}
const dummy={id:'dummy',name:'dummy',hp:100000,atk:0,armor:0,mr:0,atkSpeed:.1,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0,role:'warrior',damageType:'physical'};
function create(id,star=1,{source={x:3,y:2},enemies=[{x:3,y:3},{x:6,y:7}],friends=[],bonuses={},traits=false}={}) {
 const cfg=new ConfigManager();cfg.setUnits(clone(roster));cfg.setSkills(clone(skills));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
 cfg.setBattle({...clone(battle),traits:traits?clone(battle.traits):[]});
 const hero={...cfg.getUnit(id),critChance:0,...bonuses};
 const placements=[{cfg:hero,side:0,...source,star},...enemies.map((pos,i)=>({cfg:{...dummy,id:`enemy_${i}`},side:1,...pos})),...friends.map((pos,i)=>({cfg:{...dummy,id:`friend_${i}`},side:0,...pos}))];
 const sim=new BattleSim(cfg,placements,{seed:1801026});sim.units.forEach(u=>{u.atkCd=u.moveCd=100000;});
 const src=sim.units[0];src.mana=0;
 return {sim,cfg,src,skill:cfg.getSkill(hero.skillId),enemies:sim.units.filter(u=>u.side===1),friends:sim.units.filter(u=>u.side===0&&u!==src)};
}
function settle(s){s.resolveDamage();s.resolveStuns();s.pendingDamage.length=0;s.pendingStuns.length=0;}
function activate(f,target=f.enemies[0]){f.sim.shadowSkills.activate(f.src,f.skill,target?.id);settle(f.sim);}
function advance(f,ticks){for(let i=0;i<ticks;i++){f.sim.units.forEach(u=>{u.atkCd=u.moveCd=100000;});f.sim.step();}}
function sourceHits(f){return f.sim.events.filter(e=>e.t==='hit'&&e.source===f.src.id);}
function skillPulses(f,effect){return f.sim.events.filter(e=>e.t==='skill_pulse'&&e.effect===effect);}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

// Every explicit damage base stays independent of attack, armor and generic star skill scaling.
for(const [id,,,,,,,damage] of expected)for(const star of [1,2,3]) {
 const f=create(id,star,{bonuses:{atk:1000000,physicalPower:50,spellPower:50,damageAmp:.2}});
 const rows=buildSkillStatRows(f.cfg,f.src.cfg,star,f.src.skillScale);
 assert.ok(rows.length>=2);assert.ok(rows.every(row=>!JSON.stringify(row).match(/NaN|Infinity|undefined/)));
 const body=buildSkillDescription(f.cfg,f.src.cfg,star,f.src.skillScale,true);
 assert.doesNotMatch(body,/\{[^}]+\}|NaN|Infinity|undefined/);
 if(damage) assert.ok(rows.some(row=>row.current===String(Math.round(damage[star-1]*1.5*1.2))),id+' concrete damage appears in panel');
 assert.ok(rows.every(row=>row.stars.split(' / ').length===3));
}

for(const star of [1,2,3]) {
 const f=create('abyss_iron_guard',star,{bonuses:{physicalPower:50,spellPower:900,damageAmp:1}});const base=f.src.cfg.armor;
 activate(f);assert.equal(f.src.shield,Math.round([160,240,360][star-1]*1.5));assert.equal(f.src.armor,base+[15,20,30][star-1]);
 advance(f,79);assert.ok(f.src.shield>0);advance(f,1);assert.equal(f.src.shield,0);assert.equal(f.src.armor,base);
 assert.equal(sourceHits(f).length,1);assert.equal(sourceHits(f)[0].dmg,[80,120,180][star-1]*3);assert.equal(skillPulses(f,'bulwarkBurst').length,1);
}
const broken=create('abyss_iron_guard');activate(broken);
broken.sim.damage(broken.enemies[0],broken.src,1000,'true');settle(broken.sim);
assert.equal(broken.src.skillArmorBonus,0);assert.equal(skillPulses(broken,'bulwarkBurst').length,1);
advance(broken,80);assert.equal(skillPulses(broken,'bulwarkBurst').length,1,'break and expiry never double-trigger');
const expiry=create('abyss_iron_guard');expiry.src.shield=500;activate(expiry);advance(expiry,80);assert.equal(expiry.src.shield,500,'expiry removes only this skill shield');
const recast=create('abyss_iron_guard');activate(recast);activate(recast);assert.equal(recast.src.skillArmorBonus,15);assert.equal(recast.src.shield,160);assert.equal(skillPulses(recast,'bulwarkBurst').length,1);
const physical=create('abyss_iron_guard');physical.src.cfg.physicalPower=100;physical.src.cfg.spellPower=500;
assert.equal(configuredShieldAmount(physical.src.cfg,physical.skill,1),320);
assert.equal(configuredShieldAmount(physical.src.cfg,{...physical.skill,shieldScaling:'magic'},1),960);
assert.equal(configuredShieldAmount(physical.src.cfg,{...physical.skill,shieldScaling:'fixed'},1),160);

for(const star of [1,2,3]) {
 const f=create('blackfeather_hunter',star,{source:{x:0,y:0},enemies:[{x:1,y:0},{x:2,y:0},{x:4,y:0},{x:2,y:1}],friends:[{x:3,y:0}]});
 activate(f);assert.deepEqual(sourceHits(f).map(e=>e.dmg),[[150,90,90],[225,135,135],[350,210,210]][star-1]);
 assert.equal(f.enemies[3].hp,100000);assert.equal(f.friends[0].hp,100000);
 assert.deepEqual(skillPulses(f,'piercing')[0].center,{x:6,y:0},'visual arrow reaches board edge');
}
for(const [from,to] of [[{x:3,y:3},{x:3,y:4}],[{x:3,y:3},{x:3,y:2}],[{x:3,y:3},{x:2,y:3}],[{x:3,y:3},{x:4,y:3}],[{x:3,y:2},{x:3,y:4}]]) {
 const f=create('blackfeather_hunter',1,{source:from,enemies:[to]});activate(f);assert.equal(sourceHits(f).length,1,'odd/even rows and ray directions hit their selected target');
}

for(const star of [1,2,3]) {
 const f=create('nightmare_lamplighter',star,{source:{x:3,y:2},enemies:[{x:3,y:3},{x:6,y:7}],friends:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],bonuses:{spellPower:50,physicalPower:900,damageAmp:1}});
 f.friends[0].hp=100;f.friends[1].hp=200;f.friends[2].hp=300;
 activate(f);assert.equal(f.src.shield,Math.round([260,390,600][star-1]*1.5));
 assert.deepEqual(f.friends.map(u=>u.shield),[Math.round([130,195,300][star-1]*1.5),Math.round([130,195,300][star-1]*1.5),0]);
 near(f.enemies[0].skillAttackSpeedPenalty,[.15,.2,.25][star-1]);assert.equal(f.enemies[1].skillAttackSpeedPenalty,0);
 f.src.x=6;f.src.y=6;advance(f,1);assert.equal(f.enemies[0].skillAttackSpeedPenalty,0);near(f.enemies[1].skillAttackSpeedPenalty,[.15,.2,.25][star-1]);
 advance(f,79);assert.equal(f.src.shield,0);assert.equal(f.src.snapshot(80).domainRadius,0);assert.ok(f.sim.units.every(u=>u.skillAttackSpeedPenalty===0));
}

for(const star of [1,2,3]) {
 const f=create('shadow_seam_assassin',star,{enemies:[{x:3,y:6},{x:2,y:4}]});const enemy=f.enemies[0];
 assert.equal(f.sim.shadowSkills.target(f.src,f.skill),enemy,'farthest global enemy');activate(f,enemy);
 assert.ok(f.src.y>enemy.y,'teleport behind enemy side');assert.equal(sourceHits(f).length,1);advance(f,6);
 assert.deepEqual(sourceHits(f).map(e=>e.tick),[0,3,6]);assert.equal(sourceHits(f).reduce((n,e)=>n+e.dmg,0),[270,405,630][star-1]);
 assert.ok(!f.sim.events.some(e=>e.t==='attack'),'flurry is skill hits, not basic attacks');
}
const refund=create('shadow_seam_assassin');refund.enemies[0].hp=270;activate(refund);advance(refund,6);assert.equal(refund.src.mana,35,'last-hit kill refunds once');
const later=create('shadow_seam_assassin');activate(later);advance(later,6);later.sim.damage(later.enemies[1],later.enemies[0],1000000,'true');settle(later.sim);assert.equal(later.src.mana,35,'another unit can cause the death in the window');
const late=create('shadow_seam_assassin');activate(late);advance(late,67);late.sim.damage(late.enemies[1],late.enemies[0],1000000,'true');settle(late.sim);assert.equal(late.src.mana,0,'expired refund window');
const crit=create('shadow_seam_assassin',1,{bonuses:{critChance:1,skillCanCrit:true}});activate(crit);advance(crit,6);assert.deepEqual(sourceHits(crit).map(e=>e.dmg),[135,135,135]);assert.ok(sourceHits(crit).every(e=>e.critical));

const cone=create('soulcleaver_general',1,{source:{x:3,y:2},enemies:[{x:3,y:3},{x:3,y:4},{x:3,y:1},{x:5,y:2}]});
cone.enemies[1].hp=40000;activate(cone);assert.deepEqual(sourceHits(cone).map(e=>e.dmg),[260,390]);assert.equal(cone.enemies[2].hp,100000);assert.equal(cone.enemies[3].hp,100000);
for(const star of [1,2,3]) {
 const f=create('ghostflame_blade',star);activate(f);near(f.src.skillAttackSpeedBonus,[.35,.5,.75][star-1]);
 for(let i=0;i<4;i++){f.sim.damage(f.src,f.enemies[0],f.src.cfg.atk,'physical',true);f.sim.shadowSkills.onBasicAttack(f.src,f.enemies[0]);settle(f.sim);}
 const magic=sourceHits(f).filter(e=>e.dmgType==='magic');assert.deepEqual(magic.map(e=>e.dmg),[...Array(4).fill([55,85,140][star-1]),[140,210,350][star-1]]);
 assert.equal(sourceHits(f).filter(e=>e.dmgType==='physical').length,4);assert.equal(f.src.skillAttackSpeedBonus,0);assert.equal(skillPulses(f,'flameBurst').length,1);
}
const timeout=create('ghostflame_blade');activate(timeout);advance(timeout,120);assert.equal(timeout.src.skillAttackSpeedBonus,0);assert.equal(skillPulses(timeout,'flameBurst').length,0);

for(const star of [1,2,3])for(const ratio of [.35,.349]) {
 const f=create('eclipse_crossbow',star);f.enemies[1].hp=f.enemies[1].cfg.hp*ratio;
 assert.equal(f.sim.shadowSkills.target(f.src,f.skill),f.enemies[1]);activate(f,f.enemies[1]);
 assert.equal(sourceHits(f)[0].dmg,Math.round([360,560,2240][star-1]*(ratio<.35?1.5:1)));
}
for(const star of [1,2,3]) {
 const f=create('nether_lantern_witch',star,{enemies:[{x:3,y:3}]});activate(f);advance(f,12);
 const base=[160,240,960][star-1];assert.deepEqual(sourceHits(f).map(e=>e.dmg),[base,Math.round(base*.6),Math.round(base*.6)]);
 assert.deepEqual(skillPulses(f,'lanterns').map(e=>e.tick),[0,6,12]);
 assert.equal(f.sim.events.filter(e=>e.t==='fear').length,3);
 const enemy=f.enemies[0],from=enemy.pos;enemy.moveCd=0;f.sim.updateUnit(enemy);assert.ok(hexDist(enemy.pos,enemy.fearOrigin)>hexDist(from,enemy.fearOrigin),'fear moves away');
 assert.equal(f.sim.events.filter(e=>e.t==='attack'&&e.id===enemy.id).length,0);
}
const multiple=create('nether_lantern_witch',1,{enemies:[{x:1,y:4},{x:2,y:4},{x:5,y:6},{x:6,y:6}]});activate(multiple);advance(multiple,12);
assert.equal(new Set(skillPulses(multiple,'lanterns').map(e=>`${e.center.x},${e.center.y}`)).size,3,'lanterns prefer distinct enemy cells');
for(const star of [1,2,3]) {
 const f=create('blackstar_warlock',star,{enemies:[{x:3,y:3}]});activate(f);const count=[3,3,9][star-1];advance(f,(count-1)*4);
 const base=[240,360,3000][star-1],collapse=[180,270,6000][star-1];
 assert.deepEqual(sourceHits(f).map(e=>e.dmg),[base,...Array(count-1).fill(base*.5),collapse]);assert.equal(skillPulses(f,'collapse').length,1);
}
const moving=create('blackstar_warlock',1,{enemies:[{x:3,y:3},{x:3,y:4},{x:6,y:6}]});activate(moving);moving.enemies[0].x=6;moving.enemies[0].y=5;advance(moving,4);
assert.notDeepEqual(skillPulses(moving,'blackstars')[0].center,skillPulses(moving,'blackstars')[1].center,'stars reacquire cluster each pulse');

for(const star of [1,2,3]) {
 const f=create('voidscar_reaver',star,{enemies:[{x:2,y:5},{x:5,y:5}]});activate(f);assert.equal(f.src.skillUntargetable,true);assert.equal(f.sim.targetable(f.src),false);
 const count=[5,7,20][star-1];advance(f,(count-1)*3);
 assert.equal(sourceHits(f).length,count+2);assert.equal(skillPulses(f,'voidMark').length,2,'one mark per distinct enemy');
 const strikes=skillPulses(f,'void');for(let i=1;i<strikes.length;i++)assert.notDeepEqual(strikes[i].center,strikes[i-1].center);
 assert.equal(sourceHits(f).reduce((n,e)=>n+e.dmg,0),count*[100,150,1500][star-1]+2*[160,240,4000][star-1]);
 assert.equal(f.src.skillUntargetable,false);assert.equal(f.sim.targetable(f.src),true);
}
const single=create('voidscar_reaver',1,{enemies:[{x:3,y:5}]});activate(single);advance(single,3);assert.deepEqual(sourceHits(single).map(e=>e.dmg),[100,160]);assert.equal(single.src.skillUntargetable,false);
const protectedTarget=create('voidscar_reaver');protectedTarget.enemies[1].untargetableUntilTick=100;activate(protectedTarget);advance(protectedTarget,3);assert.ok(sourceHits(protectedTarget).every(e=>e.id!==protectedTarget.enemies[1].id));

// Real full-mana cast path uses the authored skill, including global assassin selection.
for(const [id] of expected) {
 const f=create(id);f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;f.sim.step();
 assert.equal(f.sim.events.find(e=>e.t==='cast')?.skillId,f.skill.id,id+' casts through BattleSim');
 advance(f,12);assert.ok(f.sim.events.some(e=>e.t==='skill_pulse'),id+' cast resolves');
}
for(const [id] of expected) {
 function run(){const f=create(id);f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;return f.sim.run();}
 assert.deepEqual(run(),run(),id+' full event stream is deterministic');
}
const deployed=shadow.members;assert.equal(resolveTraits([shadow],[...deployed,...deployed])[0].count,10);
const edgeRay=create('blackfeather_hunter');
let rayChecks=0;
for(let y=0;y<8;y++)for(let x=0;x<7;x++)for(let v=0;v<8;v++)for(let u=0;u<7;u++) {
 const from={x,y},to={x:u,y:v},distance=hexDist(from,to);
 if(distance===0||distance>4)continue;
 assert.ok(edgeRay.sim.shadowSkills.ray(from,to).has(`${u},${v}`),`ray reaches target ${x},${y} -> ${u},${v}`);rayChecks++;
}
assert.equal(rayChecks,1854);
// Opposing sides use the same authored skills, selectors and legal teleport cells.
for(const [id] of expected) {
 const f=create(id,1,{source:{x:3,y:5},enemies:[{x:3,y:4},{x:5,y:2}]});
 f.src.side=1;f.enemies.forEach(unit=>unit.side=0);f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;
 f.sim.step();advance(f,40);
 assert.ok(f.sim.events.some(e=>e.t==='skill_pulse'&&e.id===f.src.id),id+' resolves for enemy side');
 assert.ok(f.src.x>=0&&f.src.x<7&&f.src.y>=0&&f.src.y<8);
 assert.ok(sourceHits(f).every(hit=>f.enemies.some(unit=>unit.id===hit.id)),id+' never hits its own side');
}
const breakQueue=create('abyss_iron_guard');activate(breakQueue);
breakQueue.sim.damage(breakQueue.enemies[0],breakQueue.src,160,'true');
breakQueue.sim.damage(breakQueue.enemies[0],breakQueue.src,140,'physical');settle(breakQueue.sim);
assert.equal(breakQueue.sim.events.filter(e=>e.t==='hit'&&e.id===breakQueue.src.id)[1].dmg,100,'shield break removes resistance before next queued hit');
for(const id of ['blackfeather_hunter','nether_lantern_witch']) {
 const f=create(id,1,{enemies:[{x:3,y:3}],bonuses:{physicalPower:50,spellPower:50,damageAmp:.2}});
 f.enemies[0].cfg.armor=f.enemies[0].cfg.mr=100;f.enemies[0].cfg.damageReduction=.25;activate(f);
 assert.equal(sourceHits(f)[0].dmg,Math.round(f.skill.starDamage[0]*1.5*1.2*.75*.5),'common typed damage pipeline');
}
for(const [id,change] of [
 ['nightfeather_pierce',s=>s.shadow.secondaryDamage=[1,2]],
 ['shadow_seam',s=>s.shadow.intervalSeconds=0],
 ['blackstar_annihilation',s=>s.shadow.counts=[3,3,2.5]],
 ['hundred_nether_lanterns',s=>s.shadow.repeatMultiplier=2],
 ['abyss_bulwark',s=>s.shieldScaling='attack'],
]) {
 const bad=clone(skills);change(bad[id]);assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid/);
}
const fs=require('node:fs'),crypto=require('node:crypto');
const {UNIT_ART,UNIT_PORTRAIT}=require('../assets/scripts/view/ArtPaths.ts');
const manifest=require('../art-source/shadow-roster/manifest.json'),roles=require('../assets/resources/config/enemy-roles.json');
for(const item of manifest) {
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(item.runtime)).digest('hex'),item.sha256,'supplied image remains unchanged');
 assert.ok(UNIT_ART[item.id]&&UNIT_PORTRAIT[item.id]&&roles.units[item.id]);
 const [x,y,w,h]=UNIT_PORTRAIT[item.id].split('#rawrect,')[1].split(',').map(Number);
 assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=item.width&&y+h<=item.height);
}
console.log('PASS shadow roster: exact 10-unit v3 stats/all-star values, shields/scaling/expiry/break, piercing/cone geometry, domain movement/slow, flurry/refund/crit, empowered basics, execution boundary, separate fear/cluster pulses, star decay/collapse, void jumps/marks/protection, real casts and deterministic runs');
