export type PowerReliability = 'high' | 'medium' | 'low';
export type PowerEnvironment = 'close' | 'medium' | 'far';
export interface CalibrationConfidence {
  sampleCount: number;
  independentSeeds: number;
  reliability: PowerReliability;
  reasons: string[];
  residualRmse: number;
  censoredFraction: number;
}
export interface CalibratedPowerPoint {
  power: number;
  environments: Record<PowerEnvironment, number>;
  confidence: CalibrationConfidence;
  environmentConfidence?: Record<PowerEnvironment, CalibrationConfidence>;
}
export interface UnitPowerCalibration {
  cost: number;
  baseFactor: number;
  starFactors: Record<string, number>;
  /** Keys are star, then a sorted equipment multiset; empty key means no equipment. */
  points: Record<string, Record<string, CalibratedPowerPoint>>;
  tags: string[];
  scaling: 'normalScaling' | 'specialScaling' | 'extremeScaling';
}
export interface EnemyPowerData {
  version: string;
  calibrationHash: string;
  sourceHash: string;
  configHash: string;
  baseScale: number;
  normalization: string;
  costBaseline: Record<string, number>;
  globalStarFactors: Record<string, number>;
  units: Record<string, UnitPowerCalibration>;
  equipment: Record<string, { marginalAtOneStar: number; relativeGain: number; confidence: CalibrationConfidence }>;
  derivedConfidence?: {
    costBaseline: Record<string, CalibrationConfidence>;
    globalStarFactors: Record<string, CalibrationConfidence>;
    unitFactors: Record<string, CalibrationConfidence>;
    starFactors: Record<string, Record<string, CalibrationConfidence>>;
  };
  winProbabilitySlope: number;
  applicability: { teamValidationMae: number; unitValidationMae: number; notes: string[] };
}
export interface PowerRequest {
  unitId: string;
  star: number;
  equipment?: string[];
  /** Required for an explicit cost-baseline fallback for an unknown unit. */
  cost?: number;
  environment?: PowerEnvironment;
}
export interface PowerEstimate {
  power: number;
  confidence: PowerReliability;
  sampleCount: number;
  diagnostics: string[];
  method: 'measured' | 'additive-fallback' | 'cost-fallback';
}
