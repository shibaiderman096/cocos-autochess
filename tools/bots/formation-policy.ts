import {hexDist} from '../../assets/scripts/battle/HexMath';
import type {BotObservation,BotPlayerPort} from '../../assets/scripts/core/BotObservation';
import type {ActionAttempt,RunAction} from '../../assets/scripts/core/RunSessionTypes';
import type {BotConfig} from './types';
import {ownedQuality,roleOf,unitConfig} from './evaluation';
import {selectRoster} from './roster-policy';

export function formationCells(o:BotObservation,c:BotConfig):Array<{uid:number;x:number;y:number}> {
  const roster=selectRoster(o,c).sort((a,b)=>{
    const order=(u:typeof a)=>{const role=roleOf(unitConfig(u.unitId,o),o);return role==='tank'?0:role==='melee'||role==='assassin'?1:2;};
    return order(a)-order(b)||ownedQuality(b,o)-ownedQuality(a,o)||a.uid-b.uid;
  });
  const visible=o.currentEnemyPreview,enemyCenter=visible.length?visible.reduce((n,e)=>n+e.x,0)/visible.length:(o.boardWidth-1)/2;
  const assassins=visible.filter(e=>{const cfg=unitConfig(e.unitId,o);return cfg&&(roleOf(cfg,o)==='assassin');});
  const aoe=visible.some(e=>{const cfg=unitConfig(e.unitId,o);return cfg?.skillId&&o.catalog.skills[cfg.skillId]?.radius>0;});
  const center=c.formation==='counter'?Math.round(enemyCenter):Math.floor(o.boardWidth/2),used:Array<{uid:number;x:number;y:number}>=[];
  for(const unit of roster){const role=roleOf(unitConfig(unit.unitId,o),o),ranged=role==='ranged'||role==='mage';
    const cells=[];for(let y=0;y<o.ownRows;y++)for(let x=0;x<o.boardWidth;x++)if(!used.some(p=>p.x===x&&p.y===y))cells.push({x,y});
    const preferredY=ranged?(c.formation==='rows'?1:0):o.ownRows-1;
    const score=(p:{x:number;y:number})=>{
      let value=-Math.abs(p.y-preferredY)*3-Math.abs(p.x-center)*.2;
      if(c.formation!=='rows'&&ranged){for(const other of used.filter(p=>{const owned=roster.find(u=>u.uid===p.uid)!;const role=roleOf(unitConfig(owned.unitId,o),o);return role==='mage'||role==='ranged';}))if(hexDist(p,other)<2)value-=aoe&&c.formation==='counter'?8:4;}
      if(c.formation==='counter'&&ranged&&assassins.length){
        value+=Math.min(...assassins.map(a=>Math.abs(a.x-p.x)))*.35;
        const tanks=used.filter(p=>roleOf(unitConfig(roster.find(u=>u.uid===p.uid)!.unitId,o),o)==='tank');
        if(tanks.length)value-=Math.min(...tanks.map(t=>hexDist(p,t)))*.25;
      }
      return value;
    };
    cells.sort((a,b)=>score(b)-score(a)||b.y-a.y||a.x-b.x);used.push({uid:unit.uid,...cells[0]});
  }
  return used;
}
export function deploy(player:BotPlayerPort,c:BotConfig,actions:ActionAttempt[]):void {
  const o=player.observe(),targets=formationCells(o,c),selected=new Set(targets.map(t=>t.uid));
  const act=(action:RunAction)=>{const result=player.act(action);actions.push({action,result});return result.ok;};
  for(const target of targets){let view=player.observe(),unit=view.units.find(u=>u.uid===target.uid);if(!unit)continue;
    if(unit.location==='board'&&unit.x===target.x&&unit.y===target.y)continue;
    const occupant=view.units.find(u=>u.location==='board'&&u.x===target.x&&u.y===target.y);
    if(unit.location==='bench'&&!occupant&&view.units.filter(u=>u.location==='board').length>=view.unitCap){
      const outgoing=view.units.find(u=>u.location==='board'&&!selected.has(u.uid));if(!outgoing)continue;
      if(!act({type:'move',uid:unit.uid,to:{location:'board',x:outgoing.x,y:outgoing.y}}))continue;
      view=player.observe();unit=view.units.find(u=>u.uid===target.uid);if(!unit)continue;
    }
    act({type:'move',uid:unit.uid,to:{location:'board',x:target.x,y:target.y}});
  }
}
