require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { CombatStatistics } = require('../assets/scripts/battle/CombatStatistics.ts');
const { hexDist, hexNeighbors } = require('../assets/scripts/battle/HexMath.ts');
const { buildSkillDescription, buildSkillStatRows, unitRoleLabel } = require('../assets/scripts/ui/SkillPresentation.ts');
const { resolveTraits } = require('../assets/scripts/battle/Traits.ts');
const units = require('../assets/resources/config/units.json');
const skills = require('../assets/resources/config/skills.json');
const battle = require('../assets/resources/config/battle.json');
const equipment = require('../assets/resources/config/equipment.json');
const clone = x => JSON.parse(JSON.stringify(x));
const normal = [90, 135, 1600], final = [450, 675, 8000], counts = [2, 4, 10];
function fixture({star = 1, side = 0, bonuses = {}, enemies = [{x:3,y:5},{x:6,y:7}], ally = false, friends = []} = {}) {
  const c = new ConfigManager(); c.setUnits(clone(units)); c.setSkills(clone(skills));
  c.setBattle({...clone(battle), traits:[]}); c.setEquipment(clone(equipment));
  const dummy = {id:'dummy',name:'dummy',hp:1000000,atk:0,armor:0,mr:0,atkSpeed:.1,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
  const s = new BattleSim(c, [
    {cfg:{...c.getUnit('seraphiel'),critChance:0,...bonuses},side,star,x:3,y:2},
    ...enemies.map(({equipment:items,...p},i) => ({cfg:{...dummy,id:'enemy'+i},side:1-side,...p,equipment:items})),
    ...(ally ? [{cfg:dummy,side,x:0,y:0}] : []),
    ...friends.map(p=>({cfg:dummy,side,...p}))
  ], {seed:1019});
  s.units.forEach(u => {u.mana=0;u.atkCd=u.moveCd=100000;}); s.start();
  return {s,c,src:s.units[0],targets:s.units.slice(1,1+enemies.length),sk:c.getSkill('corona_transit')};
}
function settle(f) {f.s.resolveDamage();f.s.resolveStuns();f.s.pendingDamage.length=0;f.s.pendingStuns.length=0;}
function activate(f) {f.s.sunlight.activate(f.src,f.sk,f.targets[0].id);settle(f);}
function advance(f,n) {for(let i=0;i<n;i++){f.s.units.forEach(u=>u.atkCd=u.moveCd=100000);f.s.step();}}
const hits = f => f.s.events.filter(e=>e.t==='hit'&&e.source===f.src.id);
const casts = f => f.s.events.filter(e=>e.t==='cast'&&e.id===f.src.id);
for (const side of [0,1]) for (const star of [1,2,3]) for (const physicalPower of [0,50]) for (const spellPower of [0,900]) {
  const f=fixture({side,star,bonuses:{atk:99999,physicalPower,spellPower,damageAmp:.2}});
  activate(f);const start={...f.src.pos};
  assert.equal(f.src.skillUntargetable,false);
  const multiplier=(1+physicalPower/100)*1.2;
  advance(f,(counts[star-1]-1)*4-1);
  assert.equal(hits(f).length,counts[star-1]-1,'finisher waits for its configured tick');
  assert.equal(f.s.sunlight.busy(f.src),true);
  advance(f,1);
  assert.deepEqual(hits(f).map(e=>e.dmg),[...Array(counts[star-1]-1).fill(Math.round(normal[star-1]*multiplier)),Math.round(final[star-1]*multiplier)]);
  assert.ok(hits(f).every((e,i)=>e.id===f.targets[0].id&&e.dmgType==='physical'&&e.tick===i*4));
  assert.equal(f.s.sunlight.busy(f.src),false);
  assert.deepEqual(f.src.pos,start,'no movement between combo hits');
  assert.equal(f.s.events.filter(e=>e.t==='teleport').length,1);
  assert.equal(f.s.events.filter(e=>e.t==='sun_pulse'&&e.finisher).length,1);
  const rows=buildSkillStatRows(f.c,f.src.cfg,star,f.src.skillScale,true);
  assert.deepEqual(rows.map(r=>r.label),['连击次数','普通段伤害','最后一击伤害']);
  assert.equal(rows[2].current,String(hits(f).at(-1).dmg));
  const text=buildSkillDescription(f.c,f.src.cfg,star,f.src.skillScale,true);
  assert.ok(text.includes(rows[2].current));assert.match(text,/attr_phys_bonus/);assert.doesNotMatch(text,/attr_spell_bonus|魔法伤害|\{[^}]+\}/);
  assert.equal(rows[0].current,String(counts[star-1]));assert.equal(rows[0].stars,'2 / 4 / 10');
  assert.match(buildSkillDescription(f.c,f.src.cfg,star,f.src.skillScale),/每次重放降低20%伤害（至多40%）/);
}
// Killing during an ordinary hit or on the finisher restarts from hit zero, without mana.
for(const lethalHp of [80,500]){
  const f=fixture({enemies:[{x:3,y:5},{x:0,y:7},{x:4,y:5},{x:2,y:5}]});
  f.targets[0].hp=lethalHp;f.targets[3].skillUntargetable=true;f.src.mana=17;
  activate(f);const killTick=lethalHp===80?0:4;advance(f,killTick);
  assert.equal(f.targets[0].alive,false);assert.equal(casts(f).length,0);
  const nearest=f.targets.filter(u=>u.alive&&!u.skillUntargetable).sort((a,b)=>hexDist(f.src.pos,a.pos)-hexDist(f.src.pos,b.pos)||a.id-b.id)[0];
  advance(f,3);assert.equal(casts(f).length,0);advance(f,1);
  assert.equal(casts(f)[0].target,nearest.id);assert.equal(casts(f)[0].duration,0);
  assert.equal(hits(f).at(-1).dmg,72);assert.equal(hits(f).at(-1).id,nearest.id);
  assert.equal(hexDist(f.src.pos,nearest.pos),1);assert.equal(f.src.mana,17);
  assert.equal(f.s.events.filter(e=>e.t==='teleport').length,2);
  advance(f,4);assert.deepEqual(hits(f).filter(e=>e.id===nearest.id).map(e=>e.dmg),[72,360]);
  assert.equal(f.s.sunlight.busy(f.src),false);
}
// A complete kill chain terminates and contributes only effective HP damage to statistics.
function chain(side){const f=fixture({side,enemies:[{x:3,y:4},{x:2,y:6},{x:4,y:6}]});f.targets.forEach(u=>u.hp=1);
  const statistics=new CombatStatistics();statistics.begin(f.s.units);activate(f);advance(f,8);
  assert.ok(f.targets.every(u=>!u.alive));assert.equal(hits(f).length,3);assert.equal(casts(f).length,2);
  assert.equal(f.s.sunlight.busy(f.src),false);assert.equal(f.src.skillUntargetable,false);
  statistics.consume(f.s.events);assert.equal(statistics.snapshot().find(r=>r.id===f.src.id).damage,3);
  return f.s.events;}
for(const side of [0,1])assert.deepEqual(chain(side),chain(side),'fixed-seed chain is deterministic');
// Recasts lose 20 percentage points of base skill damage, cap at 40%, and affect finishers too.
for(const side of [0,1])for(const star of [1,2,3]){
 const f=fixture({side,star,bonuses:{physicalPower:50,spellPower:900,damageAmp:.2},enemies:[{x:3,y:4},{x:1,y:5},{x:5,y:5},{x:2,y:7},{x:4,y:7}]});
 f.targets.forEach(u=>u.hp=1);activate(f);advance(f,12);
 f.targets.find(u=>u.alive).hp=1000000;advance(f,4+(counts[star-1]-1)*4);
 const multiplier=1.5*1.2;
 assert.deepEqual(hits(f).slice(0,5).map(e=>e.dmg),[1,.8,.6,.6,.6].map(r=>Math.round(normal[star-1]*r*multiplier)));
 const survivor=hits(f).at(-1).id,combo=hits(f).filter(e=>e.id===survivor);
 assert.equal(combo.length,counts[star-1]);assert.equal(combo.at(-1).dmg,Math.round(final[star-1]*.6*multiplier));
 assert.equal(f.s.sunlight.busy(f.src),false);assert.equal(f.src.cfg.damageAmp,.2,'recast loss never mutates general damage amplification');
 // Enter a new cast through the actual mana/skill path, without rebuilding the battle.
 f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;f.s.step();
 assert.equal(casts(f).at(-1).skillId,f.sk.id);assert.equal(hits(f).at(-1).dmg,Math.round(normal[star-1]*multiplier),'normal paid cast starts at full damage');
}
// Equal-distance enemies use stable ID ordering.
{
 const f=fixture({enemies:[{x:3,y:5},{x:2,y:5},{x:4,y:5}]});activate(f);
 const alive=f.targets.slice(1);alive[0].x=2;alive[0].y=4;alive[1].x=4;alive[1].y=4;
 assert.equal(hexDist(f.src.pos,alive[0].pos),hexDist(f.src.pos,alive[1].pos));
 f.targets[0].hp=1;advance(f,8);assert.equal(casts(f)[0].target,alive[0].id);
}
// A teammate or a separate basic hit cannot earn a skill reset, including same-tick overkill.
for(const sameSource of [false,true]){
 const f=fixture({ally:true});f.targets[0].hp=1;
 f.s.damage(sameSource?f.src:f.s.units.at(-1),f.targets[0],1,'true');activate(f);advance(f,8);
 assert.equal(casts(f).length,0);assert.equal(f.s.sunlight.busy(f.src),false);
}
// Shields and survival equipment are resolved before the kill decision.
{
 const f=fixture();f.targets[0].hp=1;f.targets[0].shield=2000;activate(f);advance(f,16);
 assert.equal(f.targets[0].hp,1);assert.equal(casts(f).length,0);assert.equal(f.s.sunlight.busy(f.src),false);
 for(const hp of [1,500]){
  const p=fixture({enemies:[{x:3,y:5,equipment:['totem_of_undying']},{x:6,y:7}]});
  p.targets[0].cfg.hp=1000;p.targets[0].cfg.armor=0;p.targets[0].cfg.mr=0;p.targets[0].hp=hp;
  activate(p);if(hp===500)advance(p,4);
  assert.equal(p.targets[0].hp,1);assert.equal(p.targets[0].alive,true);
  assert.equal(p.s.events.filter(e=>e.t==='equipment_trigger').length,1);advance(p,4);
  assert.equal(casts(p).length,0);assert.equal(p.s.sunlight.busy(p.src),false);
 }
}
// A final hit blocked during resolution still ends the channel rather than leaving it busy forever.
{
 const f=fixture();activate(f);f.s.tick+=4;f.s.sunlight.update();f.targets[0].skillUntargetable=true;settle(f);
 assert.equal(hits(f).length,1);assert.equal(f.s.sunlight.busy(f.src),false);
}
// No invulnerability: real enemy damage and stun can kill or interrupt this combo.
for(const action of ['damage','stun','fear']){
 const f=fixture();activate(f);
 if(action==='damage')f.s.damage(f.targets[0],f.src,999999,'true');
 else f.s.pendingStuns.push({src:f.targets[0],dst:f.src,seconds:1,...(action==='fear'?{fearOrigin:f.targets[0].pos}:{})});
 settle(f);advance(f,20);assert.equal(hits(f).length,1);assert.equal(f.s.sunlight.busy(f.src),false);
 if(action==='damage')assert.equal(f.src.alive,false);else assert.ok(f.s.events.some(e=>e.t===action&&e.id===f.src.id));
}
// The nearest target is not replaced with a farther one when no adjacent landing cell is free.
{
 const friends=hexNeighbors(3,7).filter(p=>p.x>=0&&p.x<7&&p.y>=0&&p.y<8);
 const f=fixture({enemies:[{x:3,y:5},{x:3,y:7},{x:0,y:0}],friends});activate(f);f.targets[0].hp=1;advance(f,4);
 advance(f,4);assert.equal(casts(f).length,0);assert.equal(f.s.sunlight.busy(f.src),false);
}
for(const value of [undefined,[1,2],[450,675,NaN],[90,675,8000]]){
 const bad=clone(skills);bad.corona_transit.sunlight.finalDamage=value;
 assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid sunlight/);
}
for(const [key,value] of [['recastDamageLoss',undefined],['recastDamageLoss',NaN],['recastDamageLoss',-.1],['recastDamageLoss',1.1],
 ['recastDamageLossCap',undefined],['recastDamageLossCap',NaN],['recastDamageLossCap',-.1],['recastDamageLossCap',.1],['recastDamageLossCap',1.1]]){
 const bad=clone(skills);bad.corona_transit.sunlight[key]=value;assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid sunlight/);
}
// The new role changes class membership and resistance/scaling paths in actual combat.
const members=resolveTraits(battle.traits,['seraphiel','turbo_fist_tiger'],units);
assert.equal(members.find(t=>t.config.id==='assassin').memberIds.includes('seraphiel'),false);
assert.equal(members.find(t=>t.config.id==='conqueror').active.count,2);
assert.equal(unitRoleLabel('warrior','physical'),'物理战士');
for(const side of [0,1]){
 const f=fixture({side});f.targets[0].cfg.armor=100;f.targets[0].cfg.mr=900;
 activate(f);advance(f,4);assert.deepEqual(hits(f).map(e=>e.dmg),[45,225],'armor mitigates every combo segment, magic resistance does not');
 assert.equal(f.src.attackSpeed,.8);
}
console.log('PASS Seraphiel: physical warrior/class membership, 0.8 attack speed, all-star physical scaling and armor/panels, fixed timing, kill recasts, effective statistics, deterministic chains, shields/totem, interruption/death and invalid configuration');
