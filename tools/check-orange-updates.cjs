const assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.COCOS_PROJECT||path.resolve(__dirname,'..');require('node:module').createRequire(root+'/package.json')('tsx/cjs');
const {ConfigManager}=require(root+'/assets/scripts/core/ConfigManager.ts'),{BattleSim}=require(root+'/assets/scripts/battle/BattleSim.ts');
const {professionConfig}=require(root+'/assets/scripts/core/KnightProfession.ts'),{dist}=require(root+'/assets/scripts/battle/Pathfinding.ts');
const {realmBorderLayout}=require(root+'/assets/scripts/view/RealmBorderLayout.ts');
const {buildSkillStatRows,buildSkillDescription}=require(root+'/assets/scripts/ui/SkillPresentation.ts');
const {loadRunInputs}=require(root+'/tools/run-simulation.ts'),input=loadRunInputs(root),cfg=new ConfigManager();
cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle({...input.battle,traits:[]});cfg.setEquipment(input.equipment);
const expected=[['azure_knight_warrior','knightStance','damage',[240,360,2800]],['azure_knight_caster','knightStance','damage',[160,240,1800]],['azure_knight_caster','knightStance','slow',[.2,.25,.5]],['azure_knight_tank','knightStance','damage',[70,105,600]],['azure_knight_tank','knightStance','duration',[3,3.5,6]],['azure_knight_tank','knightStance','reduction',[.25,.3,.6]],['cloud_dragon_flow','dragonFlow','maxHp',[600,900,4000]],['cloud_dragon_flow','dragonFlow','reduction',[.2,.25,.5]],['cloud_dragon_flow','dragonFlow','damage',[60,90,800]],['soul_realm','soulRealm','spellPowerPerDeath',[8,12,60]],['soul_realm','soulRealm','healPerEnemy',[100,150,1200]],['soul_realm','soulRealm','stealPower',[5,8,50]]];
for(const [id,spec,key,values]of expected)assert.deepEqual(cfg.getSkill(id)[spec][key],values);
assert.deepEqual(cfg.getSkill('cloud_dragon_flow').starDamage,[60,90,800]);
const dragon=cfg.getSkill('cloud_dragon_flow').dragonFlow;assert.equal(dragon.intervalSeconds,.25);assert.equal(dragon.manaPerSecond,15);assert.equal(dragon.resistanceShredPerHit,2);
assert.equal(cfg.getSkill('soul_realm').soulRealm.manaPerDeath,15);assert.equal(cfg.getSkill('azure_knight_warrior').knightStance.stunSeconds,1.5);
const base=cfg.getUnit('azure_oath_knight'),dummy={...cfg.getUnit('helion'),skillId:undefined,hp:100000,atk:0,critChance:0,armor:0,mr:0,damageReduction:0};
function make(star=1,role='caster'){
 return new BattleSim(cfg,[{cfg:professionConfig(base,{profession:role}),side:0,x:3,y:4,star},{cfg:dummy,side:1,x:3,y:2},{cfg:dummy,side:1,x:6,y:0},{cfg:dummy,side:0,x:0,y:7}],{seed:31});
}
for(const star of [1,2,3]){
 const s=make(star),u=s.units[0],target=s.units[1],skill=cfg.getSkill(u.cfg.skillId),from=u.pos;
 u.cfg.physicalPower=100;u.cfg.spellPower=100;u.mana=30;s.castKnight(u,skill,target);s.resolveDamage();
 const move=s.events.find(e=>e.t==='move'&&e.id===u.id),release=u.knightWave.releaseTick;
 assert.equal(dist(from,u.pos),1);assert.equal(release,move.tick+move.durationTicks);assert.equal(move.durationTicks,7);assert.equal(u.mana,0);u.gainMana(100);assert.equal(u.mana,0);
 assert.ok(!s.events.some(e=>e.t==='knight_action'||e.t==='skill_impact'||e.t==='hit'));
 for(let tick=1;tick<release;tick++){s.tick=tick;s.updateUnit(u);s.resolveDamage();assert.equal(target.hp,target.cfg.hp);assert.ok(u.knightWave);}
 s.tick=release;s.updateUnit(u);s.resolveDamage();assert.equal(u.knightWave,null);assert.equal(u.manaLocked,false);
 const wave=s.events.filter(e=>e.t==='knight_action'&&e.kind==='wave');assert.equal(wave.length,1);assert.equal(wave[0].tick,release);assert.deepEqual(wave[0].at,u.pos);
 assert.equal(target.cfg.hp-target.hp,skill.knightStance.damage[star-1]*3);assert.equal(target.knightSlow,Math.min(.8,skill.knightStance.slow[star-1]*2));
 assert.equal(s.units[2].hp,s.units[2].cfg.hp);assert.equal(s.units[3].hp,s.units[3].cfg.hp);
 s.tick++;s.updateUnit(u);s.resolveDamage();assert.equal(s.events.filter(e=>e.t==='knight_action'&&e.kind==='wave').length,1);
 const rows=buildSkillStatRows(cfg,u.cfg,star,1);assert.equal(Number(rows.find(r=>r.label==='形态技能伤害').current),skill.knightStance.damage[star-1]*3);assert.ok(!buildSkillDescription(cfg,u.cfg,star,1).includes('{'));
}
console.log('PASS: 1-3 star step->wave, no early damage/slow, 7-tick movement completion, one release, AD+AP damage, slow caps and live panel values');
for(const reason of ['stun','fear','death','end','revive']){
 const s=make(),u=s.units[0];s.castKnight(u,cfg.getSkill(u.cfg.skillId),s.units[1]);const release=u.knightWave.releaseTick;
 if(reason==='stun'||reason==='fear'){s.pendingStuns.push({src:s.units[1],dst:u,seconds:1,...(reason==='fear'?{fearOrigin:s.units[1].pos}:{})});s.resolveStuns();}
 if(reason==='death'){u.hp=0;s.resolveDamage();}
 if(reason==='end')s.end(0);
 if(reason==='revive')u.reviveAt(u.pos,1);
 assert.equal(u.knightWave,null,reason);assert.equal(u.manaLocked,false,reason);
 s.tick=release+1;if(u.alive)s.updateUnit(u);s.resolveDamage();assert.ok(!s.events.some(e=>e.t==='knight_action'&&e.kind==='wave'),reason);
}
{
 const s=make(),u=s.units[0],target=s.units[1];s.castKnight(u,cfg.getSkill(u.cfg.skillId),target);target.untargetableUntilTick=100;
 s.tick=u.knightWave.releaseTick;s.updateUnit(u);s.resolveDamage();assert.equal(target.hp,target.cfg.hp);assert.equal(target.knightSlowUntil,0);
}
console.log('PASS: stun/fear/death/end/revive cancel queued wave, no mana lock leaks, release respects target eligibility');
for(const role of ['warrior','tank'])for(const star of [1,2,3]){
 const s=make(star,role),u=s.units[0],skill=cfg.getSkill(u.cfg.skillId);s.castKnight(u,skill,s.units[1]);s.resolveDamage();s.resolveStuns();
 if(role==='warrior'){assert.ok(u.knightLeap);assert.ok(!s.events.some(e=>e.t==='hit'));s.tick=u.knightLeap.landTick;s.updateUnit(u);s.resolveDamage();s.resolveStuns();}
 assert.equal(u.knightWave,null);assert.ok(s.events.some(e=>e.t==='knight_action'&&e.kind===(role==='warrior'?'leap':'spin')));
 if(role==='warrior')assert.ok(s.events.filter(e=>e.t==='skill_impact').every(e=>dist(u.pos,s.units.find(v=>v.id===e.target).pos)<=1));
 if(role==='tank'){assert.equal(u.knightSpin.reduction,skill.knightStance.reduction[star-1]);u.cfg.spellPower=100;s.castKnight(u,skill,s.units[1]);assert.ok(u.knightSpin.reduction<=.75);assert.ok((u.knightSpin.until-s.tick)*cfg.battle.tickMs<=8000);}
}
for(const id of ['cloud_dragon_priestess','blueflame_soul_knight']){
 const u=cfg.getUnit(id),rows=buildSkillStatRows(cfg,cfg.scaleUnit(u,3),3,1);assert.ok(rows.length);assert.ok(!buildSkillDescription(cfg,cfg.scaleUnit(u,3),3,1).includes('{'));
}
for(const [columns,rows,size]of [[7,8,56],[7,8,40],[3,4,80]]){
 const edges=realmBorderLayout(columns,rows,size);assert.equal(edges.length,4);assert.ok(edges[0].width<edges[2].width,'near edge wider under board perspective');
 for(let i=0;i<4;i++){const e=edges[i];assert.deepEqual(e.to,edges[(i+1)%4].from);assert.ok(e.width>0&&Number.isFinite(e.angle));assert.equal(e.x,(e.from.x+e.to.x)/2);assert.equal(e.y,(e.from.y+e.to.y)/2);}
}
const run=()=>{const s=make();s.units[0].mana=30;for(let i=0;i<160&&!s.finished;i++)s.step();assert.ok(s.events.some(e=>e.t==='knight_action'&&e.kind==='wave'));return JSON.stringify(s.events);};assert.equal(run(),run());
const bad=JSON.parse(JSON.stringify(input.skills));bad.azure_knight_caster.knightStance.stepSeconds=0;assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid knight stance/);
console.log('PASS: other stances, 3-star utility caps, fixed dragon/mana rules, all new skill panels, four closed projected edges, deterministic full combat and invalid timing rejection');
