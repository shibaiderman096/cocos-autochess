import { configuredShieldAmount, configuredSkillDamage, SkillConfigData } from '../core/ConfigManager';
import { hexDist, offsetToWorld } from './HexMath';
import type { BattleEvent, Pos } from './types';
import type { Unit } from './Unit';

/** Hex radius clipped by the forward 180-degree half-plane, including its side edges. */
export function inCompassSector(from: Pos, toward: Pos, point: Pos, radius: number): boolean {
  const distance = hexDist(from, point);
  if (distance === 0 || distance > radius) return false;
  const a = offsetToWorld(from.x, from.y, 1, 0, 0), b = offsetToWorld(toward.x, toward.y, 1, 0, 0);
  const p = offsetToWorld(point.x, point.y, 1, 0, 0), dx = b.x - a.x, dy = b.y - a.y;
  return Math.hypot(dx, dy) > 0 && (p.x-a.x)*dx + (p.y-a.y)*dy >= -1e-8;
}

interface ShieldLayer { serial: number; target: Unit; remaining: number; end: number }
interface Host {
  units: Unit[]; events: BattleEvent[]; now(): number; width(): number; height(): number;
  targetable(unit: Unit): boolean; damage(source: Unit, target: Unit, amount: number, skillId: string): void;
}

/** Each cast owns a separate expiring shield layer; it never removes another system's shield. */
export class SandCompass {
  private layers: ShieldLayer[] = [];
  private serial = 0;
  constructor(private host: Host, private tickMs: number) {}

  release(source: Unit, skill: SkillConfigData, toward: Pos): void {
    const tick = this.host.now(), from = source.pos;
    const amount = configuredShieldAmount(source.cfg, skill, source.star);
    const end = tick + Math.max(1, Math.round(skill.sandCompass!.shieldSeconds * 1000 / this.tickMs));
    for (const ally of this.host.units) {
      if (!ally.alive || ally.hp <= 0 || ally.side !== source.side || hexDist(from, ally.pos) > skill.radius) continue;
      const serial = this.serial++;
      ally.shield += amount;
      this.layers.push({ serial, target: ally, remaining: amount, end });
      this.host.events.push({ t:'shield', tick, id:ally.id, source:source.id, amount, shield:ally.shield });
      this.host.events.push({ t:'compass_guard', tick, id:ally.id, source:source.id, serial, untilTick:end });
    }
    const cells: Pos[] = [];
    for (let y=0;y<this.host.height();y++) for (let x=0;x<this.host.width();x++)
      if (inCompassSector(from,toward,{x,y},skill.radius)) cells.push({x,y});
    this.host.events.push({ t:'sand_compass', tick, id:source.id, from, toward, cells, radius:skill.radius });
    for (const enemy of this.host.units)
      if (enemy.side !== source.side && enemy.hp > 0 && this.host.targetable(enemy) && inCompassSector(from,toward,enemy.pos,skill.radius))
        this.host.damage(source,enemy,configuredSkillDamage(skill,source.star,source.skillScale),skill.id);
  }

  update(): void {
    for (const layer of [...this.layers]) if (this.host.now() >= layer.end) this.remove(layer);
  }
  absorb(target: Unit, amount: number): number {
    for (const layer of this.layers.filter(s=>s.target===target).sort((a,b)=>a.end-b.end||a.serial-b.serial)) {
      const used = Math.min(amount,layer.remaining); layer.remaining -= used; amount -= used;
      if (layer.remaining === 0) this.remove(layer);
      if (amount === 0) break;
    }
    return amount;
  }
  onDeath(target: Unit): void { for (const layer of [...this.layers]) if (layer.target===target) this.remove(layer); }
  clear(): void { for (const layer of [...this.layers]) this.remove(layer); }
  private remove(layer: ShieldLayer): void {
    this.layers.splice(this.layers.indexOf(layer),1);
    layer.target.shield = Math.max(0,layer.target.shield-layer.remaining);
    this.host.events.push({t:'compass_guard_end',tick:this.host.now(),serial:layer.serial});
  }
}
