require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { resolveTraits } = require('../assets/scripts/battle/Traits.ts');
const { CombatStatistics } = require('../assets/scripts/battle/CombatStatistics.ts');
const { applyHealing } = require('../assets/scripts/battle/Healing.ts');
const battle = require('../assets/resources/config/battle.json');
const trait = battle.traits.find(t => t.id === 'bloodfiend');
const clone = x => JSON.parse(JSON.stringify(x));
const base = { id:'dummy',name:'dummy',hp:1000,atk:100,armor:0,mr:0,atkSpeed:1,range:20,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0 };
function setup(n = 3, side = 0, duplicates = false) {
  const cfg = new ConfigManager(), t = clone(trait);
  t.members = Array.from({length:n}, (_,i) => `blood_${i}`);t.pendingMembers = false;
  cfg.setBattle({...clone(battle),traits:[t]});
  const members = t.members.map(id => ({...base,id}));cfg.setUnits(members);
  const placements = [...members.map((u,i)=>({cfg:u,side,x:i%7,y:side?5:2})),
    {cfg:{...base,id:'ally'},side,x:0,y:side?6:1},
    ...[0,1,2].map((_,i)=>({cfg:{...base,id:`enemy_${i}`},side:1-side,x:i,y:side?0:7}))];
  if(duplicates) placements.push({cfg:members[0],side,x:1,y:side?6:1});
  const sim = new BattleSim(cfg,placements,{seed:25});
  return {cfg,sim,members:sim.units.slice(0,n),ally:sim.units[n],enemies:sim.units.slice(n+1,n+4)};
}
function damage(sim,source,target,amount,type='true') {
  sim.damage(source,target,amount,type);sim.resolveDamage();sim.pendingDamage.length=0;
}
assert.equal(trait.pendingMembers,false);assert.deepEqual(trait.members,['crimson_riftclaw','bloodline_earl','crimson_devourer','voidscar_reaver','scarlet_enchantress','crimson_demon_knight','ripsaw_spider']);
assert.equal(resolveTraits([trait],['helion'])[0].active,null);
for(const side of [0,1]) for(const n of [1,2,3,4,5,6,7]) {
  const {cfg,sim,members,ally,enemies}=setup(n,side,true),u=members[0];
  assert.equal(u.lifesteal,.1,'innate vamp applies below activation');
  assert.equal(cfg.scaleUnit(cfg.getUnit(u.cfg.id)).lifesteal,.1,'collection preview includes innate vamp');
  assert.equal(ally.lifesteal,0);
  assert.equal(resolveTraits(cfg.battle.traits,sim.units.filter(u=>u.side===side).map(u=>u.cfg.id))[0].count,n);
  u.hp=500;sim.tick=10;damage(sim,ally,enemies[0],1000);
  const e=trait.breakpoints.filter(t=>t.count<=n).at(-1)?.bloodfiend;
  assert.equal(u.hp,500+(e?Math.round(1000*e.healMaxHpFraction):0));
  u.combatTick=10;assert.equal(u.attackSpeed,1+(e?.attackSpeedBonus??0));
  assert.equal(sim.units.at(-1).hp,1000,'all duplicate carriers receive effects but count once');
  assert.equal(enemies[1].bloodfiendUntilTick,0);
  if(e){
    assert.equal(u.bloodfiendUntilTick,90);
    u.combatTick=89;assert.equal(u.attackSpeed,1+e.attackSpeedBonus);
    u.combatTick=90;assert.equal(u.attackSpeed,1,'expires at exactly four seconds');
    sim.tick=50;damage(sim,ally,enemies[1],1000);u.combatTick=50;
    assert.equal(u.bloodfiendUntilTick,130);assert.equal(u.attackSpeed,1+2*e.attackSpeedBonus,'kills stack independently');
    u.combatTick=90;assert.equal(u.attackSpeed,1+e.attackSpeedBonus,'first stack expires without refreshing');
    u.combatTick=130;assert.equal(u.attackSpeed,1,'last stack expires');
    u.cfg.atkSpeed=5;assert.equal(u.attackSpeed,5);
  }
}
for(const type of ['physical','magic','true']) {
  const {sim,members,enemies}=setup(1),u=members[0];u.hp=500;
  damage(sim,u,enemies[0],100,type);assert.equal(u.hp,510);
  enemies[0].shield=100;damage(sim,u,enemies[0],100,type);assert.equal(u.hp,510,'absorbed damage has no vamp');
  enemies[0].hp=20;damage(sim,u,enemies[0],100,type);assert.equal(u.hp,512,'overkill excluded');
}
{
  const {sim,members,ally,enemies}=setup(7),u=members[0];u.hp=950;u.shield=25;
  const stats=new CombatStatistics();stats.begin(sim.units);
  damage(sim,ally,enemies[0],1000);
  assert.equal(u.hp,1000);assert.equal(u.shield,125,'50 healing plus 100 overflow, preserve other shield');
  damage(sim,u,enemies[1],200);assert.equal(u.shield,145,'full-health vamp converts');
  applyHealing(ally,u,80,sim.tick,sim.events);assert.equal(u.shield,225,'external healing converts');
  sim.sunlight.heal(ally,u,50);assert.equal(u.shield,275,'Sunlight healing uses the same settlement');
  stats.consume(sim.events);
  const row=stats.snapshot().find(r=>r.id===u.id);
  assert.equal(row.healing,50);assert.equal(row.shielding,120);
  assert.equal(stats.snapshot().find(r=>r.id===ally.id).shielding,130,'external shields credited to healer; revel shields belong to each bloodfiend');
  // Persistent shield survives buff expiry and combines with other shield sources.
  u.combatTick=100;assert.equal(u.attackSpeed,1);assert.equal(u.shield,275);
  sim.end(0);assert.equal(u.bloodfiendUntilTick,0);
}
for(const n of [3,5]){
  const {sim,members}=setup(n),u=members[0];applyHealing(u,u,100,0,sim.events);assert.equal(u.shield,0);
}
{
  const {sim,members,ally,enemies}=setup(7),u=members[0];u.hp=100;
  sim.damage(ally,enemies[0],1000,'true');sim.damage(ally,enemies[0],1000,'true');
  sim.damage(enemies[1],u,1000,'true');sim.resolveDamage();
  assert.equal(u.hp,0);assert.equal(u.alive,false);assert.equal(u.shield,0);assert.equal(u.bloodfiendUntilTick,0);
  assert.equal(sim.events.filter(e=>e.t==='bloodfiend_revel').length,6,'one death triggers once, only surviving members');
}
{
  const {sim,members,ally,enemies}=setup(7);const u=members[0];
  sim.damage(ally,enemies[0],1000,'true');sim.damage(ally,enemies[1],1000,'true');sim.resolveDamage();
  assert.equal(u.shield,300,'two distinct kills trigger two heals');
  assert.equal(u.bloodfiendStackCount,2,'same-tick kills grant two independent stacks');
  u.combatTick=80;assert.equal(u.bloodfiendStackCount,0,'same-tick stacks expire together after four seconds');
}
{
  const {cfg,sim,members,ally}=setup(1);
  const unit=cfg.scaleUnit({...ally.cfg,grantedTraitIds:['bloodfiend']});assert.equal(unit.lifesteal,.1);
  const innate=cfg.scaleUnit({...cfg.getUnit(members[0].cfg.id),lifesteal:.95});assert.equal(innate.lifesteal,1);
  assert.equal(cfg.equipmentStats({...unit,grantedTraitIds:['bloodfiend']}).lifesteal,.1,'no double innate on equipment pass');
  assert.equal(sim.units[0].bloodfiend,undefined);
}
for(const [key,value] of [['attackSpeedBonus',-1],['durationSeconds',0],['healMaxHpFraction',1.1],['overhealShieldRatio',NaN]]) {
  const t=clone(trait);t.breakpoints[0].bloodfiend[key]=value;
  assert.throws(()=>new ConfigManager().setBattle({...clone(battle),traits:[t]}),/Invalid bloodfiend/);
}
{
  const t=clone(trait);t.innateLifesteal=Infinity;
  assert.throws(()=>new ConfigManager().setBattle({...clone(battle),traits:[t]}),/Invalid innate/);
}
assert.deepEqual(setup(7).sim.run(),setup(7).sim.run(),'seeded replay remains deterministic');
console.log('PASS bloodfiend: seven-member roster, innate vamp, both sides/all tiers, allied kills, deduplication, independent four-second stacks/expiry/cap, all healing overflow, statistics, no revival and determinism');
