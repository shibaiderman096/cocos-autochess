import { Node, Sprite, UITransform, UIOpacity } from 'cc';
import { loadArtSprite } from './ArtSpriteLoader';

/** Native-alpha artwork retains its full canvas and pivot, including transparent glow. */
export function astralSprite(parent: Node, name: string, path: string, width: number, height: number,
  alive: () => boolean): Sprite {
  const node = new Node(name); parent.addChild(node); node.layer = parent.layer;
  node.addComponent(UITransform).setContentSize(width, height);
  node.addComponent(UIOpacity);
  const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
  loadArtSprite(path, (error, frame) => {
    if (!error && frame && alive() && node.isValid && node.parent?.isValid) sprite.spriteFrame = frame;
  });
  return sprite;
}
