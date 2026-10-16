import type { PlayerObservation,RunPlayerPort } from './RunSessionTypes';
import type { UnitConfigData,SkillConfigData } from './ConfigManager';
import type { EquipmentConfigData } from '../battle/types';
import type { EconomyConfig } from './EconomySystem';
import type { WaveEnemy } from './RoundFlow';
import type { WaveKind } from './EnemyGenerationTypes';

/** Public rules and currently visible board only. No model, subsystem RNG, pool secrets or future objects. */
export interface BotCatalog {
  units:UnitConfigData[];skills:Record<string,SkillConfigData>;equipment:EquipmentConfigData[];
  economy:EconomyConfig;levelUpExp:number[];xpPurchase:{gold:number;exp:number};
  refreshCost:number;initialHealth:number;maxEquipment:number;
}
export interface BotObservation extends PlayerObservation {
  catalog:BotCatalog;
  currentEnemyPreview:WaveEnemy[];
  waveKind:WaveKind;
}
export interface BotPlayerPort extends RunPlayerPort { observe():BotObservation }
