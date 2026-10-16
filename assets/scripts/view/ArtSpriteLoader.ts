import { Rect, Size, SpriteFrame, resources } from 'cc';

const cells = new Map<string, SpriteFrame>();
/** Optional #index,columns,rows addresses an unmodified generated sprite sheet. */
export function loadArtSprite(path: string, ready: (error: Error | null, frame?: SpriteFrame) => void): void {
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
