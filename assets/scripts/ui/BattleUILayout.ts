/** UI-local coordinates; share the visible shop rectangle with drag hit testing. */
export const SHOP_DROP_AREA = { x: -108, y: -281, width: 964, height: 150 } as const;
export const SHOP_CARDS = { firstX: -335, spacing: 158, y: -294, scale: 150 / 164 } as const;

export function containsShopDrop(x: number, y: number): boolean {
  return Math.abs(x - SHOP_DROP_AREA.x) <= SHOP_DROP_AREA.width / 2
    && Math.abs(y - SHOP_DROP_AREA.y) <= SHOP_DROP_AREA.height / 2;
}
