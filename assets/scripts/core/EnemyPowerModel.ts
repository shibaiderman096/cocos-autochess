import { MAX_EQUIPMENT } from '../battle/types';
import type { EnemyPowerData, PowerEstimate, PowerRequest, PowerReliability, CalibratedPowerPoint } from './EnemyPowerTypes';

export function equipmentPowerKey(ids: string[]): string { return ids.slice().sort().join('+'); }
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const lowest = (a: PowerReliability, b: PowerReliability): PowerReliability =>
  a === 'low' || b === 'low' ? 'low' : a === 'medium' || b === 'medium' ? 'medium' : 'high';

/** An opt-in offline model consumer. No current enemy generator or UI loads this model. */
export class EnemyPowerModel {
  private readonly data: EnemyPowerData;
  constructor(data: EnemyPowerData, expected?: { configHash?: string; sourceHash?: string; version?: string }) {
    if (!data || !data.version || !data.calibrationHash || !positive(data.baseScale) || !positive(data.winProbabilitySlope)) throw new Error('Invalid enemy power model');
    for (const key of ['configHash', 'sourceHash', 'version'] as const) {
      if (expected?.[key] !== undefined && expected[key] !== data[key]) throw new Error(`Power model ${key} mismatch`);
    }
    for (const cost of [1,2,3,4,5]) if (!positive(data.costBaseline?.[cost])) throw new Error(`Missing positive cost baseline: ${cost}`);
    for (const star of [1,2,3]) if (!positive(data.globalStarFactors?.[star])) throw new Error(`Missing positive global star factor: ${star}`);
    for (const [id, unit] of Object.entries(data.units ?? {})) {
      if (!positive(unit.baseFactor) || !Number.isInteger(unit.cost) || unit.cost < 1 || unit.cost > 5) throw new Error(`Invalid calibrated unit: ${id}`);
      for (const points of Object.values(unit.points)) for (const point of Object.values(points)) {
        if (!positive(point.power) || !['high','medium','low'].includes(point.confidence?.reliability)) throw new Error(`Invalid power point: ${id}`);
        for (const env of ['close','medium','far'] as const) if (!positive(point.environments[env])) throw new Error(`Invalid environment: ${id}/${env}`);
      }
    }
    for (const [id, item] of Object.entries(data.equipment ?? {})) {
      if (!Number.isFinite(item.relativeGain) || !Number.isFinite(item.marginalAtOneStar)) throw new Error(`Invalid equipment calibration: ${id}`);
    }
    this.data = JSON.parse(JSON.stringify(data));
  }

  estimateUnitPower(request: PowerRequest): PowerEstimate {
    if (!request || typeof request.unitId !== 'string' || !request.unitId || !Number.isInteger(request.star) || request.star < 1 || request.star > 3) throw new Error('Invalid unit/star power request');
    const ids = request.equipment ?? [];
    if (!Array.isArray(ids) || ids.length > MAX_EQUIPMENT || ids.some(id => typeof id !== 'string' || !id || id.includes('+'))) throw new Error('Invalid equipment power request');
    if (request.environment !== undefined && !['close','medium','far'].includes(request.environment)) throw new Error('Invalid power environment');
    const unit = this.data.units[request.unitId];
    const diagnostics: string[] = [];
    let base: number, confidence: PowerReliability = 'low', sampleCount = 0;
    const value = (p: CalibratedPowerPoint) => request.environment ? p.environments[request.environment] : p.power;
    const support = (p: CalibratedPowerPoint) => request.environment ? p.environmentConfidence?.[request.environment] : p.confidence;
    const points = unit?.points[request.star];
    const exact = points?.[equipmentPowerKey(ids)];
    if (exact) {
      const meta = support(exact);
      return { power: value(exact), confidence: meta?.reliability ?? 'low', sampleCount: meta?.sampleCount ?? 0,
        diagnostics: meta ? meta.reasons.slice() : ['environment confidence metadata missing; model coverage is not assumed'], method: 'measured' };
    }
    if (unit) {
      const naked = points?.[''];
      if (naked) { base = value(naked); confidence = support(naked)?.reliability ?? 'low'; sampleCount = support(naked)?.sampleCount ?? 0; }
      else {
        base = this.data.costBaseline[unit.cost] * unit.baseFactor * (unit.starFactors[request.star] ?? this.data.globalStarFactors[request.star]);
        diagnostics.push('star calibration missing; using unit/cost and global star fallback');
      }
    } else {
      if (!Number.isInteger(request.cost) || request.cost! < 1 || request.cost! > 5) throw new Error('Unknown unit requires an explicit valid cost for fallback');
      base = this.data.costBaseline[request.cost!] * this.data.globalStarFactors[request.star];
      diagnostics.push('unit calibration missing; using supplied cost baseline and global star factor');
    }
    let total = base;
    for (const id of ids) {
      const single = points?.[id];
      if (single && points?.['']) {
        total += value(single) - value(points['']); sampleCount = Math.min(sampleCount, support(single)?.sampleCount ?? 0);
      } else if (this.data.equipment[id]) {
        total += base * this.data.equipment[id].relativeGain;
        diagnostics.push(`equipment ${id}: unit/star calibration missing; using measured global relative gain`);
      } else diagnostics.push(`equipment ${id}: calibration missing; excluded from partial estimate`);
    }
    if (ids.length) diagnostics.push('equipment combination unmeasured; additive fallback may miss interactions');
    if (!positive(total)) { total = base; diagnostics.push('additive estimate nonpositive; retaining positive base estimate'); }
    return { power: total, confidence: diagnostics.length ? 'low' : confidence, sampleCount,
      diagnostics, method: unit ? 'additive-fallback' : 'cost-fallback' };
  }

  estimateTeamPower(units: PowerRequest[]): PowerEstimate {
    if (!Array.isArray(units) || !units.length || units.length > 10) throw new Error('Team power requires 1 to 10 units');
    const estimates = units.map(u => this.estimateUnitPower(u));
    return { power: estimates.reduce((sum, e) => sum + e.power, 0),
      confidence: estimates.reduce((c, e) => lowest(c, e.confidence), 'high' as PowerReliability),
      sampleCount: Math.min(...estimates.map(e => e.sampleCount)),
      diagnostics: Array.from(new Set(estimates.flatMap(e => e.diagnostics))), method: estimates.every(e => e.method === 'measured') ? 'measured' : 'additive-fallback' };
  }
  winProbability(powerA: number, powerB: number): number {
    if (!positive(powerA) || !positive(powerB)) throw new Error('Win prediction requires positive finite power');
    return 1 / (1 + Math.exp(-this.data.winProbabilitySlope * Math.log(powerA / powerB)));
  }
}
