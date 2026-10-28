import type { UnitConfigData,SkillConfigData } from './ConfigManager';
import { EnemyPowerModel } from './EnemyPowerModel';
import { RunRandomContext } from './RunRandomContext';
import { stableEnemyJson, combatConfigurationIdentity } from './EnemyGenerationTypes';
import { FORMATION_VERSION, formationHash } from './EnemyFormationTypes';
import type { EnemyFormationConfig,EnemyRoleConfig,EnemyFormationContext,EnemyFormationResult } from './EnemyFormationTypes';
import { validateFormationConfig } from './FormationPolicy';
import { resolveEnemyRole,snapshotIdentity } from './EnemyRoles';
import { templateProblem } from './FormationTemplates';
import { hexDist,hexNeighbors } from '../battle/HexMath';
import { nextStep } from '../battle/Pathfinding';
import type { FormationScore,RoleEntry } from './EnemyFormationTypes';
import type { WaveEnemy } from './RoundFlow';

export function staticFormation(enemies:readonly WaveEnemy[],version=FORMATION_VERSION):EnemyFormationResult {
  return {placements:JSON.parse(JSON.stringify(enemies)),level:'L0',strength:0,version,
    diagnostics:{roleCounts:{},spacingViolations:0,fallbackSteps:[],templateId:null,templateUsed:false,templateSlotsMatched:0,templateSlotsAvailable:0,
      playerSnapshotUsed:false,playerSnapshotHash:null,counterReasons:[],score:{role:0,cover:0,spacing:0,flank:0,counter:0,template:0,total:0},iterations:0,roleDepthViolations:0,roles:[]}};
}

/** Independent position-only solver. It never imports EnemyGenerator or BattleSim. */
export class EnemyFormation {
  readonly config:EnemyFormationConfig;
  readonly roles:EnemyRoleConfig;
  readonly identity:string;
  readonly cells:Array<{x:number;y:number}>=[];
  private distances:number[][];
  private adjacent:boolean[][];
  constructor(config:EnemyFormationConfig,roles:EnemyRoleConfig,private roster:UnitConfigData[],private skills:Record<string,SkillConfigData>,
    private model:EnemyPowerModel,private baselineCells:Array<{x:number;y:number}>,savedIdentity?:string) {
    validateFormationConfig(config);
    if(!roles||!roles.version||!roles.units)throw new Error('Invalid enemy role configuration');
    this.config=JSON.parse(JSON.stringify(config));this.roles=JSON.parse(JSON.stringify(roles));
    for(let y=4;y<8;y++)for(let x=0;x<7;x++)this.cells.push({x,y});
    const currentIdentity=combatConfigurationIdentity({config,roles,baselineCells,units:roster.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),skills,
      board:{width:7,height:8,ownRows:4}});
    if(savedIdentity!==undefined&&savedIdentity!==currentIdentity)throw new Error('Saved formation configuration mismatch');
    this.identity=currentIdentity;
    this.distances=this.cells.map(a=>this.cells.map(b=>hexDist(a,b)));
    this.adjacent=this.cells.map(a=>this.cells.map(b=>hexNeighbors(a.x,a.y).some(p=>p.x===b.x&&p.y===b.y)));
  }
  private prepare(context:EnemyFormationContext) {
    if(!context.enemies.length||context.enemies.length>10)throw new Error('Formation requires 1 to 10 existing enemies');
    const settings=context.settings;
    if(!['L0','L1','L2','L3'].includes(settings.level))throw new Error('Invalid formation level');
    if(settings.level!=='L0'&&![settings.strength,settings.roleStrength,settings.spacingStrength,settings.counterStrength].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('Invalid formation strength');
    const rng=new RunRandomContext(context.runSeed).stream('formation',context.globalWaveId,parseInt(formationHash(this.identity+'|'+stableEnemyJson(settings)),16));
    const blank=staticFormation(context.enemies,this.config.version);
    if(context.waveKind!=='intro'&&settings.level==='L0')blank.placements=blank.placements.map((e,i)=>({...e,...this.baselineCells[i]}));
    if(settings.level==='L0'||context.waveKind==='intro')return {blank,rng};
    const fallback=blank.diagnostics.fallbackSteps,c=this.config,n=context.enemies.length;
    const available=context.candidateCells??this.cells;
    const allowed=available.map(p=>this.cells.findIndex(q=>p.x===q.x&&p.y===q.y)).sort((a,b)=>a-b);
    if(allowed.some(i=>i<0)||new Set(allowed).size!==allowed.length||allowed.length<n)throw new Error('Insufficient or illegal formation candidate cells');
    const units=context.enemies.map((e,index)=>{
      const unit=this.roster.find(u=>u.id===e.unitId);if(!unit)throw new Error('Unknown formation unit '+e.unitId);
      const role=resolveEnemyRole(unit,this.skills,this.roles),power=this.model.estimateUnitPower({unitId:e.unitId,cost:unit.cost,star:e.star,equipment:e.equipment}).power;
      return {index,unit,role,power,policy:c.roles[role.role]};
    });
    const sorted=units.slice().sort((a,b)=>a.policy.priority-b.policy.priority||b.power-a.power||(a.unit.id<b.unit.id?-1:a.unit.id>b.unit.id?1:0)||a.index-b.index);
    const maxPower=Math.max(...units.map(u=>u.power));
    const keys=units.filter(u=>c.keyRoles.includes(u.role.role)||(u.unit.range>1&&u.power>=maxPower*c.highPowerFraction)).map(u=>u.index);
    const tanks=units.filter(u=>u.role.role==='tank').map(u=>u.index);
    // L0/L1/L2 never even access playerSnapshot, including getters supplied by a caller.
    const snapshot=settings.level==='L3'?context.playerSnapshot:undefined;
    if(snapshot){
      const occupied=new Set<string>();
      if(!Array.isArray(snapshot.units)||snapshot.units.length>10)throw new Error('Invalid player formation snapshot');
      for(const p of snapshot.units){const key=p.x+','+p.y;if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=7||p.y<0||p.y>=4||occupied.has(key)
        ||typeof p.unitId!=='string'||!p.unitId||!Number.isInteger(p.star)||p.star<1||p.star>3||!Number.isFinite(p.range)||p.range<=0||!Array.isArray(p.equipment)||p.equipment.length>3||p.equipment.some(id=>typeof id!=='string')
        ||!Array.isArray(p.tags)||p.tags.some(t=>typeof t!=='string')||!Object.keys(c.roles).includes(p.role))throw new Error('Invalid player formation snapshot');occupied.add(key);}
    }
    const player=snapshot?.units??[],mages=player.filter(u=>u.role==='mage'&&u.y<=1).slice().sort((a,b)=>b.star-a.star||a.x-b.x||a.y-b.y);
    const rangedFraction=player.length?player.filter(u=>u.range>=3).length/player.length:0;
    let pairDistance=0,pairs=0;for(let i=0;i<player.length;i++)for(let j=i+1;j<player.length;j++){pairDistance+=hexDist(player[i],player[j]);pairs++;}
    const clustered=pairs>0&&pairDistance/pairs<=2;
    const center=player.slice().sort((a,b)=>player.reduce((s,p)=>s+hexDist(a,p),0)-player.reduce((s,p)=>s+hexDist(b,p),0)||a.y-b.y||a.x-b.x)[0];
    const reasons:string[]=[];
    if(mages.length&&units.some(u=>u.role.role==='assassin'||u.role.tags.includes('teleport')))reasons.push('EXISTING_ASSASSIN_TELEPORT_TO_BACKLINE_MAGE_LANE');
    if(rangedFraction>=.5&&units.some(u=>['melee_dps','assassin'].includes(u.role.role)))reasons.push('EXISTING_MELEE_FRONT_PRESSURE_VS_RANGED');
    if(clustered&&units.some(u=>u.role.tags.includes('aoe')||u.role.tags.includes('control')))reasons.push('EXISTING_AOE_CONTROL_TOWARD_CLUSTER_CENTER');
    if(settings.level==='L3'&&!snapshot)fallback.push('L3_SNAPSHOT_MISSING_USE_L2_SCORING');
    const assignments=new Map<number,number>();let templateId:string|null=null,templateSize=0;
    if(context.template&&c.templates.enabled&&c.templates.kinds.includes(context.waveKind)){
      templateId=context.template.id;const problem=templateProblem(context.template,allowed.map(i=>this.cells[i]));
      if(problem)fallback.push(problem+';USE_BASE_FORMATION');
      else {
        const slots=context.template.slots.map(p=>this.cells.findIndex(q=>q.x===p.x&&q.y===p.y)).sort((a,b)=>a-b),used=new Set<number>();templateSize=slots.length;
        for(const u of sorted){
          const options=slots.filter(i=>!used.has(i)&&u.policy.allowedDepth.includes(this.cells[i].y))
            .sort((a,b)=>Math.min(...u.policy.preferredDepth.map(y=>Math.abs(y-this.cells[a].y)))-Math.min(...u.policy.preferredDepth.map(y=>Math.abs(y-this.cells[b].y)))||a-b);
          if(options.length){assignments.set(u.index,options[0]);used.add(options[0]);}
        }
        if(slots.length<n)fallback.push('TEMPLATE_PARTIAL_FILL_REMAINING_WITH_SCORES');
        if(assignments.size<Math.min(n,slots.length))fallback.push('TEMPLATE_ROLE_MISMATCH_FILL_WITH_SCORES');
      }
    }
    const maxDist=10;
    const staticScores=units.map(u=>this.cells.map(cell=>{
      const preferred=Math.min(...u.policy.preferredDepth.map(y=>Math.abs(cell.y-y)));
      const depth=u.policy.allowedDepth.includes(cell.y)?1-preferred/4:0;
      const anchor=Math.max(0,1-hexDist(cell,context.enemies[u.index])/maxDist);
      let counter=0;
      if(snapshot&&settings.counterStrength>0){
        if(mages.length&&(u.role.role==='assassin'||u.role.tags.includes('teleport')))counter=.8*(1-hexDist(cell,mages[0])/maxDist)+.2*(1-Math.min(cell.x,6-cell.x)/3);
        if(rangedFraction>=.5&&['melee_dps','assassin'].includes(u.role.role)&&center){
          const target=mages[0]??center,step=nextStep(cell,7,8,(x,y)=>player.some(p=>p.x===x&&p.y===y),(x,y)=>hexDist({x,y},target)<=u.unit.range);
          const access=step||hexDist(cell,target)<=u.unit.range?1:.25;
          counter=Math.max(counter,(1-hexDist(cell,target)/maxDist)*(.75+.25*(7-cell.y)/3)*access);
        }
        if(clustered&&center&&(u.role.tags.includes('aoe')||u.role.tags.includes('control')))counter=Math.max(counter,1-hexDist(cell,center)/maxDist);
      }
      return {role:depth*settings.roleStrength+anchor*(1-settings.roleStrength),flank:u.policy.flank?1-Math.min(cell.x,6-cell.x)/3:0,counter,
        template:assignments.get(u.index)===this.cells.indexOf(cell)?1:0};
    }));
    const evaluate=(positions:number[]):FormationScore=>{
      let role=0,flank=0,counter=0,template=0,covered=0,near=0,keyPairs=0;
      for(let i=0;i<n;i++)if(positions[i]>=0){const s=staticScores[i][positions[i]];role+=s.role;flank+=s.flank;counter+=s.counter;template+=s.template;}
      for(const i of keys)if(positions[i]>=0){const a=this.cells[positions[i]];
        if(tanks.some(j=>positions[j]>=0&&this.cells[positions[j]].y<a.y&&(this.adjacent[positions[i]][positions[j]]||this.distances[positions[i]][positions[j]]<=c.coverDistance)))covered++;
        for(const j of keys)if(j>i&&positions[j]>=0){keyPairs++;if(this.distances[positions[i]][positions[j]]<c.spacingDistance)near++;}}
      const cover=keys.length?covered/keys.length:0,spacing=keyPairs?1-near/keyPairs:1;
      const w=c.weights,activeSpacing=settings.level==='L1'?0:settings.spacingStrength,activeCounter=snapshot?settings.counterStrength:0;
      const tw=assignments.size?w.template*settings.roleStrength:0;
      const total=(w.role*role/n+w.flank*settings.roleStrength*flank/n+w.cover*settings.roleStrength*cover+w.spacing*activeSpacing*spacing
        +w.counter*activeCounter*counter/n+tw*template/n)/(w.role+w.flank*settings.roleStrength+w.cover*settings.roleStrength+w.spacing*activeSpacing+w.counter*activeCounter+tw);
      return {role:role/n,cover,spacing,flank:flank/n,counter:counter/n,template:template/n,total};
    };
    return {blank,rng,settings,fallback,c,n,allowed,units,sorted,keys,assignments,templateId,templateSize,snapshot,reasons,evaluate};
  }
  score(context:EnemyFormationContext,placements:readonly {x:number;y:number}[]):FormationScore {
    const p=this.prepare(context);if(!p.evaluate)return p.blank.diagnostics.score;
    const positions=placements.map(cell=>this.cells.findIndex(q=>q.x===cell.x&&q.y===cell.y));
    if(positions.length!==context.enemies.length||positions.some(i=>i<0)||new Set(positions).size!==positions.length)throw new Error('Invalid positions for formation scoring');
    return p.evaluate(positions);
  }
  solve(context:EnemyFormationContext):EnemyFormationResult {
    const p=this.prepare(context);if(!p.evaluate)return p.blank;
    const {c,n,allowed,units,sorted,keys,evaluate}=p;
    let positions=Array(n).fill(-1) as number[];const relaxed=new Set<number>();
    for(const u of sorted){
      const free=allowed.filter(i=>!positions.includes(i)),preferred=free.filter(i=>u.policy.allowedDepth.includes(this.cells[i].y));
      if(!preferred.length){relaxed.add(u.index);p.fallback.push('RELAX_ROLE_DEPTH@'+u.index);}
      const options=(preferred.length?preferred:free).map(i=>{const next=positions.slice();next[u.index]=i;return {i,score:evaluate(next).total};})
        .sort((a,b)=>b.score-a.score||a.i-b.i);
      const tied=options.filter(o=>o.score>=options[0].score-c.tieTolerance).slice(0,c.tieTopK);
      positions[u.index]=tied[p.rng.int(0,tied.length-1)].i;
    }
    let iterations=0;
    const legal=(unit:number,cell:number)=>relaxed.has(unit)||units[unit].policy.allowedDepth.includes(this.cells[cell].y);
    for(;iterations<c.maxIterations;iterations++){
      let best=positions,bestScore=evaluate(positions).total;
      const consider=(next:number[])=>{const score=evaluate(next).total;if(score>bestScore+c.tieTolerance){best=next;bestScore=score;}};
      for(let i=0;i<n;i++)for(const cell of allowed)if(!positions.includes(cell)&&legal(i,cell)){const next=positions.slice();next[i]=cell;consider(next);}
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(legal(i,positions[j])&&legal(j,positions[i])){const next=positions.slice();[next[i],next[j]]=[next[j],next[i]];consider(next);}
      if(best===positions)break;positions=best;
    }
    let violations=0;for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)if(this.distances[positions[keys[i]]][positions[keys[j]]]<c.spacingDistance)violations++;
    const score=evaluate(positions);
    if(keys.length&&units.some(u=>u.role.role==='tank')&&score.cover<1)p.fallback.push('PARTIAL_COVER_KEEP_ROLE_DIRECTION');
    if(context.settings.level!=='L1'&&violations)p.fallback.push('SPACING_SOFT_CONSTRAINT_RETAIN_LEGAL_ROLE_CELLS');
    const matched=Array.from(p.assignments).filter(([unit,cell])=>positions[unit]===cell).length;
    const roleCounts:Record<string,number>={};for(const u of units)roleCounts[u.role.role]=(roleCounts[u.role.role]??0)+1;
    return {placements:context.enemies.map((e,i)=>({...JSON.parse(JSON.stringify(e)),...this.cells[positions[i]]})),level:p.settings.level,strength:p.settings.strength,version:c.version,
      diagnostics:{roleCounts,spacingViolations:violations,fallbackSteps:p.fallback,templateId:p.templateId,templateUsed:matched>0,templateSlotsMatched:matched,templateSlotsAvailable:p.templateSize,
        playerSnapshotUsed:!!p.snapshot,playerSnapshotHash:p.snapshot?snapshotIdentity(p.snapshot):null,counterReasons:p.reasons,score,iterations,
        roleDepthViolations:positions.filter((cell,i)=>!units[i].policy.allowedDepth.includes(this.cells[cell].y)).length,
        roles:units.map(u=>({index:u.index,unitId:u.unit.id,role:u.role.role,power:u.power,source:u.role.source,confidence:u.role.confidence}))}};
  }
}
