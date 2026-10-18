require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {buildSkillStatRows,buildSkillDescription}=require('../assets/scripts/ui/SkillPresentation.ts');
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setSkills(require('../assets/resources/config/skills.json'));
const card=cfg.getUnit('madara');assert.deepEqual([card.cost,card.role,card.startMana,card.maxMana],[5,'tank',30,100]);
assert.equal(new CardPool(cfg.allUnits()).count('madara'),9);
function make(star=1){const dummy={...cfg.getUnit('warrior'),hp:1e7,armor:0,mr:0,skillId:undefined,maxMana:0,critChance:0};
 const sim=new BattleSim(cfg,[{cfg:{...card,critChance:0},side:0,star,x:2,y:2},{cfg:dummy,side:1,x:3,y:2},{cfg:dummy,side:1,x:4,y:2},{cfg:dummy,side:1,x:6,y:5},{cfg:dummy,side:0,x:2,y:1}],{maxTicks:3000});
 sim.units[0].mana=100;for(const u of sim.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}return sim;}
for(const star of [1,2,3]){
 const sim=make(star),u=sim.units[0];sim.step();assert.equal(u.mana,0);
 const reduction=[.5,.7,.99][star-1],bonus=[60,100,10000][star-1];
 const end=1+[2,3,99][star-1]*20;assert.equal(u.susanooUntilTick,end);assert.equal(u.damageReductionAt(1),reduction);
 assert.equal(u.snapshot(sim.tick).susanooActive,true);
 sim.step();const hits=sim.events.filter(e=>e.t==='hit');assert.deepEqual(hits.map(e=>e.id),[2,3]);assert.ok(hits.every(e=>e.dmg===u.cfg.atk+bonus));assert.equal(u.mana,10,'one mana award per area attack');
 assert.equal(sim.events.find(e=>e.t==='attack').area,true);
 sim.pendingDamage.length=0;sim.damage(sim.units[1],u,100,'true');sim.resolveDamage();assert.equal(sim.events.filter(e=>e.t==='hit').at(-1).dmg,Math.round(100*(1-reduction)));
 for(const knockup of [false,true]){sim.pendingStuns=[{src:sim.units[1],dst:u,seconds:5,knockup}];sim.resolveStuns();assert.equal(u.stunnedUntilTick,0,'immune to both stun and knockup');}
 u.mana=100;u.atkCd=0;sim.step();assert.equal(sim.events.filter(e=>e.t==='cast').length,1,'cannot recast during form');
 sim.tick=end-1;u.mana=0;u.atkCd=0;sim.events.length=0;sim.step();
 assert.equal(u.damageReductionAt(sim.tick),0);assert.equal(u.snapshot(sim.tick).susanooActive,false);
 assert.deepEqual(sim.events.filter(e=>e.t==='hit').map(e=>e.id),[2],'normal attack resumes on expiry');
 sim.pendingStuns=[{src:sim.units[1],dst:u,seconds:.5,knockup:true}];sim.resolveStuns();assert.ok(u.stunnedUntilTick>sim.tick,'control works again after form');
 const rows=buildSkillStatRows(cfg,u.cfg,star,1);assert.equal(rows.find(r=>r.label==='持续时间').current,[2,3,99][star-1]+'秒');
 assert.ok(!buildSkillDescription(cfg,u.cfg,star,1).includes('{'));
}
assert.equal(cfg.scaleUnit(card,3).hp,10184,'three-star legendary keeps flat 5000 bonus HP');
assert.equal(make().units[0].susanooUntilTick,0,'form resets next battle');
const boosted=make(3),b=boosted.units[0];b.cfg.physicalPower=50;boosted.step();
assert.equal(b.susanooUntilTick,1+99*1.5*20,'duration scales with physical bonus');
boosted.step();assert.equal(boosted.events.find(e=>e.t==='hit').dmg,Math.round((b.cfg.atk+10000)*1.5));
const boostedRows=buildSkillStatRows(cfg,b.cfg,3,1);
assert.equal(boostedRows.find(r=>r.label==='持续时间').current,'148.5秒');
assert.equal(boostedRows.find(r=>r.label==='额外伤害').current,'15000');
assert.match(buildSkillDescription(cfg,b.cfg,3,1),/148.5/);
// Exercise the actual replay callsite and verify the crescent's downward edge rotates toward each target.
const replaySource=require('node:fs').readFileSync(require('node:path').join(__dirname,'../assets/scripts/view/BattleReplayer.ts'),'utf8');
const sweepBlock=replaySource.match(/if \(e\.area && skillId === 'susanoo_form'\) \{([\s\S]*?)\n          \}/)[1];
const sweep=new Function('tv','uv','FX_SPRITE',sweepBlock);
for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
 let args;const position={x:30+dx*100,y:40+dy*100,clone(){return {...this};}};
 sweep.call({playSpriteFx:(...a)=>args=a},{node:{position}},{node:{position:{x:30,y:40}}},{susanooSlash:'slash'});
 assert.equal(args[6],false,'rotation is not combined with horizontal mirroring');
 const rad=args[9]*Math.PI/180,length=Math.hypot(dx,dy);
 assert.ok(Math.abs(Math.sin(rad)-dx/length)<1e-8&&Math.abs(-Math.cos(rad)-dy/length)<1e-8,'convex edge points away from caster toward victim');
 assert.equal(args[1].x,position.x);assert.equal(args[1].y,position.y,'effect stays at victim');
}
console.log('PASS Susanoo: physical-scaled duration and extra damage, 50/70/99% reduction, 10000 three-star bonus, CC immunity, expiry, area attack event, mana, panel and reset');
