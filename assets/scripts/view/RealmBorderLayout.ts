import {BoardGeometry} from './BoardGeometry';
import {projectBoardPoint} from './BoardPresentation';

/** The four projected floor edges, shared by initial deployment and the lasting realm. */
export function realmBorderLayout(columns:number,rows:number,size:number) {
  const geometry=new BoardGeometry(columns,rows,size),points=geometry.cells.flatMap(c=>c.polygon),inset=size*.15;
  const left=Math.min(...points.map(p=>p.x))+inset,right=Math.max(...points.map(p=>p.x))-inset;
  const bottom=Math.min(...points.map(p=>p.y))+inset,top=Math.max(...points.map(p=>p.y))-inset;
  const corners=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}].map(projectBoardPoint);
  return corners.map((from,index)=>{
    const to=corners[(index+1)%4];
    return {from,to,x:(from.x+to.x)/2,y:(from.y+to.y)/2,width:Math.hypot(to.x-from.x,to.y-from.y),angle:Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI};
  });
}
