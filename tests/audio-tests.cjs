// Exercise actual audio management at the engine boundary, including asynchronous loading.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const pending = [], played = [], persisted = [], storage = new Map(), listeners = [];
const events = () => ({
  on(type, fn, target) { listeners.push({ type, fn, target, bus: this }); },
  off(type, fn, target) { const i = listeners.findIndex(l => l.bus === this && l.type === type && l.fn === fn && l.target === target); if (i >= 0) listeners.splice(i, 1); },
  emit(type) { for (const l of [...listeners]) if (l.bus === this && l.type === type) l.fn.call(l.target); },
});
class Component { isValid = true; }
class Node {
  constructor(name) { this.name = name; this.children = []; this.components = []; this.isValid = true; }
  addChild(child) { if (child.parent) child.parent.children = child.parent.children.filter(n => n !== child); child.parent = this; this.children.push(child); }
  addComponent(T) { const c = new T(); c.node = this; this.components.push(c); c.onLoad?.(); return c; }
  destroy() { this.isValid = false; for (const c of this.components) { c.isValid = false; c.onDestroy?.(); } }
}
class AudioSource extends Component {
  playing = false;
  play() { this.playing = true; played.push({ clip: this.clip, volume: this.volume }); }
  stop() { this.playing = false; }
}
const scene = new Node('scene'), input = events(), game = events();
const cc = {
  Component, Node, AudioSource, AudioClip: class {}, input, game,
  isValid: (value, strict) => value?.isValid && !(strict && value.destroyQueued),
  Input: { EventType: { TOUCH_START: 'touch', MOUSE_DOWN: 'mouse', KEY_DOWN: 'key' } },
  Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
  director: { getScene: () => scene, addPersistRootNode: n => persisted.push(n) },
  sys: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
  resources: { load: (resource, type, cb) => pending.push({ resource, cb }) },
  _decorator: { ccclass: () => C => C },
};
function loadManager() {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/scripts/view/GameAudio.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
  }).outputText;
  const out = {}; new Function('require', 'exports', code)(id => { assert.equal(id, 'cc'); return cc; }, out); return out.GameAudio;
}
const GameAudio = loadManager();
const realNow = Date.now; let now = 1000; Date.now = () => now;
try {
  assert.equal(GameAudio.volume, .6);
  const parent = new Node('menu'); scene.addChild(parent); GameAudio.mount(parent);
  const manager = persisted[0].components[0], voices = Object.values(manager.voices).flat();
  assert.equal(persisted.length, 1); assert.equal(persisted[0].parent, scene);
  GameAudio.mount(new Node('stage')); assert.equal(persisted.length, 1, 'scene changes reuse the persistent player');
  assert.equal(voices.length, 10); assert.equal(pending.length, 65);
  GameAudio.play('buy'); input.emit('touch'); GameAudio.play('buy');
  assert.equal(played.length, 0, 'unloaded sounds are dropped without a playback backlog');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'licenses/audio/sources.json'), 'utf8'));
  assert.equal(manifest.license, 'CC0-1.0');
  assert.equal(manifest.sounds.length, pending.length);
  for (const p of pending.splice(0)) {
    assert.ok(manifest.sounds.some(s => s.file === p.resource + '.mp3'), p.resource);
    p.cb(null, { name: p.resource });
  }
  GameAudio.play('buy'); assert.equal(played.length, 1); assert.equal(played[0].volume, .7 * .6);
  GameAudio.play('buy'); assert.equal(played.length, 1, 'per-sound cooldown');
  GameAudio.play('melee'); GameAudio.play('ranged'); GameAudio.play('cast');
  assert.equal(played.length, 3, 'basic attacks and abilities have separate bounded lanes');
  now += 100; GameAudio.play('cast'); assert.equal(played.length, 3);
  GameAudio.play('victory');
  assert.ok(manager.voices.battle.every(v => !v.playing), 'settlement stops combat sounds');
  assert.equal(manager.voices.cue[0].playing, true);
  GameAudio.setVolume(0); assert.ok(voices.every(v => !v.playing), 'mute immediately stops existing audio');
  now += 1000; const beforeMute = played.length; GameAudio.play('buy'); assert.equal(played.length, beforeMute);
  assert.equal(loadManager().volume, 0, 'muted preference survives a reload');
  GameAudio.setVolume(.3); assert.equal(loadManager().volume, .3);
  GameAudio.play('buy'); game.emit('hide'); assert.ok(voices.every(v => !v.playing));
  const beforeHide = played.length; now += 1000; GameAudio.play('cast'); assert.equal(played.length, beforeHide);
  game.emit('show'); GameAudio.play('cast'); assert.equal(played.length, beforeHide + 1);
  now += 1000; GameAudio.play('click'); GameAudio.play('confirm'); GameAudio.play('buy');
  const beforeFull = played.length; GameAudio.play('equip'); assert.equal(played.length, beforeFull, 'full UI pool drops additional sounds');
  assert.equal(voices.length, 10, 'event storms never grow the source pool');
  GameAudio.setVolume(.6);
  const variants = [];
  for (let i = 0; i < 4; i++) { now += 200; GameAudio.play('melee'); variants.push(played.at(-1).clip.name); voices.forEach(v => v.stop()); }
  assert.equal(new Set(variants).size, 3, 'repeated attacks rotate through three sounds'); assert.equal(variants[0], variants[3]);
  const swords = [];
  for (let i = 0; i < 4; i++) { now += 250; GameAudio.play('sword'); swords.push(played.at(-1).clip.name); voices.forEach(v => v.stop()); }
  assert.equal(new Set(swords).size, 3, 'sword attacks rotate three distinct recordings');
  assert.equal(swords[0], swords[3]);
  now += 1000;
  const beforeStorm = played.length;
  for (const id of ['sword', 'claw', 'heavy', 'mechanical_melee', 'bite', 'chain']) GameAudio.play(id);
  assert.equal(played.length, beforeStorm + 1, 'different weapon identities still share the combat throttle');
  assert.equal(manager.voices.ui.filter(v => v.playing).length, 0, 'weapon sounds cannot occupy UI voices');
  GameAudio.setVolume(99); assert.equal(GameAudio.volume, 1); GameAudio.setVolume(NaN); assert.equal(GameAudio.volume, 1);
  GameAudio.setVolume(-1); assert.equal(GameAudio.volume, 0);
  // Children may already be queued for destruction when the persistent parent tears down.
  voices.forEach(v => { v.destroyQueued = true; v.stop = () => { throw Error('stopped destroyed source'); }; });
  persisted[0].destroy(); assert.equal(listeners.length, 0); assert.equal(manager.clips.size, 0);
  GameAudio.mount(new Node('new')); const next = persisted[1].components[0]; persisted[1].destroy();
  for (const p of pending.splice(0)) p.cb(null, { name: p.resource });
  assert.equal(next.clips.size, 0, 'late callbacks cannot revive a destroyed audio manager');
  const uuids = new Set(); let total = 0;
  for (const sound of manifest.sounds) {
    const file = path.join(root, 'assets/resources', sound.file), data = fs.readFileSync(file); total += data.length;
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), sound.sha256);
    const meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
    assert.equal(meta.importer, 'audio-clip'); assert.equal(meta.imported, true);
    assert.ok(!uuids.has(meta.uuid)); uuids.add(meta.uuid);
    assert.ok(fs.readFileSync(path.join(root, 'licenses/audio', sound.pack + '.txt'), 'utf8').includes('CC0'));
  }
  assert.ok(total < 768 * 1024, 'small SFX budget including weapon and skill identities');
  console.log(`PASS audio: ${manifest.sounds.length} licensed/imported assets (${total} bytes), gesture/load gates, bounded voices, throttling, variants, settlement priority, mute persistence, background and destruction`);
} finally { Date.now = realNow; }

// The real replay cursor emits sounds only once, independent of number visibility.
const harness = require('./helpers/ui-harness.cjs');
const { GameAudio: replayAudio } = harness.load(path.join(root, 'assets/scripts/view/GameAudio.ts'));
const { BattleReplayer } = harness.load(path.join(root, 'assets/scripts/view/BattleReplayer.ts'));
const sounds = []; replayAudio.play = id => sounds.push(id);
const replayer = new BattleReplayer();
replayer.sim = { units: [{ id: 1, cfg: { range: 1 } }, { id: 2, cfg: { range: 4 } }], events: [
  { t: 'attack', id: 1, target: 2 }, { t: 'attack', id: 2, target: 1 },
  { t: 'cast', id: 1, target: 2 }, { t: 'hit', id: 2, critical: true },
  { t: 'heal', id: 1, amount: 20 }, { t: 'heal', id: 1, amount: 0 },
] };
replayer.damageNumbers = false; replayer.healingNumbers = false;
replayer.consumeEvents(); replayer.consumeEvents();
assert.deepEqual(sounds, ['melee', 'ranged', 'cast', 'hit', 'heal']);
console.log('PASS audio replay: melee/ranged/cast/critical/heal from actual events; consumed once; unaffected by hidden numbers');

const roster = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/units.json'), 'utf8'));
const skills = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/skills.json'), 'utf8'));
const { unitAttackSound, unitCastSound } = harness.load(path.join(root, 'assets/scripts/view/UnitAudio.ts'));
for (const unit of roster) {
  assert.ok(!['melee', 'ranged'].includes(unitAttackSound(unit)), `weapon identity missing for ${unit.id}`);
  assert.notEqual(unitCastSound(unit.skillId), 'cast', `skill identity missing for ${unit.id}`);
}
for (const skill of Object.keys(skills)) assert.notEqual(unitCastSound(skill), 'cast', `unmapped skill ${skill}`);
const cases = [
  ['crimson_gunslinger', 'ranged_mechanical', 'ranged_mechanical'],
  ['xiya', 'ranged_arrow', 'ranged_arrow'],
  ['ghostflame_blade', 'sword', 'cast_fire'],
  ['gravity_executor', 'heavy', 'cast_gravity'],
  ['crimson_devourer', 'bite', 'cast_ice'],
  ['thornchain_succubus', 'chain', 'chain'],
  ['wayward_alchemist', 'ranged_magic', 'cast_corrosion'],
  ['arc_repairer', 'ranged_mechanical', 'cast_blessing'],
];
for (const [id, attack, cast] of cases) {
  const cfg = roster.find(unit => unit.id === id), replay = new BattleReplayer();
  replay.sim = { units: [{ id: 1, cfg }], events: [
    { t: 'attack', id: 1, target: 2 }, { t: 'cast', id: 1, target: 2, skillId: cfg.skillId, duration: 0 },
  ] };
  sounds.length = 0; replay.consumeEvents(); replay.consumeEvents();
  assert.deepEqual(sounds, [attack, cast], `${id}: real replay uses its weapon and skill once`);
}
assert.equal(unitAttackSound({ id: 'future', range: 4, basicAttackFx: 'arrow' }), 'ranged_arrow');
assert.equal(unitCastSound('future', 'art/units/shadow/future'), 'cast_shadow');
console.log(`PASS unit audio: ${roster.length} roster weapons, ${Object.keys(skills).length} skills, replay identities, gun/arrow distinction and future-unit fallbacks`);
