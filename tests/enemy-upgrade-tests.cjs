require('tsx/cjs');
const assert=require('node:assert/strict');
const {loadRunInputs,loadEnemyGenerationInputs,loadEquipmentInputs,loadFormationInputs}=require('../tools/run-simulation.ts');
const {buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {applyEnemyUpgrades,enemyEquipmentFits}=require('../assets/scripts/core/EnemyUpgrades.ts');
const {resolveEnemyRole}=require('../assets/scripts/core/EnemyRoles.ts');
const {validateEquipmentPolicy}=require('../assets/scripts/core/EquipmentPolicy.ts');
const input=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadEquipmentInputs(),...loadFormationInputs()};
const p=deps.equipmentPolicy,tags=p.enemy.itemTags,clone=x=>JSON.parse(JSON.stringify(x));
const build=(stages,seed=17,policy=p)=>buildRunWaves(stages,input.run,input.waves,input.units,{mode:'budget-v1',runSeed:seed,
 difficulty:deps.enemyDifficulty,power:deps.enemyPower,equipmentPolicy:policy,equipmentRoles:deps.enemyRoles});
assert.deepEqual(Object.keys(tags).sort(),input.equipment.map(e=>e.id).sort(),'all current items have internal labels');
validateEquipmentPolicy(p,input.equipment,deps.enemyPower);
assert.equal(tags.trait_emblem.enabled,false);
const role=u=>resolveEnemyRole(u,input.skills,deps.enemyRoles).role;
const tank=input.units.find(u=>u.id==='helion'),physical=input.units.find(u=>u.id==='atlas'),magic=input.units.find(u=>u.id==='celine');
assert.ok(enemyEquipmentFits(physical,role(physical),tags.divine_judgment),'physical caster gets physical gear');
assert.equal(enemyEquipmentFits(physical,role(physical),tags.arcane_sovereignty),false);
assert.ok(enemyEquipmentFits(magic,role(magic),tags.arcane_sovereignty));
assert.equal(enemyEquipmentFits(tank,role(tank),tags.blazing_feather),false,'tank gets defensive gear');
assert.equal(enemyEquipmentFits({...magic,maxMana:0},role(magic),tags.arcane_overflow_codex),false);
assert.equal(enemyEquipmentFits({...magic,skillId:undefined},role(magic),tags.spell_overdrive_armor),false);
for(const mutate of [q=>delete q.enemy.itemTags.guinsoo,q=>q.enemy.itemTags.guinsoo.roles=['bogus'],
 q=>q.enemy.equipmentEconomy.boss.initialGold=-1,q=>q.enemy.equipmentEconomy.elite.healthMultiplier=2]){
 const q=clone(p);mutate(q);assert.throws(()=>validateEquipmentPolicy(q,input.equipment,deps.enemyPower),/Invalid equipment policy/);
}
const waves=build(99),seen=new Set();
for(let seed=17;seed<27;seed++){
 const current=seed===17?waves:build(99,seed);
 for(const wave of current){
  const upgrade=wave.enemyUpgrade,eligible=wave.stage>=2&&['normal','elite','boss'].includes(wave.encounterKind);
  assert.equal(!!upgrade,eligible);
  if(!upgrade){assert.ok(wave.enemies.every(e=>!e.equipment?.length&&!e.healthMultiplier));continue;}
  const rule=p.enemy.equipmentEconomy[wave.encounterKind],cost=p.enemy.equipmentEconomy.itemCost;
  assert.equal(upgrade.goldBudget,6*(wave.stage-1)+(wave.encounterKind==='elite'?wave.stage:wave.encounterKind==='boss'?2*wave.stage:0));
  assert.equal(upgrade.goldSpent,upgrade.equipmentIds.reduce((n,id)=>n+(tags[id].goldCost??cost),0));assert.equal(upgrade.goldRemaining,upgrade.goldBudget-upgrade.goldSpent);
  assert.ok(upgrade.goldRemaining>=0);if(upgrade.itemCount<wave.enemies.length*3)assert.ok(upgrade.goldRemaining<3);
  assert.equal(upgrade.itemCount,wave.enemies.reduce((n,e)=>n+e.equipment.length,0));
  assert.ok(wave.enemies.filter(e=>e.equipment.length>0&&e.equipment.length<3).length<=1,'only the final carrier may have a partial loadout');
  assert.equal(wave.enemies.filter(e=>e.equipment.length>0).length,Math.ceil(upgrade.itemCount/3),'fill one three-slot loadout before starting another');
  for(const enemy of wave.enemies){
   const unit=input.units.find(u=>u.id===enemy.unitId);assert.ok(enemy.equipment.length<=3);assert.equal(enemy.healthMultiplier,rule.healthMultiplier??1);
   for(const id of enemy.equipment){seen.add(id);assert.ok(enemyEquipmentFits(unit,role(unit),tags[id]),`${unit.id}: ${id} must fit`);}
  }
 }
}
assert.deepEqual([...seen].sort(),Object.keys(tags).filter(id=>tags[id].enabled).sort(),'new uncalibrated items also reach enemies');
const concentrated=applyEnemyUpgrades({id:2001,stage:2,encounterKind:'normal',enemies:[
 {unitId:tank.id,star:1,x:2,y:4,equipment:[]},{unitId:tank.id,star:2,x:3,y:4,equipment:[]},
]},p,input.units,new RunRandomContext(17),deps.enemyRoles);
assert.equal(concentrated.enemies[0].equipment.length,0);
assert.ok(concentrated.enemies[1].equipment.length>0,'the more invested eligible unit receives the concentrated equipment');
for(const kind of ['elite','boss']){
 const w=waves.find(w=>w.stage===4&&w.encounterKind===kind);
 assert.equal(w.enemyUpgrade.goldBudget,kind==='elite'?22:26);
 assert.ok(w.enemyUpgrade.itemCount>=3&&w.enemyUpgrade.itemCount<=8);
}
const base=buildRunWaves(99,input.run,input.waves,input.units,{mode:'budget-v1',runSeed:17,difficulty:deps.enemyDifficulty,power:deps.enemyPower});
for(let i=0;i<waves.length;i++){
 assert.deepEqual(waves[i].enemies.map(e=>[e.unitId,e.star,e.x,e.y]),base[i].enemies.map(e=>[e.unitId,e.star,e.x,e.y]),'bonus gold never replaces units or stars');
 assert.equal(waves[i].budget?.effectiveBudget,base[i].budget?.effectiveBudget);
}
for(const stage of [3,6])assert.deepEqual(build(stage),waves.filter(w=>w.stage<=stage));
assert.deepEqual(build(10),build(10));
const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setEquipment(input.equipment);cfg.setBattle({...input.battle,traits:[]});
const enemy=waves.find(w=>w.stage===4&&w.encounterKind==='boss').enemies[0],unit=cfg.getUnit(enemy.unitId);
const boosted=new BattleSim(cfg,[{...enemy,cfg:unit,side:1}]).units[0],unboosted=new BattleSim(cfg,[{...enemy,healthMultiplier:1,cfg:unit,side:1}]).units[0];
const expectedBase=cfg.scaleUnit(unit,enemy.star,enemy.statMultiplier);expectedBase.hp=Math.round(expectedBase.hp*1.1);
assert.equal(boosted.cfg.hp,cfg.equipmentStats(expectedBase,enemy.equipment).hp);
for(const key of ['atk','armor','mr','atkSpeed','spellPower','physicalPower','maxMana'])assert.equal(boosted.cfg[key],unboosted.cfg[key],`HP bonus cannot change ${key}`);
assert.equal(boosted.skillScale,unboosted.skillScale);
function session(policy=p,save){const c=new ConfigManager();c.setUnits(input.units);c.setSkills(input.skills);c.setEquipment(input.equipment);c.setBattle(input.battle);
 return new RunSession(c,input.run,input.waves,{...deps,equipmentPolicy:policy,stageCount:10,runSeed:17,...(save?{save}:{})});}
const s=session(),saved=s.snapshot();assert.deepEqual(session(p,saved).waves,s.waves,'save/load preserves items and health');
const boss=s.waves.find(w=>w.stage===4&&w.encounterKind==='boss');assert.ok(s.debugJump(4,boss.round));
assert.deepEqual(applyEnemyUpgrades(boss,p,input.units,new RunRandomContext(17),deps.enemyRoles),boss,'applying bonuses twice cannot double-buy or stack health');
assert.ok(s.createPreview().sim.units.filter(u=>u.side===1).some(u=>u.equipment.length),'preview gets actual equipment');
const placements=s.formation.placements,preview=s.createPreview().sim;
const direct=new BattleSim(s.cfg,placements.map(e=>({...e,cfg:s.cfg.getUnit(e.unitId),side:1})),{seed:s.battleSeed});
assert.deepEqual(preview.units.filter(u=>u.side===1).map(u=>u.cfg.hp),direct.units.map(u=>u.cfg.hp),'preview forwards the health bonus through placement');
if(!s.owned.onBoard().length)assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
const actual=s.startBattle();assert.ok(actual);
assert.deepEqual(actual.units.filter(u=>u.side===1).map(u=>[u.cfg.hp,u.equipment.map(e=>e.id)]),
 direct.units.map(u=>[u.cfg.hp,u.equipment.map(e=>e.id)]),'actual battle matches enemy preview health and equipment');
assert.ok(actual.run().ticks>0);
const isolated=new RunRandomContext(17),reference=new RunRandomContext(17);
applyEnemyUpgrades({...boss,enemyUpgrade:undefined,enemies:boss.enemies.map(e=>({...e,equipment:[]}))},p,input.units,isolated,deps.enemyRoles);
for(const subsystem of ['shop','battle','formation','reward','bot'])assert.equal(isolated.stream(subsystem,boss.id).next(),reference.stream(subsystem,boss.id).next());
console.log('PASS enemy upgrades: full hidden label coverage, all eligible items, role/damage/mana matching, 10 seeds through 99 stages, per-item prices, separate gold, exact HP-only bonus, preview, deterministic save continuation, prefixes and isolated RNG');
