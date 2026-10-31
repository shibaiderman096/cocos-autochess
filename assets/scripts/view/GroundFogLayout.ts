import {BoardGeometry} from './BoardGeometry';
import {projectBoardPoint} from './BoardPresentation';

/** Sample the floor itself. Thin bands preserve the same perspective as the playable cells. */
export function groundFogLayout(columns:number,rows:number,size:number,count=96) {
  const geometry=new BoardGeometry(columns,rows,size),points=geometry.cells.flatMap(c=>c.polygon);
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
  const bottom=Math.min(...points.map(p=>p.y)),top=Math.max(...points.map(p=>p.y));
  return Array.from({length:count},(_,index)=>{
    const a=top-(top-bottom)*index/count,b=top-(top-bottom)*(index+1)/count;
    const middle=(a+b)/2,l=projectBoardPoint({x:left,y:middle}),r=projectBoardPoint({x:right,y:middle});
    const high=projectBoardPoint({x:0,y:a}),low=projectBoardPoint({x:0,y:b});
    return {index,x:(l.x+r.x)/2,y:(high.y+low.y)/2,width:r.x-l.x,height:high.y-low.y};
  });
}
