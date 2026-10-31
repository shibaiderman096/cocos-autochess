const assert=require('node:assert/strict'),fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..');require('tsx/cjs');
const {BASIC_ATTACK_LOOKS,basicAttackLook}=require(root+'/assets/scripts/view/BasicAttackArt.ts');
const {UNIT_ART,FX_SPRITE}=require(root+'/assets/scripts/view/ArtPaths.ts');
const units=require(root+'/assets/resources/config/units.json');
const existing=u=>u.id==='blueflame_soul_knight'||u.id==='azure_oath_knight'||u.id==='cloud_dragon_priestess'||u.skillId==='moon_triple_arrow'||UNIT_ART[u.artId??u.id]?.includes('/units/sunlight/')||u.range<=1&&UNIT_ART[u.artId??u.id]?.includes('/units/shadow/')||!!u.basicAttackFx;
const missingBefore=units.filter(u=>!existing(u));
assert.ok(missingBefore.length>0);
assert.deepEqual(Object.keys(BASIC_ATTACK_LOOKS).sort(),missingBefore.map(u=>u.id).sort());
for(const u of units)assert.ok(existing(u)||basicAttackLook(u.id),`No basic attack art for ${u.name}/${u.id}`);
for(const [id,look] of Object.entries(BASIC_ATTACK_LOOKS)){
 assert.ok(units.some(u=>u.id===id));assert.ok(look.row>=0&&look.row<(look.atlas==='basicBlood'?4:6));
 assert.ok(look.width>0&&look.height>0&&look.seconds>0);
 const path=root+'/assets/resources/'+FX_SPRITE[look.atlas].replace('/spriteFrame','.png');assert.ok(fs.existsSync(path),id);
}
assert.equal(basicAttackLook('__proto__'),undefined);assert.equal(basicAttackLook('toString'),undefined);assert.equal(basicAttackLook('not_a_unit'),undefined);
assert.equal(basicAttackLook('thornchain_succubus').motion,'lash');
for(const id of ['atlas','arc_repairer','rail_hunter_07','bloodline_earl'])assert.equal(basicAttackLook(id).motion,'projectile');
console.log(`PASS: ${units.length}/${units.length} roster basic-attack coverage; ${missingBefore.length} units each have a dedicated painted row; resource paths and projectile/chain motions checked`);
