require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {CombatStatistics} = require('../assets/scripts/battle/CombatStatistics.ts');
const equipment = require('../assets/resources/config/equipment.json');
const cfg = new ConfigManager();cfg.setEquipment(equipment);
const ARCANE='arcane_sovereignty',CLAW='crimson_bloodclaw',PLATE='abyssal_plate',
  SWORD='divine_judgment',VEIL='arcane_veil',FOREST='forest_sanctuary';
const base={id:'test',name:'test',hp:1000,atk:100,armor:0,mr:0,atkSpeed:1,range:10,
  moveTicks:1,maxMana:0,startMana:0,manaPerHit:0,critChance:0,damageReduction:1};
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function make(items=[],source={},target={},targetItems=[]) {
  return new BattleSim(cfg,[{cfg:{...base,...source},side:0,x:1,y:2,equipment:items},
    {cfg:{...base,hp:100000,atk:0,...target},side:1,x:2,y:2,equipment:targetItems}],{seed:17,maxTicks:400});
}
function queue(sim,src,dst,raw,type='true',basic=false) {
  sim.damage(src,dst,raw,type,basic);
}
function resolve(sim) {sim.resolveDamage();sim.pendingDamage.length=0;}
function hit(sim,raw,type='true',reverse=false) {
  sim.pendingDamage.length=0;
  const src=sim.units[reverse?1:0],dst=sim.units[reverse?0:1];
  const reduction=dst.cfg.damageReduction;dst.cfg.damageReduction=0;
  queue(sim,src,dst,raw,type);resolve(sim);dst.cfg.damageReduction=reduction;
  return sim.events.filter(e=>e.t==='hit'&&e.id===dst.id).at(-1);
}
const triggers=(sim,id)=>sim.events.filter(e=>e.t==='equipment_trigger'&&e.equipmentId===id);
const advance=(sim,n)=>{for(let i=0;i<n;i++)sim.step();};
const stats=(items,patch={})=>cfg.equipmentStats({...base,...patch},items);
// All passive calculations use final equipment attributes and are independent of slot order.
assert.equal(stats([ARCANE]).spellPower,50);approx(stats([ARCANE]).damageAmp,.02);
for(const [power,bonus] of [[9,.02],[10,.03],[149,.09],[150,.1],[10000,.1]])approx(stats([ARCANE],{spellPower:power}).damageAmp,bonus);
approx(stats([ARCANE,ARCANE]).damageAmp,.1);
approx(stats([ARCANE,ARCANE,ARCANE],{spellPower:50}).damageAmp,.3);
approx(stats([ARCANE,CLAW]).damageAmp,.03,'claw pushes total spell power across the next 20% step');
assert.deepEqual(stats([ARCANE,CLAW]),stats([CLAW,ARCANE]));
for(const type of ['physical','magic','true']) {
  const sim=make([ARCANE]);const event=hit(sim,100,type);
  assert.equal(event.dmg,type==='magic'?153:102,'Arcane global amplification applies once to all damage');
}
assert.equal(stats([PLATE]).armor,60);assert.equal(stats([PLATE]).hp,1100);
approx(stats([PLATE],{armor:40,damageReduction:0}).damageReduction,0,'100 armor is insufficient');
approx(stats([PLATE],{armor:41,damageReduction:0}).damageReduction,.05);
approx(stats([PLATE,PLATE],{damageReduction:0}).damageReduction,.1);
assert.deepEqual(stats([PLATE,CLAW],{armor:31}),stats([CLAW,PLATE],{armor:31}));
{
  const sim=make([],{}, {hp:1000,armor:41,damageReduction:0},[PLATE]);
  queue(sim,...sim.units,100);resolve(sim);assert.equal(sim.events.at(-1).dmg,95,'plate reduces true damage after armor threshold is met');
}
{
  const sim=make([CLAW]),u=sim.units[0];
  assert.deepEqual([u.cfg.armor,u.cfg.mr,u.cfg.physicalPower,u.cfg.spellPower],[10,10,10,10]);
  for(const [hp,rate] of [[1000,.2],[901,.2],[900,.21],[500,.25],[100,.29],[1,.29],[1000,.2]]){u.hp=hp;approx(u.lifesteal,rate);}
  const triple=make([CLAW,CLAW,CLAW]).units[0];triple.hp=500;approx(triple.lifesteal,.75);
  assert.equal(make([CLAW,CLAW],{lifesteal:.9}).units[0].lifesteal,1);
}
for(const type of ['physical','magic','true']) {
  const sim=make([CLAW],{}, {armor:50,mr:50}),u=sim.units[0];u.hp=500;
  const event=hit(sim,300,type),amount=type==='true'?75:55;
  assert.equal(event.actualDamage,type==='true'?300:220);assert.equal(u.hp,500+amount);
  assert.equal(sim.events.filter(e=>e.t==='heal').at(-1).amount,amount,'omni lifesteal follows actual HP damage');
}
{
  const sim=make([CLAW]),u=sim.units[0],enemy=sim.units[1];u.hp=500;enemy.shield=100;
  hit(sim,300);assert.equal(u.hp,550,'shield absorption is excluded from lifesteal');
  u.hp=500;enemy.shield=1000;hit(sim,300);assert.equal(u.hp,500);
  u.hp=990;enemy.shield=0;hit(sim,300);assert.equal(u.hp,1000,'lifesteal cannot exceed max HP');
  u.hp=500;enemy.hp=10;hit(sim,100000);assert.equal(u.hp,503,'overkill damage is excluded');
}
{
  const sim=make([CLAW,CLAW]),[u,enemy]=sim.units;u.hp=600;u.cfg.damageReduction=0;enemy.cfg.damageReduction=0;
  queue(sim,enemy,u,150);queue(sim,u,enemy,100);resolve(sim);
  assert.equal(u.hp,500,'lifesteal samples current missing HP when queued damage resolves');
  u.hp=40;queue(sim,enemy,u,100);queue(sim,u,enemy,100);resolve(sim);
  assert.equal(u.alive,false);assert.equal(u.hp,0,'lifesteal cannot revive a carrier killed this tick');
}
for(const [hp,damage] of [[501,150],[500,150],[499,165]]) {
  const sim=make([SWORD],{}, {hp:1000});sim.units[1].hp=hp;assert.equal(hit(sim,100,'physical').dmg,damage);
}
{
  const sim=make([SWORD],{}, {hp:1000,damageReduction:0});sim.units[1].hp=600;
  queue(sim,...sim.units,100,'physical');queue(sim,...sim.units,100,'physical');resolve(sim);
  assert.deepEqual(sim.events.filter(e=>e.t==='hit').map(e=>e.dmg),[150,165],'later same-tick hits observe crossing below 50%');
  for(const type of ['magic','true']) {const s=make([SWORD]);s.units[1].hp=499;assert.equal(hit(s,100,type).dmg,110);}
  const pair=make([SWORD,SWORD]);pair.units[1].hp=499;assert.equal(hit(pair,100,'physical').dmg,240);
  const additive=make([SWORD],{damageAmp:.5});additive.units[1].hp=499;assert.equal(hit(additive,100,'physical').dmg,240);
  const crit=make([SWORD,'jeweled_gauntlet'],{critChance:1,damageAmp:.17},{armor:75});crit.units[1].hp=499;
  assert.equal(hit(crit,101,'physical',false).dmg,Math.round(101*1.5*1.5*1.27*100/175),'conditional amp composes before one final rounding');
}
for(const [type,damage] of [['physical',160],['magic',85],['true',160]]) {
  const sim=make([],{}, {damageReduction:0},[VEIL]);queue(sim,...sim.units,160,type);resolve(sim);
  assert.equal(sim.events.filter(e=>e.t==='hit').at(-1).dmg,damage,'veil only adds reduction against magic');
}
{
  const sim=make([],{}, {damageReduction:0},[VEIL,VEIL]);queue(sim,...sim.units,160,'magic');resolve(sim);
  assert.equal(sim.events.at(-1).dmg,51,'duplicate veil adds 30% magic reduction and 120 MR');
  const both=make([],{}, {armor:50,damageReduction:0},[PLATE,VEIL]);queue(both,...both.units,220,'magic');resolve(both);
  assert.equal(both.events.at(-1).dmg,110,'general and magic-only reduction add');
  const immune=make([],{}, {damageReduction:.9},[VEIL]);queue(immune,...immune.units,160,'magic');resolve(immune);
  assert.equal(immune.events.at(-1).dmg,0,'combined reduction capped at 100%');
}
for(const [items,hp] of [[[FOREST],1440],[[FOREST,FOREST],2380],[[FOREST,FOREST,FOREST],3520],[[FOREST,'totem_of_undying'],1680]]) {
  assert.equal(stats(items,{hp:700}).hp,hp,'flat HP sums before additive %HP');
}
assert.equal(cfg.equipmentStats(cfg.scaleUnit({...base,hp:700},2),[FOREST]).hp,2112,'flat equipment HP is not star-scaled');
{
  const sim=make([FOREST]),u=sim.units[0];assert.equal(u.cfg.hp,1800);assert.equal(u.hp,1800);
  u.hp=900;sim.step();assert.equal(triggers(sim,FOREST).length,0,'exactly 50% does not trigger');
  hit(sim,1,'true',true);assert.equal(u.hp,899);assert.equal(triggers(sim,FOREST).length,1);
  assert.equal(sim.events.filter(e=>e.t==='heal').length,0,'no instant healing');
  u.stunnedUntilTick=200;advance(sim,19);assert.equal(u.hp,899);
  sim.step();assert.equal(u.hp,926,'first 1.5% pulse one second after activation');
  u.hp=1000;advance(sim,20);assert.equal(u.hp,1027,'regeneration persists above 50% and while stunned');
  u.hp=1799;advance(sim,20);assert.equal(u.hp,1800);
  advance(sim,20);u.hp=1700;advance(sim,20);assert.equal(u.hp,1727,'overhealing is not banked');
  assert.equal(triggers(sim,FOREST).length,1);
  const count=sim.events.filter(e=>e.t==='heal').length;hit(sim,10000,'true',true);assert.equal(u.alive,false);
  assert.equal(u.equipmentSustain.size,0);advance(sim,40);assert.equal(sim.events.filter(e=>e.t==='heal').length,count);
  const next=make([FOREST]).units[0];assert.equal(next.equipmentSustain.size,0,'next battle resets passive activation');
}
{
  const sim=make([FOREST,FOREST]),u=sim.units[0];u.hp=1399;sim.step();
  assert.equal(u.cfg.hp,2800);assert.equal(triggers(sim,FOREST).length,2);advance(sim,20);assert.equal(u.hp,1483);
  advance(sim,20);assert.equal(u.hp,1567,'each copy continues healing independently');
  const fractions=make([FOREST],{hp:700});fractions.units[0].hp=100;fractions.step();advance(fractions,100);
  assert.equal(fractions.units[0].hp,208,'fractional HP pulses preserve cumulative 1.5% total');
}
{
  const sim=make([FOREST,'totem_of_undying'],{hp:700}),u=sim.units[0];hit(sim,99999,'true',true);
  assert.equal(u.hp,1);assert.equal(u.shield,168);assert.equal(triggers(sim,FOREST).length,1);
  advance(sim,100);assert.equal(u.hp,295,'forest healing and totem five-second healing coexist');
  const report=new CombatStatistics();report.begin(sim.units);report.consume(sim.events);
  assert.equal(report.snapshot().find(row=>row.id===1).healing,294);
}
const replay=()=>{const sim=make([ARCANE,CLAW,FOREST]);sim.units[0].hp=100;return sim.run();};
assert.deepEqual(replay(),replay(),'new effects retain seeded deterministic replay');
const originals={
  [ARCANE]:'星辉蓝晶魔杖.png',[CLAW]:'猩红血魔利爪徽章.png',[PLATE]:'暗黑尖刺骑士胸甲.png',
  [SWORD]:'神圣星辉华丽长剑.png',[VEIL]:'星辉蓝金法师斗篷.png',[FOREST]:'翡翠藤甲：森林守护者铠甲.png',
};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const [id,file] of Object.entries(originals)) {
  const item=equipment.find(item=>item.id===id),asset=path.join(__dirname,'../assets/resources',item.icon.replace('/spriteFrame','.png'));
  const original=path.join(__dirname,'../art-source/equipment',file);
  const meta=JSON.parse(fs.readFileSync(asset+'.meta','utf8'));
  assert.ok(fs.existsSync(original),'supplied source artwork remains available');
  assert.ok(meta.subMetas.f9941);
  if([PLATE,SWORD,VEIL,FOREST].includes(id)) {
    const png=fs.readFileSync(asset),frame=meta.subMetas.f9941.userData;
    assert.equal(png.readUInt8(25),6,'cutout PNG retains RGBA transparency');
    assert.equal(meta.userData.hasAlpha,true,'Cocos imports the cutout alpha channel');
    assert.equal(frame.rawWidth,png.readUInt32BE(16));
    assert.equal(frame.rawHeight,png.readUInt32BE(20));
  } else assert.equal(digest(asset),digest(original),'unchanged icons preserve supplied artwork');
}
console.log('PASS advanced equipment: final stats, passive stacks/caps, strict thresholds, live execute, omni lifesteal, magic-only reduction, max HP, persistent per-second healing, stun/death/reset, totem synergy, statistics, deterministic replay and all six icons');
