import { Rect, Size, SpriteFrame, Texture2D, resources } from 'cc';

const cells = new Map<string, SpriteFrame>();
/** Optional #index,columns,rows addresses an unmodified generated sprite sheet. */
export function loadArtSprite(path: string, ready: (error: Error | null, frame?: SpriteFrame) => void): void {
  // Portrait coordinates refer to original pixels, independent of imported trim or dynamic packing.
  const rawRegion = /^(.*)\/spriteFrame#rawrect,(\d+),(\d+),(\d+),(\d+)$/.exec(path);
  if (rawRegion) {
    const cached = cells.get(path); if (cached) { ready(null, cached); return; }
    resources.load(`${rawRegion[1]}/texture`, Texture2D, (error, texture) => {
      if (error) { ready(error); return; }
      const x = +rawRegion[2], y = +rawRegion[3], width = +rawRegion[4], height = +rawRegion[5];
      if (width <= 0 || height <= 0 || x + width > texture.width || y + height > texture.height) { ready(new Error('Invalid portrait region')); return; }
      const existing = cells.get(path); if (existing) { ready(null, existing); return; }
      const frame = new SpriteFrame(); frame.name = path; frame.texture = texture;
      frame.rect = new Rect(x, y, width, height); frame.originalSize = new Size(width, height);
      cells.set(path, frame); ready(null, frame);
    });
    return;
  }
  // Explicit atlas rectangles preserve a supplied image without rewriting its pixels.
  const region = /^(.*)#rect,(\d+),(\d+),(\d+),(\d+)$/.exec(path);
  if (region) {
    const cached = cells.get(path); if (cached) { ready(null, cached); return; }
    resources.load(region[1], SpriteFrame, (error, sheet) => {
      if (error) { ready(error); return; }
      const x = +region[2], y = +region[3], width = +region[4], height = +region[5];
      if (width <= 0 || height <= 0 || x + width > sheet.rect.width || y + height > sheet.rect.height) { ready(new Error('Invalid sprite region')); return; }
      const existing = cells.get(path); if (existing) { ready(null, existing); return; }
      const frame = new SpriteFrame(); frame.name = path; frame.texture = sheet.texture;
      frame.rect = new Rect(sheet.rect.x + x, sheet.rect.y + y, width, height); frame.originalSize = new Size(width, height);
      cells.set(path, frame); ready(null, frame);
    });
    return;
  }
  const match = /^(.*)#(\d+),(\d+),(\d+)$/.exec(path);
  if (!match) { resources.load(path, SpriteFrame, ready); return; }
  const cached = cells.get(path); if (cached) { ready(null, cached); return; }
  const index = Number(match[2]), columns = Number(match[3]), rows = Number(match[4]);
  if (!columns || !rows || index >= columns * rows) { ready(new Error('Invalid sprite cell')); return; }
  resources.load(match[1], SpriteFrame, (error, sheet) => {
    if (error) { ready(error); return; }
    const existing = cells.get(path); if (existing) { ready(null, existing); return; }
    const width = sheet.rect.width / columns, height = sheet.rect.height / rows;
    const frame = new SpriteFrame(); frame.name = path; frame.texture = sheet.texture;
    frame.rect = new Rect((index % columns) * width, Math.floor(index / columns) * height, width, height);
    frame.originalSize = new Size(width, height);
    cells.set(path, frame); ready(null, frame);
  });
}
