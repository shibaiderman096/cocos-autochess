import { _decorator, Component, Sprite, Node, Graphics, Color, VideoClip, VideoPlayer,
  UITransform, resources, sys, native, Canvas, Camera, isValid, game, Game } from 'cc';
import { setUISkin } from '../ui/UISkin';

const { ccclass } = _decorator;
const VIDEO = 'video/bg_clouds';
const BRIDGE = 'com/cocos/game/SkyVideoBackground';
const EVENT = 'sky-video-state';
let nextId = 0;

/** Video stays underneath the game surface; a matching poster survives decode failures. */
@ccclass('SkyBackgroundAnimation')
export class SkyBackgroundAnimation extends Component {
  private readonly token = String(++nextId);
  private clip: VideoClip | null = null;
  private player: VideoPlayer | null = null;
  private shade: Node | null = null;
  private camera: Camera | null = null;
  private clearColor: Color | null = null;
  private clearFlags = 0;
  private disposed = false;
  private hidden = false;
  private ready = false;
  private android = sys.isNative && sys.os === sys.OS.ANDROID;

  start(): void {
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);
    if (this.android) native.jsbBridgeWrapper.addNativeEventListener(EVENT, this.onNativeState);
    if (sys.isNative && !this.android) return;
    resources.load(VIDEO, VideoClip, (error, clip) => {
      if (this.disposed || !isValid(this, true)) return;
      if (error) { this.onError(); return; }
      clip.addRef(); this.clip = clip;
      let ancestor: Node | null = this.node;
      while (ancestor && !ancestor.getComponent(Canvas)) ancestor = ancestor.parent;
      this.camera = ancestor?.getComponent(Canvas)?.cameraComponent ?? null;
      if (this.camera) {
        this.clearColor = this.camera.clearColor.clone(); this.clearFlags = this.camera.clearFlags;
        this.camera.clearColor = new Color(0, 0, 0, 0); this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
      }
      if (this.android) {
        this.callAndroid('show', '(Ljava/lang/String;Ljava/lang/String;)V', clip.nativeUrl, this.token);
        this.syncPlayback();
      } else {
        const node = new Node('skyVideo'); node.layer = this.node.layer; this.node.addChild(node);
        node.addComponent(UITransform).setContentSize(this.node.getComponent(UITransform)!.contentSize);
        const player = this.player = node.addComponent(VideoPlayer);
        player.playOnAwake = false; player.resourceType = VideoPlayer.ResourceType.LOCAL;
        player.mute = true; player.volume = 0; player.loop = true;
        player.keepAspectRatio = false; player.stayOnBottom = true;
        node.on(VideoPlayer.EventType.READY_TO_PLAY, this.syncPlayback, this);
        node.on(VideoPlayer.EventType.PLAYING, this.onPlaying, this);
        node.on(VideoPlayer.EventType.ERROR, this.onError, this);
        player.clip = clip;
        if (player.nativeVideo) player.nativeVideo.style.pointerEvents = 'none';
        this.syncPlayback();
      }
    });
  }

  private callAndroid(method: string, signature: string, ...args: (string | boolean)[]): void {
    try { native.reflection.callStaticMethod(BRIDGE, method, signature, ...args); }
    catch (error) { console.warn('[SkyBackgroundAnimation] Android video unavailable', error); this.onError(); }
  }

  private onNativeState = (message: string): void => {
    if (this.disposed || !isValid(this, true)) return;
    if (message === `${this.token}:ready`) this.onPlaying();
    else if (message === `${this.token}:error`) this.onError();
  };

  private onPlaying(): void {
    if (this.disposed || !this.enabledInHierarchy || this.hidden) { this.syncPlayback(); return; }
    this.getComponent(Sprite)!.enabled = false;
    if (!this.shade) {
      this.shade = new Node('skyVideoTint'); this.shade.layer = this.node.layer; this.node.addChild(this.shade);
      const g = this.shade.addComponent(Graphics);
      g.fillColor = new Color(5, 15, 25, 115); g.rect(-2000, -1200, 4000, 2400); g.fill();
    }
    this.shade.active = true;
    if (!this.ready) console.info('SKY_BACKGROUND_READY ' + JSON.stringify({video: VIDEO, fps: 24, duration: 60, backend: this.android ? 'android-texture' : 'web-video'}));
    this.ready = true;
  }

  private onError(): void {
    this.getComponent(Sprite)!.enabled = true;
    if (this.shade) this.shade.active = false;
    console.warn('[SkyBackgroundAnimation] video unavailable; retaining matching poster');
  }

  private syncPlayback(): void {
    const active = !this.disposed && this.enabledInHierarchy && !this.hidden;
    if (this.android && this.clip) this.callAndroid('setPlaying', '(Ljava/lang/String;Z)V', this.token, active);
    if (this.player) { if (active) this.player.play(); else this.player.pause(); }
  }

  private onHide(): void { this.hidden = true; this.syncPlayback(); }
  private onShow(): void { this.hidden = false; this.syncPlayback(); }
  onDisable(): void { this.syncPlayback(); }
  onEnable(): void { this.syncPlayback(); }
  onDestroy(): void {
    this.disposed = true;
    game.off(Game.EVENT_HIDE, this.onHide, this); game.off(Game.EVENT_SHOW, this.onShow, this);
    if (this.android) {
      native.jsbBridgeWrapper.removeNativeEventListener(EVENT, this.onNativeState);
      if (this.clip) this.callAndroid('hide', '(Ljava/lang/String;)V', this.token);
    }
    if (this.player && isValid(this.player, true)) { this.player.stop(); this.player.clip = null; }
    if (this.camera && isValid(this.camera, true) && this.clearColor) {
      this.camera.clearColor = this.clearColor; this.camera.clearFlags = this.clearFlags;
    }
    this.clip?.decRef(); this.clip = null;
  }
}

/** Keep the matching poster until the first decoded frame is visible. */
export function setSkyBackground(node: Node, fallback: Graphics, tint: Color): void {
  const sprite = setUISkin(node, 'arena_sky', fallback, sprite => {
    sprite.color = tint;
    if (!sprite.node.getComponent(SkyBackgroundAnimation)) sprite.node.addComponent(SkyBackgroundAnimation);
  });
  // New Cocos nodes default to DEFAULT: a background skin must stay out of the 3D RT camera.
  sprite.node.layer = node.layer;
}
