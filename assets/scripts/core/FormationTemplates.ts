import type { WaveConfig } from './RoundFlow';
import type { FormationTemplate } from './EnemyFormationTypes';

/** Deliberately reads coordinates only: old heroes, stars, scaling and gear never enter a template. */
export function extractFormationTemplates(waves:readonly WaveConfig[]):FormationTemplate[] {
  return waves.map((wave,index)=>({id:'legacy-shape-'+(index+1),slots:wave.enemies.map(e=>({x:e.x,y:e.y}))}));
}
export function templateProblem(template:FormationTemplate,cells:readonly {x:number;y:number}[]):string|null {
  if(!template||typeof template.id!=='string'||!Array.isArray(template.slots)||!template.slots.length)return 'EMPTY_OR_MALFORMED_TEMPLATE';
  const keys=new Set(cells.map(p=>p.x+','+p.y)),seen=new Set<string>();
  for(const p of template.slots){if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||!keys.has(p.x+','+p.y))return 'TEMPLATE_OUTSIDE_LEGAL_ENEMY_HEX';
    const key=p.x+','+p.y;if(seen.has(key))return 'TEMPLATE_DUPLICATE_HEX';seen.add(key);}
  return null;
}
