/**
 * 存档（纯逻辑，无 cc）。
 * - 单一 JSON 结构，包含经济/等级/阶段。
 * - migrate() 为旧档补默认值，避免读取报错。
 */

import { DEFAULT_ECONOMY_CONFIG } from './EconomySystem';
import { MAX_LEVEL } from './LevelSystem';

export interface SaveData {
  version: number;
  /** 当前阶段（层）数，从 1 开始 */
  floor: number;
  gold: number;
  level: number;
  exp: number;
  winStreak: number;
  loseStreak: number;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'autochess_save_v1';

/** 任意输入（可能来自旧档/损坏 JSON）→ 合法 SaveData */
export function migrateSave(raw: unknown): SaveData {
  const d = (raw ?? {}) as Partial<SaveData>;
  const safeInt = (v: unknown, def: number, min: number, max: number): number => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  };
  return {
    version: SAVE_VERSION,
    floor: safeInt(d.floor, 1, 1, 9999),
    gold: safeInt(d.gold, DEFAULT_ECONOMY_CONFIG.initialGold, 0, 999999),
    level: safeInt(d.level, 1, 1, MAX_LEVEL),
    exp: safeInt(d.exp, 0, 0, 999999),
    winStreak: safeInt(d.winStreak, 0, 0, 999),
    loseStreak: safeInt(d.loseStreak, 0, 0, 999),
  };
}

/** localStorage 读档（浏览器环境），Node 里返回 null */
export function loadSave(): SaveData | null {
  try {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null;
    if (!s) return null;
    return migrateSave(JSON.parse(s));
  } catch {
    return null;
  }
}

/** localStorage 写档（浏览器环境） */
export function writeSave(data: SaveData): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    }
  } catch {
    // 存储失败不阻塞游戏
  }
}

/** 清档（重开一局用） */
export function clearSave(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY);
  } catch {}
}

/** 从内存对象新建一局 */
export function freshSave(): SaveData {
  return migrateSave({});
}
