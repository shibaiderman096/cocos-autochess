import {ShadowGroundFog} from './ShadowGroundFog';
import {RolePaintedVfx} from './RolePaintedVfx';
import type {PaintedAtlas} from './RolePaintedVfx';
import {basicAttackLook} from './BasicAttackArt';
import { _decorator, Component, Node, Vec3, Color, Sprite, SpriteFrame, UITransform, UIOpacity, resources } from 'cc';
import { BattleSim } from '../battle/BattleSim';
import { BattleEvent } from '../battle/types';
import { UnitView } from './UnitView';
import { FloatText, FloatTextPool } from './FloatText';
import { BoardView } from './BoardView';
import { FX_SPRITE, UNIT_ART } from './ArtPaths';
import { ShadowSkillVfx } from './ShadowSkillVfx';
import { SunlightVfx } from './SunlightVfx';
import { SunlightSpriteVfx } from './SunlightSpriteVfx';
import { MechanicalVfx } from './MechanicalVfx';
import { BloodfiendVfx } from './BloodfiendVfx';
import { AstralVfx } from './AstralVfx';
import { AstralUnitVfx } from './AstralUnitVfx';
import { ExplorerUnitVfx } from './ExplorerUnitVfx';
import { RunicArcanaVfx } from './RunicArcanaVfx';
import { DemonVfx } from './DemonVfx';
import { DemonRosterVfx } from './DemonRosterVfx';
import { ExplorerSkillVfx } from './ExplorerSkillVfx';
import { ExplorerSpriteVfx } from './ExplorerSpriteVfx';
import { ropeHuntPoint } from '../battle/RopeHunt';
import { GameAudio } from './GameAudio';
import { unitAttackSound, unitCastSound } from './UnitAudio';

const { ccclass } = _decorator;
interface MoveVisual { from: Vec3; to: Vec3; startTick: number; durationTicks: number }

/**
 * 战斗回放器：消费 sim.events，把逻辑事件映射到 UnitView 表现。
 */
@ccclass('BattleReplayer')
export class BattleReplayer extends Component {
  damageNumbers = true;
  healingNumbers = true;
  private sim: BattleSim;
  private eventCursor = 0;
  private unitViews = new Map<number, UnitView>();
  private cellSize = 64;
  private fxRoot: Node;
  private boardView: BoardView;
  private moves = new Map<number, MoveVisual>();
  private knightLeaps = new Set<number>();
  private renderTick = 0;
  private eventTick=0;
  private spriteFx:Array<{node:Node;sprite:Sprite;opacity:UIOpacity;lease:number;path?:string;start:number;duration:number;from:Vec3;to:Vec3;projectile:boolean}>=[];
  private spriteFrames=new Map<string,SpriteFrame>();
  private spriteLoads=new Map<string,Promise<SpriteFrame|null>>();
  private tickMs = 50;
  private shadowFog: ShadowGroundFog | null = null;
  private shadowSkillVfx: ShadowSkillVfx | null = null;
  private sunlightVfx: SunlightVfx | null = null;
  private sunlightSprites: SunlightSpriteVfx | null = null;
  private mechanicalSprites: MechanicalVfx | null = null;
  private bloodfiendSprites: BloodfiendVfx | null = null;
  private astralVfx: AstralVfx | null = null;
  private astralUnitVfx: AstralUnitVfx | null = null;
  private explorerUnitVfx: ExplorerUnitVfx | null = null;
  private explorerSkillVfx: ExplorerSkillVfx | null = null;
  private dragonVfx:RolePaintedVfx|null=null;
  private runicVfx: RunicArcanaVfx | null = null;
  private demonVfx: DemonVfx | null = null;
  private demonRosterVfx: DemonRosterVfx | null = null;
  private explorerSprites: ExplorerSpriteVfx | null = null;
  private stellarKnockups = new Map<number, {tick:number;duration:number}>();

  bind(sim: BattleSim, views: Map<number, UnitView>, cellSize: number, boardView: BoardView, tickMs = 50) {
    this.clearSpriteFx(true);
    this.demonRosterVfx?.destroy();this.demonRosterVfx=null;
    this.demonVfx?.destroy();this.demonVfx=null;
    this.dragonVfx?.destroy();this.dragonVfx=null;
    this.runicVfx?.destroy();this.runicVfx=null;
    this.explorerSprites?.destroy();this.explorerSprites=null;
    this.explorerSkillVfx?.destroy();this.explorerSkillVfx=null;
    this.explorerUnitVfx?.destroy();this.explorerUnitVfx=null;
    this.astralUnitVfx?.destroy();this.astralUnitVfx=null;
    this.clearStellar();
    this.astralVfx?.clear(); this.astralVfx = null;
    this.clearShadowFog();
    this.mechanicalSprites?.destroy(); this.mechanicalSprites = null;
    this.bloodfiendSprites?.destroy(); this.bloodfiendSprites = null;
    this.shadowSkillVfx?.destroy(); this.shadowSkillVfx = null;
    this.sunlightVfx?.destroy(); this.sunlightVfx = null;
    this.sunlightSprites?.destroy(); this.sunlightSprites = null;
    for(const v of views.values())v.resetCombatAnimation?.();
    this.sim = sim;
    this.unitViews = views;
    this.cellSize = cellSize;
    this.boardView = boardView;
    this.tickMs = tickMs;
    this.eventCursor = 0;
    this.moves.clear(); this.knightLeaps.clear(); this.renderTick = sim.tick;
  }

  /** Preparation has no consumed battle events; retain idle FX and their live lookups. */
  bindPreview(sim: BattleSim, views: Map<number, UnitView>): void {
    this.clearSpriteFx();for(const view of views.values())view.resetCombatAnimation?.();
    this.sim = sim; this.unitViews = views;
    this.eventCursor = 0; this.moves.clear(); this.knightLeaps.clear(); this.renderTick = sim.tick;
  }

  setFxRoot(root: Node): void {
    this.fxRoot = root;
    const demonAssets=this.sim?.units.flatMap(u=>{const asset=DemonRosterVfx.asset(u.cfg.skillId??'');return asset?[asset]:[];})??[];
    if(demonAssets.length)this.demonRosterVfx=new DemonRosterVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
      p=>this.boardView.cellToWorld(p.x,p.y),(id,skillId)=>this.sim.units.some(u=>u.id===id&&u.pendingCast?.skillId===skillId),demonAssets);
    if(this.sim?.units.some(u=>u.cfg.summonOnly))
      this.demonVfx=new DemonVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
        p=>this.boardView.cellToWorld(p.x,p.y),id=>this.sim.units.some(u=>u.id===id&&u.cfg.summonOnly&&u.hp>0&&u.shield>0));
    const exclusive:PaintedAtlas[]=[];
    for(const u of this.sim?.units??[]){const look=basicAttackLook(u.cfg.id);if(look)exclusive.push(look.atlas);}
    if(this.sim?.units.some(u=>u.cfg.id==='blueflame_soul_knight'))exclusive.push('soul');
    if(this.sim?.units.some(u=>u.cfg.id==='azure_oath_knight'))exclusive.push('knight');
    if(this.sim?.units.some(u=>u.cfg.id==='cloud_dragon_priestess'))exclusive.push('dragon');
    if(this.sim?.units.some(u=>u.cfg.id==='star_card_magician'))exclusive.push('starCards');
    if(exclusive.length)this.dragonVfx=new RolePaintedVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
      id=>this.sim.units.find(u=>u.id===id)?.cfg.id,p=>this.boardView.cellToWorld(p.x,p.y),
      (from,to,length)=>this.boardView.lineEndToWorld(from,to,length),id=>!!this.sim.units.find(u=>u.id===id&&u.hp>0)?.knightSpin,exclusive,{columns:this.sim.w,rows:this.sim.h});
    if(this.sim?.units.some(u=>u.cfg.skillId==='runic_arcana'))
      this.runicVfx=new RunicArcanaVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
        p=>this.boardView.cellToWorld(p.x,p.y),id=>!!this.sim.units.find(u=>u.id===id)?.pendingCast,
        (from,toward,length)=>this.boardView.lineEndToWorld(from,toward,length));
    if(this.sim?.units.some(u=>u.lanternGuard||['startrail_inspiration','windward_hunt','wayward_corrosion','sand_compass','rope_shadow_hunt'].includes(u.cfg.skillId??'')))
      this.explorerSprites=new ExplorerSpriteVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
        ()=>this.sim.units,p=>this.boardView.logicalPointToWorld(p));
    if(this.sim?.units.some(u=>['sand_compass','rope_shadow_hunt'].includes(u.cfg.skillId??'')))
      this.explorerSkillVfx=new ExplorerSkillVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
        p=>this.boardView.logicalPointToWorld(p),id=>!!this.sim.units.find(u=>u.id===id)?.pendingCast);
    if(this.sim?.units.some(u=>u.lanternGuard||['startrail_inspiration','windward_hunt','wayward_corrosion'].includes(u.cfg.skillId??'')))
      this.explorerUnitVfx=new ExplorerUnitVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
        ()=>this.sim.finished?[]:this.sim.units.filter(u=>u.alive&&u.hp>0&&u.lanternGuard).map(u=>({id:u.id,missing:u.missingHealthFraction})),
        ()=>this.sim.finished?[]:this.sim.units.filter(u=>u.alive&&u.hp>0&&u.cfg.skillId==='windward_hunt').map(u=>({id:u.id,active:u.windHuntActive,
          windup:u.pendingCast?.skillId==='windward_hunt'?1-u.pendingCast.remainingTicks/u.windHuntCastTicks:null})),
        id=>!!this.sim.units.find(u=>u.id===id)?.pendingCast);
    if(this.sim?.units.some(u=>['stellar_bulwark','milu_star_leap','moon_triple_arrow','nebula_tide','gravity_collapse'].includes(u.cfg.skillId??'')))
      this.astralUnitVfx=new AstralUnitVfx(root,this.cellSize,this.tickMs,
        (x,y)=>this.boardView.cellToWorld(x,y),id=>this.unitViews.get(id)?.node,
        id=>this.sim.units.find(u=>u.id===id)?.cfg.skillId);
    if (this.sim?.astralFields?.some(field => field.effect.meteor))
      this.astralVfx = new AstralVfx(root, this.boardView, this.tickMs);
  }

  consumeEvents() {
    if (!this.sim) return;
    const events = this.sim.events;
    while (this.eventCursor < events.length) {
      const e = events[this.eventCursor++];
      this.play(e);
    }
  }

  private play(e: BattleEvent) {
    this.eventTick=e.tick;
    if(e.t==='end')for(const unit of this.sim.units)if(unit.temporaryCopy){const view=this.unitViews.get(unit.id);if(view)view.node.active=false;}
    if(e.t==='unit_copy'&&this.boardView&&this.fxRoot){
      const unit=this.sim.units.find(u=>u.id===e.id);
      if(unit&&!this.unitViews.has(e.id)){
        const root=this.fxRoot.parent?.getChildByName('units')??this.fxRoot.parent;
        if(root){
          const node=new Node(`copy_${e.id}`);node.layer=root.layer;
          node.addComponent(UITransform).setContentSize(this.cellSize,this.cellSize);root.addChild(node);
          const view=node.addComponent(UnitView);
          view.setup(unit.cfg.id,unit.side,unit.id,this.cellSize,unit.cfg.artId??unit.cfg.id,unit.cfg.tint,1.3);
          view.setStar(unit.star);view.setEquipment(unit.equipment);view.sync(unit.snapshot(e.tick),this.cellSize);
          node.setPosition(this.boardView.cellToWorld(e.pos.x,e.pos.y));this.unitViews.set(e.id,view);
        }
      }
    }
    this.demonRosterVfx?.play(e);
    this.demonVfx?.play(e);
    if(e.t==='demon_leap'||e.t==='demon_impact')this.moves.delete(e.id);
    if(e.t==='raven_flight'||e.t==='raven_end')this.moves.delete(e.id);
    this.dragonVfx?.play(e);
    if(e.t==='knight_action'&&e.kind==='jump'&&this.moves.has(e.id))this.knightLeaps.add(e.id);
    if(e.t==='dragon_form')this.unitViews.get(e.id)?.setDragonAppearance(e.active,e.tick);
    this.runicVfx?.play(e);
    this.explorerSprites?.play(e);
    this.explorerSkillVfx?.play(e);
    if(e.t==='rope_swing'||e.t==='rope_return'){
      this.moves.delete(e.id);
      if(e.t==='rope_return'&&this.boardView)this.unitViews.get(e.id)?.node.setPosition(this.boardView.cellToWorld(e.to.x,e.to.y));
    }
    this.explorerUnitVfx?.play(e);
    this.astralUnitVfx?.play(e);
    this.mechanicalArt()?.play(e);
    this.bloodfiendArt()?.play(e);
    switch (e.t) {
      case 'astral_meteor':
        GameAudio.play('meteor');
        if (this.fxRoot?.isValid && this.boardView) {
          this.astralVfx ??= new AstralVfx(this.fxRoot, this.boardView, this.tickMs);
          this.astralVfx.play(e);
        }
        break;
      case 'sun_pulse':
        if (this.fxRoot?.isValid && this.boardView) {
          this.sunlightVfx ??= new SunlightVfx(this.fxRoot, this.cellSize, this.tickMs,
            (x, y) => this.boardView.cellToWorld(x, y), id => this.unitViews.get(id)?.node);
          if (e.effect !== 'board') this.sunlightVfx.play(e);
          this.sunlightArt()?.play(e);
        }
        break;
      case 'battle_start': break;
      case 'rail_shot': GameAudio.play('rail'); break;
      case 'missile': GameAudio.play('ranged_mechanical'); break;
      case 'thorn_pull':
      case 'move': {
        const unit = this.sim.units.find(u => u.id === e.id);
        if (unit && this.boardView) this.moves.set(e.id, {
          from: this.boardView.cellToWorld(e.from.x, e.from.y),
          to: this.boardView.cellToWorld(e.to.x, e.to.y),
          startTick: e.tick, durationTicks: Math.max(1, e.durationTicks ?? unit.cfg.moveTicks),
        });
        break;
      }
      case 'teleport': {
        GameAudio.play('teleport');
        this.moves.delete(e.id);
        const uv = this.unitViews.get(e.id);
        if (uv && this.boardView) uv.node.setPosition(this.boardView.cellToWorld(e.to.x, e.to.y));
        const unit = this.sim.units.find(unit => unit.id === e.id);
        const path = unit && UNIT_ART[unit.cfg.artId ?? unit.cfg.id];
        if (path?.includes('/units/shadow/') && this.boardView)
          this.shadowVfx()?.teleport(e.id, path, this.boardView.cellToWorld(e.from.x,e.from.y), this.boardView.cellToWorld(e.to.x,e.to.y), e.tick);
        if (path?.includes('/units/sunlight/') && this.boardView)
          this.sunlightArt()?.teleport(this.boardView.cellToWorld(e.from.x,e.from.y),this.boardView.cellToWorld(e.to.x,e.to.y),e.tick);
        break;
      }
      case 'dash': {
        GameAudio.play('dash');
        if (this.boardView) this.moves.set(e.id,{from:this.boardView.cellToWorld(e.from.x,e.from.y),to:this.boardView.cellToWorld(e.to.x,e.to.y),startTick:e.tick,durationTicks:e.durationTicks});
        break;
      }
      case 'dash_stop': {
        this.moves.delete(e.id);this.knightLeaps.delete(e.id);
        if (this.boardView) this.unitViews.get(e.id)?.node.setPosition(this.boardView.cellToWorld(e.at.x, e.at.y));
        break;
      }
      case 'attack': {
        const attacker = this.sim.units.find(unit => unit.id === e.id);
        const art = attacker && UNIT_ART[attacker.cfg.artId ?? attacker.cfg.id];
        GameAudio.play(unitAttackSound(attacker?.cfg, art));
        const uv = this.unitViews.get(e.id);
        const tv = this.unitViews.get(e.target);
        if (uv && tv) {
          const dir = new Vec3(
            Math.sign(tv.node.position.x - uv.node.position.x),
            Math.sign(tv.node.position.y - uv.node.position.y),
            0,
          );
          uv.playAttack(dir,e.tick);
          const attacker = this.sim.units.find(u => u.id === e.id);
          const shadowMelee = attacker && attacker.cfg.range <= 1 && UNIT_ART?.[attacker.cfg.artId ?? attacker.cfg.id]?.includes('/units/shadow/');
          const sunlight = attacker && UNIT_ART?.[attacker.cfg.artId ?? attacker.cfg.id]?.includes('/units/sunlight/');
          if (sunlight) this.sunlightArt()?.basicAttack(uv.node.position.clone(),tv.node.position.clone(),e.tick,attacker.cfg.range>1);
          if (shadowMelee) this.shadowVfx()?.basicMelee(uv.node.position.clone(),tv.node.position.clone(),e.tick);
          else if (e.shadow) this.playSpriteFx(FX_SPRITE.shadowProjectile, uv.node.position.clone(), tv.node.position.clone(), 1.1, 0.55, true, false, undefined, true);
          const projectile = e.shadow || shadowMelee || sunlight || attacker?.cfg.skillId==='moon_triple_arrow' ? undefined : attacker?.cfg.basicAttackFx;
          if (projectile) {
            const tint = attacker.cfg.basicAttackTint;
            this.playSpriteFx(FX_SPRITE[projectile], uv.node.position.clone(), tv.node.position.clone(),
              projectile === 'arrow' ? 0.9 : 0.5,
              projectile === 'arrow' ? 0.3 : 0.5,
              true, false, tint ? new Color(...tint) : undefined, true);
          }
        }
        break;
      }
      case 'shadow_board': this.showShadowFog(); break;
      case 'shadow_pulse':
        if (e.damage && this.boardView) this.shadowVfx()?.boardPulse(e.tick,this.boardView.boardPixelW/this.cellSize);
        break;
      case 'shadow_mark': break; // The snapshot owns the persistent, moving unit aura.
      case 'skill_pulse': {
        if (!this.boardView || e.skillId === 'voidscar_transit') break;
        const pos = this.boardView.cellToWorld(e.center.x, e.center.y);
        const source = this.unitViews.get(e.id)?.node.position.clone();
        this.shadowVfx()?.play(e.effect,e.id,e.from?this.boardView.cellToWorld(e.from.x,e.from.y):source??pos,pos,e.tick,e.radius,e.duration,e.selfCast,e.flightTicks);
        break;
      }
      case 'fear': {
        GameAudio.play('stun');
        const view = this.unitViews.get(e.id);
        if (view && this.fxRoot) FloatTextPool.get().show('恐惧', new Color(195, 120, 235), view.node.position.clone(), this.fxRoot);
        break;
      }
      case 'hit': {
        if (e.critical) GameAudio.play('hit');
        const tv = this.unitViews.get(e.id);
        if (tv) {
          tv.playHit(e.tick);
          if (this.damageNumbers && this.fxRoot && tv.side !== 0) {
            const ft = FloatTextPool.get();
            const color = FloatText.colorForType(e.dmgType);
            const pos = tv.node.position.clone();
            const sourcePos = this.unitViews.get(e.source)?.node.position;
            ft.show(e.executed ? '斩杀' : `${e.critical ? '!' : ''}${e.dmg}`, color, pos, this.fxRoot, {
              critical: e.critical,
              damage: e.dmg,
              direction: sourcePos ? pos.x - sourcePos.x : 0,
            });
          }
        }
        break;
      }
      case 'cast': {
        const caster = this.sim.units.find(unit => unit.id === e.id);
        const art = caster && UNIT_ART[caster.cfg.artId ?? caster.cfg.id];
        GameAudio.play(unitCastSound(e.skillId ?? caster?.cfg.skillId, art));
        const windup=e.windupTicks===undefined?e.duration:e.windupTicks*this.tickMs/1000;
        if (windup !== undefined) {
          if (!['crimson_upheaval','frostblood_roar','scarlet_aid_dance','blood_sovereignty','startrail_inspiration','wayward_corrosion','windward_hunt','sand_compass','rope_shadow_hunt','runic_arcana','redhorn_fervor','hellhound_breath','abyss_verdict','infernal_axe_spin','raven_soul_theft','infernal_gunfire'].includes(e.skillId??'')) this.unitViews.get(e.id)?.playCast(windup,e.tick,this.tickMs);
          const source = this.sim.units.find(unit => unit.id === e.id);
          const path = source && UNIT_ART[source.cfg.artId ?? source.cfg.id];
          const view = this.unitViews.get(e.id);
          if (path?.includes('/units/shadow/') && view) this.shadowVfx()?.charge(e.id,view.node.position.clone(),e.tick,windup);
          if (path?.includes('/units/sunlight/') && view) this.sunlightArt()?.charge(e.id,view.node.position.clone(),e.tick,windup);
          break;
        }
        const tv = this.unitViews.get(e.target);
        if (tv) tv.playHit(e.tick);
        break;
      }
      case 'trait_mana': {
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}法力`, new Color(80, 180, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'bloodfiend_revel': break; // Painted activation is handled by BloodfiendVfx.
      case 'permanent_spell_power': {
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}永久法强`, new Color(210, 95, 170), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'mechanical_overclock': break; // Painted activation is handled by MechanicalVfx.
      case 'swiftmartialist_stack': {
        const uv = this.unitViews.get(e.id);
        const bonus = Number((e.attackSpeedBonus * 100).toFixed(2));
        if (uv && this.fxRoot) FloatTextPool.get().show(`${e.stacks}/${e.maxStacks}层 +${bonus}%攻速`, new Color(242, 208, 75), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'heal': {
        if (e.amount > 0) GameAudio.play('heal');
        const uv = this.unitViews.get(e.id);
        if (this.healingNumbers && uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}`, new Color(89, 203, 176), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'shield': {
        if (e.amount > 0) GameAudio.play('shield');
        // Equipment triggers already have their own visual notification.
        if (e.equipmentId) break;
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}护盾`, new Color(220, 235, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'equipment_trigger': {
        const uv = this.unitViews.get(e.id);
        const name = this.sim.units.find(u => u.id === e.id)?.equipment.find(item => item.id === e.equipmentId)?.name ?? '装备触发';
        if (uv && this.fxRoot) FloatTextPool.get().show(name, new Color(255, 218, 104), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'stun': {
        GameAudio.play('stun');
        const uv = this.unitViews.get(e.id);
        uv?.playCast(e.duration,e.tick,this.tickMs);
        if (uv && this.fxRoot) FloatTextPool.get().show('眩晕', new Color(204, 125, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'knockup': {
        GameAudio.play('stun');
        const uv = this.unitViews.get(e.id);
        this.stellarKnockups.set(e.id,{tick:e.tick,duration:e.duration*1000/this.tickMs});
        if (uv && this.fxRoot) FloatTextPool.get().show('击飞', new Color(240, 210, 135), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'guard': {
        GameAudio.play('shield');
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`减伤${Math.round(e.reduction * 100)}%`, new Color(120, 215, 150), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'skill_impact': {
        GameAudio.play('explosion');
        const target = this.unitViews.get(e.target);
        if (e.skillId === 'monster_blast' && target) {
          const pos = target.node.position.clone();
          this.playSpriteFx(FX_SPRITE.monsterBlast, pos, pos, 3.2, 3.2);
        }
        break;
      }
      case 'revive': {
        this.moves.delete(e.id);this.knightLeaps.delete(e.id);
        this.unitViews.get(e.id)?.playRevive();
        break;
      }
      case 'death': {
        GameAudio.play('death');
        this.stellarKnockups.delete(e.id);
        this.moves.delete(e.id);this.knightLeaps.delete(e.id);
        this.shadowSkillVfx?.cancel(e.id);
        this.sunlightSprites?.cancel(e.id);
        const uv = this.unitViews.get(e.id);
        if (uv) uv.playDeath(e.tick);
        break;
      }
      case 'end': this.clearSpriteFx();this.clearStellar(); this.astralVfx?.clear(); this.boardView?.stopAstralAnimation?.(); this.clearShadowFog(); this.shadowSkillVfx?.clear(); this.sunlightVfx?.clear(); this.sunlightSprites?.clear(); break;
    }
  }

  syncViews(dt: number, interpolation = 0, playbackSpeed = 1) {
    if (!this.sim || !this.boardView) return;
    // The fixed clock controls travel at every playback speed; only the final step may finish after settlement.
    this.renderTick = this.sim.finished
      ? Math.max(this.renderTick, this.sim.tick) + Math.max(0, dt) * playbackSpeed * 1000 / this.tickMs
      : this.sim.tick + Math.max(0, Math.min(1, interpolation));
    // Derive motion from the simulation clock so pause and playback speed also govern mist.
    this.shadowFog?.update(this.renderTick);
    for (const u of this.sim.units) {
      const uv = this.unitViews.get(u.id);
      if (!uv) continue;
      if (u.alive) {
        const target = u.ropeHunt ? this.boardView.logicalPointToWorld(ropeHuntPoint(u.ropeHunt,this.renderTick)) : this.boardView.cellToWorld(u.x, u.y);
        if(u.demonLeap){
          const leap=u.demonLeap,p=Math.max(0,Math.min(1,(this.renderTick-leap.startTick)/(leap.endTick-leap.startTick)));
          Vec3.lerp(target,this.boardView.cellToWorld(leap.from.x,leap.from.y),this.boardView.cellToWorld(leap.to.x,leap.to.y),p);
          target.y+=Math.sin(p*Math.PI)*this.cellSize*2.4;
        }
        if(u.ravenFlight){
          const flight=u.ravenFlight,p=Math.max(0,Math.min(1,(this.renderTick-flight.startTick)/(flight.endTick-flight.startTick)));
          Vec3.lerp(target,this.boardView.cellToWorld(flight.from.x,flight.from.y),this.boardView.cellToWorld(flight.to.x,flight.to.y),p);
          target.y+=Math.sin(p*Math.PI)*this.cellSize*.45;
        }
        const movement = this.moves.get(u.id);
        if (movement && !u.ropeHunt && !u.demonLeap && !u.ravenFlight) {
          const progress = Math.max(0, Math.min(1, (this.renderTick - movement.startTick) / movement.durationTicks));
          Vec3.lerp(target, movement.from, movement.to, progress);
          if(this.knightLeaps.has(u.id))target.y+=Math.sin(progress*Math.PI)*this.cellSize*1.4;
          if (progress === 1) {this.moves.delete(u.id);this.knightLeaps.delete(u.id);}
        }
        uv.node.setPosition(target);
        uv.sync(u.snapshot(this.sim.tick), this.cellSize);
        uv.syncCombatAnimation?.(this.renderTick,this.tickMs,!!u.pendingCast,this.sim.tick<u.stunnedUntilTick||this.sim.tick<u.fearUntilTick);
        if(u.ravenFlight&&this.demonRosterVfx?.ravenReady)uv.hideRavenBody?.();
        const airborne=this.stellarKnockups.get(u.id);
        const progress=airborne?(this.renderTick-airborne.tick)/airborne.duration:1;
        if(progress>=1)this.stellarKnockups.delete(u.id);
        uv.animateStellar?.(!this.sim.finished&&!!u.stellarShield?.remaining,progress<1?progress:null,this.renderTick,this.tickMs);
        uv.animateShadowCorruption?.(this.renderTick,this.tickMs,this.cellSize);
        const cleave=u.bloodCleaveWindup;
        const toward=cleave&&this.unitViews.get(cleave.targetId)?.node.position;
        const direction=toward?new Vec3(toward.x-uv.node.position.x,toward.y-uv.node.position.y,0):undefined;
        uv.animateBloodCleave?.(cleave?Math.max(0,Math.min(1,(this.renderTick-cleave.startTick)/(cleave.endTick-cleave.startTick))):null,direction);
        if(u.cfg.skillId==='windward_hunt')uv.animateWindHunt?.(u.pendingCast?.skillId==='windward_hunt'
          ?1-u.pendingCast.remainingTicks/u.windHuntCastTicks:null);
        if(['sand_compass','rope_shadow_hunt','runic_arcana','cloud_dragon_flow'].includes(u.cfg.skillId??''))
          uv.animateExpeditionCast?.(u.pendingCast?1-u.pendingCast.remainingTicks/u.expeditionCastTicks:null);
        if(DemonRosterVfx.asset(u.cfg.skillId??''))uv.animateDemonSpell?.(
          u.pendingCast?1-u.pendingCast.remainingTicks/u.expeditionCastTicks:null,
          u.infernalSpin?Math.max(0,Math.min(1,(this.renderTick-u.infernalSpin.startTick)/(u.infernalSpin.endTick-u.infernalSpin.startTick))):null);
        if(u.cfg.skillId==='wayward_corrosion'){
          const charge=this.explorerSprites?.brewProgress(u.id,this.renderTick)??this.explorerUnitVfx?.brewProgress(u.id,this.renderTick)??null;
          uv.animateExpeditionCast?.(charge);
        }
        if(u.cfg.id==='azure_oath_knight')uv.animateDemonSpell(null,u.knightSpin?this.renderTick*this.tickMs/500:null);
        if(u.cfg.id==='cloud_dragon_priestess')uv.setDragonAppearance(!!u.dragonFlow,this.renderTick);
        uv.animateSunlight?.(this.renderTick,this.tickMs,this.cellSize);
        this.mechanicalSprites?.syncUnit(u.id,this.renderTick);
        const domain = uv.node.getChildByName('shadowDomain');
        if (domain?.active) {
          const breath = 1 + Math.sin(this.renderTick*this.tickMs/280)*.025;
          domain.setScale(breath,breath,1);
          domain.getComponent(UIOpacity)!.opacity = 160+Math.round(Math.sin(this.renderTick*this.tickMs/400)*20);
        }
      }else uv.syncCombatAnimation?.(this.renderTick,this.tickMs,false,true);
    }
    this.updateSpriteFx(this.renderTick);
    this.shadowSkillVfx?.update(this.renderTick);
    this.sunlightVfx?.update(this.renderTick);
    this.sunlightSprites?.update(this.renderTick);
    this.mechanicalSprites?.update(this.renderTick);
    this.bloodfiendSprites?.update(this.renderTick);
    this.boardView.animateAstralFields?.(this.renderTick, this.tickMs);
    this.astralVfx?.update(this.renderTick, this.sim);
    this.astralUnitVfx?.update(this.renderTick);
    this.dragonVfx?.update(this.renderTick);
    this.runicVfx?.update(this.renderTick);
    this.demonVfx?.update(this.renderTick);
    this.demonRosterVfx?.update(this.renderTick);
    this.explorerUnitVfx?.update(this.renderTick);
    this.explorerSkillVfx?.update(this.renderTick);
    const painted=this.explorerSprites?.ready??false;
    this.explorerUnitVfx?.setVisible(!painted);this.explorerSkillVfx?.setVisible(!painted);
    this.explorerSprites?.update(this.renderTick);
  }

  private clearStellar(): void {
    this.stellarKnockups.clear();
    for(const view of this.unitViews.values())view.animateStellar?.(false,null,0,this.tickMs);
  }

  private bloodfiendArt(): BloodfiendVfx | null {
    if(!this.fxRoot?.isValid||!this.boardView)return null;
    if(!this.bloodfiendSprites&&!this.sim.units.some(u=>u.bloodfiend||['crimson_upheaval','bloodline_siphon','voidscar_transit','frostblood_roar','scarlet_aid_dance','blood_sovereignty'].includes(u.cfg.skillId??'')))return null;
    this.bloodfiendSprites ??= new BloodfiendVfx(this.fxRoot,this.cellSize,this.tickMs,
      (x,y)=>this.boardView.cellToWorld(x,y),id=>this.unitViews.get(id)?.node,id=>{
        const u=this.sim.units.find(unit=>unit.id===id);
        return u?{alive:u.alive&&u.hp>0,charging:u.pendingCast?.skillId??(u.bloodCleaveWindup?'blood_sovereignty':undefined),skillId:u.cfg.skillId,rebirthing:!!u.bloodRebirth}:undefined;
      },(from,toward,length)=>this.boardView.lineEndToWorld(from,toward,length));
    return this.bloodfiendSprites;
  }

  private mechanicalArt(): MechanicalVfx | null {
    if(!this.fxRoot?.isValid||!this.boardView)return null;
    if(!this.mechanicalSprites&&!this.sim.units.some(u=>u.mechanicalPioneer||UNIT_ART[u.cfg.artId??u.cfg.id]?.includes('/units/mechanical/')))return null;
    this.mechanicalSprites ??= new MechanicalVfx(this.fxRoot,this.cellSize,this.tickMs,
      (x,y)=>this.boardView.cellToWorld(x,y),id=>this.unitViews.get(id)?.node,id=>{
        const u=this.sim.units.find(unit=>unit.id===id);
        return u?{alive:u.alive&&u.hp>0,skillId:u.cfg.skillId,wall:u.hydraulicRooted,airborne:!!u.spiderLeap,
          dashing:!!u.furnaceDash,charging:u.pendingCast?.skillId,overclockUntil:u.overclockUntilTick,
          burning:u.burns.some(b=>b.untilBattleEnd&&b.skillId==='sky_annihilation')}:undefined;
      });
    return this.mechanicalSprites;
  }

  private sunlightArt(): SunlightSpriteVfx | null {
    if (!this.fxRoot?.isValid || !this.boardView) return null;
    this.sunlightSprites ??= new SunlightSpriteVfx(this.fxRoot,this.cellSize,this.tickMs,
      (x,y)=>this.boardView.cellToWorld(x,y),id=>this.unitViews.get(id)?.node,
      {width:this.boardView.boardPixelW,height:this.boardView.boardPixelH},id=>{
        const unit=this.sim.units.find(u=>u.id===id);
        return unit ? {alive:unit.alive&&unit.hp>0,shield:unit.shield,empowered:unit.skillAttackSpeedBonus>0} : undefined;
      });
    return this.sunlightSprites;
  }

  private shadowVfx(): ShadowSkillVfx | null {
    if (!this.fxRoot?.isValid) return null;
    this.shadowSkillVfx ??= new ShadowSkillVfx(this.fxRoot,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node);
    return this.shadowSkillVfx;
  }

  private showShadowFog(): void {
    if (this.shadowFog || !this.fxRoot?.isValid || !this.boardView) return;
    const board=this.boardView;
    this.shadowFog=new ShadowGroundFog(board.node,board.boardWidth,board.boardHeight,board.hexSize,this.tickMs);
    this.shadowFog.update(this.renderTick);
  }

  private clearShadowFog(): void {
    this.shadowFog?.destroy();this.shadowFog=null;
  }

  onDestroy(): void {this.clearSpriteFx(true);this.dragonVfx?.destroy();this.dragonVfx=null; this.demonRosterVfx?.destroy();this.demonRosterVfx=null; this.demonVfx?.destroy();this.demonVfx=null; this.runicVfx?.destroy();this.runicVfx=null; this.explorerSprites?.destroy();this.explorerSprites=null; this.explorerSkillVfx?.destroy();this.explorerSkillVfx=null; this.explorerUnitVfx?.destroy(); this.explorerUnitVfx=null; this.bloodfiendSprites?.destroy(); this.bloodfiendSprites=null; this.astralUnitVfx?.destroy(); this.astralUnitVfx=null; this.clearStellar(); this.astralVfx?.clear(); this.astralVfx=null; this.clearShadowFog(); this.shadowSkillVfx?.destroy(); this.shadowSkillVfx=null; this.sunlightVfx?.destroy(); this.sunlightVfx=null; this.sunlightSprites?.destroy(); this.sunlightSprites=null; this.mechanicalSprites?.destroy(); this.mechanicalSprites=null; }

  private clearSpriteFx(destroy=false):void {
    for(const slot of this.spriteFx){slot.path=undefined;slot.lease++;if(slot.node.isValid){slot.node.active=false;if(destroy)slot.node.destroy();}}
    if(destroy){this.spriteFx=[];this.spriteFrames.clear();this.spriteLoads.clear();}
  }
  private updateSpriteFx(tick:number):void {
    for(const slot of this.spriteFx){
      if(!slot.path||!slot.node.isValid)continue;
      const p=(tick-slot.start)/slot.duration;
      if(p>=1){slot.path=undefined;slot.lease++;slot.node.active=false;continue;}
      slot.node.active=p>=0&&!!slot.sprite.spriteFrame;
      if(p<0)continue;
      if(slot.projectile)slot.node.setPosition(slot.from.x+(slot.to.x-slot.from.x)*p,slot.from.y+(slot.to.y-slot.from.y)*p,0);
      slot.opacity.opacity=slot.projectile?255:Math.round(255*(1-p));
    }
  }
  private playSpriteFx(path:string,from:Vec3,to:Vec3,width:number,height:number,projectile=false,mirror=false,tint?:Color,rotate=false,angle?:number):void {
    if(!this.fxRoot?.isValid)return;
    let slot=this.spriteFx.find(s=>!s.path&&s.node.isValid);
    if(!slot){
      if(this.spriteFx.length>=96)return;
      const node=new Node('basicSpriteFx');node.addComponent(UITransform);
      const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
      slot={node,sprite,opacity:node.addComponent(UIOpacity),lease:0,start:0,duration:1,from:new Vec3(),to:new Vec3(),projectile:false};this.spriteFx.push(slot);
    }
    const current=slot,lease=++current.lease;
    Object.assign(current,{path,start:this.eventTick,duration:(projectile?250:450)/this.tickMs,from:from.clone(),to:to.clone(),projectile});
    this.fxRoot.addChild(current.node);current.node.active=false;current.node.setPosition(from);
    current.node.setScale(mirror||(projectile&&to.x<from.x&&!rotate)?-1:1,1,1);
    current.node.angle=angle??(projectile&&rotate?Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI:0);
    current.node.getComponent(UITransform)!.setContentSize(this.cellSize*width,this.cellSize*height);
    current.sprite.color=tint??Color.WHITE;current.sprite.spriteFrame=this.spriteFrames.get(path)??null;current.opacity.opacity=255;
    if(current.sprite.spriteFrame)return;
    let loading=this.spriteLoads.get(path);
    if(!loading){loading=new Promise(resolve=>resources.load(path,SpriteFrame,(err,frame)=>resolve(err?null:frame)));this.spriteLoads.set(path,loading);}
    loading.then(frame=>{
      this.spriteLoads.delete(path);
      if(!current.node.isValid||current.lease!==lease||current.path!==path)return;
      if(frame){this.spriteFrames.set(path,frame);current.sprite.spriteFrame=frame;}
    });
  }
}
