import type { ConfigManager, SkillConfigData, UnitConfigData } from '../core/ConfigManager';
import type { Rng } from '../core/Rng';
import type { Unit } from './Unit';
import type { Pos } from './types';
import { dist } from './Pathfinding';

/** A release-time snapshot prevents new copies from becoming targets of the same cast. */
export function releaseStarCardCopies(caster: Unit, skill: SkillConfigData, configs: ConfigManager, rng: Rng,
  units: Unit[], width: number, height: number, occupied: (x:number,y:number)=>boolean,
  targetable: (unit:Unit)=>boolean, spawn: (target:Unit,pos:Pos,equipment:string[],healthFraction:number)=>void): void {
  const spec=skill.starCardCopy!, rank=Math.min(2,caster.star-1);
  const targets=units.filter(u=>u.side!==caster.side&&!u.temporaryCopy&&u.alive&&u.hp>0&&targetable(u)&&caster.canSelectEnemy(u)).sort((a,b)=>a.id-b.id);
  const count=caster.star>=spec.allEnemiesStar?targets.length:Math.min(spec.counts[rank],targets.length);
  for(let i=0;i<count;i++) {
    const target=targets.splice(rng.int(0,targets.length-1),1)[0];
    const cells:Pos[]=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!occupied(x,y))cells.push({x,y});
    const pos=cells.sort((a,b)=>dist(caster.pos,a)-dist(caster.pos,b)||a.y-b.y||a.x-b.x)[0];
    if(!pos)break;
    const base=target.copyBase??target.cfg;
    const pool=spec.equipmentPools[equipmentGroup(base)].filter(id=>{
      const item=configs.getEquipment([id])[0];
      return !item.consumable&&!item.traitChoice&&!item.unitCapBonus;
    }).slice().sort();
    const equipment:string[]=[];
    for(let j=0;j<spec.equipmentCounts[rank]&&pool.length;j++)equipment.push(pool.splice(rng.int(0,pool.length-1),1)[0]);
    spawn(target,pos,equipment,spec.healthFractions[rank]);
  }
}

function equipmentGroup(unit:UnitConfigData): 'physical'|'magic'|'tank' {
  if(unit.role==='tank'||unit.role==='magicTank')return 'tank';
  return unit.damageType==='magic'&&unit.maxMana>0&&!!unit.skillId?'magic':'physical';
}
