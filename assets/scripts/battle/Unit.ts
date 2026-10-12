import { Side } from './types';
import { UnitConfigData } from '../core/ConfigManager';

export class Unit {
  hp: number;
  mana: number;
  atkCd = 0;
  moveCd = 0;
  alive = true;

  constructor(
    public id: number,
    public side: Side,
    public cfg: UnitConfigData,
    public x: number,
    public y: number,
  ) {
    this.hp = cfg.hp;
    this.mana = cfg.startMana;
  }

  get pos() { return { x: this.x, y: this.y }; }

  /** 快照给表现层 / 模拟器读取，防止外部直接改内部状态 */
  snapshot() {
    return {
      id: this.id,
      side: this.side,
      cfgId: this.cfg.id,
      pos: { x: this.x, y: this.y },
      hp: this.hp,
      maxHp: this.cfg.hp,
      mana: this.mana,
      maxMana: this.cfg.maxMana,
      atkCd: this.atkCd,
      moveCd: this.moveCd,
      alive: this.alive,
    };
  }
}
