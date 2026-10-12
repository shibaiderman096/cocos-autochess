import { _decorator, Component, Graphics, Node, Vec3, Color, SpriteFrame, Sprite, UITransform } from 'cc';
import { resources } from 'cc';
import { Grid } from '../battle/Grid';
import { TILE_SPRITE } from './ArtPaths';

const { ccclass, property } = _decorator;

/**
 * 棋盘渲染（素材版）。
 * - 用 tile_light / tile_dark 铺 8×8 棋盘格。
 * - Graphics 画外框 + 己方/敌方分界线。
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
  private lightSf: SpriteFrame;
  private darkSf: SpriteFrame;
  private tilesRoot: Node;
  private g: Graphics;

  start() {
    this.grid = new Grid(this.boardWidth, this.boardHeight);
    this.tilesRoot = new Node('tiles');
    this.tilesRoot.addComponent(UITransform);
    this.node.addChild(this.tilesRoot);

    let pending = 2;
    const done = () => { if (--pending === 0) this.buildTiles(); };
    resources.load(TILE_SPRITE.light, SpriteFrame, (e, sf) => {
      if (e) console.warn('[BoardView] load tile_light failed', e.message);
      else this.lightSf = sf;
      done();
    });
    resources.load(TILE_SPRITE.dark, SpriteFrame, (e, sf) => {
      if (e) console.warn('[BoardView] load tile_dark failed', e.message);
      else this.darkSf = sf;
      done();
    });

    this.g = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
  }

  private buildTiles() {
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const sf = (x + y) % 2 === 0 ? this.lightSf : this.darkSf;
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

  /** 外框 + 中线（Graphics 叠在 Sprite 上） */
  private redrawFrame() {
    const g = this.g;
    g.clear();
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;
    g.strokeColor = new Color(40, 30, 20, 255);
    g.lineWidth = 3;
    g.rect(-halfW, -halfH, this.boardWidth * this.cellSize, this.boardHeight * this.cellSize);
    g.stroke();
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
