import { _decorator, Component, Node, Vec3, Color, Sprite, SpriteFrame, UITransform, UIOpacity, resources, tween } from 'cc';
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
  private renderTick = 0;
  private tickMs = 50;
  private shadowFog: Node | null = null;
  private shadowSkillVfx: ShadowSkillVfx | null = null;
  private sunlightVfx: SunlightVfx | null = null;
  private sunlightSprites: SunlightSpriteVfx | null = null;
  private mechanicalSprites: MechanicalVfx | null = null;
  private bloodfiendSprites: BloodfiendVfx | null = null;
  private astralVfx: AstralVfx | null = null;
  private astralUnitVfx: AstralUnitVfx | null = null;
  private explorerUnitVfx: ExplorerUnitVfx | null = null;
  private explorerSkillVfx: ExplorerSkillVfx | null = null;
  private runicVfx: RunicArcanaVfx | null = null;
  private demonVfx: DemonVfx | null = null;
  private demonRosterVfx: DemonRosterVfx | null = null;
  private explorerSprites: ExplorerSpriteVfx | null = null;
  private stellarKnockups = new Map<number, {tick:number;duration:number}>();

  bind(sim: BattleSim, views: Map<number, UnitView>, cellSize: number, boardView: BoardView, tickMs = 50) {
    this.demonRosterVfx?.destroy();this.demonRosterVfx=null;
    this.demonVfx?.destroy();this.demonVfx=null;
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
    this.sim = sim;
    this.unitViews = views;
    this.cellSize = cellSize;
    this.boardView = boardView;
    this.tickMs = tickMs;
    this.eventCursor = 0;
    this.moves.clear(); this.renderTick = sim.tick;
  }

  setFxRoot(root: Node): void {
    this.fxRoot = root;
    const demonAssets=this.sim?.units.flatMap(u=>{const asset=DemonRosterVfx.asset(u.cfg.skillId??'');return asset?[asset]:[];})??[];
    if(demonAssets.length)this.demonRosterVfx=new DemonRosterVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
      p=>this.boardView.cellToWorld(p.x,p.y),(id,skillId)=>this.sim.units.some(u=>u.id===id&&u.pendingCast?.skillId===skillId),demonAssets);
    if(this.sim?.units.some(u=>u.cfg.summonOnly))
      this.demonVfx=new DemonVfx(root,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node,
        p=>this.boardView.cellToWorld(p.x,p.y),id=>this.sim.units.some(u=>u.id===id&&u.cfg.summonOnly&&u.hp>0&&u.shield>0));
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
    this.demonRosterVfx?.play(e);
    this.demonVfx?.play(e);
    if(e.t==='demon_leap'||e.t==='demon_impact')this.moves.delete(e.id);
    if(e.t==='raven_flight'||e.t==='raven_end')this.moves.delete(e.id);
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
        this.moves.delete(e.id);
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
          uv.playAttack(dir);
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
        this.shadowVfx()?.play(e.effect,e.id,source??pos,pos,e.tick,e.radius,e.duration,e.selfCast);
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
          tv.playHit();
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
        if (e.duration !== undefined) {
          if (!['crimson_upheaval','frostblood_roar','scarlet_aid_dance','blood_sovereignty','startrail_inspiration','wayward_corrosion','windward_hunt','sand_compass','rope_shadow_hunt','runic_arcana','redhorn_fervor','hellhound_breath','abyss_verdict','infernal_axe_spin','raven_soul_theft','infernal_gunfire'].includes(e.skillId??'')) this.unitViews.get(e.id)?.playCast(e.duration);
          const source = this.sim.units.find(unit => unit.id === e.id);
          const path = source && UNIT_ART[source.cfg.artId ?? source.cfg.id];
          const view = this.unitViews.get(e.id);
          if (path?.includes('/units/shadow/') && view) this.shadowVfx()?.charge(e.id,view.node.position.clone(),e.tick,e.duration);
          if (path?.includes('/units/sunlight/') && view) this.sunlightArt()?.charge(e.id,view.node.position.clone(),e.tick,e.duration);
          break;
        }
        const tv = this.unitViews.get(e.target);
        if (tv) tv.playHit();
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
        uv?.playCast(e.duration);
        if (uv && this.fxRoot) FloatTextPool.get().show('眩晕', new Color(204, 125, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'knockup': {
        GameAudio.play('stun');
        const uv = this.unitViews.get(e.id);
        if(['stellar_bulwark','crimson_upheaval'].includes(this.sim.units.find(u=>u.id===e.source)?.cfg.skillId??''))
          this.stellarKnockups.set(e.id,{tick:e.tick,duration:e.duration*1000/this.tickMs});
        else uv?.playKnockup(e.duration);
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
        this.unitViews.get(e.id)?.playRevive();
        break;
      }
      case 'death': {
        GameAudio.play('death');
        this.stellarKnockups.delete(e.id);
        this.moves.delete(e.id);
        this.shadowSkillVfx?.cancel(e.id);
        this.sunlightSprites?.cancel(e.id);
        const uv = this.unitViews.get(e.id);
        if (uv) uv.playDeath();
        break;
      }
      case 'end': this.clearStellar(); this.astralVfx?.clear(); this.boardView?.stopAstralAnimation?.(); this.clearShadowFog(); this.shadowSkillVfx?.clear(); this.sunlightVfx?.clear(); this.sunlightSprites?.clear(); break;
    }
  }

  syncViews(dt: number, interpolation = 0, playbackSpeed = 1) {
    if (!this.sim || !this.boardView) return;
    // The fixed clock controls travel at every playback speed; only the final step may finish after settlement.
    this.renderTick = this.sim.finished
      ? Math.max(this.renderTick, this.sim.tick) + Math.max(0, dt) * playbackSpeed * 1000 / this.tickMs
      : this.sim.tick + Math.max(0, Math.min(1, interpolation));
    // Derive motion from the simulation clock so pause and playback speed also govern mist.
    if (this.shadowFog?.isValid) {
      const phase = this.renderTick * this.tickMs / 1000;
      this.shadowFog.setScale(1 + Math.sin(phase * 1.7) * 0.018, 1 + Math.cos(phase * 1.3) * 0.018, 1);
      this.shadowFog.getComponent(UIOpacity)!.opacity = 220 + Math.round(Math.sin(phase * 2) * 20);
    }
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
          if (progress === 1) this.moves.delete(u.id);
        }
        uv.node.setPosition(target);
        uv.sync(u.snapshot(this.sim.tick), this.cellSize);
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
        if(['sand_compass','rope_shadow_hunt','runic_arcana'].includes(u.cfg.skillId??''))
          uv.animateExpeditionCast?.(u.pendingCast?1-u.pendingCast.remainingTicks/u.expeditionCastTicks:null);
        if(DemonRosterVfx.asset(u.cfg.skillId??''))uv.animateDemonSpell?.(
          u.pendingCast?1-u.pendingCast.remainingTicks/u.expeditionCastTicks:null,
          u.infernalSpin?Math.max(0,Math.min(1,(this.renderTick-u.infernalSpin.startTick)/(u.infernalSpin.endTick-u.infernalSpin.startTick))):null);
        if(u.cfg.skillId==='wayward_corrosion'){
          const charge=this.explorerSprites?.brewProgress(u.id,this.renderTick)??this.explorerUnitVfx?.brewProgress(u.id,this.renderTick)??null;
          uv.animateExpeditionCast?.(charge);
        }
        uv.animateSunlight?.(this.renderTick,this.tickMs,this.cellSize);
        this.mechanicalSprites?.syncUnit(u.id,this.renderTick);
        const domain = uv.node.getChildByName('shadowDomain');
        if (domain?.active) {
          const breath = 1 + Math.sin(this.renderTick*this.tickMs/280)*.025;
          domain.setScale(breath,breath,1);
          domain.getComponent(UIOpacity)!.opacity = 160+Math.round(Math.sin(this.renderTick*this.tickMs/400)*20);
        }
      }
    }
    this.shadowSkillVfx?.update(this.renderTick);
    this.sunlightVfx?.update(this.renderTick);
    this.sunlightSprites?.update(this.renderTick);
    this.mechanicalSprites?.update(this.renderTick);
    this.bloodfiendSprites?.update(this.renderTick);
    this.boardView.animateAstralFields?.(this.renderTick, this.tickMs);
    this.astralVfx?.update(this.renderTick, this.sim);
    this.astralUnitVfx?.update(this.renderTick);
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
    if (this.shadowFog?.isValid || !this.fxRoot?.isValid || !this.boardView) return;
    const fog = new Node('shadowBoardFog');
    fog.addComponent(UITransform).setContentSize(this.boardView.boardPixelW + 155, this.boardView.boardPixelH + 100);
    const sprite = fog.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    fog.addComponent(UIOpacity).opacity = 220;
    this.fxRoot.addChild(fog); fog.setSiblingIndex(0); fog.setPosition(0, 0, 0); this.shadowFog = fog;
    resources.load(FX_SPRITE.shadowBoardFog, SpriteFrame, (err, frame) => { if (!err && fog.isValid) sprite.spriteFrame = frame; });
  }

  private clearShadowFog(): void {
    if (this.shadowFog?.isValid) this.shadowFog.destroy();
    this.shadowFog = null;
  }

  onDestroy(): void { this.demonRosterVfx?.destroy();this.demonRosterVfx=null; this.demonVfx?.destroy();this.demonVfx=null; this.runicVfx?.destroy();this.runicVfx=null; this.explorerSprites?.destroy();this.explorerSprites=null; this.explorerSkillVfx?.destroy();this.explorerSkillVfx=null; this.explorerUnitVfx?.destroy(); this.explorerUnitVfx=null; this.bloodfiendSprites?.destroy(); this.bloodfiendSprites=null; this.astralUnitVfx?.destroy(); this.astralUnitVfx=null; this.clearStellar(); this.astralVfx?.clear(); this.astralVfx=null; this.clearShadowFog(); this.shadowSkillVfx?.destroy(); this.shadowSkillVfx=null; this.sunlightVfx?.destroy(); this.sunlightVfx=null; this.sunlightSprites?.destroy(); this.sunlightSprites=null; this.mechanicalSprites?.destroy(); this.mechanicalSprites=null; }

  private playSpriteFx(path: string, from: Vec3, to: Vec3, width: number, height: number, projectile = false, mirror = false, tint?: Color, rotate = false, angle?: number): void {
    if (!this.fxRoot?.isValid) return;
    const effect = new Node(projectile ? 'ravenProjectile' : 'ravenVortex');
    effect.addComponent(UITransform).setContentSize(this.cellSize * width, this.cellSize * height);
    const sprite = effect.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    if (tint) sprite.color = tint;
    this.fxRoot.addChild(effect); effect.setPosition(from);
    if (angle !== undefined) effect.angle = angle;
    else if (projectile && rotate) effect.angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    else if (mirror || (projectile && to.x < from.x)) effect.setScale(new Vec3(-1, 1, 1));
    resources.load(path, SpriteFrame, (err, frame) => {
      if (!effect.isValid) return;
      if (err) { effect.destroy(); return; }
      sprite.spriteFrame = frame;
      if (projectile) {
        tween(effect).to(0.25, { position: to }).call(() => { if (effect.isValid) effect.destroy(); }).start();
      } else {
        const opacity = effect.addComponent(UIOpacity);
        tween(opacity).to(0.45, { opacity: 0 }).call(() => { if (effect.isValid) effect.destroy(); }).start();
      }
    });
  }
}
