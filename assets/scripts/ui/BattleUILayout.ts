/** UI-local coordinates; share the visible shop rectangle with drag hit testing. */
export const SHOP_DROP_AREA = { x: -108, y: -265, width: 964, height: 182 } as const;
export const SHOP_CARDS = { firstX: -335, spacing: 158, y: -294, scale: 150 / 164 } as const;
export const SHOP_REWARD_AREA = { x: -20, y: -265, width: 788, height: 182 } as const;

/** Presentation only; coordinates are shared by drawing and drag-to-sell. */
export function battleUILayout(width: number, mobile: boolean) {
  const half = Math.max(640, width / 2);
  const right = half - 28;
  const shop = mobile ? { x: -96, y: -241, width: 2 * half - 368, height: 230 } : SHOP_DROP_AREA;
  return { mobile, half, shop, left: -half + 124, right: right - (mobile ? 126 : 138),
    commandX: mobile ? right - 120 : 482,
    cardWidth: mobile ? (shop.width - 228) / 5 : 164,
    cardHeight: mobile ? 170 : 124,
    cardPosition: (i: number) => mobile
      ? { x: shop.x - shop.width / 2 + 184 + ((shop.width - 228) / 5 + 8) * i + (shop.width - 228) / 10, y: -261 }
      : { x: SHOP_CARDS.firstX + i * SHOP_CARDS.spacing, y: -290 },
  };
}

export function containsShopDrop(x: number, y: number): boolean {
  return Math.abs(x - SHOP_DROP_AREA.x) <= SHOP_DROP_AREA.width / 2
    && Math.abs(y - SHOP_DROP_AREA.y) <= SHOP_DROP_AREA.height / 2;
}
