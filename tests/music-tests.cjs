const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const listeners = [], pending = [], storage = new Map(), clips = [], sources = [];
const bus = () => ({
  on(type, fn, target) { listeners.push({ bus: this, type, fn, target }); },
  off(type, fn, target) { const i = listeners.findIndex(l => l.bus === this && l.type === type && l.fn === fn && l.target === target); if (i >= 0) listeners.splice(i, 1); },
  emit(type) { for (const l of [...listeners]) if (l.bus === this && l.type === type) l.fn.call(l.target); },
});
class Component { isValid = true; }
class Node {
  constructor(name) { this.name = name; this.children = []; this.components = []; }
  addChild(n) { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); this.children.push(n); n.parent = this; }
  addComponent(T) { const c = new T(); c.node = this; this.components.push(c); c.onLoad?.(); return c; }
  destroy() { for (const c of this.components) { c.isValid = false; c.onDestroy?.(); } }
}
class AudioSource extends Component {
  constructor() { super(); this.playing = false; this.playCount = 0; this.currentTime = 0; sources.push(this); }
  play() { this.playing = true; this.playCount++; }
  pause() { this.playing = false; }
  stop() { this.playing = false; this.currentTime = 0; }
}
function clip(name) { const c = { name, refs: 0, addRef() { this.refs++; return this; }, decRef() { this.refs--; assert.ok(this.refs >= 0); } }; clips.push(c); return c; }
const input = bus(), game = bus(), scene = new Node('scene');
const cc = { Component, Node, AudioSource, AudioClip: class {}, input, game,
  isValid: (v, strict) => v?.isValid && !(strict && v.destroyQueued),
  Input: { EventType: { TOUCH_START: 'touch', MOUSE_DOWN: 'mouse', KEY_DOWN: 'key' } },
  Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
  director: { getScene: () => scene, addPersistRootNode() {} },
  sys: { localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } },
  resources: { load: (resource, type, cb) => pending.push({ resource, cb }) },
  _decorator: { ccclass: () => C => C },
};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/scripts/view/GameAudio.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
}).outputText;
function load() { const out = {}; new Function('require', 'exports', code)(() => cc, out); return out.GameAudio; }
const Audio = load(); Audio.mount(scene);
const manager = scene.children.find(n => n.name === 'GameAudio').components[0];
const musicSources = sources.filter(s => s.node.name.startsWith('music_'));
const finish = id => {
  const index = pending.findIndex(p => p.resource === `audio/music/${id}`); assert.ok(index >= 0, `requested ${id}`);
  const p = pending.splice(index, 1)[0], asset = clip(id); p.cb(null, asset); return asset;
};
const requested = () => pending.filter(p => p.resource.startsWith('audio/music/')).map(p => p.resource);
assert.equal(Audio.musicVolume, .3); assert.equal(musicSources.length, 2);
Audio.setMusic('menu'); assert.deepEqual(requested(), [], 'music waits for a real gesture');
input.emit('touch'); input.emit('key'); assert.equal(requested().length, 1, 'repeated input deduplicates in-flight requests');
const menu = finish('menu'); manager.update(.65);
const playing = musicSources.find(s => s.playing); assert.ok(playing.loop); assert.equal(playing.clip, menu);
assert.equal(playing.volume, .85 * .3); assert.equal(menu.refs, 1);
playing.currentTime = 27; const menuPlays = playing.playCount;
Audio.setMusic('menu'); manager.update(.1); assert.equal(playing.playCount, menuPlays, 'UI refresh does not restart music');
assert.equal(playing.currentTime, 27);
const sfxVolume = Audio.volume; Audio.setMusicVolume(0);
assert.equal(Audio.volume, sfxVolume); assert.ok(musicSources.every(s => !s.playing));
assert.equal(load().musicVolume, 0, 'music mute survives refresh');
Audio.setMusicVolume(.6); assert.equal(playing.currentTime, 27); assert.ok(playing.playing);
Audio.setVolume(0); assert.ok(playing.playing, 'SFX mute does not stop the score');
game.emit('hide'); assert.ok(musicSources.every(s => !s.playing)); const frozen = playing.currentTime;
manager.update(20); assert.equal(playing.currentTime, frozen); game.emit('show'); assert.ok(playing.playing);
assert.equal(playing.currentTime, frozen, 'background resume preserves position');

// Deliberately complete requests out of order during rapid menu -> battle -> preparation changes.
Audio.setMusic('battle'); Audio.setMusic('prepare'); const battle = finish('battle');
assert.equal(battle.refs, 0, 'stale load is released'); assert.equal(playing.clip, menu);
const prepare = finish('prepare'); manager.update(.325);
const prepVoice = musicSources.find(s => s.clip === prepare);
assert.ok(playing.volume > 0 && prepVoice.volume > 0, 'both tracks overlap only during crossfade');
manager.update(.325); assert.equal(playing.clip, null); assert.equal(menu.refs, 0);
assert.equal(prepVoice.volume, .8 * .6); assert.equal(prepare.refs, 1);
assert.equal(manager.musicClips.size, 1, 'finished fades release unused decoded music');

// A muted volume change to a different scene must not start a pending track.
Audio.setMusic('boss'); Audio.setMusicVolume(0); const boss = finish('boss');
assert.ok(musicSources.every(s => !s.playing)); Audio.setMusicVolume(.3); manager.update(.65);
const bossVoice = musicSources.find(s => s.clip === boss); assert.ok(bossVoice.playing);
assert.equal(prepare.refs, 0); assert.equal(bossVoice.volume, .75 * .3);
// Cue ducking restores music without a restart, independently from the SFX preference.
const victory = pending.find(p => p.resource === 'audio/sfx/victory'); victory.cb(null, clip('victory'));
Audio.setVolume(.6); Audio.play('victory'); manager.update(.1);
assert.equal(bossVoice.volume, .75 * .3 * .35); const bossPlays = bossVoice.playCount;
manager.update(2); assert.equal(bossVoice.volume, .75 * .3); assert.equal(bossVoice.playCount, bossPlays);
// Reversing a fade to a resident track must reuse its current position.
Audio.setMusic('prepare'); finish('prepare'); manager.update(.2); const oldBossTime = bossVoice.currentTime = 42;
Audio.setMusic('boss'); manager.update(.65); assert.equal(bossVoice.currentTime, oldBossTime);
assert.equal(bossVoice.playCount, bossPlays); assert.equal(manager.musicClips.size, 1);

Audio.setMusic('battle'); manager.node.destroy(); const late = finish('battle');
assert.equal(late.refs, 0); assert.equal(boss.refs, 0); assert.equal(manager.musicClips.size, 0);
assert.equal(listeners.length, 0); assert.ok(musicSources.every(s => !s.playing));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'licenses/audio/music-sources.json'), 'utf8'));
assert.equal(manifest.tracks.length, 4); assert.equal(manifest.license, 'CC0-1.0');
for (const track of manifest.tracks) {
  const file = path.join(root, 'assets/resources', track.file), data = fs.readFileSync(file);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), track.sha256);
  assert.equal(JSON.parse(fs.readFileSync(file + '.meta', 'utf8')).importer, 'audio-clip');
  assert.ok(track.author && track.source.startsWith('https://opengameart.org/'));
  assert.ok(track.durationSeconds > 30 && track.durationSeconds < 240);
}
console.log('PASS music: 4 licensed tracks, gesture gate, lazy loading, loop, independent volume persistence, background resume, crossfade, stale callbacks, ducking, rapid scene reversal and released clips');

// Verify that every visible audio setting remains separately usable in the actual UI.
const harness = require('./helpers/ui-harness.cjs');
const { GameAudio: UIAudio } = harness.load(path.join(root, 'assets/scripts/view/GameAudio.ts'));
const { BattleUI } = harness.load(path.join(root, 'assets/scripts/ui/BattleUI.ts'));
const ui = new BattleUI(); ui.node = new harness.Node('BattleUI'); ui.buildMainMenu(); ui.buildDebugMenu();
ui.refreshSettingsLabels(); const musicRow = ui.mainMenuContent.getChildByName('settingMusicVolume');
assert.ok(musicRow); const before = UIAudio.volume;
const musicBefore = UIAudio.musicVolume;
musicRow.getChildByName('volumeIncrease').events.get(harness.Node.EventType.TOUCH_END)();
assert.equal(UIAudio.musicVolume, Math.min(1, Math.round((musicBefore + .05) * 100) / 100)); assert.equal(UIAudio.volume, before);
const rows = ['settingSpeed', 'settingDamageNumbers', 'settingHealingNumbers', 'settingUIMode', 'settingSoundVolume', 'settingMusicVolume', 'debugToggle', 'returnHome'].map(n => ui.mainMenuContent.getChildByName(n));
for (let i = 1; i < rows.length; i++) {
  const upper = rows[i - 1], lower = rows[i];
  assert.ok(upper.position.y - upper.getComponent(harness.UITransform).contentSize.height / 2 > lower.position.y + lower.getComponent(harness.UITransform).contentSize.height / 2, 'setting touch areas do not overlap');
}
console.log('PASS audio settings: real music control, independent SFX volume and non-overlapping touch areas');
