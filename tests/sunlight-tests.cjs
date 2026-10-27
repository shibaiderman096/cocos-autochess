require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim}=require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics}=require('../assets/scripts/battle/CombatStatistics.ts');
const {resolveTraits}=require('../assets/scripts/battle/Traits.ts');
const {buildSkillDescription,buildSkillStatRows}=require('../assets/scripts/ui/SkillPresentation.ts');
const {sunlightTierText}=require('../assets/scripts/ui/SunlightPresentation.ts');
const retired=require('./fixtures/retired-20261023.json');
const roster=[...require('../assets/resources/config/units.json'),...retired.units],skills={...require('../assets/resources/config/skills.json'),...retired.skills},battle=structuredClone(require('../assets/resources/config/battle.json'));
// Historical skill regression fixtures retain their original faction membership.
for(const t of battle.traits)if(['shadow','sunlight'].includes(t.id)){const old=t.id==='shadow'?['abyss_iron_guard','blackfeather_hunter','nightmare_lamplighter','shadow_seam_assassin','soulcleaver_general','ghostflame_blade','eclipse_crossbow','nether_lantern_witch','blackstar_warlock','voidscar_reaver']:['helion','saiph','bronda','kaeru','leon','phinia','aurelia','celine','oris','seraphiel'];t.members=old;}
const clone=x=>JSON.parse(JSON.stringify(x)),trait=battle.traits.find(t=>t.id==='sunlight'),ids=trait.members;
const dummy={id:'dummy',name:'target',hp:100000,atk:0,armor:0,mr:0,atkSpeed:.1,range:1,moveTicks:6,maxMana:0,startMana:0,manaPerHit:0,critChance:0};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function config(traits=[]){const c=new ConfigManager();c.setUnits(clone(roster));c.setSkills(clone(skills));c.setBattle({...clone(battle),traits});return c;}
function settle(s){s.resolveDamage();s.resolveStuns();s.pendingDamage.length=0;s.pendingStuns.length=0;}
function advance(s,n){for(let i=0;i<n;i++){s.units.forEach(u=>{u.atkCd=u.moveCd=100000;});s.step();}}
function create(id,star=1,{source={x:3,y:2},enemies=[{x:3,y:3},{x:6,y:7}],friends=[],bonuses={}}={}){
 const c=config(),hero={...c.getUnit(id),critChance:0,...bonuses};
 const s=new BattleSim(c,[{cfg:hero,side:0,star,...source},...enemies.map((p,i)=>({cfg:{...dummy,id:`enemy${i}`},side:1,...p})),...friends.map((p,i)=>({cfg:{...dummy,id:`friend${i}`},side:0,...p}))],{seed:1019});
 s.units.forEach(u=>{u.mana=0;u.atkCd=u.moveCd=100000;});s.start();
 return {s,c,src:s.units[0],targets:s.units.filter(u=>u.side===1),friends:s.units.slice(1+enemies.length),sk:c.getSkill(hero.skillId)};
}
function activate(f,target=f.targets[0]){f.s.sunlight.activate(f.src,f.sk,target?.id);settle(f.s);}
const hits=f=>f.s.events.filter(e=>e.t==='hit'&&e.source===f.src.id);
assert.deepEqual(ids,['helion','saiph','bronda','kaeru','leon','phinia','aurelia','celine','oris','seraphiel']);
assert.equal(resolveTraits([trait],[...ids,...ids])[0].count,10);
for(const side of [0,1])for(let n=1;n<=10;n++){
 const c=config([clone(trait)]),base={...dummy,hp:1000};
 const s=new BattleSim(c,[...ids.slice(0,n).map((id,i)=>({cfg:{...base,id},side,x:i%7,y:(side===0?0:6)+Math.floor(i/7)})),{cfg:dummy,side:1-side,x:0,y:side===0?7:0}],{seed:44});
 s.start();const fraction=n>=10?3:n>=7?.5:n>=5?.35:n>=3?.2:0;
 for(const unit of s.units.slice(0,n))assert.equal(unit.shield,1000*fraction);
 assert.equal(s.units.at(-1).shield,0);
 if(n>=5){near(s.units[0].cfg.damageAmp??0,n===10?1:0);advance(s,239);near(s.units[0].cfg.damageAmp,n===10?1:0);advance(s,1);near(s.units[0].cfg.damageAmp,n===10?1:.25);}
}
// Initial mirrored front/back classification survives movement; members only, no duplicate-count activations.
for(const side of [0,1]){
 const c=config([clone(trait)]),s=new BattleSim(c,[...ids.slice(0,5).map((id,i)=>({cfg:{...dummy,id,hp:1000},side,x:i,y:side===0?(i===0?2:0):(i===0?5:7)})),{cfg:dummy,side:1-side,x:6,y:side===0?7:0}],{seed:9});
 s.start();s.units[0].y=side===0?0:7;s.units[1].y=side===0?3:4;advance(s,240);
 near(s.units[0].cfg.damageReduction,.2);near(s.units[0].cfg.damageAmp,0);near(s.units[1].cfg.damageAmp,.25);near(s.units[1].cfg.damageReduction,0);
}
// The 10-tier buffs apply at battle start, using initial mirrored rows and scaled/equipped max HP.
for(const side of [0,1])for(const star of [1,2,3]){
 const c=config([clone(trait)]);c.setEquipment(require('../assets/resources/config/equipment.json'));
 const s=new BattleSim(c,[...ids.map((id,i)=>({cfg:{...dummy,id,hp:1000},side,star,equipment:['forest_sanctuary'],x:i%7,y:side===0?(i===0?2:0):(i===0?5:7)})),
  {cfg:{...dummy,id:'outsider'},side,x:6,y:side===0?3:4},
  {cfg:{...dummy,hp:1000000},side:1-side,star:3,equipment:['forest_sanctuary'],x:6,y:side===0?7:0}],{seed:9});
 const [front,back]=s.units,outsider=s.units.at(-2),enemy=s.units.at(-1);
 s.start();s.start();
 for(const u of s.units.slice(0,10))assert.equal(u.sunlightShield,Math.round(u.cfg.hp*3));
 near(front.cfg.damageReduction,.5);near(front.cfg.damageAmp,0);near(back.cfg.damageAmp,1);near(back.cfg.damageReduction,0);
 assert.equal(outsider.shield,0);near(outsider.cfg.damageReduction,0);near(outsider.cfg.damageAmp,0);
 assert.equal(s.events.filter(e=>e.t==='shield').length,10,'starting twice does not grant shields or buffs twice');
 s.damage(enemy,front,100,'physical');s.damage(back,enemy,100,'physical');settle(s);
 assert.deepEqual(s.events.filter(e=>e.t==='hit').map(e=>e.dmg),[50,200],'front halves incoming damage, back doubles outgoing damage');
 front.y=side===0?0:7;back.y=side===0?3:4;
 advance(s,240);near(front.cfg.damageReduction,.5);near(front.cfg.damageAmp,0);near(back.cfg.damageAmp,1);near(back.cfg.damageReduction,0);
 assert.equal(s.events.filter(e=>e.t==='sun_pulse'&&e.trait&&e.effect==='formation').length,10,'no inherited 12-second buff stacks on 10-tier');
 assert.ok(s.events.filter(e=>e.t==='hit'&&e.sunlightJudgmentSide!==undefined).every(e=>e.dmg===Math.round(1000+enemy.cfg.hp*.1)),'judgments use target max HP after star and equipment scaling');
}
// No faction tier deals damage or emits a burst when its own shield breaks, even on a lethal hit.
for(const side of [0,1])for(const count of [3,5,7,10])for(const lethal of [false,true]){
 const c=config([clone(trait)]),s=new BattleSim(c,[...ids.slice(0,count).map((id,i)=>({cfg:{...dummy,id,hp:1000},side,x:i%7,y:side===0?2+Math.floor(i/7):5-Math.floor(i/7)})),{cfg:dummy,side:1-side,x:0,y:side===0?4:3}],{seed:1});
 s.start();const src=s.units[0],enemy=s.units.at(-1),hp=enemy.hp;
 s.damage(enemy,src,(src.shield+(lethal?1000:0))/(1-src.damageReductionAt(s.tick)),'true');settle(s);
 assert.equal(src.sunlightShield,0);assert.equal(enemy.hp,hp);assert.equal(src.hp,lethal?0:1000);
 assert.ok(!s.events.some(e=>e.t==='sun_pulse'&&e.trait&&e.effect==='burst'));
}
// Untargetable/dead enemies are excluded, shields absorb damage, and statistics cap overkill at actual HP lost.
{
 const c=config([clone(trait)]),s=new BattleSim(c,[...ids.map((id,i)=>({cfg:{...dummy,id,hp:1000},side:0,x:i%7,y:Math.floor(i/7)})),
  {cfg:{...dummy,hp:20000},side:1,x:1,y:7},{cfg:{...dummy,hp:200000},side:1,x:5,y:7}],{seed:19});
 const [first,second]=s.units.slice(-2);first.skillUntargetable=second.skillUntargetable=true;first.hp=500;first.shield=1000;
 s.start();advance(s,20);assert.equal(s.events.filter(e=>e.t==='hit').length,0);
 first.skillUntargetable=false;advance(s,20);assert.equal(first.hp,0);assert.equal(first.shield,0);assert.equal(first.alive,false);
 const hit=s.events.find(e=>e.t==='hit');assert.equal(hit.id,first.id);assert.equal(hit.dmg,3000);assert.equal(hit.actualDamage,500);
 second.skillUntargetable=false;advance(s,40);
 assert.deepEqual(s.events.filter(e=>e.t==='hit').map(e=>[e.tick,e.id]),[[40,first.id],[60,second.id],[80,second.id]]);
 const statistics=new CombatStatistics();statistics.begin(s.units);statistics.consume(s.events);
 assert.equal(statistics.snapshot().find(r=>r.sourceKind==='sunlightJudgment').damage,42500);
}
// The 7-piece timer first fires at 5s; faction true damage ignores power, amp and reductions.
{
 const c=config([clone(trait)]),s=new BattleSim(c,[...ids.slice(0,7).map((id,i)=>({cfg:{...dummy,id,damageAmp:2,spellPower:900},side:0,x:i,y:0})),{cfg:{...dummy,damageReduction:1,mr:9999},side:1,x:3,y:7}],{seed:5});
 s.start();advance(s,99);assert.equal(s.events.filter(e=>e.t==='hit').length,0);advance(s,1);
 assert.equal(s.events.find(e=>e.t==='hit').dmg,200);assert.equal(s.events.find(e=>e.t==='stun').duration,1);
 assert.ok(!('sunlightJudgedUntil' in s.units.at(-1)));assert.ok(!s.events.some(e=>e.t==='sun_pulse'&&e.effect==='mark'));
}
// 7-piece judgments use their own 3-star source and keep personal damage untouched.
for(const side of [0,1]){
 const c=config([clone(trait)]),s=new BattleSim(c,[...ids.slice(0,7).map((id,i)=>({cfg:{...dummy,id},side,x:i,y:side===0?0:7})),
  {cfg:{...dummy,hp:1000},side:1-side,x:3,y:side===0?7:0}],{seed:5});
 s.start();s.units[0].hp=0;s.units[0].alive=false;const target=s.units.at(-1);target.shield=150;
 const statistics=new CombatStatistics();statistics.begin(s.units);advance(s,100);statistics.consume(s.events);
 const row=statistics.snapshot().find(r=>r.sourceKind==='sunlightJudgment');
 assert.deepEqual([row.side,row.star,row.damage,row.damageByType.true],[side,3,50,50],'7-piece judgments credit actual HP damage after shields to a 3-star faction row, even if its representative died');
 assert.equal(statistics.snapshot().find(r=>r.id===s.units[0].id).damage,0,'no duplicate personal credit');
 target.hp=40;advance(s,100);statistics.consume(s.events);assert.equal(statistics.snapshot().find(r=>r.id===row.id).damage,90,'overkill is capped');
 assert.equal(statistics.snapshot().find(r=>r.id===target.id).taken,90);
 assert.equal(statistics.consume(s.events),false);statistics.begin(s.units);assert.ok(statistics.snapshot().every(r=>!r.sourceKind&&!r.damage),'next battle clears the faction row');
}
// 10-piece random judgments deal immediate fixed true damage every second and can revisit targets.
for(const side of [0,1]){
 const c=config([clone(trait)]),placements=[...ids.map((id,i)=>({cfg:{...dummy,id,hp:1000,damageAmp:2,physicalPower:900,spellPower:900},side,x:i%7,y:side===0?Math.floor(i/7):7-Math.floor(i/7)})),...[1,5].map((x,i)=>({cfg:{...dummy,id:`enemy${i}`,hp:100000*(i+1),damageReduction:1,armor:9999,mr:9999},side:1-side,x,y:side===0?7:0}))];
 const s=new BattleSim(c,clone(placements),{seed:19});
 s.start();advance(s,19);assert.equal(s.events.filter(e=>e.t==='stun').length,0);assert.equal(s.events.filter(e=>e.t==='hit').length,0);
 advance(s,1);assert.equal(s.events.filter(e=>e.t==='stun').length,1);assert.equal(s.events.filter(e=>e.t==='hit').length,1,'no one-second damage delay');
 advance(s,19);assert.equal(s.events.filter(e=>e.t==='hit').length,1,'no damage between judgments');
 advance(s,1);assert.equal(s.events.filter(e=>e.t==='stun').length,2);assert.equal(s.events.filter(e=>e.t==='hit').length,2);
 s.units[0].alive=false;s.units[0].hp=0;advance(s,60);
 const judged=s.events.filter(e=>e.t==='hit');assert.equal(judged.length,5,'exactly one hit per second, without former 5-second or per-target DOT damage');
 assert.deepEqual(judged.map(e=>e.tick),[20,40,60,80,100]);
 for(const event of judged){assert.equal(event.dmg,1000+s.units.find(u=>u.id===event.id).cfg.hp*.1);assert.equal(event.dmgType,'true');assert.equal(event.sunlightJudgmentSide,side);assert.ok(!event.critical);}
 assert.ok(new Set(judged.map(e=>e.id)).size<judged.length,'random selection can revisit judged enemies');
 assert.ok(s.events.filter(e=>e.t==='stun').every(e=>e.duration===1));
 assert.ok(!('burns' in s.sunlight));
 assert.ok(s.units.slice(-2).every(u=>!('sunlightJudged' in u.snapshot(s.tick))));
 assert.equal(s.events.filter(e=>e.t==='sun_pulse'&&e.effect==='board').length,1,'10-tier battlefield stays enabled');
 const statistics=new CombatStatistics();statistics.begin(s.units);statistics.consume(s.events);
 const row=statistics.snapshot().find(r=>r.sourceKind==='sunlightJudgment');
 assert.equal(row.name,'日辉羁绊');assert.equal(row.star,4);assert.equal(row.side,side);
 assert.equal(row.damage,s.events.filter(e=>e.t==='hit').reduce((n,e)=>n+e.actualDamage,0));
 assert.equal(row.damageByType.true,row.damage);assert.equal(statistics.snapshot().find(r=>r.id===s.units[0].id).damage,0);
 const repeat=new BattleSim(c,clone(placements),{seed:19});repeat.start();advance(repeat,40);repeat.units[0].alive=false;repeat.units[0].hp=0;advance(repeat,60);assert.deepEqual(repeat.events,s.events,'same seed and inputs replay exactly');
}
for(const star of [1,2,3]){
 const f=create('helion',star,{bonuses:{physicalPower:50,spellPower:900,damageAmp:.2}});f.src.shield=500;activate(f);
 assert.equal(f.src.shield,500+Math.round([180,270,420][star-1]*1.5));advance(f.s,79);assert.equal(hits(f).length,0);advance(f.s,1);
 assert.equal(f.src.shield,500);assert.equal(hits(f)[0].dmg,Math.round([90,135,210][star-1]*1.5*1.2));
 const b=create('helion',star);activate(b);b.s.damage(b.targets[0],b.src,100000,'true');settle(b.s);assert.equal(hits(b).length,1,'lethal break still bursts');advance(b.s,80);assert.equal(hits(b).length,1);
 const a=create('saiph',star,{source:{x:0,y:0},enemies:[{x:1,y:0},{x:2,y:0},{x:2,y:1}]});activate(a);advance(a.s,8);
 assert.deepEqual(hits(a).map(e=>e.dmg),[[45,45,75,53],[70,70,105,74],[110,110,170,119]][star-1]);assert.deepEqual(hits(a).map(e=>e.tick),[0,4,8,8]);assert.equal(a.targets[2].hp,100000);
 const b2=create('bronda',star,{friends:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],bonuses:{spellPower:50,physicalPower:900}});
 b2.friends.forEach((u,i)=>u.hp=100+i*100);activate(b2);assert.deepEqual(b2.friends.map(u=>u.shield),[Math.round([130,195,300][star-1]*1.5),Math.round([130,195,300][star-1]*1.5),0]);
 b2.s.damage(b2.targets[0],b2.friends[0],1000,'true');settle(b2.s);const hp=b2.friends[1].hp;advance(b2.s,80);
 assert.equal(b2.friends[1].hp,hp+Math.round([80,120,180][star-1]*1.5));assert.equal(b2.s.events.filter(e=>e.t==='heal').length,1);
 const h=create('kaeru',star);h.targets[0].shield=1;activate(h);assert.equal(hits(h)[0].dmg,Math.round([90,135,210][star-1]*1.4));near(h.src.skillAttackSpeedBonus,[.4,.5,.7][star-1]);advance(h.s,8);assert.equal(hits(h).length,3);advance(h.s,72);near(h.src.skillAttackSpeedBonus,0);
 const l=create('leon',star,{enemies:[{x:3,y:3},{x:3,y:4},{x:2,y:3},{x:3,y:1},{x:6,y:7}]});activate(l);assert.equal(hits(l).length,3);assert.equal(l.src.shield,[210,315,510][star-1]);near(l.src.guardReduction,.15);advance(l.s,80);assert.equal(l.src.damageReductionAt(l.s.tick),0);assert.equal(l.src.shield,[210,315,510][star-1]);
 const e=create('phinia',star);activate(e);for(let i=0;i<4;i++){e.s.damage(e.src,e.targets[0],e.src.cfg.atk,'physical',true);e.s.sunlight.onBasicAttack(e.src,e.targets[0]);settle(e.s);}
 assert.deepEqual(hits(e).filter(h=>h.dmgType==='magic').map(e=>e.dmg),[...Array(4).fill([55,85,140][star-1]),[140,210,350][star-1]]);assert.equal(e.src.skillAttackSpeedBonus,0);
 const bow=create('aurelia',star,{source:{x:0,y:0},enemies:[1,2,3,4,5,6].map(x=>({x,y:0})),bonuses:{physicalPower:100,spellPower:900}});activate(bow);
 const physical=hits(bow).filter(e=>e.dmgType==='physical');assert.equal(physical.length,6);assert.equal(physical[0].dmg,[840,1300,5200][star-1]);assert.equal(physical[5].dmg,Math.round([420,650,2600][star-1]*.4*2));assert.equal(hits(bow).filter(e=>e.dmgType==='true').length,0,'the retired judgment bonus is never dealt');
 const p=create('celine',star,{source:{x:6,y:0},enemies:[{x:0,y:1},{x:6,y:7}],friends:[{x:0,y:0},{x:1,y:0}],bonuses:{spellPower:50}});p.friends.forEach(u=>u.hp=100);activate(p);assert.equal(p.friends[0].shield,Math.round([180,270,1080][star-1]*1.5));advance(p.s,79);assert.equal(hits(p).length,0);advance(p.s,1);assert.equal(hits(p)[0].dmg,[300,450,1800][star-1]);assert.equal(p.s.events.find(e=>e.t==='stun').duration,[.75,1,2.5][star-1]);assert.equal(p.friends[0].hp,100+Math.round([100,150,600][star-1]*1.5));
 const j=create('oris',star,{enemies:[0,1,2,3,4,5].map(x=>({x,y:5})),bonuses:{spellPower:100}});activate(j);const expected=[3,4,6][star-1];assert.equal(j.s.events.filter(e=>e.t==='sun_pulse'&&e.effect==='warning').length,expected);advance(j.s,15);assert.equal(hits(j).length,0);advance(j.s,1);assert.equal(hits(j).length,expected*2);assert.equal(hits(j).find(e=>e.dmgType==='magic').dmg,[600,900,5000][star-1]);assert.equal(hits(j).find(e=>e.dmgType==='true').dmg,[100,150,2000][star-1]);
 assert.ok(j.targets.every(u=>!('sunlightJudged' in u.snapshot(j.s.tick))));
 const t=create('seraphiel',star,{enemies:[{x:2,y:5},{x:5,y:5}]});activate(t);assert.equal(t.src.skillUntargetable,false);advance(t.s,([2,4,10][star-1]-1)*4);assert.equal(t.src.skillUntargetable,false);
 assert.equal(hits(t).filter(e=>e.dmgType==='physical').length,[2,4,10][star-1]);assert.equal(hits(t).filter(e=>e.dmgType==='true').length,0,'end-of-transit mark damage and its bonus are removed');
 assert.equal(new Set(hits(t).map(e=>e.id)).size,1,'the whole combo locks one target');assert.equal(hits(t).at(-1).dmg,[450,675,600][star-1]);
 assert.ok(!t.s.events.some(e=>e.t==='sun_pulse'&&e.kind==='transit'&&e.effect==='burst'));
}
const solo=create('seraphiel',1,{enemies:[{x:3,y:5}]});activate(solo);advance(solo.s,16);assert.deepEqual(hits(solo).map(e=>e.dmg),[90,450]);assert.equal(solo.src.skillUntargetable,false);
const interrupted=create('seraphiel');activate(interrupted);interrupted.s.sunlight.interrupt(interrupted.src);advance(interrupted.s,20);assert.deepEqual(hits(interrupted).map(e=>[e.dmgType,e.dmg]),[['physical',90]]);assert.equal(interrupted.src.skillUntargetable,false);
const route=create('seraphiel',1,{enemies:[{x:1,y:5},{x:3,y:5},{x:5,y:5}]});activate(route);advance(route.s,16);assert.equal(new Set(hits(route).map(e=>e.id)).size,1,'surviving targets do not cause extra jumps');
// A 10-trait judgment target grants neither removed skill bonus nor an end explosion.
{
 const c=config([clone(trait)]),s=new BattleSim(c,[...ids.map((id,i)=>({cfg:{...dummy,id,hp:1000},side:0,x:i%7,y:Math.floor(i/7)})),{cfg:dummy,side:1,x:3,y:7}],{seed:19});
 s.start();advance(s,40);const bow=s.units[6],transit=s.units[9],target=s.units.at(-1);assert.equal(s.events.filter(e=>e.t==='hit').length,2);
 s.sunlight.activate(bow,c.getSkill('sunpiercer_lance'),target.id);settle(s);assert.ok(s.events.filter(e=>e.t==='hit'&&e.source===bow.id).every(e=>e.dmgType==='physical'));
 s.sunlight.activate(transit,c.getSkill('corona_transit'),target.id);settle(s);advance(s,16);const jumps=s.events.filter(e=>e.t==='hit'&&e.source===transit.id);assert.equal(jumps.length,2);assert.ok(jumps.every(e=>e.dmgType==='physical'));assert.equal(transit.skillUntargetable,false);
}
const timeout=create('phinia');activate(timeout);advance(timeout.s,120);assert.equal(timeout.src.skillAttackSpeedBonus,0);assert.equal(hits(timeout).length,0);
// Shield groups cannot spend the same absorbed damage twice.
{
 const f=create('helion');activate(f);f.src.shield+=100;f.s.shadowSkills.shields.push({serial:0,source:f.src,target:f.src,skill:{...f.sk,shadow:{kind:'domain'}},remaining:100,end:200,bulwark:false});
 f.s.damage(f.targets[0],f.src,100,'true');settle(f.s);assert.equal(f.src.shield,180);assert.equal(hits(f).length,0);advance(f.s,80);assert.equal(f.src.shield,0);assert.equal(hits(f).length,1);
}
for(const id of ids){
 const c=config(),u=c.getUnit(id);assert.equal(u.manaPerHit,10);assert.equal(u.critChance,.25);assert.equal(u.moveTicks,6);
 for(const star of [1,2,3]){
  const current={...c.scaleUnit(u,star),atk:999999,physicalPower:50,spellPower:80,damageAmp:.2};
  const rows=buildSkillStatRows(c,current,star,1,true);assert.equal(rows.length,skills[u.skillId].statRows.length,id+' complete panel rows');
  assert.doesNotMatch(JSON.stringify(rows),/NaN|Infinity|undefined/);assert.doesNotMatch(buildSkillDescription(c,current,star,1,true),/\{[^}]+\}|NaN|Infinity|undefined/);
 }
 const f=create(id);f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;f.s.step();assert.equal(f.s.events.find(e=>e.t==='cast')?.skillId,f.sk.id);advance(f.s,40);assert.ok(f.s.events.some(e=>e.t==='sun_pulse'),id+' real cast produces visual events');
 function replay(){const f=create(id);f.src.mana=f.src.cfg.maxMana;f.src.atkCd=0;return f.s.run();}assert.deepEqual(replay(),replay(),id+' deterministic');
 if(retired.units.some(unit=>unit.id===id))continue; // Retired art is intentionally no longer shipped.
 const art=require('../assets/scripts/view/ArtPaths.ts');assert.ok(fs.existsSync(`assets/resources/${art.UNIT_ART[id].replace('/spriteFrame','.png')}`));assert.ok(art.UNIT_PORTRAIT[id]);
}
for(const tier of trait.breakpoints)assert.doesNotMatch(sunlightTierText(tier),/undefined|NaN/);
for(const tier of trait.breakpoints){assert.doesNotMatch(sunlightTierText(tier),/标记|印记|破盾|未受审判|5%的真实/);assert.doesNotMatch(JSON.stringify(tier.sunlight),/burstMaxHpFraction|burstRadius|continuous/);}
assert.deepEqual(ids.map(id=>roster.find(u=>u.id===id).name),['赫利昂','赛芙','布隆达','凯鲁','雷昂','菲妮娅','艾蕾娅','瑟琳','奥瑞斯','塞拉菲尔']);
for(const id of ids){const skill=skills[roster.find(u=>u.id===id).skillId];assert.doesNotMatch(JSON.stringify(skill),/标记|印记|judgmentDamage|judgmentBonus|markSeconds|markDamage/);}
for(const [id,modify] of [['solar_prayer',s=>s.sunlight.durationSeconds=0],['corona_transit',s=>s.sunlight.counts=[1,2,2.5]],['celestial_judgment',s=>s.sunlight.allEnemiesStar=4]]){const bad=clone(skills);modify(bad[id]);assert.throws(()=>new ConfigManager().setSkills(bad),/Invalid sunlight/);}
for(const modify of [s=>s.shieldMaxHpFraction=-1,s=>s.formation.frontReduction=1.01,s=>s.judgment.intervalSeconds=0,s=>s.judgment.targetMaxHpFraction=-.1,s=>s.judgment.targetMaxHpFraction=1.1,s=>s.judgment.targetMaxHpFraction=NaN,s=>s.judgment.independentStatistics='yes',s=>s.judgment.statisticsStar=0,s=>s.judgment.statisticsStar=5,s=>s.judgment.statisticsStar=1.5,s=>s.judgment.statisticsStar=NaN,s=>s.battlefield=1]){
 const bad=clone(battle);modify(bad.traits.find(t=>t.id==='sunlight').breakpoints[3].sunlight);assert.throws(()=>new ConfigManager().setBattle(bad),/Invalid sunlight/);
}
console.log('PASS sunlight: all four tiers, both sides, initial formations, shield ownership/break/expiry without faction bursts, immediate random true judgments, independent four-star statistics, all ten skills at three stars, live casts, panels, resources, deterministic replays and invalid configurations');
