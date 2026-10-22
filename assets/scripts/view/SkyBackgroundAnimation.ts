import { _decorator, Component, Animation, AnimationClip, Sprite, SpriteFrame, Node, Graphics, Color } from 'cc';
import { SKY_BACKGROUND_SPRITE } from './ArtPaths';
import { loadArtSprite } from './ArtSpriteLoader';
import { setUISkin } from '../ui/UISkin';

const { ccclass } = _decorator;

/** One atlas, 30 painted frames, native Cocos playback; no battle clock or input listeners. */
@ccclass('SkyBackgroundAnimation')
export class SkyBackgroundAnimation extends Component {
  private animation: Animation | null = null;
  private clip: AnimationClip | null = null;
  private disposed = false;

  start(): void {
    const frames: SpriteFrame[] = new Array(30);
    let remaining = frames.length, failed = false;
    for (let index = 0; index < frames.length; index++) {
      loadArtSprite(`${SKY_BACKGROUND_SPRITE.loop}#${index},5,6`, (error, frame) => {
        if (this.disposed || !this.isValid) return;
        if (error || !frame) {
          if (!failed) console.warn('[SkyBackgroundAnimation] atlas unavailable; retaining static background', error?.message);
          failed = true; return;
        }
        frames[index] = frame;
        if (--remaining || failed) return;
        this.clip = AnimationClip.createWithSpriteFrames(frames, 15);
        this.clip.name = 'SkyIslands30';
        this.clip.wrapMode = AnimationClip.WrapMode.Loop;
        this.animation = this.node.addComponent(Animation);
        this.animation.addClip(this.clip);
        this.animation.defaultClip = this.clip;
        this.getComponent(Sprite)!.spriteFrame = frames[0];
        this.animation.play();
        if (!this.enabledInHierarchy) this.animation.pause();
        console.info('SKY_BACKGROUND_READY '+JSON.stringify({frames:30,fps:15,duration:2,atlas:SKY_BACKGROUND_SPRITE.loop}));
      });
    }
  }

  onDisable(): void { if (this.animation?.isValid) this.animation.pause(); }
  onEnable(): void { if (this.animation?.isValid) this.animation.resume(); }
  onDestroy(): void {
    this.disposed = true;
    if (this.animation?.isValid) {
      this.animation.stop();
      if (this.clip) this.animation.removeClip(this.clip, true);
    }
    this.animation = null;
    this.clip?.destroy(); this.clip = null;
  }
}

/** Keep the new matching static poster and existing tint until all 30 atlas regions are ready. */
export function setSkyBackground(node: Node, fallback: Graphics, tint: Color): void {
  const sprite = setUISkin(node, 'arena_sky', fallback, sprite => {
    sprite.color = tint;
    if (!sprite.node.getComponent(SkyBackgroundAnimation)) sprite.node.addComponent(SkyBackgroundAnimation);
  });
  // New Cocos nodes default to DEFAULT: a background skin must stay out of the 3D RT camera.
  sprite.node.layer = node.layer;
}
