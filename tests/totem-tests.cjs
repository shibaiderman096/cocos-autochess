require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { CombatStatistics } = require('../assets/scripts/battle/CombatStatistics.ts');
const equipment = require('../assets/resources/config/equipment.json');
const cfg = new ConfigManager(); cfg.setEquipment(equipment);
const id = 'totem_of_undying';
const base = { id:'test', name:'test', hp:800, atk:0, armor:0, mr:0, atkSpeed:1,
  range:10, moveTicks:1, maxMana:0, startMana:0, manaPerHit:0, critChance:0, damageReduction:1 };
function make(items=[id], extra=[]) {
  return new BattleSim(cfg, [
    {cfg:base, side:0, x:0, y:0, equipment:items},
    {cfg:base, side:1, x:1, y:0}, ...extra,
  ], {seed:7, maxTicks:300});
}
const triggers = sim => sim.events.filter(e => e.t === 'equipment_trigger');
const heals = sim => sim.events.filter(e => e.t === 'heal' && e.id === 1);
// Controlled raw hits use the same mitigation/queue/resolve path as real attacks.
function hit(sim, raw, type='true', targeted=true) {
  const [dst, src] = sim.units;
  sim.pendingDamage.length = 0;
  const reduction = dst.cfg.damageReduction; dst.cfg.damageReduction = 0;
  sim.damage(src, dst, raw, type, false, false, targeted);
  sim.resolveDamage(); sim.pendingDamage.length = 0;
  dst.cfg.damageReduction = reduction;
}
for (const star of [1,2,3]) {
  const scaled = cfg.scaleUnit(base, star, 1.2);
  const stats = cfg.equipmentStats(scaled, [id]);
  assert.equal(stats.hp, scaled.hp + 200, 'equipment HP added after star/wave scaling');
  assert.equal(stats.armor, scaled.armor + 10); assert.equal(stats.mr, scaled.mr + 10);
}
assert.equal(base.hp,800); assert.equal(make().units[0].hp,1000);
assert.equal(make().units[0].attackSpeed,1);
for (const type of ['physical','magic']) {
  const sim=make(); hit(sim,110,type); assert.equal(sim.units[0].hp,900,'10 resistance mitigates damage');
}
{
  const sim=make(), u=sim.units[0];
  u.hp=50; sim.step(); assert.equal(triggers(sim).length,0,'exactly 5% does not trigger');
  assert.equal(u.equipmentAttackStacks,0,'totem does not generate attack-speed stacks');
  hit(sim,1); assert.equal(u.hp,49); assert.equal(u.shield,100);
  assert.equal(triggers(sim).length,1); assert.equal(u.equipmentRegen.delivered,0,'no instant heal');
  const start=sim.tick;
  u.stunnedUntilTick=200; // Item regeneration is independent of ability/channel/stun state.
  while(sim.tick<start+50) sim.step();
  assert.equal(u.hp,99,'half the healing delivered after 2.5 seconds');
  while(sim.tick<start+100) sim.step();
  assert.equal(u.hp,149); assert.equal(u.equipmentRegen,null);
  assert.equal(heals(sim).reduce((sum,e)=>sum+e.amount,0),100);
  assert.equal(heals(sim)[0].tick,start+1); assert.equal(heals(sim).at(-1).tick,start+100);
  const stats=new CombatStatistics(); stats.begin(sim.units); stats.consume(sim.events);
  assert.equal(stats.snapshot().find(r=>r.id===1).healing,100);
  hit(sim,201); assert.equal(u.hp,48); assert.equal(triggers(sim).length,1,'no retrigger');
}
{
  // Real attacks, three simultaneous enemies, lethal first hit, later queued hits miss.
  const enemy={...base, atk:2000, damageReduction:0};
  const sim=new BattleSim(cfg,[{cfg:{...base,damageReduction:0},side:0,x:0,y:0,equipment:[id]},
    ...[1,2,3].map(x=>({cfg:enemy,side:1,x,y:0}))],{seed:11});
  sim.step(); const u=sim.units[0];
  assert.equal(u.hp,1); assert.equal(u.alive,true); assert.equal(u.shield,100);
  assert.equal(sim.events.filter(e=>e.t==='hit'&&e.id===1).length,1,'same-tick targeted hits miss');
  assert.ok(!sim.events.some(e=>e.t==='death'&&e.id===1));
  assert.equal(triggers(sim).length,1);
}
{
  const sim=make(), u=sim.units[0]; u.hp=49; sim.step();
  const start=sim.tick;
  for(let n=0;n<6;n++) {
    assert.equal(u.snapshot(sim.tick).untargetable,true);
    hit(sim,999); assert.equal(u.shield,100,'targeted hit blocked');
    if(n<5) sim.step();
  }
  sim.step(); assert.equal(sim.tick,start+6);
  assert.equal(u.snapshot(sim.tick).untargetable,false,'targetable at 0.3 seconds');
  const hp=u.hp; hit(sim,80,'magic'); assert.equal(u.hp,hp); assert.equal(u.shield,27);
  hit(sim,50); assert.equal(u.hp,hp-23); assert.equal(u.shield,0,'shield absorbs before HP');
}
{
  // New selection, priority selection, lowest-HP selection and teleport selection all skip it.
  const sim=make([id],[{cfg:base,side:0,x:2,y:0}]), [u,enemy,ally]=sim.units;
  u.hp=49; sim.step();
  assert.equal(sim.nearestEnemy(enemy),ally);
  assert.equal(sim.teleportTarget(enemy,{targetRange:10}),ally);
  enemy.priorityTarget=u.id; enemy.atkCd=0; sim.step();
  assert.equal(sim.events.filter(e=>e.t==='attack'&&e.id===enemy.id).at(-1).target,ally.id);
  cfg.setSkills({test_bolt:{id:'test_bolt',power:1,radius:0,dmgType:'magic',targeting:'lowestHp'}});
  enemy.cfg.skillId='test_bolt'; enemy.cfg.maxMana=10; enemy.mana=10; enemy.atkCd=0; sim.step();
  assert.equal(sim.events.filter(e=>e.t==='cast'&&e.id===enemy.id).at(-1).target,ally.id);
}
{
  // A delayed single-target spell loses its target during the 0.3-second window.
  cfg.setSkills({stun:{id:'stun',power:200,radius:0,dmgType:'magic',targeting:'nearest',
    effect:'damageStun',castSeconds:.1,spellMultipliers:[1,1,1],stunSeconds:[1,1,1]}});
  const sim=make(), [u,enemy]=sim.units;
  enemy.cfg.skillId='stun'; enemy.cfg.maxMana=10; enemy.mana=10;
  sim.step(); assert.ok(enemy.pendingCast);
  u.hp=49; sim.step(); sim.step();
  assert.ok(!enemy.pendingCast); assert.equal(u.stunnedUntilTick,0);
  assert.ok(!sim.events.some(e=>e.t==='skill_impact'));
}
{
  const sim=make(), [u,enemy]=sim.units; u.hp=49; sim.step();
  u.burns.push({sourceId:enemy.id,skillId:'burn',nextTick:sim.tick+1,intervalTicks:20,
    remainingPulses:1,rawDamage:30,dmgType:'true'});
  u.cfg.damageReduction=0; sim.step(); u.cfg.damageReduction=1;
  assert.equal(u.shield,70,'existing burn continues through untargetability');
  hit(sim,20,'true',false); assert.equal(u.shield,50,'area damage also consumes shield');
  hit(sim,1000,'true',false); assert.equal(u.alive,false); assert.equal(u.equipmentRegen,null);
  assert.equal(triggers(sim).length,1,'cannot revive again');
}
{
  const sim=make([id,id,id]), u=sim.units[0];
  assert.equal(u.cfg.hp,1400); assert.equal(u.cfg.armor,30); assert.equal(u.cfg.mr,30);
  hit(sim,9999); assert.equal(u.hp,1); assert.equal(u.shield,140);
  assert.equal(triggers(sim).length,1,'passive shared by carrier');
  const next=make([id,id,id]).units[0];
  assert.equal(next.lowHealthProtectionUsed,false); assert.equal(next.shield,0);
  assert.equal(next.equipmentRegen,null); assert.equal(next.untargetableUntilTick,0);
}
{
  const sim=make(),u=sim.units[0]; u.hp=49; sim.step(); u.hp=999;
  for(let n=0;n<100;n++) sim.step();
  assert.equal(u.hp,1000); assert.equal(heals(sim).reduce((n,e)=>n+e.amount,0),1,'healing capped at max HP');
  const small=new BattleSim(cfg,[{cfg:{...base,hp:1},side:0,x:0,y:0,equipment:[id]},
    {cfg:base,side:1,x:1,y:0}]); small.units[0].hp=1; small.step();
  for(let n=0;n<100;n++) small.step();
  assert.equal(small.units[0].hp,21,'fractional per-tick heals keep exact total');
}
const deterministic=()=>{const sim=make();sim.units[0].hp=49;return sim.run();};
assert.deepEqual(deterministic(),deterministic());
const item=equipment.find(e=>e.id===id), asset=path.join(__dirname,'../assets/resources',item.icon.replace('/spriteFrame','.png'));
assert.ok(fs.existsSync(asset));
const meta=JSON.parse(fs.readFileSync(asset+'.meta','utf8'));
assert.equal(meta.subMetas.f9941.userData.width,160);
assert.equal(meta.subMetas['6c48a'].userData.minfilter,'nearest');
assert.equal(meta.userData.hasAlpha,true);
console.log('PASS totem: stats, strict threshold, lethal save, same-tick protection, six-tick untargetability, targeting, delayed spells, shield, burn/AoE, 100-tick healing, stun independence, duplicate passive, death/reset, deterministic replay and icon');
