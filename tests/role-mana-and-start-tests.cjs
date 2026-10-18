require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {buildMonsterUnits}=require('../assets/scripts/core/RunSetup.ts');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs();
function cfg(){const c=new ConfigManager();c.setUnits(inputs.units);c.setSkills(inputs.skills);c.setBattle(inputs.battle);c.setEquipment(inputs.equipment);return c;}
const starters=new Set();
for(let seed=1;seed<=30;seed++){
 const s=new RunSession(cfg(),inputs.run,inputs.waves,{runSeed:seed,enemyGenerationMode:'legacy'}),unit=s.owned.all()[0];
 assert.equal(s.owned.all().length,1);assert.equal(s.cfg.getUnit(unit.unitId).cost,1);assert.equal(unit.star,1);starters.add(unit.unitId);assertLegalSession(s);
 const again=new RunSession(cfg(),inputs.run,inputs.waves,{runSeed:seed,enemyGenerationMode:'legacy'});assert.deepEqual(again.snapshot(),s.snapshot());
 const loaded=new RunSession(cfg(),inputs.run,inputs.waves,{save:s.snapshot()});assert.deepEqual(loaded.owned.snapshot(),s.owned.snapshot());assertLegalSession(loaded);
}
assert.ok(starters.size>=3,'fresh seeds cover varied one-cost starters');
const monsters=buildMonsterUnits(inputs.run,inputs.units);
assert.ok(monsters.every(m=>m.critChance===.25),'ordinary and strong monsters have 25% base crit');
const legacyMonsters=buildMonsterUnits({...inputs.run,monsterTemplate:undefined},inputs.units);
assert.ok(legacyMonsters.every(m=>m.critChance===.25),'legacy stat scaling does not reduce crit chance');
for(const monster of monsters.filter(m=>m.monsterTier!=='strong'))assert.deepEqual([monster.atk,monster.armor,monster.mr,monster.maxMana],[30,10,10,0]);
assert.deepEqual(buildMonsterUnits(inputs.run,inputs.units.map(u=>({...u,hp:u.hp*10,atk:u.atk*10}))),monsters,'monster template is independent of playable unit balance');
function battle(role,armor=0,mr=0){
 const c=cfg(),base={...c.getUnit('warrior'),id:'dummy',role,hp:1000,atk:0,armor,mr,skillId:undefined,maxMana:100,startMana:0,critChance:0,manaPerHit:10};
 const sim=new BattleSim(c,[{cfg:base,side:0,x:2,y:2},{cfg:{...base,role:'marksman',maxMana:0},side:1,x:3,y:2}]);
 for(const u of sim.units){u.atkCd=10000;u.moveCd=10000;}return sim;
}
function hit(s,src,dst,amount,type){s.pendingDamage.length=0;s.damage(src,dst,amount,type);s.resolveDamage();}
for(const role of ['caster','tank','warrior','marksman','assassin']){
 const s=battle(role);for(let n=0;n<200;n++)s.step();assert.equal(s.units[0].mana,role==='caster'?20:0);
 const [dst,src]=s.units;hit(s,src,dst,100,'true');assert.equal(dst.mana,role==='caster'?20:['tank','warrior'].includes(role)?10:0);
 const basic=battle(role);basic.units[0].atkCd=0;basic.step();assert.equal(basic.units[0].mana,10,'all roles keep ordinary attack mana');
}
for(const role of ['tank','warrior'])for(const type of ['physical','magic','true']){
 const s=battle(role,100,100),[dst,src]=s.units;dst.shield=50;hit(s,src,dst,type==='true'?100:200,type);
 assert.equal(dst.hp,950);assert.equal(dst.mana,5,'only actual HP loss after shield and mitigation generates mana');
 dst.shield=100;hit(s,src,dst,100,'true');assert.equal(dst.mana,5,'shield-only hits do not grant mana');
 dst.mana=99;hit(s,src,dst,100,'true');assert.equal(dst.mana,100,'mana is capped');
 dst.mana=0;dst.manaLocked=true;hit(s,src,dst,100,'true');assert.equal(dst.mana,0,'mana lock applies');
 dst.manaLocked=false;dst.hp=20;hit(s,src,dst,1000,'true');assert.equal(dst.mana,0,'dead units receive no overkill mana');
}
const fractional=battle('tank'),[dst,src]=fractional.units;
for(let i=0;i<10;i++)hit(fractional,src,dst,1,'true');assert.equal(dst.mana,1,'fractional hit gains accumulate accurately');
const locked=battle('caster');locked.units[0].manaLocked=true;for(let i=0;i<40;i++)locked.step();assert.equal(locked.units[0].mana,0);
console.log('PASS random starters: 30 seeds, variety/repeat/save/stock; independent monster template 30/10/10; role mana rates, attacks, typed damage, shields, caps, locks and fractional gains');
