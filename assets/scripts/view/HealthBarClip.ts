import { Node, UITransform, Mask, Graphics } from 'cc';

/** A shared inner boundary keeps both HP and rectangular shield textures inside the frame. */
export function createHealthBarClip(parent: Node, width: number, height: number): Node {
  const node = new Node('healthBarClip');
  node.addComponent(UITransform).setContentSize(width, height);
  parent.addChild(node);
  const mask = node.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
  const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  graphics.clear(); graphics.roundRect(-width / 2, -height / 2, width, height, height / 2); graphics.fill();
  return node;
}
