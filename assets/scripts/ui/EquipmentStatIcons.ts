import { Node, UITransform, Label, Color } from 'cc';
import { setUISkin } from './UISkin';
import { equipmentStatRows, EquipmentDisplayItem } from './EquipmentPresentation';

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
