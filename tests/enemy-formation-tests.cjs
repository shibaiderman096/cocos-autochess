require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const {EnemyFormation}=require('../assets/scripts/core/EnemyFormation.ts'),{resolveEnemyRole,snapshotIdentity}=require('../assets/scripts/core/EnemyRoles.ts');
const {formationSettings,validateFormationConfig}=require('../assets/scripts/core/FormationPolicy.ts'),{extractFormationTemplates}=require('../assets/scripts/core/FormationTemplates.ts');
const {EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts'),{RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {loadEnemyGenerationInputs,loadFormationInputs}=require('../tools/run-simulation.ts');
const loadRunInputs=()=>require('./historical-inputs.cjs').archivedInputs;
const {buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const {hexDist,hexNeighbors}=require('../assets/scripts/battle/HexMath.ts');
const i=loadRunInputs(),g={...loadEnemyGenerationInputs(),enemyPower:require('../docs/p1-enemy-difficulty/power-calibration/final-500/enemy-power.json')},f={...loadFormationInputs(),enemyRoles:require('../docs/p4-balance/baseline/frozen.json').configs['enemy-roles']},c=f.formationConfig,r=f.enemyRoles,model=new EnemyPowerModel(g.enemyPower);
const clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const member=placements=>placements.map(({x,y,...m})=>m);let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function engine(config=c,roles=r){return new EnemyFormation(config,roles,i.units,i.skills,model,i.run.enemyProgression.cells);}
const solver=engine(),baseline=require('../docs/p2-enemy-formation/baseline-waves.json');
function context(ids=['guardian','mage','archer','ranger','enderman'],level='L2',extra={}){return {runSeed:12345,globalWaveId:40,stage:7,round:2,roundsInStage:10,waveKind:'normal',
 settings:formationSettings(c,7,2,10,'normal',level),enemies:ids.map((unitId,index)=>({unitId,star:1,equipment:[],statMultiplier:1,damageAmp:0,damageReduction:0,...i.run.enemyProgression.cells[index]})),...extra};}
const snapshot=(side=0,dispersed=false)=>({units:[{unitId:'mage',star:2,equipment:[],x:side?6:0,y:0,role:'mage',range:3,tags:['aoe']},
 {unitId:'archer',star:2,equipment:[],x:dispersed?(side?0:6):(side?5:1),y:dispersed?3:0,role:'ranged_dps',range:4,tags:[]}]});
function legal(result){assert.equal(new Set(result.placements.map(e=>e.x+','+e.y)).size,result.placements.length);for(const e of result.placements)assert.ok(Number.isInteger(e.x)&&Number.isInteger(e.y)&&e.x>=0&&e.x<7&&e.y>=4&&e.y<8);assert.ok(result.diagnostics.iterations<=c.maxIterations);}

test('budget generation rejects configuration without enemyGoldBudget',()=>{
 assert.throws(()=>buildRunWaves(99,i.run,i.waves,i.units,{mode:'budget-v1',runSeed:12345,difficulty:g.enemyDifficulty,power:g.enemyPower}),/requires enemyGoldBudget/);
});
test('all 15 purchasable units have auditable roles; self-heal and damage casters are not invented support',()=>{
 for(const u of i.units){const entry=resolveEnemyRole(u,i.skills,r);assert.ok(entry.role);assert.equal(entry.source,'explicit');assert.ok(entry.reason);}
 assert.equal(resolveEnemyRole(i.units.find(u=>u.id==='sakura'),i.skills,r).role,'tank');assert.equal(resolveEnemyRole(i.units.find(u=>u.id==='shaman'),i.skills,r).role,'mage');
 const unknown={...i.units[0],id:'fixture',role:undefined};const fallback=resolveEnemyRole(unknown,{}, {version:'test',units:{}});assert.equal(fallback.role,'melee_dps');assert.equal(fallback.confidence,'low');
 assert.equal(resolveEnemyRole({...unknown,range:4},{},{version:'test',units:{}}).role,'ranged_dps');
});
test('odd-r even and odd row adjacency comes from the existing HexMath',()=>{
 for(const cell of [{x:3,y:4},{x:3,y:5}])for(const neighbor of hexNeighbors(cell.x,cell.y))assert.equal(hexDist(cell,neighbor),1);
 assert.equal(hexDist({x:3,y:3},{x:4,y:4}),1);assert.equal(hexDist({x:3,y:4},{x:4,y:5}),2);
});
test('L0 exactly preserves all 968 P1-C positions and ignores malformed templates and player snapshots',()=>{
 for(const w of baseline){const result=solver.solve({runSeed:12345,globalWaveId:w.id,stage:w.stage,round:w.round,roundsInStage:w.roundsInStage,waveKind:w.waveKind,
  settings:formationSettings(c,w.stage,w.round,w.roundsInStage,w.waveKind,'L0'),enemies:w.enemies,template:{id:'bad',slots:[{x:-1,y:-1}]}});assert.deepEqual(result.placements,w.enemies);}
});
test('L1 uses role depth including a synthetic support classification without adding game content',()=>{
 const roles=clone(r);roles.units.shaman={...roles.units.shaman,role:'support',reason:'Test-only role fixture; no new support skill'};
 const result=engine(c,roles).solve(context(['guardian','warrior','mage','archer','shaman','enderman'],'L1'));legal(result);
 const y=id=>result.placements.find(e=>e.unitId===id).y;assert.ok(y('guardian')<y('archer'));assert.ok(y('guardian')<y('shaman'));
 const assassin=result.placements.find(e=>e.unitId==='enderman');assert.ok(Math.min(assassin.x,6-assassin.x)<=1);
});
test('L0/L1/L2 never access a supplied player snapshot',()=>{
 for(const level of ['L0','L1','L2']){const ctx=context(undefined,level);Object.defineProperty(ctx,'playerSnapshot',{get(){throw new Error('player snapshot leak');}});legal(solver.solve(ctx));}
});
test('L2 spaces three key backliners by at least two actual hexes when a feasible layout exists',()=>{
 const result=solver.solve(context());assert.equal(result.diagnostics.spacingViolations,0);const keys=result.placements.filter(e=>['mage','archer','ranger'].includes(e.unitId));
 for(let a=0;a<keys.length;a++)for(let b=a+1;b<keys.length;b++)assert.ok(hexDist(keys[a],keys[b])>=2);legal(result);
});
test('crowded backline retains legal unique cells, terminates and diagnoses spacing relaxation',()=>{
 const ctx=context(Array(10).fill('mage'),'L2',{candidateCells:solver.cells.filter(p=>p.y===6||p.y===7).slice(0,10)}),result=solver.solve(ctx);legal(result);
 assert.ok(result.diagnostics.spacingViolations>0);assert.ok(result.diagnostics.fallbackSteps.some(s=>s.includes('SPACING_SOFT')));
});
test('tank cover is stronger than a deterministic random-position baseline, without requiring every backliner covered',()=>{
 const ctx=context(),result=solver.solve(ctx),rng=new RunRandomContext(123).stream('formation',1);let mean=0;
 for(let trial=0;trial<100;trial++){const cells=solver.cells.slice();for(let j=cells.length-1;j>0;j--){const k=rng.int(0,j);[cells[j],cells[k]]=[cells[k],cells[j]];}mean+=solver.score(ctx,cells.slice(0,ctx.enemies.length)).cover/100;}
 assert.ok(result.diagnostics.score.cover>mean);assert.ok(result.diagnostics.score.cover>0);
 assert.ok(solver.solve(context(undefined,'L1')).diagnostics.score.cover>mean);
});
test('L3 reacts to left versus right backline mages using existing assassin/teleport capability only',()=>{
 const left=solver.solve(context(undefined,'L3',{playerSnapshot:snapshot(0)})),right=solver.solve(context(undefined,'L3',{playerSnapshot:snapshot(1)}));
 assert.ok(left.diagnostics.playerSnapshotUsed);assert.ok(left.diagnostics.counterReasons.some(s=>s.includes('ASSASSIN_TELEPORT')));
 assert.ok(left.placements.find(e=>e.unitId==='enderman').x<right.placements.find(e=>e.unitId==='enderman').x);
 assert.deepEqual(member(left.placements),member(right.placements));assert.notEqual(left.diagnostics.playerSnapshotHash,right.diagnostics.playerSnapshotHash);
});
test('L3 ranged density and cluster heuristics report existing melee/AoE/control responses',()=>{
 const dense=solver.solve(context(['warrior','itachi','mage'],'L3',{playerSnapshot:snapshot(0)}));
 assert.ok(dense.diagnostics.counterReasons.some(s=>s.includes('MELEE_FRONT')));assert.ok(dense.diagnostics.counterReasons.some(s=>s.includes('AOE_CONTROL')));
 const spread=solver.solve(context(['warrior','itachi','mage'],'L3',{playerSnapshot:snapshot(0,true)}));assert.ok(!spread.diagnostics.counterReasons.some(s=>s.includes('CLUSTER_CENTER')));
});
test('no assassin or teleport enemy gets no new ability and only coordinates can change',()=>{
 const ctx=context(['warrior','guardian','archer'],'L3',{playerSnapshot:snapshot(0)}),result=solver.solve(ctx);
 assert.deepEqual(member(result.placements),member(ctx.enemies));assert.ok(!result.diagnostics.counterReasons.some(s=>s.includes('ASSASSIN_TELEPORT')));assert.equal(i.units.find(u=>u.id==='warrior').skillId,undefined);
});
test('all seven templates extract coordinates only; malicious old stars, identities and multipliers never enter placements',()=>{
 const changed=clone(i.waves);for(const w of changed)for(const e of w.enemies){e.unitId='invalid';e.star=99;e.statMultiplier=100;}
 const templates=extractFormationTemplates(changed);assert.deepEqual(templates,extractFormationTemplates(i.waves));assert.equal(templates.length,7);
 const ctx=context(['guardian','mage','archer'],'L2',{waveKind:'boss',template:templates[6]}),result=solver.solve(ctx);assert.deepEqual(member(result.placements),member(ctx.enemies));legal(result);
});
test('legal templates apply, invalid templates fall back and partial templates fill remaining units',()=>{
 const template={id:'fixture',slots:[{x:3,y:4},{x:1,y:6},{x:5,y:6}]},ctx=context(['guardian','mage','archer'],'L2',{waveKind:'boss',template}),result=solver.solve(ctx);
 assert.ok(result.diagnostics.templateUsed);assert.ok(result.diagnostics.templateSlotsMatched>0);legal(result);
 for(const slots of [[{x:-1,y:4}],[{x:1,y:4},{x:1,y:4}],[]]){const bad=solver.solve({...ctx,template:{id:'bad',slots}});legal(bad);assert.equal(bad.diagnostics.templateUsed,false);assert.ok(bad.diagnostics.fallbackSteps.some(s=>s.includes('TEMPLATE')));}
 const partial=solver.solve({...ctx,template:{id:'one',slots:[{x:3,y:4}]}});assert.equal(partial.placements.length,3);assert.ok(partial.diagnostics.fallbackSteps.some(s=>s.includes('PARTIAL_FILL')));legal(partial);
});
test('all L1/L2/L3 formations retain exact members and budget diagnostics over all 99 stages',()=>{
 for(const w of baseline){if(w.stage===1)continue;const members=hash(member(w.enemies)),budget=hash(w.budget);
  for(const level of ['L1','L2','L3']){const result=solver.solve({runSeed:12345,globalWaveId:w.id,stage:w.stage,round:w.round,roundsInStage:w.roundsInStage,waveKind:w.waveKind,
   settings:formationSettings(c,w.stage,w.round,w.roundsInStage,w.waveKind,level),enemies:w.enemies,playerSnapshot:level==='L3'?snapshot():undefined});legal(result);assert.equal(hash(member(result.placements)),members);assert.equal(hash(w.budget),budget);}}
});
test('same inputs repeat exactly and configuration key order does not affect formations',()=>{
 const ctx=context(undefined,'L3',{playerSnapshot:snapshot()});assert.deepEqual(solver.solve(ctx),solver.solve(clone(ctx)));
 const reversed=Object.fromEntries(Object.entries(c).reverse());assert.deepEqual(engine(reversed,{...r,units:Object.fromEntries(Object.entries(r.units).reverse())}).solve(ctx),solver.solve(ctx));
});
test('formation RNG consumption leaves shop/battle/enemy/bot/reward streams unchanged',()=>{
 const a=new RunRandomContext(12345),b=new RunRandomContext(12345),stream=b.stream('formation',40);for(let n=0;n<1000;n++)stream.next();solver.solve(context());
 for(const key of ['shop','battle','enemy','bot','reward']){const aa=a.stream(key,40),bb=b.stream(key,40);for(let n=0;n<20;n++)assert.equal(aa.next(),bb.next());}
});
test('snapshot identity ignores order and future data but includes current tactical positions/stars/equipment',()=>{
 const a=snapshot();assert.equal(snapshotIdentity(a),snapshotIdentity({units:a.units.slice().reverse(),futureShop:['not read']}));
 const b=clone(a);b.units[0].x=2;assert.notEqual(snapshotIdentity(a),snapshotIdentity(b));
});
test('progression strengths vary smoothly; early bosses do not unlock counter scoring through a bonus alone',()=>{
 const boss=formationSettings(c,2,5,5,'boss');assert.notEqual(boss.level,'L3');assert.equal(boss.counterStrength,0);
 const before=formationSettings(c,5,8,8,'normal'),after=formationSettings(c,6,1,9,'normal');assert.ok(Math.abs(after.spacingStrength-before.spacingStrength)<.1);
 assert.equal(formationSettings(c,1,3,3,'intro','L3').level,'L0');assert.equal(formationSettings(c,10,1,10,'normal').counterStrength,0);
});
test('invalid config/snapshot/insufficient cells fail clearly; invalid template alone does not crash',()=>{
 const bad=clone(c);bad.maxIterations=Infinity;assert.throws(()=>validateFormationConfig(bad));assert.throws(()=>solver.solve(context(undefined,'L2',{candidateCells:[{x:0,y:4}]})));
 const snap=snapshot();snap.units[0].y=4;assert.throws(()=>solver.solve(context(undefined,'L3',{playerSnapshot:snap})));
 const missing=solver.solve(context(undefined,'L3'));assert.ok(missing.diagnostics.fallbackSteps.some(s=>s.includes('SNAPSHOT_MISSING')));
});
test('formation does not import BattleSim or EnemyGenerator',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../assets/scripts/core/EnemyFormation.ts'),'utf8');assert.ok(!/from ['"].*(BattleSim|EnemyGenerator)['"]/.test(text));
});
console.log(`Enemy formation: ${passed} passed, 0 failed`);
