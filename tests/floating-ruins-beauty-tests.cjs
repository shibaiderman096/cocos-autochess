require('tsx/cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { BoardProjectionAdapter } = require('../assets/scripts/view/BoardProjectionAdapter.ts');
const cfg = require('../assets/resources/config/battle.json');
const adapter = new BoardProjectionAdapter(cfg.boardWidth, cfg.boardHeight, 48);
function readModel(variant) {
  const bytes = fs.readFileSync(require('./board-model-path.cjs')(variant));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const len = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + len));
  const bin = bytes.subarray(28 + len);
  function vertices(node) {
    const positions = gltf.meshes[node.mesh].primitives.flatMap(p => {
      const a = gltf.accessors[p.attributes.POSITION], v = gltf.bufferViews[a.bufferView];
      assert.equal(a.componentType, 5126); assert.equal(a.type, 'VEC3');
      const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? 12;
      return Array.from({ length: a.count }, (_, i) => [0, 1, 2].map(k => bin.readFloatLE(start + i * stride + k * 4)));
    });
    return [...new Map(positions.map(p => [JSON.stringify(p), p])).values()].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return {gltf, vertices, bytes: bytes.length};
}
const old = readModel('floating-ruins-p0'), art = readModel('floating-ruins-beauty-v1');
assert.equal(art.gltf.nodes.filter(n => /^SM_Hex_R\d{2}_C\d{2}$/.test(n.name)).length, 56);
assert.equal(art.gltf.animations?.length ?? 0, 0); assert.equal(art.gltf.skins?.length ?? 0, 0);
assert.ok(art.gltf.meshes.every(m => m.primitives.every(p => !p.targets)), 'static asset has no morph animation');
assert.equal(art.gltf.images.length, 2);
assert.ok(art.gltf.images.every(i => i.bufferView !== undefined && i.mimeType === 'image/png'), 'real albedo images embedded in GLB');
let samples = 0, maxError = 0;
for (const cell of adapter.manifest().cells) {
  const original = old.gltf.nodes.find(n => n.name === cell.name), next = art.gltf.nodes.find(n => n.name === cell.name);
  assert.ok(original && next, cell.name);
  for (const key of ['translation','rotation','scale','matrix']) assert.deepEqual(next[key], original[key], `${cell.name} transform`);
  assert.deepEqual(art.vertices(next), old.vertices(original), `${cell.name} exact vertex positions`);
  const [x,y,z] = next.translation ?? [0,0,0];
  const center = adapter.toBoard({x,y,z});
  maxError = Math.max(maxError, Math.hypot(center.x-cell.center.x, center.y-cell.center.y)); samples++;
  const world = art.vertices(next).map(v => ({x:v[0]+x, y:v[1]+y, z:v[2]+z}));
  for (let i=0; i<6; i++) {
    const q = cell.groundPolygon[i];
    const closest = world.reduce((a,b) => Math.hypot(a.x-q.x,a.y-q.y,a.z-q.z) < Math.hypot(b.x-q.x,b.y-q.y,b.z-q.z) ? a : b);
    const actual = adapter.toBoard(closest), expected = cell.polygon[i];
    maxError = Math.max(maxError, Math.hypot(actual.x-expected.x, actual.y-expected.y)); samples++;
    const inside = {x:expected.x*.999+center.x*.001,y:expected.y*.999+center.y*.001};
    const hit = adapter.geometry.cellAt(inside.x, inside.y);
    assert.equal(hit.x, cell.x); assert.equal(hit.y, cell.y);
  }
  assert.deepEqual(adapter.geometry.cellAt(center.x,center.y)?.center,cell.center);
}
assert.equal(samples, 392); assert.ok(maxError < .001);
const result = {pass:true,cells:56,samples,maxProjectionErrorPixels:maxError,originalTileVerticesUnchanged:true,
  meshes:art.gltf.meshes.length,materials:art.gltf.materials.length,bytes:art.bytes,
  primitives:art.gltf.meshes.reduce((n,m)=>n+m.primitives.length,0)};
if (process.env.FLOATING_RUINS_BEAUTY_REPORT) fs.writeFileSync(process.env.FLOATING_RUINS_BEAUTY_REPORT,JSON.stringify(result,null,2));
console.log('PASS floating ruins beauty: '+JSON.stringify(result));
