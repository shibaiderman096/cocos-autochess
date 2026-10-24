const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function harness(android = false) {
  const pending = [], calls = [], events = new Map(), nativeEvents = new Map();
  class Component { isValid = true; enabledInHierarchy = true; getComponent(T) { return this.node.getComponent(T); } }
  class Color { constructor(...values) { this.values = values; } clone() { return new Color(...this.values); } }
  class UITransform { contentSize = { width: 1280, height: 720 }; setContentSize(size) { this.contentSize = size; } }
  class Sprite { enabled = true; }
  class Graphics { rect() {} fill() {} }
  class Canvas { cameraComponent = { isValid: true, clearColor: new Color(1, 2, 3, 255), clearFlags: 7 }; }
  class Node {
    constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.events = new Map(); this.layer = 1 << 25; }
    addChild(child) { this.children.push(child); child.parent = this; }
    addComponent(T) { const c = new T(); c.node = this; this.components.set(T, c); return c; }
    getComponent(T) { return this.components.get(T); }
    on(type, fn, target) { this.events.set(type, () => fn.call(target)); }
    emit(type) { this.events.get(type)?.(); }
  }
  class VideoPlayer { static ResourceType = { LOCAL: 0 }; static EventType = { READY_TO_PLAY: 'ready', PLAYING: 'playing', ERROR: 'error' };
    nativeVideo = { style: {} }; plays = 0; pauses = 0; isValid = true;
    play() { this.plays++; } pause() { this.pauses++; } stop() { this.stopped = true; }
  }
  const game = { on(type, fn, target) { events.set(type, () => fn.call(target)); }, off(type) { events.delete(type); } };
  const cc = { Component, Color, UITransform, Sprite, Graphics, Canvas, Node, VideoPlayer, VideoClip: class {},
    Camera: { ClearFlag: { SOLID_COLOR: 7 } }, isValid: v => v?.isValid, game, Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
    sys: { isNative: android, os: android ? 'android' : 'web', OS: { ANDROID: 'android' } },
    native: { reflection: { callStaticMethod(...args) { calls.push(args); } }, jsbBridgeWrapper: {
      addNativeEventListener(k, fn) { nativeEvents.set(k, fn); }, removeNativeEventListener(k) { nativeEvents.delete(k); } } },
    resources: { load(resource, type, callback) { assert.equal(resource, 'video/bg_clouds'); pending.push(callback); } },
    _decorator: { ccclass: () => T => T } };
  const exports = {}, source = fs.readFileSync(path.join(root, 'assets/scripts/view/SkyBackgroundAnimation.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText;
  const skin = { node: new Node('skin') };
  new Function('require', 'exports', code)(id => id === 'cc' ? cc : { setUISkin: () => skin }, exports);
  exports.setSkyBackground({ layer: 1 << 25 }, {}, {}); assert.equal(skin.node.layer, 1 << 25);
  const canvas = new Node('Canvas'); const camera = canvas.addComponent(Canvas).cameraComponent;
  const node = new Node('background'); canvas.addChild(node); node.addComponent(UITransform);
  const sprite = node.addComponent(Sprite), manager = node.addComponent(exports.SkyBackgroundAnimation);
  function finish() { const clip = { nativeUrl: '@assets/assets/resources/native/clouds.mp4', refs: 0, addRef() { this.refs++; }, decRef() { this.refs--; } }; pending.shift()(null, clip); return clip; }
  return { manager, node, sprite, camera, pending, finish, events, calls, nativeEvents, VideoPlayer };
}
for (let i = 0; i < 10; i++) {
  const h = harness(); h.manager.start(); const oldColor = h.camera.clearColor, clip = h.finish();
  const videoNode = h.node.children[0], player = videoNode.getComponent(h.VideoPlayer);
  assert.equal(player.loop, true); assert.equal(player.mute, true); assert.equal(player.volume, 0); assert.equal(player.stayOnBottom, true);
  assert.equal(player.nativeVideo.style.pointerEvents, 'none'); assert.equal(h.sprite.enabled, true, 'poster stays visible until a decoded frame');
  videoNode.emit('playing'); assert.equal(h.sprite.enabled, false); assert.equal(clip.refs, 1);
  h.events.get('hide')(); assert.ok(player.pauses); const plays = player.plays;
  h.events.get('show')(); assert.ok(player.plays > plays);
  h.manager.enabledInHierarchy = false; h.manager.onDisable(); const paused = player.pauses;
  videoNode.emit('ready'); assert.ok(player.pauses > paused, 'late readiness cannot start a disabled background');
  h.manager.enabledInHierarchy = true; h.manager.onEnable();
  h.manager.onDestroy(); assert.equal(player.stopped, true); assert.equal(player.clip, null); assert.equal(clip.refs, 0);
  assert.equal(h.events.size, 0); assert.deepEqual(h.camera.clearColor, oldColor);
}
const late = harness(); late.manager.start(); late.manager.onDestroy(); const lateClip = late.finish(); assert.equal(lateClip.refs, 0); assert.equal(late.node.children.length, 0);
const android = harness(true); android.manager.start(); const clip = android.finish();
assert.equal(android.node.children.length, 0, 'Android uses an underlay instead of the stock overlaid VideoPlayer');
const show = android.calls.find(c => c[1] === 'show'), token = show[4], listener = android.nativeEvents.get('sky-video-state');
listener('old-scene:ready'); assert.equal(android.sprite.enabled, true);
listener(`${token}:ready`); assert.equal(android.sprite.enabled, false);
android.events.get('hide')(); assert.deepEqual(android.calls.at(-1).slice(1), ['setPlaying', '(Ljava/lang/String;Z)V', token, false]);
const warn = console.warn; console.warn = () => {}; try { listener(`${token}:error`); } finally { console.warn = warn; }
assert.equal(android.sprite.enabled, true); android.manager.onDestroy(); assert.equal(clip.refs, 0); assert.equal(android.nativeEvents.size, 0);
assert.deepEqual(android.calls.at(-1).slice(1), ['hide', '(Ljava/lang/String;)V', token]);
const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/video/bg_clouds.mp4.meta')));
assert.equal(meta.importer, 'video-clip');
assert.ok(fs.statSync(path.join(root, 'assets/resources/video/bg_clouds.mp4')).size < 3_000_000);
assert.ok(fs.existsSync(path.join(root, 'assets/resources/art/arena/bg_clouds_poster.png.meta')));
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'settings/v2/packages/engine.json'))).macroConfig.ENABLE_TRANSPARENT_CANVAS, true);
console.log('PASS sky video: muted loop under UI, poster until decoded frame, web/native routing, scene tokens, hide/show, teardown, late callbacks, imported MP4 and transparent canvas');
