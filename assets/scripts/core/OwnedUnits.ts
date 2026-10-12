/**
 * 玩家持有棋子（纯逻辑，无 cc）。
 * - 备战席与棋盘同一份数据，location 区分；拖动只改位置。
 * - 同名合并：3 个同名同星 → 1 个星+1；升星不返还卡池（合并棋子仍算玩家持有）。
 */

import { MERGE_COUNT } from './ShopConfig';

export type UnitLocation = 'bench' | 'board';

export interface OwnedUnit {
  /** 唯一实例 id */
  uid: number;
  /** 棋子配置 id（如 warrior） */
  unitId: string;
  star: number;
  location: UnitLocation;
  /** board: hex (x,y)；bench: 格子索引 0..benchSlots-1 */
  x: number;
  y: number;
}

export class OwnedUnits {
  private list: OwnedUnit[] = [];
  private nextUid = 1;

  constructor(initial?: OwnedUnit[]) {
    if (initial) {
      for (const u of initial) this.list.push({ ...u });
      this.nextUid = this.list.reduce((m, u) => Math.max(m, u.uid), 0) + 1;
    }
  }

  all(): OwnedUnit[] { return this.list; }

  get(uid: number): OwnedUnit | undefined {
    return this.list.find(u => u.uid === uid);
  }

  atBoard(x: number, y: number): OwnedUnit | undefined {
    return this.list.find(u => u.location === 'board' && u.x === x && u.y === y);
  }

  atBench(slot: number): OwnedUnit | undefined {
    return this.list.find(u => u.location === 'bench' && u.y === slot);
  }

  onBoard(): OwnedUnit[] { return this.list.filter(u => u.location === 'board'); }
  inBench(): OwnedUnit[] { return this.list.filter(u => u.location === 'bench'); }

  /** 添加棋子到备战席指定格（slot=-1 自动找空位）；失败返回 null */
  addToBench(unitId: string, benchSlots: number, slot = -1, star = 1): OwnedUnit | null {
    let s = slot;
    if (s < 0) {
      for (let i = 0; i < benchSlots; i++) {
        if (!this.atBench(i)) { s = i; break; }
      }
      if (s < 0) return null; // 备战席满
    } else if (s >= benchSlots || this.atBench(s)) {
      return null;
    }
    const u: OwnedUnit = {
      uid: this.nextUid++, unitId, star,
      location: 'bench', x: -1, y: s,
    };
    this.list.push(u);
    this.tryMerge(unitId);
    return u;
  }

  /** 强制添加（不检查备战席空位）；购买合并满席场景专用。 */
  forceAdd(unitId: string, star = 1): OwnedUnit {
    const u: OwnedUnit = {
      uid: this.nextUid++, unitId, star,
      location: 'bench', x: -1, y: -1,
    };
    this.list.push(u);
    return u;
  }

  /** 移动/交换；返回是否成功 */
  move(uid: number, to: { location: UnitLocation; x: number; y: number }): boolean {
    const u = this.get(uid);
    if (!u) return false;
    if (to.location === 'board') {
      const occ = this.atBoard(to.x, to.y);
      if (occ && occ.uid !== uid) {
        // 交换位置
        const oldX = u.x, oldY = u.y, oldLoc = u.location;
        u.location = 'board'; u.x = to.x; u.y = to.y;
        occ.location = oldLoc;
        occ.x = oldX; occ.y = oldY;
      } else {
        u.location = 'board'; u.x = to.x; u.y = to.y;
      }
    } else {
      const occ = this.atBench(to.y);
      if (occ && occ.uid !== uid) {
        const oldX = u.x, oldY = u.y, oldLoc = u.location;
        u.location = 'bench'; u.x = -1; u.y = to.y;
        occ.location = oldLoc;
        occ.x = oldX; occ.y = oldY;
      } else {
        u.location = 'bench'; u.x = -1; u.y = to.y;
      }
    }
    this.tryMerge(u.unitId);
    return true;
  }

  /** 出售：从持有中移除（卡池返还由调用方调 pool.give） */
  remove(uid: number): OwnedUnit | null {
    const i = this.list.findIndex(u => u.uid === uid);
    if (i < 0) return null;
    const [u] = this.list.splice(i, 1);
    return u;
  }

  /**
   * 同名同星合并：凑满 MERGE_COUNT 个 → 保留一个星+1，其余移除。
   * 返回升星后的棋子（未合并返回 null）。
   * 注意：只处理 1→2 星、2→3 星；3 星不再升。
   */
  tryMerge(unitId: string): OwnedUnit | null {
    for (let star = 1; star < 3; star++) {
      const same = this.list.filter(u => u.unitId === unitId && u.star === star);
      if (same.length >= MERGE_COUNT) {
        // 保留第一个，删除其余
        const keep = same[0];
        for (let i = 1; i < MERGE_COUNT; i++) {
          const idx = this.list.findIndex(u => u.uid === same[i].uid);
          if (idx >= 0) this.list.splice(idx, 1);
        }
        keep.star = star + 1;
        return keep;
      }
    }
    return null;
  }

  /** 存档快照 */
  snapshot(): OwnedUnit[] {
    return this.list.map(u => ({ ...u }));
  }
}
