require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const input=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
const STONE='stonegrowth_bulwark',FIRE='blazing_feather',CODEX='arcane_overflow_codex',added=[STONE,FIRE,CODEX];
const cfg=new ConfigManager();cfg.setEquipment(input.equipment);
const base={id:'test',name:'test',hp:1000,atk:100,armor:0,mr:0,atkSpeed:1,range:10,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
const stats=(items,patch={})=>cfg.equipmentStats({...base,...patch},items);
const sim=(items,options={})=>new BattleSim(cfg,[{cfg:base,side:0,x:1,y:2,equipment:items,...options},
 {cfg:{...base,hp:100000,atk:0},side:1,x:2,y:2}],{seed:17,maxTicks:400});
for(const [hp,armor] of [[899,20],[900,21],[999,21],[1000,22]]){
 const value=stats([STONE],{hp});assert.equal(value.hp,hp+200);assert.equal(value.armor,armor);assert.equal(value.mr,armor);
}
assert.deepEqual([stats([STONE,STONE]).hp,stats([STONE,STONE]).armor,stats([STONE,STONE]).mr],[1400,48,48]);
assert.equal(stats([STONE,'forest_sanctuary']).armor,30,'percent maximum HP contributes after flat HP');
assert.deepEqual(stats([STONE,'forest_sanctuary']),stats(['forest_sanctuary',STONE]),'slot order does not affect final HP or resistance');
assert.equal(cfg.equipmentStats(cfg.scaleUnit(base,2),[STONE]).armor,30);
assert.equal(sim([STONE],{permanentMaxHp:100}).units[0].armor,23,'permanent health growth contributes');
cfg.battle.traits=[{id:'health',name:'health',glyph:'生',description:'',members:['test'],breakpoints:[{count:1,stats:{maxHpBonus:.5}}]}];
assert.equal(sim([STONE]).units[0].armor,28,'final trait HP contributes to both resistances');
const plate=sim([STONE,'abyssal_plate'],{cfg:{...base,hp:1800}}).units[0];
assert.ok(plate.armor>100);assert.equal(plate.cfg.damageReduction,.05,'health-driven armor unlocks plate reduction');
cfg.battle.traits=[];
{
 const s=sim([FIRE]),u=s.units[0];assert.equal(u.cfg.physicalPower,10);assert.equal(u.attackSpeed,1.1);
 for(let n=1;n<=3;n++){
  u.atkCd=0;s.step();assert.equal(u.equipmentAttackStacks,n);assert.equal(u.cfg.physicalPower,10+2*n);
  assert.equal(s.events.filter(e=>e.t==='hit'&&e.source===u.id).at(-1).dmg,110+2*n,'each basic attack gains one stack and uses physical amplification');
 }
 const count=u.equipmentAttackStacks;u.stunnedUntilTick=s.tick+10;u.atkCd=0;s.step();assert.equal(u.equipmentAttackStacks,count,'stun does not grant stacks');
 u.stunnedUntilTick=0;
 for(const [type,amount] of [['physical',116],['magic',100],['true',100]]){
  s.damage(u,s.units[1],100,type);s.resolveDamage();s.pendingDamage.length=0;
  assert.equal(s.events.filter(e=>e.t==='hit').at(-1).dmg,amount);
  assert.equal(u.equipmentAttackStacks,count,'skill and other damage do not grant attack stacks');
 }
 assert.equal(sim([FIRE]).units[0].cfg.physicalPower,10,'new battle resets accumulated physical power');
 assert.equal(sim([FIRE]).units[0].equipmentAttackStacks,0);assert.equal(cfg.getEquipment([FIRE])[0].physicalPower,10);
}
{
 const s=sim([FIRE,FIRE,'guinsoo']),u=s.units[0];s.step();
 assert.equal(u.equipmentAttackStacks,1,'one basic attack grants one shared displayed stack');assert.equal(u.cfg.physicalPower,24);
 assert.equal(u.attackSpeed,1.35,'existing and new attack equipment compose additively');
 const replay=()=>{const battle=sim([FIRE,STONE]);return battle.run();};assert.deepEqual(replay(),replay());
}
// Resume an actual pre-extension campaign with inventory, a pending reward and the old catalogue identities.
for(const [id,file] of [[STONE,'翡翠绿晶石岩铠徽章.png'],[FIRE,'赤焰羽翼魔刃徽章.png'],[CODEX,'星辉魔典与幻彩能量.png']]){
 const target=path.resolve('assets/resources/art/equipment',id+'.png'),png=fs.readFileSync(target),meta=JSON.parse(fs.readFileSync(target+'.meta'));
 assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);assert.equal(png[25],6);assert.equal(meta.userData.hasAlpha,true);
 assert.ok(fs.existsSync(path.resolve('art-source/equipment',file)),'supplied full-resolution source remains archived');
 assert.equal(deps.equipmentPolicy.tiers[id],'basic');assert.ok(input.run.stageEncounters.basicEquipmentIds.includes(id));
}
console.log('PASS growth equipment: final HP/rounding/stars/traits/permanent HP/stacking, plate synergy, per-basic-attack physical growth, damage types, stun/reset/replay, authored transparent artwork');
