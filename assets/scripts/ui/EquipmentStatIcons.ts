import { Node, UITransform, Label, Color, RichText, SpriteAtlas, SpriteFrame, resources, isValid } from 'cc';
import { setUISkin } from './UISkin';
import { equipmentStatRows, equipmentDescriptionRichText, EquipmentDisplayItem } from './EquipmentPresentation';
import { M2_UI_SPRITE, UISkinKey } from '../view/ArtPaths';
import { equipmentQualityName, equipmentNameColor } from './EquipmentPresentation';
import { panel, label, paintPanel } from './UIPrimitives';
import { Graphics } from 'cc';

export function equipmentQualityBadge(parent:Node,item:EquipmentDisplayItem,x:number,y:number,width=76,fontSize=12):Node {
  const tint=new Color(...equipmentNameColor(item));
  let root=parent.getChildByName('equipmentQualityBadge');
  if(!root){root=panel(parent,'equipmentQualityBadge',x,y,width,18,new Color(13,27,35),tint,null);label(root,'',0,0,fontSize,tint,width-4).node.getComponent(UITransform)!.setContentSize(width-4,18);}
  root.active=true;root.setPosition(x,y,0);paintPanel(root.getComponent(Graphics)!,width,18,new Color(13,27,35),tint);
  const text=root.getChildByName('text')!.getComponent(Label)!;text.string=equipmentQualityName(item);text.color=tint;
  return root;
}

/** Shared icon/value presentation for backpack, equipped items and reward cards. */
export function equipmentStatIcons(parent: Node, item: EquipmentDisplayItem, width: number, columns = 3, iconSize = 24, fontSize = 17, rowHeight = 36) {
  const root = new Node('equipmentStats'); parent.addChild(root);
  const stats = equipmentStatRows(item), height = Math.ceil(stats.length / columns) * rowHeight;
  root.addComponent(UITransform).setContentSize(width, height);
  const cellWidth = width / columns;
  const rows = stats.map((stat, index) => {
    const node = new Node('equipmentStat'); root.addChild(node);
    node.addComponent(UITransform).setContentSize(cellWidth, rowHeight);
    node.setPosition((index % columns - (columns - 1) / 2) * cellWidth, -Math.floor(index / columns) * rowHeight, 0);
    const iconRoot = new Node(stat.icon); node.addChild(iconRoot);
    iconRoot.addComponent(UITransform).setContentSize(iconSize, iconSize);
    iconRoot.setPosition(-cellWidth / 2 + iconSize / 2 + 2, 0, 0);
    setUISkin(iconRoot, stat.icon);
    const valueNode = new Node('value'); node.addChild(valueNode);
    valueNode.addComponent(UITransform).setContentSize(cellWidth - iconSize - 5, rowHeight);
    valueNode.setPosition(iconSize / 2, 0, 0);
    const value = valueNode.addComponent(Label); value.string = stat.value;
    value.fontSize = fontSize; value.lineHeight = fontSize + 3; value.color = new Color(233, 231, 210);
    value.overflow = Label.Overflow.SHRINK; value.isBold = true;
    // Retain an attribute name for inspection without repeating it visually.
    const nameNode = new Node('attributeName'); node.addChild(nameNode);
    const name = nameNode.addComponent(Label); name.string = stat.name; nameNode.active = false;
    return { node, iconRoot, name, value };
  });
  return { root, rows, height };
}

const descriptionVersions = new WeakMap<RichText, number>();

export function createEquipmentDescription(parent: Node, width: number, fontSize = 16, lineHeight = 25): RichText {
  const node = new Node('equipmentDescription'); parent.addChild(node);
  const transform = node.addComponent(UITransform); transform.setAnchorPoint(0, 1);
  const body = node.addComponent(RichText);
  body.fontSize = fontSize; body.lineHeight = lineHeight; body.maxWidth = width;
  body.fontColor = new Color(231, 236, 223); body.handleTouchEvent = false;
  body.horizontalAlign = Label.HorizontalAlign.LEFT; body.verticalAlign = Label.VerticalAlign.TOP;
  return body;
}

/** Reuse this view's atlas; version callbacks so a previous hover cannot restore stale copy. */
export function setEquipmentDescription(body: RichText, item: EquipmentDisplayItem, resized?: () => void): void {
  const version = (descriptionVersions.get(body) ?? 0) + 1; descriptionVersions.set(body, version);
  const markup = equipmentDescriptionRichText(item, body.fontSize + 1), atlas = body.imageAtlas ?? new SpriteAtlas();
  const icons = [...new Set([...markup.matchAll(/<img src='([^']+)'/g)].map(match => match[1] as UISkinKey))];
  body.imageAtlas = atlas;
  const render = () => {
    if (!isValid(body, true) || !isValid(body.node, true) || descriptionVersions.get(body) !== version) return;
    const text = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (tag, key) => atlas.spriteFrames[key] ? tag : '');
    body.string = ''; body.string = text; resized?.();
  };
  render();
  for (const key of icons) resources.load(M2_UI_SPRITE[key], SpriteFrame, (error, frame) => {
    if (error || !isValid(body, true) || !isValid(body.node, true) || descriptionVersions.get(body) !== version) return;
    atlas.spriteFrames[key] = frame; render();
  });
}
