import { offsetToWorld, worldToOffset, hexDist } from './HexMath';
import type { Pos } from './types';

/** Samples a finite straight hex ray toward the current target, in either board orientation. */
export function stellarChargeRay(from: Pos, target: Pos, distance: number, width: number, height: number): Pos[] {
  const a=offsetToWorld(from.x,from.y,1,0,0),b=offsetToWorld(target.x,target.y,1,0,0);
  const length=hexDist(from,target);if(!length)return [];
  const cells:Pos[]=[],seen=new Set<string>();
  for(let step=1;step<=distance*40;step++){
    const t=step/40/length,cell=worldToOffset(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,1,0,0);
    const pos={x:cell.col,y:cell.row},key=`${pos.x},${pos.y}`;
    if(pos.x<0||pos.x>=width||pos.y<0||pos.y>=height)break;
    if(hexDist(from,pos)>distance)break;
    if((pos.x===from.x&&pos.y===from.y)||seen.has(key))continue;
    seen.add(key);cells.push(pos);
  }
  return cells;
}
