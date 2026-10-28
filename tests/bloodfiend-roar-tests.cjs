require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {inFearLine}=require('../assets/scripts/battle/LineFear.ts');
const {buildSkillDescription,buildSkillStatRows}=require('../assets/scripts/ui/SkillPresentation.ts');
const units=require('../assets/resources/config/units.json'),skills=require('../assets/resources/config/skills.json'),battle=require('../assets/resources/config/battle.json');
function config(){const c=new ConfigManager();c.setUnits(structuredClone(units));c.setSkills(structuredClone(skills));c.setBattle({...structuredClone(battle),traits:[],roleMana:{casterPerSecond:0,damageTakenFraction:0}});return c;}
const dummy={id:'dummy',name:'dummy',hp:100000,atk:1,armor:0,mr:0,atkSpeed:1,range:1,moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
function fixture(star=1,side=0){const cfg=config(),sim=new BattleSim(cfg,[{cfg:{...cfg.getUnit('crimson_devourer'),critChance:0},star,side,x:0,y:3},...[1,2,3,4,5].map(x=>({cfg:{...dummy,id:'target'+x},side:1-side,x,y:3})),{cfg:{...dummy,id:'offLine'},side:1-side,x:2,y:2}],{seed:83});sim.units.forEach(u=>u.moveCd=u.atkCd=100000);return {cfg,sim,src:sim.units[0],enemies:sim.units.slice(1)};}
function settle(sim){sim.resolveDamage();sim.resolveStuns();sim.pendingDamage.length=sim.pendingStuns.length=0;}
function advance(f,n=12){for(let t=1;t<=n;t++){f.sim.tick=t;f.sim.updateUnit(f.src);settle(f.sim);}}
for(const side of [0,1])for(const star of [1,2,3]){
 const f=fixture(star,side),{cfg,sim,src,enemies}=f,skill=cfg.getSkill(src.cfg.skillId);
 sim.cast(src,skill,enemies[0]);assert.equal(src.pendingCast.remainingTicks,12);advance(f,11);
 assert.ok(enemies.every(u=>u.hp===u.cfg.hp),'charge has no early damage');sim.tick=12;sim.updateUnit(src);settle(sim);
 enemies.forEach((u,i)=>{assert.equal(u.cfg.hp-u.hp,i<4?[180,270,405][star-1]:0);assert.equal(u.fearUntilTick,i<4?12+[30,40,50][star-1]+1:0);});
 assert.equal(sim.events.filter(e=>e.t==='line_roar').length,1);assert.equal(sim.events.filter(e=>e.t==='fear').length,4);
 const text=buildSkillDescription(cfg,src.cfg,star,src.skillScale,true);assert.doesNotMatch(text,/\{[^}]+\}|NaN|undefined/);
 assert.match(text,/无法释放技能/);assert.equal(buildSkillStatRows(cfg,src.cfg,star,src.skillScale,true).length,4);
}
for(const mode of ['movedTarget','deadTarget','immune','interrupt','fearInterrupt','deadCaster','end']){
 const f=fixture(),{cfg,sim,src,enemies}=f;sim.cast(src,cfg.getSkill(src.cfg.skillId),enemies[0]);
 if(mode==='movedTarget'){enemies[0].x=0;enemies[0].y=0;}
 if(mode==='deadTarget'){enemies[0].hp=0;enemies[0].alive=false;}
 if(mode==='immune')enemies[1].equipment.push({crowdControlImmune:true});
 if(['interrupt','fearInterrupt'].includes(mode)){sim.pendingStuns.push({src:enemies[0],dst:src,seconds:1,...(mode==='fearInterrupt'?{fearOrigin:enemies[0].pos}:{})});sim.resolveStuns();sim.pendingStuns.length=0;}
 if(mode==='deadCaster'){sim.damage(enemies[0],src,src.hp,'true');settle(sim);}
 if(mode==='end')sim.end(1);
 if(!['deadCaster','end'].includes(mode))advance(f);
 if(['interrupt','fearInterrupt','deadCaster','end'].includes(mode)){assert.equal(src.pendingCast,null);assert.equal(enemies[1].hp,enemies[1].cfg.hp);}
 else {assert.equal(enemies[1].cfg.hp-enemies[1].hp,180,'locked direction penetrates even after target leaves/dies');if(mode==='immune')assert.equal(enemies[1].fearUntilTick,0);}
}
// Geometry is symmetric under odd/even rows and all six hex directions.
for(const origin of [{x:2,y:2},{x:2,y:3}])for(const toward of [{x:3,y:origin.y},{x:1,y:origin.y},{x:2,y:origin.y-1},{x:2,y:origin.y+1}]){
 assert.equal(inFearLine(origin,toward,toward,4,1),true);assert.equal(inFearLine(origin,toward,origin,4,1),false);
}
assert.equal(inFearLine({x:3,y:3},{x:4,y:3},{x:2,y:3},4,1),false);
assert.equal(inFearLine({x:0,y:3},{x:1,y:3},{x:5,y:3},4,1),false);
// Every current unit uses the same fear gate, including self-cast, teleport and channel skills.
for(const unit of units){
 const cfg=config(),sim=new BattleSim(cfg,[{cfg:{...unit,critChance:0,range:20},side:0,x:3,y:3},{cfg:dummy,side:1,x:3,y:4}],{seed:87}),src=sim.units[0],enemy=sim.units[1];
 src.mana=src.cfg.maxMana;src.atkCd=0;src.fearUntilTick=100;sim.updateUnit(src);
 assert.equal(sim.events.some(e=>e.t==='cast'&&e.id===src.id),false,unit.id+' cannot cast while feared');
 assert.ok(sim.events.some(e=>e.t==='attack'&&e.id===src.id),unit.id+' can basic attack while feared');
 const mana=src.mana;sim.cast(src,cfg.getSkill(unit.skillId),enemy);assert.equal(src.mana,mana,'direct cast gate preserves mana');
}
{
 const f=fixture(),{sim,src,enemies}=f;enemies.forEach((u,i)=>{u.x=6;u.y=i;});src.fearUntilTick=20;src.moveCd=src.atkCd=0;
 sim.updateUnit(src);assert.ok(sim.events.some(e=>e.t==='move'&&e.id===src.id),'fear follows normal approach movement');
 const target=sim.units.find(u=>u.id===src.attackTargetId);src.x=target.x-1;src.y=target.y;src.mana=src.cfg.maxMana;src.atkCd=0;sim.tick=20;
 sim.updateUnit(src);assert.ok(src.pendingCast,'casts resume exactly at fear expiry');
}
for(const key of ['length','width','fearSeconds']){const cfg=config(),copy=structuredClone(skills);copy.frostblood_roar.lineFear[key]=key==='fearSeconds'?[1,0,2]:0;assert.throws(()=>cfg.setSkills(copy),/Invalid/);}
const a=fixture(),b=fixture();a.sim.cast(a.src,a.cfg.getSkill(a.src.cfg.skillId),a.enemies[0]);b.sim.cast(b.src,b.cfg.getSkill(b.src.cfg.skillId),b.enemies[0]);advance(a);advance(b);assert.deepEqual(a.sim.events,b.sim.events);
console.log('PASS bloodfiend roar: both sides/all stars, fixed charge/line/expiry, target movement/death, interruption/immunity, all-roster cast gate, ordinary attacks/movement, validation and determinism');
