require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const clone=v=>JSON.parse(JSON.stringify(v)),trait=battle.traits.find(t=>t.id==='swiftmartialist');
const base={id:'dummy',name:'dummy',hp:1000,atk:100,armor:0,mr:0,atkSpeed:.8,range:20,moveTicks:1,maxMana:100,startMana:0,manaPerHit:0,critChance:0};
function create(n=2,side=0,options={}) {
  const c=new ConfigManager();c.setBattle({...clone(battle),roleMana:{casterPerSecond:0,damageTakenFraction:0},traits:[clone(trait)]});
  c.setSkills({test:{id:'test',name:'test',dmgType:'physical',starDamage:[100,100,100],radius:0,...options.skill}});
  const units=Array.from({length:n},(_,i)=>({...base,id:`physical_caster_${i}`,role:'caster',damageType:'physical',skillId:'test',...(i===0?options.unit:{})}));
  c.setUnits(units);
  return new BattleSim(c,[...units.map((cfg,i)=>({cfg,side,x:i%7,y:2+Math.floor(i/7)})),...Array.from({length:options.enemies??1},(_,i)=>({cfg:{...base,id:`enemy_${i}`,hp:100000,maxMana:0},side:1-side,x:6-i,y:7}))],{seed:1019});
}
function cast(s,u=s.units[0]){s.cast(u,s.configs.getSkill('test'),s.units.at(-1));s.pendingDamage.length=0;}
const current=resolveTraits([trait],roster.map(u=>u.id),roster)[0];assert.equal(current.count,2,'rail hunter is the first authored physical caster');
assert.deepEqual(trait.breakpoints.map(t=>[t.count,t.swiftmartialist.physicalPower,t.swiftmartialist.attackSpeedPerCast,t.swiftmartialist.maxStacks]),[[2,15,.05,5],[4,30,.08,5],[6,50,.12,5],[8,80,.18,5]]);
for(const side of [0,1])for(let n=1;n<=8;n++) {
  const s=create(n,side),u=s.units[0],e=trait.breakpoints.filter(t=>t.count<=n).at(-1)?.swiftmartialist;
  assert.equal(u.cfg.physicalPower,e?.physicalPower??0);assert.equal(u.cfg.spellPower,0);assert.equal(u.attackSpeed,.8);
  for(let i=1;i<=7;i++) {
    cast(s);assert.equal(u.swiftmartialistStacks,e?Math.min(i,5):0);
    assert.ok(Math.abs(u.attackSpeed-(.8+Math.min(i,5)*(e?.attackSpeedPerCast??0)))<1e-9);
  }
  assert.equal(s.events.filter(e=>e.t==='swiftmartialist_stack').length,e?5:0,'cap emits no repeated stack feedback');
  assert.equal(s.units.at(-1).swiftmartialist,undefined,'opponent without matching role gains nothing');
  s.tick=850;u.combatTick=850;assert.ok(Math.abs(u.attackSpeed-(.8+5*(e?.attackSpeedPerCast??0)))<1e-9,'earned stacks never time out');
  const other=s.units[1];assert.equal(other.swiftmartialistStacks,0,'each caster earns its own stacks');
}
// Actual full-mana windup, completion and multi-target damage create one stack per cast.
{
  const s=create(2,0,{enemies:2,skill:{effect:'delayedArea',castSeconds:.15,radius:20}}),u=s.units[0];u.mana=100;s.step();
  assert.equal(u.swiftmartialistStacks,1);assert.ok(u.pendingCast);assert.equal(s.events.filter(e=>e.t==='cast').length,1);
  for(let i=0;i<3;i++)s.step();assert.equal(u.pendingCast,null);assert.equal(u.swiftmartialistStacks,1);
  assert.equal(s.events.filter(e=>e.t==='hit'&&e.source===u.id).length,2,'one area cast hits two enemies without adding a second stack');
  u.atkCd=0;s.step();assert.equal(u.swiftmartialistStacks,1,'ordinary attacks do not add stacks');
  u.mana=100;u.atkCd=0;s.step();assert.equal(u.swiftmartialistStacks,2);
  s.pendingStuns.push({src:s.units.at(-1),dst:u,seconds:1});s.resolveStuns();
  assert.equal(u.pendingCast,null);assert.equal(u.swiftmartialistStacks,2,'a cast already started keeps its stack when interrupted');
  assert.equal(s.events.filter(e=>e.t==='swiftmartialist_stack').length,2);
}
// Bonus is physical only and adds to other physical power instead of multiplying it.
{
  const s=create(2,0,{unit:{physicalPower:25}}),u=s.units[0],v=s.units.at(-1);
  assert.equal(u.cfg.physicalPower,40);s.damage(u,v,100,'physical');s.damage(u,v,100,'magic');s.resolveDamage();
  assert.deepEqual(s.events.filter(e=>e.t==='hit').map(e=>e.dmg),[140,100]);
}
{
  const s=create(8),u=s.units[0];u.attackSpeedBonus=.1;u.skillAttackSpeedBonus=.2;u.overtimeAttackSpeedBonus=.3;
  for(let i=0;i<5;i++)cast(s);assert.ok(Math.abs(u.attackSpeed-2.3)<1e-9,'all speed sources add in absolute attacks per second');
  u.cfg.atkSpeed=4.9;assert.equal(u.attackSpeed,5,'existing global 500% cap still applies');
  u.skillAttackSpeedBonus=0;u.overtimeAttackSpeedBonus=0;u.attackSpeedBonus=0;u.cfg.atkSpeed=.8;
  assert.ok(Math.abs(u.attackSpeed-1.7)<1e-9,'clearing temporary skill effects does not clear trait stacks');
  const b=s.units[1];s.damage(s.units.at(-1),b,10000,'true');s.resolveDamage();s.pendingDamage.length=0;
  assert.equal(u.swiftmartialist.maxStacks,5,'ally deaths do not downgrade the battle-locked tier');
  s.damage(s.units.at(-1),u,10000,'true');s.resolveDamage();assert.equal(u.alive,false);assert.equal(u.swiftmartialistStacks,0);
  assert.equal(create(8).units[0].swiftmartialistStacks,0,'new battle starts without stacks');
}
{
  const c=new ConfigManager();c.setBattle({...clone(battle),traits:[clone(trait)]});
  const a={...base,id:'same',role:'caster',damageType:'physical'},b={...a,id:'other'};c.setUnits([a,b]);
  const s=new BattleSim(c,[a,a,b].map((cfg,x)=>({cfg,side:0,x,y:2})));
  assert.ok(s.units.every(u=>u.cfg.physicalPower===15),'same ID counts once but each instance benefits');
  assert.equal(a.physicalPower,undefined,'source configuration is immutable');
  for(const u of [{...a,role:'warrior'},{...a,damageType:'magic'}])assert.equal(resolveTraits([trait],[u.id],[u])[0].count,0);
}
for(const key of ['physicalPower','attackSpeedPerCast','maxStacks'])for(const value of [-1,NaN,Infinity,...(key==='maxStacks'?[0,1.5]:[])]) {
  const invalid=clone(trait);invalid.breakpoints[0].swiftmartialist[key]=value;
  assert.throws(()=>new ConfigManager().setBattle({traits:[invalid]}),/Invalid swiftmartialist trait/);
}
for(const n of [2,4,6,8]) {
  const simulate=()=>{const s=create(n,0,{unit:{maxMana:10,startMana:10,manaPerHit:10}});return s.run();};
  const result=simulate();assert.deepEqual(result,simulate());assert.equal(result.events.filter(e=>e.t==='swiftmartialist_stack').length,5);
}
// Future valid members use normal board/bench counting and mechanical save identity.
{
  const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
  const {RunSession}=require('../assets/scripts/core/RunSession.ts');
  const input=loadRunInputs(),options={runSeed:1019,...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
  const future=roster.filter(u=>['nether_lantern_witch','celine'].includes(u.id)).map(u=>({...u,damageType:'physical'}));
  const units=roster.map(u=>future.find(f=>f.id===u.id)??u);
  const session=(data,save)=>{const c=new ConfigManager();c.setUnits(clone(units));c.setSkills(input.skills);c.setBattle(clone(data));c.setEquipment(input.equipment);return new RunSession(c,input.run,input.waves,{...options,...(save?{save}:{})});};
  const run=session(input.battle);for(const u of run.owned.all())run.owned.remove(u.uid);
  const members=future.map(u=>run.owned.forceAdd(u.id));members.forEach((u,x)=>run.owned.move(u.uid,{location:'board',x,y:2}));
  const preview=s=>{const p=s.createPreview();return p.sim.units.find(u=>u.id===p.battleIds.get(members[0].uid));};
  assert.equal(preview(run).swiftmartialist.physicalPower,15);
  assert.equal(preview(session(input.battle,run.snapshot())).swiftmartialistStacks,0);
  run.owned.move(members[1].uid,{location:'bench',x:-1,y:8});assert.equal(preview(run).swiftmartialist,undefined);
  const changed=clone(input.battle);changed.traits.find(t=>t.id==='swiftmartialist').breakpoints[0].swiftmartialist.attackSpeedPerCast+=.01;
  assert.throws(()=>session(changed,run.snapshot()),/configuration mismatch/);
}
console.log('PASS swiftmartialist: all exact tiers/sides, 5-stack cap, actual cast/windup/interrupt, physical scaling, additive speed/cap, persistent per-unit stacks, death/reset, selectors, saves and deterministic battles');
