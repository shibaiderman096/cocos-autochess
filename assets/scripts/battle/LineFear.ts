import { offsetToWorld } from './HexMath';
import type { Pos } from './types';

/** Cell-center strip: one grid spacing wide, finite length, no rear/adjacent splash. */
export function inFearLine(origin: Pos, direction: Pos, candidate: Pos, length: number, width: number): boolean {
  const a=offsetToWorld(origin.x,origin.y,1,0,0), b=offsetToWorld(direction.x,direction.y,1,0,0), p=offsetToWorld(candidate.x,candidate.y,1,0,0);
  const dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);if(n===0)return false;
  const x=p.x-a.x,y=p.y-a.y,forward=(x*dx+y*dy)/n,lateral=Math.abs(x*dy-y*dx)/n;
  return forward>1e-8 && forward<=length*Math.sqrt(3)+1e-8 && lateral<width*Math.sqrt(3)/2-1e-8;
}
