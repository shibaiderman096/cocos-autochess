/** UI-local coordinates; share the visible shop rectangle with drag hit testing. */
export const SHOP_DROP_AREA = { x: -114, y: -292, width: 952, height: 112 } as const;
export const SHOP_CARDS = { firstX: -334, spacing: 152, y: -292, scale: 142 / 164 } as const;

export function containsShopDrop(x: number, y: number): boolean {
  return Math.abs(x - SHOP_DROP_AREA.x) <= SHOP_DROP_AREA.width / 2
    && Math.abs(y - SHOP_DROP_AREA.y) <= SHOP_DROP_AREA.height / 2;
}
