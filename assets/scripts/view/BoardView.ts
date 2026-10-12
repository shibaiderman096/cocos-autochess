import { _decorator, Component, Graphics, Node, Vec3, Color, SpriteFrame, Sprite, UITransform, instantiate } from 'cc';
import { resources } from 'cc';
import { Grid } from '../battle/Grid';
import { TILE_SPRITE } from './ArtPaths';

const { ccclass, property } = _decorator;

/**
 * 棋盘渲染（素材版，M1 第 2 项）。
 * - 用 tile_light / tile_dark / tile_zone_ally / tile_zone_enemy 拼出 8×8。
 * - 保留 Graphics 画外框。
 * - cellToWorld / worldToCell 供 UnitView、拖拽布阵使用。
 */
@ccclass('BoardView')
export class BoardView extends Component {
  @property
  cellSize = 64;

  @property
  boardWidth = 8;

  @property
  boardHeight = 8;

  grid: Grid;
  private tileFrames: SpriteFrame[] = [];
  private tilesRoot: Node;
  private g: Graphics;

  start() {
    this.grid = new Grid(this.boardWidth, this.boardHeight);
    this.tilesRoot = new Node('tiles');
    this.tilesRoot.addComponent(UITransform);
    this.node.addChild(this.tilesRoot);

    const keys: Array<'light' | 'dark' | 'zoneAlly' | 'zoneEnemy'> = ['light', 'dark', 'zoneAlly', 'zoneEnemy'];
    let pending = keys.length;
    for (const k of keys) {
      const p = TILE_SPRITE[k];
      resources.load(p, SpriteFrame, (err, sf) => {
        if (err) { console.warn(`[BoardView] load failed: ${p}`, err.message); }
        else {
          switch (k) {
            case 'light': this.tileFrames[0] = sf; break;
            case 'dark': this.tileFrames[1] = sf; break;
            case 'zoneAlly': this.tileFrames[2] = sf; break;
            case 'zoneEnemy': this.tileFrames[3] = sf; break;
          }
        }
        pending--;
        if (pending === 0) this.buildTiles();
      });
    }

    this.g = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
  }

  private buildTiles() {
    // 0=light 1=dark 2=zoneAlly 3=zoneEnemy
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const own = y < this.boardHeight / 2;
        const checker = (x + y) % 2 === 0;
        // 半场着色优先于棋盘格：前 2 行（每半场内侧 1 行）用 zone 色突出交战区
        let idx: number;
        if (checker) idx = own ? 0 : 3;
        else idx = own ? 2 : 1;
        // 让整体还是棋盘格观感：只用 light/dark，zone 色画两侧边缘线
        idx = checker ? 0 : 1;
        void own;
        const sf = this.tileFrames[idx];
        if (!sf) continue;
        const node = new Node(`tile_${x}_${y}`);
        node.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = sf;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        node.setPosition(this.cellToWorld(x, y));
        this.tilesRoot.addChild(node);
      }
    }
    this.redrawFrame();
  }

  /** 画外框 + 中线（Graphics 叠在 Sprite 上面） */
  redrawFrame() {
    const g = this.g;
    g.clear();
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;
    g.strokeColor = new Color(40, 30, 20, 255);
    g.lineWidth = 3;
    g.rect(-halfW, -halfH, this.boardWidth * this.cellSize, this.boardHeight * this.cellSize);
    g.stroke();
    // 己方/敌方分界线
    g.strokeColor = new Color(255, 220, 120, 160);
    g.lineWidth = 2;
    g.moveTo(-halfW, 0);
    g.lineTo(halfW, 0);
    g.stroke();
  }

  /** 格子坐标（逻辑）→ 本地世界坐标 */
  cellToWorld(x: number, y: number): Vec3 {
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;
    return new Vec3(
      -halfW + (x + 0.5) * this.cellSize,
      halfH - (y + 0.5) * this.cellSize,
      0,
    );
  }

  /** 本地世界坐标 → 格子坐标；出界返回 null */
  worldToCell(wx: number, wy: number): { x: number; y: number } | null {
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;
    const fx = (wx + halfW) / this.cellSize - 0.5;
    const fy = (halfH - wy) / this.cellSize - 0.5;
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x < 0 || y < 0 || x >= this.boardWidth || y >= this.boardHeight) return null;
    return { x, y };
  }
}

function instantiate$1(): Node { return instantiate(new Node()); }
void instantiate$1;
