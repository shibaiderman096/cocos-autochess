require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const traits=battle.traits.filter(trait=>trait.selector && trait.breakpoints.every(tier=>tier.stats));
assert.deepEqual(traits.map(t=>t.id),['armored_tank','brawler','swift_marksman','sharpshooter','assassin']);
const expected={armored_tank:['abyss_iron_guard','bao_zero','helion','star_armor_guard'],brawler:['bronda','nightmare_lamplighter'],swift_marksman:[],sharpshooter:['aurelia','blackfeather_hunter','eclipse_crossbow','saiph'],assassin:['kaeru','milu','ripsaw_spider','seraphiel','shadow_seam_assassin','voidscar_reaver']};
for(const state of resolveTraits(traits,roster.map(u=>u.id),roster))assert.deepEqual(state.memberIds,expected[state.config.id]);
const base={id:'dummy',name:'dummy',hp:1000,atk:100,armor:0,mr:0,atkSpeed:.8,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function create(id,n,side=0,overrides={}) {
  const trait=traits.find(t=>t.id===id),cfg=new ConfigManager();
  cfg.setBattle({...clone(battle),traits:[clone(trait)]});cfg.setEquipment([...require('../assets/resources/config/equipment.json'),
    {id:'test_guard',name:'test',icon:'test',spellPower:0,attackSpeedBonus:0,attackSpeedPerAttack:0,armorDamageReduction:{threshold:150,bonus:.1}}]);
  const members=Array.from({length:n},(_,i)=>({...base,id:`member_${i}`,role:trait.selector.role,damageType:trait.selector.damageType??(i%2?'magic':'physical')}));
  cfg.setUnits(members);
  const placements=members.map((unit,i)=>({cfg:unit,side,x:i%7,y:(side===0?2:4)+Math.floor(i/7),...(i===0?overrides:{})}));
  placements.push({cfg:base,side:1-side,x:6,y:side===0?7:0});
  return new BattleSim(cfg,placements,{seed:1018,maxTicks:40});
}
for(const trait of traits)for(let n=1;n<=trait.breakpoints.at(-1).count;n++)for(const side of [0,1]) {
  const sim=create(trait.id,n,side),stats=trait.breakpoints.filter(t=>n>=t.count).at(-1)?.stats??{};
  for(const unit of sim.units.slice(0,n)) {
    assert.equal(unit.cfg.armor,stats.armor??0);assert.equal(unit.cfg.mr,stats.mr??0);
    assert.equal(unit.hp,Math.round(1000*(1+(stats.maxHpBonus??0))));
    assert.ok(Math.abs(unit.attackSpeed-(.8+(stats.attackSpeedBonus??0)))<1e-9);
    assert.equal(unit.cfg.physicalPower,stats.physicalPower??0);
    assert.equal(unit.traitAttackDamage,stats.attackDamage??0);
    assert.equal(unit.cfg.critChance,stats.critChance??0);
    assert.equal(unit.cfg.skillCanCrit,stats.skillCanCrit===true);
    assert.equal(unit.traitExecuteThreshold,stats.executeThreshold??0);
  }
  assert.equal(sim.units.at(-1).hp,1000,'nonmember/opposing side gains nothing');
}
for(const trait of traits) {
  const cfg=new ConfigManager();cfg.setBattle({...clone(battle),traits:[clone(trait)]});
  const member={...base,id:'only_one',role:trait.selector.role,damageType:trait.selector.damageType??'physical'};
  cfg.setUnits([member]);
  const sim=new BattleSim(cfg,[0,1,2,3].map(x=>({cfg:member,side:0,x,y:2})));
  assert.equal(resolveTraits([trait],['only_one','only_one'],[member])[0].count,1);
  assert.equal(sim.units[0].cfg.hp,1000);assert.equal(sim.units[0].cfg.armor,0);assert.equal(sim.units[0].traitAttackDamage,0);
  assert.deepEqual(create(trait.id,trait.breakpoints.at(-1).count).run(),create(trait.id,trait.breakpoints.at(-1).count).run(),'complete seeded events reproduce');
}
const armor=create('armored_tank',2,0,{cfg:{...base,id:'member_0',role:'tank',damageType:'physical',armor:140},equipment:['test_guard']});
// A synthetic passive isolates the exact armor threshold, independent of production item tuning.
const u=armor.units[0];assert.equal(u.cfg.armor,165);assert.equal(u.cfg.damageReduction,.1,'trait armor contributes to equipment thresholds');
const sniper=create('sharpshooter',2),src=sniper.units[0],dst=sniper.units.at(-1);
sniper.damage(src,dst,90,'physical',true);sniper.resolveDamage();
assert.equal(dst.hp,885,'(90+10) * 1.15 = 115 physical basic damage');
const spell=create('sharpshooter',2);spell.damage(spell.units[0],spell.units.at(-1),100,'magic');spell.resolveDamage();
assert.equal(spell.units.at(-1).hp,900,'fixed on-hit damage cannot leak into spells');
const replaced=create('sharpshooter',2);replaced.damage(replaced.units[0],replaced.units.at(-1),100,'magic',true);replaced.resolveDamage();
assert.equal(replaced.units.at(-1).hp,888,'magic replacement basic keeps separate 12 physical on-hit damage');
assert.deepEqual(replaced.events.filter(e=>e.t==='hit').map(e=>e.dmgType),['magic','physical']);
function strike(hp,{type='physical',basic=true,shield=0,reduction=0,protectedItem=false,untargetable=false}={}) {
  const sim=create('assassin',2),attacker=sim.units[0],victim=sim.units.at(-1);
  attacker.cfg.critChance=0;victim.hp=hp;victim.shield=shield;victim.cfg.damageReduction=reduction;
  if(protectedItem)victim.equipment=[{id:'save',lowHealthProtection:{threshold:.5,untargetableSeconds:2,shieldMaxHpFraction:.2,healMaxHpFraction:.2,healSeconds:2}}];
  if(untargetable)victim.untargetableUntilTick=100;
  sim.damage(attacker,victim,10,type,basic,false,!untargetable);sim.resolveDamage();return {sim,attacker,victim};
}
assert.equal(strike(90).victim.hp,80,'exact threshold does not execute');
for(const basic of [true,false])for(const type of ['physical','magic','true']) {
  const {sim,victim}=strike(89,{basic,type});assert.equal(victim.hp,0);assert.equal(victim.alive,false);
  const hit=sim.events.find(e=>e.t==='hit');assert.equal(hit.executed,true);assert.equal(hit.actualDamage,89);
  assert.equal(sim.events.filter(e=>e.t==='death').length,1);
  const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);
  assert.equal(stats.snapshot().find(row=>row.id===1).damage,89,'execute is credited once to its source');
}
assert.equal(strike(70,{reduction:1}).victim.hp,70,'blocked hit cannot execute');
assert.equal(strike(70,{shield:1000}).victim.hp,0,'a damaging hit can execute a low-health shielded target');
assert.equal(strike(70,{untargetable:true}).victim.hp,60,'persistent damage cannot execute protected target');
const saved=strike(89,{protectedItem:true});assert.equal(saved.victim.hp,1);assert.equal(saved.victim.lowHealthProtectionUsed,true);
assert.equal(saved.sim.events.find(e=>e.t==='hit').executed,undefined,'lethal-save equipment handles execute');
const crit=create('assassin',2);crit.units[0].cfg.critChance=1;
crit.damage(crit.units[0],crit.units.at(-1),100,'magic');crit.resolveDamage();
assert.equal(crit.events.find(e=>e.t==='hit').critical,true,'activated assassin skills can crit');
const capped=create('assassin',5,0,{cfg:{...base,id:'member_0',role:'assassin',critChance:.9}});assert.equal(capped.units[0].cfg.critChance,1);
const rapid=create('swift_marksman',5,0,{cfg:{...base,id:'member_0',role:'marksman',damageType:'magic',atkSpeed:4.9},equipment:['guinsoo']});assert.equal(rapid.units[0].attackSpeed,5);
const future={...base,id:'future_tank',role:'tank',damageType:'physical'};
assert.ok(resolveTraits(traits,[future.id],[...roster,future]).find(s=>s.config.id==='armored_tank').memberIds.includes(future.id),'future matching roles join automatically');
assert.equal(resolveTraits(traits,[future.id],[{...future,role:'warrior'}]).find(s=>s.config.id==='armored_tank').count,0,'role changes remove old membership');
for(const trait of traits) {
  const invalid=clone(trait);invalid.breakpoints[0].stats.critChance=2;
  assert.throws(()=>new ConfigManager().setBattle({traits:[invalid]}),/Invalid trait stat/);
}
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const inputs=loadRunInputs(),options={runSeed:1018,...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function session(battleData,save) {
  const cfg=new ConfigManager();cfg.setUnits(clone(inputs.units));cfg.setSkills(inputs.skills);cfg.setBattle(clone(battleData));cfg.setEquipment(inputs.equipment);
  return new RunSession(cfg,inputs.run,inputs.waves,{...options,...(save?{save}: {})});
}
const run=session(inputs.battle);for(const unit of run.owned.all())run.owned.remove(unit.uid);
const tanks=['helion','abyss_iron_guard'].map(id=>run.owned.forceAdd(id));
tanks.forEach((unit,x)=>run.owned.move(unit.uid,{location:'board',x,y:2}));
function guardian(s) {const p=s.createPreview();return p.sim.units.find(u=>u.id===p.battleIds.get(tanks[0].uid));}
assert.equal(guardian(run).cfg.armor,inputs.units.find(u=>u.id==='helion').armor+25);
assert.equal(guardian(session(inputs.battle,run.snapshot())).cfg.armor,guardian(run).cfg.armor,'save/load recomputes class stats once');
run.owned.move(tanks[1].uid,{location:'bench',x:-1,y:8});
assert.equal(guardian(run).cfg.armor,inputs.units.find(u=>u.id==='helion').armor,'reserve member cannot activate a class trait');
const changed=clone(inputs.battle);changed.traits.find(t=>t.id==='armored_tank').breakpoints[0].stats.armor++;
assert.throws(()=>session(changed,run.snapshot()),/configuration mismatch/);
console.log('PASS class traits: automatic role membership, every threshold on both sides, unique counting, flat physical on-hit, skill crit, post-hit execute boundaries, protection, credit and determinism');
