import type {RunSession} from '../../assets/scripts/core/RunSession';
import {POOL_STOCK,validCost} from '../../assets/scripts/core/ShopConfig';
export function equipmentCount(s:RunSession):number{return s.owned.equipmentReserve.length+s.owned.all().reduce((n,u)=>n+(u.equipment?.length??0),0);}
export function assertLegalSession(s:RunSession):void {
  const fail=(message:string)=>{throw Error('BOT_LEGALITY: '+message);},owned=s.owned.all(),board=s.owned.onBoard();
  if(!Number.isSafeInteger(s.economy.gold)||s.economy.gold<0)fail('invalid gold');
  if(board.length>s.level.unitCap)fail('population cap');
  if(new Set(owned.map(u=>u.uid)).size!==owned.length)fail('duplicate uid');
  const cells=new Set<string>();
  for(const u of owned){if(u.star<1||u.star>3||(u.equipment?.length??0)>3)fail('star or equipment slots');
    const key=u.location+':'+u.x+':'+u.y;if(cells.has(key))fail('overlapping owned cells');cells.add(key);
    if(u.location==='board'&&(u.x<0||u.x>=s.cfg.battle.boardWidth||u.y<0||u.y>=s.cfg.battle.ownRows))fail('board location');
    if(u.location==='bench'&&(u.x!==-1||u.y<0||u.y>=s.save.benchSlots))fail('bench location');
  }
  const pool=s.pool.snapshot(),shop=s.shop.snapshot();
  for(const cfg of s.cfg.allUnits()){
    const held=owned.filter(u=>u.unitId===cfg.id).reduce((n,u)=>n+3**(u.star-1),0),reserved=shop.filter(slot=>slot.unitId===cfg.id).length+(s.save.stageProgress?.unitReserve.filter(id=>id===cfg.id).length??0);
    if((pool[cfg.id]??0)+held+reserved!==POOL_STOCK[validCost(cfg.cost??1)])fail('card conservation: '+cfg.id);
  }
}
