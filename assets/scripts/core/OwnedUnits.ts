/**
 * 玩家持有棋子（纯逻辑，无 cc）。
 * - 备战席与棋盘同一份数据，location 区分；拖动只改位置。
 * - 同名合并：3 个同名同星 → 1 个星+1；升星不返还卡池（合并棋子仍算玩家持有）。
 */

import { MAX_EQUIPMENT } from '../battle/types';
import { MERGE_COUNT } from './ShopConfig';

export type UnitLocation = 'bench' | 'board';

/** Source breakdown for permanent consumable bonuses, already included in the permanent totals. */
export interface ItemStatGrowth {
  itemHealth?: number;
  itemPhysicalPower?: number;
  itemSpellPower?: number;
}

export interface OwnedUnit extends ItemStatGrowth {
  /** 唯一实例 id */
  uid: number;
  /** 棋子配置 id（如 helion） */
  unitId: string;
  star: number;
  permanentMaxHp?: number;
  permanentSpellPower?: number;
  permanentPhysicalPower?: number;
  /** Health earned specifically by the soul-lamp passive, before stat multipliers. */
  soulLampHealth?: number;
  equipment?: string[];
  location: UnitLocation;
  /** board: hex (x,y)；bench: 格子索引 0..benchSlots-1 */
  x: number;
  y: number;
}

export class OwnedUnits {
  private list: OwnedUnit[] = [];
  private nextUid = 1;
  equipmentReserve: string[] = [];

  constructor(initial?: OwnedUnit[], nextUid?: number, private canMerge: () => boolean = () => true,
    readonly canMergeResult: (units:OwnedUnit[])=>boolean = () => true) {
    if (initial) {
      for (const u of initial) this.list.push({ ...u, equipment: [...(u.equipment ?? [])].slice(0, MAX_EQUIPMENT) });
      this.nextUid = this.list.reduce((m, u) => Math.max(m, u.uid), 0) + 1;
    }
    if (Number.isSafeInteger(nextUid) && nextUid! >= this.nextUid) this.nextUid = nextUid!;
  }

  get nextUnitUid(): number { return this.nextUid; }

  equip(uid: number, id: string): boolean {
    const unit = this.get(uid); if (!unit || (unit.equipment?.length ?? 0) >= MAX_EQUIPMENT) return false;
    (unit.equipment ??= []).push(id); return true;
  }
  unequip(uid: number, slot: number): boolean {
    const unit = this.get(uid);
    if (!unit || !Number.isInteger(slot) || slot < 0 || slot >= (unit.equipment?.length ?? 0)) return false;
    this.equipmentReserve.push(unit.equipment!.splice(slot, 1)[0]); return true;
  }
  all(): OwnedUnit[] { return this.list; }

  /** Restore both units and UID allocation if a purchase/merge fails. */
  transaction<T>(action: () => T): T {
    const original = this.list.slice(), snapshot = this.snapshot(), nextUid = this.nextUid, reserve = this.equipmentReserve.slice();
    try { return action(); }
    catch (error) {
      original.forEach((unit, i) => Object.assign(unit, snapshot[i]));
      this.list = original; this.nextUid = nextUid; this.equipmentReserve = reserve;
      throw error;
    }
  }

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
    if (!Number.isInteger(benchSlots) || benchSlots < 1 || benchSlots > 12 || !Number.isInteger(slot)
      || slot < -1 || !Number.isInteger(star) || star < 1 || star > 3) return null;
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
    if (!['board', 'bench'].includes(to.location) || !Number.isInteger(to.x) || !Number.isInteger(to.y)
      || to.y < 0 || (to.location === 'board' && to.x < 0)) return false;
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
    this.equipmentReserve.push(...(u.equipment ?? []));
    return u;
  }

  /** Deferred copies stay intact until the owning session leaves combat. */
  mergeAll(): void {
    if (!this.canMerge()) return;
    for (const id of Array.from(new Set(this.list.map(unit => unit.unitId))).sort()) this.tryMerge(id);
  }

  /** Preview the extra upgrade earned by one purchased 1-star copy, without consuming real materials. */
  purchaseUpgradeStar(unitId: string): 2 | 3 | null {
    const projected = new OwnedUnits(this.snapshot(), this.nextUid,()=>true,this.canMergeResult);
    // Existing combat-deferred groups are not an upgrade earned by this purchase.
    projected.tryMerge(unitId);
    projected.forceAdd(unitId);
    const result = projected.tryMerge(unitId);
    return result ? result.star as 2 | 3 : null;
  }

  /**
   * 同名同星合并：凑满 MERGE_COUNT 个 → 保留一个星+1，其余移除。
   * 返回升星后的棋子（未合并返回 null）。
   * 注意：只处理 1→2 星、2→3 星；3 星不再升。
   */
  tryMerge(unitId: string): OwnedUnit | null {
    if (!this.canMerge()) return null;
    let merged: OwnedUnit | null = null;
    for (let star = 1; star < 3; star++) {
      // Preserve a deployed slot when purchases combine board and reserve copies.
      const candidates = () => this.list.filter(u => u.unitId === unitId && u.star === star)
        .sort((a, b) => Number(b.location === 'board') - Number(a.location === 'board') || a.uid - b.uid);
      let same = candidates();
      while (same.length >= MERGE_COUNT) {
        const group=same.slice(0,MERGE_COUNT),gear=group.flatMap(unit=>unit.equipment??[]);
        const projected=this.snapshot().filter(unit=>!group.slice(1).some(material=>material.uid===unit.uid));
        const survivor=projected.find(unit=>unit.uid===group[0].uid)!;survivor.star=star+1;survivor.equipment=gear.slice(0,MAX_EQUIPMENT);
        // Returning excess capacity equipment must not strand an over-cap army on the board.
        if(!this.canMergeResult(projected))break;
        // 保留第一个，删除其余
        const keep = same[0];
        const permanentMaxHp = same.slice(0, MERGE_COUNT).reduce((sum, unit) => sum + (unit.permanentMaxHp ?? 0), 0);
        if (permanentMaxHp) keep.permanentMaxHp = permanentMaxHp;
        keep.soulLampHealth = same.slice(0, MERGE_COUNT).reduce((sum, unit) => sum + (unit.soulLampHealth ?? 0), 0);
        const permanentSpellPower = same.slice(0, MERGE_COUNT).reduce((sum, unit) => sum + (unit.permanentSpellPower ?? 0), 0);
        if (permanentSpellPower) keep.permanentSpellPower = permanentSpellPower;
        const permanentPhysicalPower=group.reduce((sum,unit)=>sum+(unit.permanentPhysicalPower??0),0);
        if(permanentPhysicalPower)keep.permanentPhysicalPower=permanentPhysicalPower;
        for (const key of ['itemHealth','itemPhysicalPower','itemSpellPower'] as const) {
          const total = group.reduce((sum, unit) => sum + (unit[key] ?? 0), 0);
          if (total) keep[key] = total;
        }
        const equipment = same.slice(0, MERGE_COUNT).flatMap(unit => unit.equipment ?? []);
        keep.equipment = equipment.slice(0, MAX_EQUIPMENT);
        this.equipmentReserve.push(...equipment.slice(MAX_EQUIPMENT));
        for (let i = 1; i < MERGE_COUNT; i++) {
          const idx = this.list.findIndex(u => u.uid === same[i].uid);
          if (idx >= 0) this.list.splice(idx, 1);
        }
        keep.star = star + 1;
        merged = keep;
        same = candidates();
      }
    }
    return merged;
  }

  /** 存档快照 */
  snapshot(): OwnedUnit[] {
    return this.list.map(u => ({ ...u, equipment: [...(u.equipment ?? [])] }));
  }
}
