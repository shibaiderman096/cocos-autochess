import type { UnitConfigData } from '../../assets/scripts/core/ConfigManager';
import type { PowerEnvironment, PowerRequest } from '../../assets/scripts/core/EnemyPowerTypes';

export const CALIBRATION_VERSION = 'enemy-power-v1';
export type CalibrationMode = 'mirror' | 'unit' | 'star' | 'equipment' | 'team' | 'full';
export interface CalibrationCase {
  id: string;
  mode: Exclude<CalibrationMode, 'full'>;
  category: 'mirror' | 'unit' | 'star' | 'single' | 'combo' | 'team';
  a: PowerRequest[];
  b: PowerRequest[];
  labels: string[];
}
export const environments: PowerEnvironment[] = ['close','medium','far'];
export const singlePositions = [
  [{x:3,y:3},{x:3,y:4}], [{x:1,y:2},{x:5,y:5}], [{x:0,y:0},{x:6,y:7}],
];
export const combinationSets = [
  ['guinsoo','guinsoo'],['totem_of_undying','totem_of_undying'],['guinsoo','jeweled_gauntlet'],
  ['guinsoo','infinity_edge'],['jeweled_gauntlet','infinity_edge'],
  ['guinsoo','guinsoo','infinity_edge'],['guinsoo','jeweled_gauntlet','totem_of_undying'],
  ['jeweled_gauntlet','infinity_edge','totem_of_undying'],['guinsoo','guinsoo','guinsoo'],
  ['totem_of_undying','totem_of_undying','totem_of_undying'],
];
export const variantKey = (u: PowerRequest) => `${u.unitId}|${u.star}|${(u.equipment ?? []).slice().sort().join('+')}`;
export function analysisTags(u: UnitConfigData, skills: Record<string, any>): string[] {
  const skill = u.skillId ? skills[u.skillId] : undefined;
  return [...new Set([u.range > 1 ? 'ranged' : 'melee', ...(u.role === 'tank' || u.id === 'guardian' ? ['tank'] : []),
    ...(u.role === 'caster' ? ['mage'] : []), ...(u.role === 'assassin' ? ['assassin'] : []),
    ...(skill?.radius > 0 ? ['aoe'] : []), ...(skill?.effect === 'damageStun' ? ['control'] : []),
    ...(skill?.effect === 'healChannel' ? ['self-healing'] : []), ...(skill?.effect === 'teleportEmpower' ? ['teleport'] : [])])];
}
export function buildCalibrationCases(units: UnitConfigData[], equipmentIds: string[], mode: CalibrationMode = 'full'): CalibrationCase[] {
  const all: CalibrationCase[] = [];
  const v = (unitId: string, star: number, equipment: string[] = []): PowerRequest => ({ unitId, star, equipment });
  const add = (category: CalibrationCase['category'], a: PowerRequest[], b: PowerRequest[], labels: string[] = []) => {
    const mode = category === 'single' || category === 'combo' ? 'equipment' : category;
    all.push({id:`${category}:${all.length}`,mode,category,a,b,labels});
  };
  for (const unit of units) {
    for (const star of [1,2]) for (const items of [[], ...equipmentIds.map(id => [id])]) add('mirror',[v(unit.id,star,items)],[v(unit.id,star,items)]);
    add('mirror',[v(unit.id,3)],[v(unit.id,3)]);
  }
  for (const star of [1,2]) for (let i=0;i<units.length;i++) for (let j=i+1;j<units.length;j++) add('unit',[v(units[i].id,star)],[v(units[j].id,star)]);
  for (const unit of units) {
    for (const [a,b] of [[1,2],[2,3],[1,3]]) add('star',[v(unit.id,a)],[v(unit.id,b)]);
    for (const star of [1,2,3]) for (const item of equipmentIds) add('single',[v(unit.id,star)],[v(unit.id,star,[item])]);
    for (const star of [1,2]) for (const items of combinationSets) {
      if (items.every(id=>equipmentIds.includes(id))) add('combo',[v(unit.id,star)],[v(unit.id,star,items)]);
    }
  }
  const archetypes: Record<string,string[]> = {
    frontline_backline:['warrior','ranger','guardian','archer','mage'],
    melee:['duelist','warrior','sasuke','guardian','sakura'],
    ranged:['archer','scout','ranger','young_sasuke','archer'],
    aoe:['guardian','mage','shaman','duelist','sorcerer'],
    control:['guardian','itachi','archer','sakura','ranger'],
    self_healing:['sakura','ranger','guardian','sakura','mage'],
    teleport:['enderman','scout','warrior','ranger','duelist'],
  };
  const keys=Object.keys(archetypes), available=new Set(units.map(u=>u.id));
  for(const size of [2,3,5]) for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const a=archetypes[keys[i]].slice(0,size),b=archetypes[keys[j]].slice(0,size);
    if([...a,...b].every(id=>available.has(id)))add('team',a.map(id=>v(id,2)),b.map(id=>v(id,2)),[keys[i],keys[j],`${size}v${size}`]);
  }
  if (archetypes.frontline_backline.every(id=>available.has(id))) for(const item of equipmentIds) {
    const a=archetypes.frontline_backline.slice(0,3).map(id=>v(id,2));
    const b=a.map((u,i)=>v(u.unitId,2,i===1?[item]:[]));add('team',a,b,['frontline_backline','equipped','3v3']);
  }
  // Smoke exposed the limits of one-on-one scaling for special three-star skills.
  const escorts=['warrior','archer','guardian','scout'];
  if(['enderman','itachi','sakura',...escorts].every(id=>available.has(id))){
    const carry=(id:string)=>[v(id,3),...escorts.map(u=>v(u,1))];
    add('team',carry('enderman'),['champion','duelist','ranger','guardian','mage'].map(u=>v(u,3)),['special-three-star','teleport','5v5']);
    add('team',carry('enderman'),Array.from({length:5},()=>v('enderman',2)),['special-three-star','teleport-mirror-tier','5v5']);
    add('team',carry('itachi'),archetypes.frontline_backline.map(u=>v(u,2)),['special-three-star','control','5v5']);
    add('team',carry('sakura'),archetypes.melee.map(u=>v(u,2)),['special-three-star','self-healing','5v5']);
  }
  return mode === 'full' ? all : all.filter(c=>c.mode===mode);
}
