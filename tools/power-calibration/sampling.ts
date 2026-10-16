import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ConfigManager } from '../../assets/scripts/core/ConfigManager';
import { BattleSim } from '../../assets/scripts/battle/BattleSim';
import type { Placement } from '../../assets/scripts/battle/BattleSim';
import { CombatStatistics } from '../../assets/scripts/battle/CombatStatistics';
import type { RunInputs } from '../run-simulation';
import type { CalibrationCase } from './fixtures';
import { CALIBRATION_VERSION, singlePositions } from './fixtures';

export const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
export function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export interface Provenance { version: string; configHash: string; sourceHash: string; sourceHashes: Record<string,string> }
export function provenance(inputs: RunInputs, root: string): Provenance {
  const files=['assets/scripts/core/ConfigManager.ts','assets/scripts/core/Rng.ts','assets/scripts/core/EnemyPowerTypes.ts',
    'assets/scripts/core/EnemyPowerModel.ts','tools/calibrate-enemy-power.ts',
    ...readdirSync(join(root,'assets/scripts/battle')).filter(f=>f.endsWith('.ts')).map(f=>'assets/scripts/battle/'+f),
    ...readdirSync(join(root,'tools/power-calibration')).filter(f=>f.endsWith('.ts')).map(f=>'tools/power-calibration/'+f)];
  const sourceHashes=Object.fromEntries(files.sort().map(file=>[file,sha256(readFileSync(join(root,file)))]));
  return {version:CALIBRATION_VERSION,configHash:sha256(canonical(inputs)),sourceHash:sha256(canonical(sourceHashes)),sourceHashes};
}
export interface SideMetrics {
  initialHp: number; remainingHp: number; hpFraction: number; damage: number; taken: number; healing: number;
  physical: number; magic: number; trueDamage: number; casts: number; stunAppliedSeconds: number; teleports: number; shieldGranted: number;
}
export interface BattleSample {
  outcome: number; ticks: number; seconds: number; timeout: number; logResourceRatio: number; censored: number;
  a: SideMetrics; b: SideMetrics; aSide: 0 | 1; aFirst: boolean;
}
export interface SeedBlock { seed: number; environment: number; samples: BattleSample[] }
export interface CaseSamples { fixture: CalibrationCase; blocks: SeedBlock[] }

const teamCells=[
  [{x:3,y:3},{x:2,y:2},{x:4,y:2},{x:1,y:1},{x:5,y:1}],
  [{x:1,y:3},{x:5,y:2},{x:3,y:1},{x:0,y:0},{x:6,y:0}],
  [{x:0,y:3},{x:6,y:3},{x:0,y:0},{x:6,y:0},{x:3,y:0}],
];
export function placementsFor(cfg: ConfigManager, fixture: CalibrationCase, environment: number, flip: boolean, reverse: boolean): {placements: Placement[]; aSide: 0 | 1} {
  if (cfg.battle.boardWidth !== 7 || cfg.battle.boardHeight !== 8 || cfg.battle.ownRows !== 4) throw new Error('Calibration fixtures require the current 7x8 odd-r board');
  const single=fixture.a.length===1 && fixture.b.length===1;
  const lower=single?[singlePositions[environment][0]]:teamCells[environment];
  const upper=single?[singlePositions[environment][1]]:lower.map(p=>({x:6-p.x,y:7-p.y}));
  const aSide=flip?1:0;
  const place=(members:CalibrationCase['a'],side:0|1):Placement[]=>members.map((u,i)=>({cfg:cfg.getUnit(u.unitId),side,
    ...(side===0?lower[i]:upper[i]),star:u.star,equipment:u.equipment}));
  const a=place(fixture.a,aSide),b=place(fixture.b,aSide===0?1:0);
  const placements=reverse?[...b,...a]:[...a,...b],cells=new Set<string>();
  for(const p of placements){const key=`${p.x},${p.y}`;if(cells.has(key)||p.y<0||p.y>=8||p.x<0||p.x>=7||(p.side===0?p.y>=4:p.y<4))throw new Error('Illegal calibration fixture');cells.add(key);}
  return {placements,aSide};
}
export function simulateSample(cfg: ConfigManager, fixture: CalibrationCase, seed: number, env: number, flip: boolean, reverse: boolean): BattleSample {
  const {placements,aSide}=placementsFor(cfg,fixture,env,flip,reverse);
  const sim=new BattleSim(cfg,placements,{seed,w:cfg.battle.boardWidth,h:cfg.battle.boardHeight,maxTicks:cfg.battle.maxTicks});
  const hp=[0,0];for(const u of sim.units)hp[u.side]+=u.cfg.hp;
  const result=sim.run(),stats=new CombatStatistics();stats.begin(sim.units);stats.consume(result.events);
  const rows=stats.snapshot();
  const metric=(side:0|1):SideMetrics=>{
    const units=sim.units.filter(u=>u.side===side),ids=new Set(units.map(u=>u.id)),source=rows.filter(r=>r.side===side);
    const remainingHp=units.filter(u=>u.alive).reduce((n,u)=>n+u.hp,0);
    return {initialHp:hp[side],remainingHp,hpFraction:remainingHp/hp[side],
      damage:source.reduce((n,r)=>n+r.damage,0),taken:source.reduce((n,r)=>n+r.taken,0),healing:source.reduce((n,r)=>n+r.healing,0),
      physical:source.reduce((n,r)=>n+r.damageByType.physical,0),magic:source.reduce((n,r)=>n+r.damageByType.magic,0),trueDamage:source.reduce((n,r)=>n+r.damageByType.true,0),
      casts:result.events.filter(e=>e.t==='cast'&&ids.has(e.id)).length,
      stunAppliedSeconds:result.events.reduce((n,e)=>n+(e.t==='stun'&&ids.has(e.source)?e.duration:0),0),
      teleports:result.events.filter(e=>e.t==='teleport'&&ids.has(e.id)).length,
      shieldGranted:result.events.reduce((n,e)=>n+(e.t==='equipment_trigger'&&ids.has(e.id)?e.shield:0),0)};
  };
  const a=metric(aSide),b=metric(aSide===0?1:0);
  // A declared measurement proxy, not a hidden stat adjustment: sqrt(resource pool x delivered damage).
  // Shared elapsed time cancels in the damage-rate ratio; one HP smooths zero-damage censored samples.
  const logResourceRatio=0.5*Math.log((a.initialHp+a.healing)/(b.initialHp+b.healing)) + 0.5*Math.log((a.damage+1)/(b.damage+1));
  return {outcome:result.winner===-1?0.5:result.winner===aSide?1:0,ticks:result.ticks,seconds:result.ticks*cfg.battle.tickMs/1000,
    timeout:result.winner===-1&&result.ticks>=cfg.battle.maxTicks?1:0,logResourceRatio,censored:a.damage===0||b.damage===0?1:0,a,b,aSide,aFirst:!reverse};
}
export function sampleCacheKey(prov: Provenance, fixture: CalibrationCase, seedStart: number, seedCount: number): string {
  return sha256(canonical({version:prov.version,sourceHash:prov.sourceHash,configHash:prov.configHash,fixture,
    positions:{singlePositions,teamCells},seedStart,seedCount,seedSequence:'ascending; environment=offset%3',orientations:'side x instance-order: 4'}));
}
export function sampleCase(cfg: ConfigManager, fixture: CalibrationCase, prov: Provenance, seedStart: number, seedCount: number, cache?: string): {data:CaseSamples;actual:number;cached:number;corruptions:number} {
  const key=sampleCacheKey(prov,fixture,seedStart,seedCount),file=cache?resolve(cache,key+'.json.gz'):undefined;
  let corruptions=0;
  if(file&&existsSync(file)){
    try{
      const stored=JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
      if(stored.key!==key||stored.digest!==sha256(canonical(stored.blocks))||stored.blocks.length!==seedCount)throw new Error('Cache integrity mismatch');
      for(let i=0;i<stored.blocks.length;i++){
        const b=stored.blocks[i];if(b.seed!==seedStart+i||b.environment!==i%3||b.samples.length!==4)throw new Error('Cache seed/placement mismatch');
        if(b.samples.some((s:BattleSample)=>!Number.isFinite(s.logResourceRatio)||!Number.isFinite(s.a.damage)||!Number.isFinite(s.b.damage)))throw new Error('Nonfinite cache data');
      }
      return {data:{fixture,blocks:stored.blocks},actual:0,cached:seedCount*4,corruptions};
    }catch{corruptions++;}
  }
  const blocks:SeedBlock[]=[];
  for(let offset=0;offset<seedCount;offset++){
    const seed=seedStart+offset,environment=offset%3,samples:BattleSample[]=[];
    for(const flip of [false,true])for(const reverse of [false,true])samples.push(simulateSample(cfg,fixture,seed,environment,flip,reverse));
    blocks.push({seed,environment,samples});
  }
  if(file){mkdirSync(cache!,{recursive:true});writeFileSync(file,gzipSync(JSON.stringify({key,digest:sha256(canonical(blocks)),blocks})));}
  return {data:{fixture,blocks},actual:seedCount*4,cached:0,corruptions};
}
