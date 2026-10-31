import type { UnitConfigData } from './ConfigManager';
import type { OwnedUnit } from './OwnedUnits';
export function professionConfig(base:UnitConfigData, owned:Pick<OwnedUnit,'profession'>):UnitConfigData {
  const choice=owned.profession&&base.professionChoice?.[owned.profession];
  return choice?{...base,...choice,grantedTraitIds:[...(base.grantedTraitIds??[]).filter(id=>!Object.values(base.professionChoice??{}).some(v=>v.classTraitId===id)),choice.classTraitId]}:base;
}
