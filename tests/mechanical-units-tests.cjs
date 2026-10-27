require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager,hydraulicBulwarkValues}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const roster=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
const dummy={id:'dummy',name:'靶子',hp:10000,atk:0,armor:0,mr:0,atkSpeed:.5,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function setup(id,star=1,changes={},extra=[]) {
 const cfg=new ConfigManager();cfg.setBattle({...battle,traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});cfg.setUnits(roster);cfg.setSkills(skills);
 const sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit(id),critChance:0,...changes},star,side:0,x:3,y:2},
 {cfg:{...dummy},side:1,x:3,y:3},...extra],{seed:1019});
 sim.units.forEach(u=>{u.atkCd=100000;u.moveCd=100000;});return {cfg,sim,u:sim.units[0],target:sim.units[1]};
}
function until(s,n){while(s.tick<n&&!s.finished)s.step();assert.equal(s.tick,n);}
function ready(s,u){u.mana=u.cfg.maxMana;u.atkCd=0;s.step();}
function hit(s,a,b,n,type='true',skillId){s.damage(a,b,n,type,false,false,true,skillId);s.resolveDamage();s.pendingDamage.length=0;}
const ids=['bao_zero','turbo_fist_tiger','arc_repairer','rail_hunter_07','ripsaw_spider','furnace_executioner','atlas'];
const expected=[[700,30,40,40,.55,1,40,100],[650,50,30,30,.75,1,0,60],[600,35,30,35,.65,4,40,100],[550,60,25,25,.75,4,0,70],[750,70,40,35,.9,1,20,70],[1050,55,60,55,.8,1,0,80],[900,50,55,60,.75,4,30,130]];
ids.forEach((id,i)=>assert.deepEqual(['hp','atk','armor','mr','atkSpeed','range','startMana','maxMana'].map(k=>roster.find(u=>u.id===id)[k]),expected[i]));
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('bao_zero',star,{physicalPower:100,spellPower:900,damageAmp:5});u.hp=100;
 ready(sim,u);const vals=hydraulicBulwarkValues(u.cfg,skills.hydraulic_bulwark,star);
 assert.equal(u.armor,40+[40,60,80][star-1]);assert.equal(u.mr,u.armor);assert.equal(u.hydraulicRooted,true);
 const pos=u.pos;u.moveCd=0;target.y=7;until(sim,60);assert.deepEqual(u.pos,pos);assert.equal(u.hp,100);
 u.stunnedUntilTick=200;until(sim,61);assert.equal(u.hp,Math.min(u.cfg.hp,100+[400,800,1200][star-1]));assert.equal(u.armor,40);assert.equal(u.hydraulicBulwark,null);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale);assert.equal(Number(rows[1].current),vals.healAmount);
 const text=buildSkillDescription(cfg,u.cfg,star,u.skillScale,true);assert.match(text,/attr_phys_bonus/);assert.doesNotMatch(text,/attr_spell_bonus/);
}
{
 const {sim,u,target}=setup('bao_zero');ready(sim,u);u.hp=400;u.atkCd=0;sim.step();assert.ok(sim.events.some(e=>e.t==='attack'&&e.id===u.id),'wall still attacks');
 u.fearUntilTick=50;u.fearOrigin=target.pos;u.moveCd=0;const pos=u.pos;sim.step();assert.deepEqual(u.pos,pos,'fear cannot move wall');
 u.mana=100;u.atkCd=0;sim.step();assert.equal(sim.events.filter(e=>e.t==='cast'&&e.id===u.id).length,1,'no recast during wall');
 u.skillArmorBonus=7;u.skillMrBonus=8;const before=u.hp;hit(sim,target,u,100,'physical');assert.equal(before-u.hp,Math.round(10000/167));
 hit(sim,target,u,100000);assert.equal(u.hydraulicBulwark,null);assert.equal(u.alive,false);assert.equal(sim.events.filter(e=>e.t==='heal').length,0);
}
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('turbo_fist_tiger',star,{physicalPower:100,spellPower:100,atk:999});u.hp=100;target.hp=1;
 ready(sim,u);assert.equal(sim.events.find(e=>e.t==='hit'&&e.source===u.id).dmg,[100,200,300][star-1]);
 assert.equal(u.hp,100+[200,240,400][star-1]);assert.equal(sim.events.filter(e=>e.t==='heal').length,1);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale);assert.equal(Number(rows[0].current),[100,200,300][star-1]);assert.equal(Number(rows[1].current),[200,240,400][star-1]);
}
for(const scenario of ['nonlethal','basic','shield','simultaneous']) {
 const {sim,u,target}=setup('turbo_fist_tiger');u.hp=100;
 if(scenario==='nonlethal'){ready(sim,u);assert.equal(u.hp,100);}
 if(scenario==='basic'){target.hp=1;hit(sim,u,target,100);assert.equal(u.hp,100);}
 if(scenario==='shield'){target.hp=1;target.shield=999;ready(sim,u);assert.equal(u.hp,100);}
 if(scenario==='simultaneous'){target.hp=1;sim.damage(u,target,50,'physical',false,false,true,'turbo_hunt');sim.damage(target,u,1000,'true');sim.resolveDamage();assert.equal(u.hp,0);}
}
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('arc_repairer',star,{spellPower:100,physicalPower:900,damageAmp:5},[
 {cfg:{...dummy,id:'ally'},side:0,x:0,y:7}, {cfg:{...dummy,id:'dead'},side:0,x:1,y:7}]);
 const ally=sim.units[2],dead=sim.units[3];u.hp=Math.round(u.cfg.hp*.5);ally.hp=1000;dead.hp=0;dead.alive=false;target.hp=1;
 const old=u.hp;ready(sim,u);const heals=sim.events.filter(e=>e.t==='heal');assert.equal(heals.length,star===3?2:1);
 assert.equal(heals[0].id,ally.id,'global lowest percentage, not absolute HP');assert.equal(heals[0].amount,[320,480,780][star-1]);assert.equal(heals[0].source,u.id);
 assert.equal(u.hp,star===3?old+Math.min(u.cfg.hp-old,780):old);assert.equal(target.hp,1,'no enemy healing');
 const stats=new CombatStatistics();stats.begin(sim.units);stats.consume(sim.events);assert.equal(stats.snapshot().find(r=>r.id===u.id).healing,heals.reduce((s,e)=>s+e.amount,0));
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale);assert.equal(Number(rows[0].current),[320,480,780][star-1]);assert.doesNotMatch(buildSkillDescription(cfg,u.cfg,star,u.skillScale),/\{|\}/);
}
{
 const {sim,u}=setup('arc_repairer');u.hp-=10;ready(sim,u);assert.equal(u.hp,u.cfg.hp);assert.equal(sim.events.find(e=>e.t==='heal').amount,10,'self eligible; no overheal');
 u.mana=100;u.atkCd=0;sim.step();assert.equal(sim.events.filter(e=>e.t==='cast').length,1,'full-health army does not spend healing cast');
}
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('rail_hunter_07',star,{physicalPower:100,spellPower:900},[{cfg:{...dummy,id:'far'},side:1,x:3,y:7}]);
 target.y=4;ready(sim,u);assert.equal(u.pendingCast.targetId,3);until(sim,20);assert.equal(sim.events.filter(e=>e.t==='hit').length,0);
 until(sim,21);const hits=sim.events.filter(e=>e.t==='hit');assert.equal(hits.length,1);assert.equal(hits[0].id,target.id);assert.equal(hits[0].dmg,[380,570,920][star-1]);
 assert.equal(sim.units[2].hp,10000,'front enemy blocks far target');assert.doesNotMatch(buildSkillDescription(cfg,u.cfg,star,u.skillScale),/拦截|阻挡/);
}
{
 const {sim,u,target}=setup('rail_hunter_07',1,{},[{cfg:{...dummy,id:'ally'},side:0,x:3,y:4}]);target.y=6;
 ready(sim,u);until(sim,21);assert.equal(sim.events.find(e=>e.t==='hit').id,target.id,'allies do not block');
 const other=setup('rail_hunter_07');ready(other.sim,other.u);other.sim.pendingStuns.push({src:other.target,dst:other.u,seconds:2});other.sim.resolveStuns();until(other.sim,30);assert.equal(other.sim.events.filter(e=>e.t==='rail_shot').length,0,'control interrupts charge');
}
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('ripsaw_spider',star,{physicalPower:100,spellPower:900},[{cfg:{...dummy,id:'far'},side:1,x:3,y:7}]);
 const far=sim.units[2];far.hp=5000;ready(sim,u);assert.equal(u.pendingCast.targetId,far.id);until(sim,6);assert.equal(u.snapshot(sim.tick).untargetable,false);
 until(sim,7);assert.equal(u.snapshot(sim.tick).spiderAirborne,true);const before=u.hp;hit(sim,target,u,100,'physical');assert.equal(u.hp,before,'targeted hits miss in air');
 until(sim,12);assert.equal(sim.events.filter(e=>e.t==='hit'&&e.source===u.id).length,0);until(sim,13);
 assert.equal(u.snapshot(sim.tick).untargetable,false);const hitEvent=sim.events.find(e=>e.t==='hit'&&e.source===u.id);assert.equal(hitEvent.id,far.id);
 assert.equal(hitEvent.dmg,[170+400,260+500,430+750][star-1],'missing HP coefficient receives no physical-power multiplier');
 assert.equal(require('../assets/scripts/battle/HexMath.ts').hexDist(u.pos,far.pos),1);assert.doesNotMatch(buildSkillDescription(cfg,u.cfg,star,u.skillScale),/不可选中/);
}
{
 const {sim,u,target}=setup('ripsaw_spider');ready(sim,u);sim.pendingStuns.push({src:target,dst:u,seconds:2});sim.resolveStuns();until(sim,20);assert.equal(u.spiderLeap,null);assert.equal(sim.events.filter(e=>e.t==='hit'&&e.source===u.id).length,0);
}
{
 const cfg=new ConfigManager();cfg.setBattle(battle);cfg.setUnits(roster);cfg.setSkills(skills);
 const placements=ids.map((id,i)=>({cfg:cfg.getUnit(id),side:0,x:i,y:2}));placements.push({cfg:dummy,side:1,x:3,y:7});
 const a=new BattleSim(cfg,placements,{seed:52}),b=new BattleSim(cfg,placements,{seed:52});assert.ok(a.units.slice(0,7).every(u=>u.mechanicalPioneer.lowHealthThreshold===.5));
 assert.deepEqual(a.run(),b.run(),'five real members: deterministic full fight');
}
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('furnace_executioner',star,{spellPower:100,physicalPower:900},[
 {cfg:{...dummy,id:'blocker'},side:1,x:3,y:3},{cfg:{...dummy,id:'outside'},side:1,x:3,y:7}]);target.y=5;
 ready(sim,u);assert.equal(u.furnaceDash.targetId,target.id,'farthest within three hexes');
 assert.equal(u.furnaceDash.endTick-u.furnaceDash.startTick,8,'two hexes at 1.5 times ordinary six-tick move');
 until(sim,8);assert.equal(sim.events.filter(e=>e.t==='hit'&&e.id===target.id).length,0);
 until(sim,9);const hits=sim.events.filter(e=>e.t==='hit'&&e.source===u.id);
 assert.equal(hits.filter(e=>e.id===sim.units[2].id).length,1,'trail blocker hit once');
 assert.equal(hits.filter(e=>e.id===target.id).length,2,'main receives both components');
 assert.equal(hits.filter(e=>e.id===target.id).reduce((n,e)=>n+e.dmg,0),[540,750,8400][star-1]);
 assert.equal(hits.find(e=>e.id===sim.units[2].id).dmg,[140,220,2400][star-1]);
 assert.equal(sim.events.find(e=>e.t==='knockup').duration,1);assert.equal(u.furnaceDash,null);
 const rows=buildSkillStatRows(cfg,u.cfg,star,u.skillScale);assert.equal(Number(rows[0].current),[400,530,6000][star-1]);
}
{
 const {sim,u,target}=setup('furnace_executioner');target.y=5;ready(sim,u);sim.pendingStuns.push({src:target,dst:u,seconds:1});sim.resolveStuns();until(sim,15);
 assert.equal(u.furnaceDash,null);assert.equal(sim.events.filter(e=>e.t==='knockup').length,0,'interrupted dash has no final strike');
}
for(const star of [1,2,3]) {
 const {cfg,sim,u,target}=setup('atlas',star,{physicalPower:100,spellPower:900},Array.from({length:4},(_,i)=>({cfg:{...dummy,id:`extra_${i}`,hp:100000},side:1,x:i,y:6})));
 ready(sim,u);const hits=sim.events.filter(e=>e.t==='hit');assert.equal(hits.length,star===3?5:3);assert.equal(new Set(hits.map(e=>e.id)).size,hits.length);
 assert.equal(hits[0].id,target.id);assert.ok(hits.every(e=>e.dmg===[560,840,5600][star-1]));assert.equal(u.cfg.maxMana,125);
 if(target.alive){const old=target.hp;until(sim,20);assert.equal(target.hp,old);until(sim,21);assert.equal(old-target.hp,200);assert.equal(sim.events.at(-1).dmgType,'true');}
 assert.equal(cfg.getUnit('atlas').maxMana,130);assert.equal(Number(buildSkillStatRows(cfg,u.cfg,star,u.skillScale)[0].current),[560,840,5600][star-1]);
}
{
 const {sim,u,target}=setup('atlas',1,{damageAmp:5,physicalPower:900,skillCanCrit:true,critChance:1});target.cfg.hp=1000000;target.hp=1000000;
 ready(sim,u);const first=target.burns[0];assert.ok(first);const next=first.nextTick;
 for(let i=0;i<8;i++)ready(sim,u);
 assert.equal(u.cfg.maxMana,100);assert.equal(u.atlasManaReduction,30);assert.equal(target.burns.length,1);assert.equal(first.nextTick,next,'repeat casts do not reset burn clock');
 const old=target.hp;target.cfg.damageReduction=1;until(sim,21);assert.equal(old-target.hp,20000,'burn fixed two percent, no amp/crit/reduction');
 const burnHit=sim.events.filter(e=>e.t==='hit'&&e.tick===21).at(-1);assert.equal(burnHit.dmgType,'true');assert.equal(burnHit.critical,undefined);assert.equal(burnHit.source,u.id);
 u.alive=false;u.hp=0;sim.units.push(new (require('../assets/scripts/battle/Unit.ts').Unit)(99,0,{...dummy,id:'survivor'},0,0));sim.units.at(-1).atkCd=sim.units.at(-1).moveCd=10000;
 const hp=target.hp;until(sim,41);assert.equal(hp-target.hp,20000,'burn survives caster death');
 sim.end(-1);assert.equal(target.burns.length,0,'end clears permanent burn');assert.equal(setup('atlas').u.cfg.maxMana,130,'new fight resets mana cap');
}
for(const id of ['turbo_hunt','repair_protocol','rail_execution','rending_hunt','furnace_overload','sky_annihilation']) {
 const c=new ConfigManager(),bad=JSON.parse(JSON.stringify(skills[id]));bad.starDamage=[NaN];bad.healAmounts=[-1];bad.healTargetCounts=[0];
 assert.throws(()=>c.setSkills({bad}));
}
console.log('PASS seven mechanical units: exact stats, 3 stars, power isolation, real heal attribution, wall clock/root/death, kill-only sustain, global/self healing, rail interception/charge, spider leap/untargetable/missing HP and deterministic seven-member battle');
