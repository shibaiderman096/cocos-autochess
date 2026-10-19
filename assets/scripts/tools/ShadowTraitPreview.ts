import { _decorator, Component, Node, JsonAsset, resources, Label, Sprite, UIOpacity, view, ResolutionPolicy } from 'cc';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import { BattleSim } from '../battle/BattleSim';
import { resolveTraits } from '../battle/Traits';
import { BoardView } from '../view/BoardView';
import { UnitView } from '../view/UnitView';
import { BattleReplayer } from '../view/BattleReplayer';
import { TraitPanel } from '../ui/TraitPanel';
import { BattleUI, button, label } from '../ui/BattleUI';
import { buildSkillDescription, buildSkillStatRows } from '../ui/SkillPresentation';
import { setUISkin } from '../ui/UISkin';
import { UITransform } from 'cc';

const { ccclass } = _decorator;
/** Isolated editor test scene; no RunSession, production membership, or player saves. */
@ccclass('ShadowTraitPreview')
export class ShadowTraitPreview extends Component {
  private cfg = new ConfigManager();
  private sim: BattleSim;
  private replay: BattleReplayer;
  private board: BoardView;
  private root: Node;
  private traits: TraitPanel;
  private status: Label;
  private roster: UnitConfigData[];
  private elapsed = 0;
  private paused = true;
  private tier = 10;
  private star = 1;
  private members: UnitConfigData[];
  private ui: BattleUI;
  private inspected: number | null = null;
  private showcaseIndex: number | null = null;

  async start(): Promise<void> {
    const read = (name: string): Promise<any> => new Promise((resolve, reject) => resources.load(`config/${name}`, JsonAsset,
      (error, asset) => error ? reject(error) : resolve(asset.json)));
    const [battle, units, skills, equipment] = await Promise.all(['battle', 'units', 'skills', 'equipment'].map(read));
    this.cfg.setBattle(JSON.parse(JSON.stringify(battle)));this.cfg.setUnits(units);this.cfg.setSkills(skills);this.cfg.setEquipment(equipment);
    this.roster = units;
    this.members = this.cfg.battle.traits!.find(trait => trait.id === 'shadow')!.members.map(id => this.cfg.getUnit(id));
    const sky = new Node('shadowPreviewSky');this.node.parent!.addChild(sky);sky.setSiblingIndex(0);
    sky.addComponent(UITransform).setContentSize(1280,720);setUISkin(sky,'arena_sky');
    this.board = this.node.parent!.getChildByName('Board')!.getComponent(BoardView)!;
    this.board.initialize(7, 8, 48);this.board.node.setPosition(0, 20, 0);
    this.replay = this.node.addComponent(BattleReplayer);
    this.traits = new TraitPanel(this.node);
    label(this.node, '暗影 · v3正式成员 · 满蓝技能演示', 0, 315, 23, undefined, 800);
    this.status = label(this.node, '', 0, -230, 15, undefined, 900);
    [3, 5, 7, 10].forEach((count, index) => button(this.node, `${count} 暗影`, -285 + index * 125, -290, 112, 40, () => { this.showcaseIndex=null;this.show(count); }));
    button(this.node, '播放 / 暂停', 260, -290, 120, 40, () => { this.paused = !this.paused; });
    button(this.node, '前进1秒', 395, -290, 120, 40, () => { this.advance(20); });
    [1,2,3].forEach((star,index) => button(this.node, `${star}星`, -110 + index * 110, -340, 100, 32, () => { this.star = star; this.show(this.tier); }));
    button(this.node,'技能特写',-425,-340,140,32,()=>{this.showcaseIndex=this.showcaseIndex===null?0:null;this.show(this.tier);});
    button(this.node,'下一技能',300,-340,120,32,()=>{this.showcaseIndex=((this.showcaseIndex??-1)+1)%this.members.length;this.show(this.tier);});
    button(this.node,'前进0.1秒',435,-340,130,32,()=>this.advance(2));
    const detail = new Node('shadowRealUnitDetails'); this.node.parent!.addChild(detail);
    this.ui = detail.addComponent(BattleUI); this.ui.init(); this.ui.enabled = false;
    for (const child of detail.children) child.active = false;
    // Keep this isolated scene letterboxed; the real game retains its own screen policy.
    view.setDesignResolutionSize(1280,720,ResolutionPolicy.SHOW_ALL);
    this.show(10);
  }

  private show(count: number): void {
    this.tier = count; this.paused = true; this.elapsed = 0;
    this.traits.hideDetail();
    this.inspected = null;this.ui.closeUnitDetail();for (const child of this.ui.node.children) child.active = false;
    const shadow = this.cfg.battle.traits!.find(trait => trait.id === 'shadow')!;
    // The diagnostic instance uses the production members and never writes JSON or saves.
    this.cfg.battle.traits = [shadow];
    if (this.root) { this.root.active = false;this.root.destroy(); }
    this.root = new Node('shadowPreviewUnits');this.board.node.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(this.board.boardPixelW,this.board.boardPixelH);
    const members = this.showcaseIndex===null?this.members.slice(0,count):[this.members[this.showcaseIndex]];
    const placements = members.map((unit, i) => ({ cfg: unit, side: 0 as const, x: this.showcaseIndex===null?i%7:3, y: 2 + Math.floor(i / 7), star: this.star }));
    const enemies = this.roster.filter(unit => !shadow.members.includes(unit.id)).slice(0,4);
    const sim = new BattleSim(this.cfg, [...placements, ...enemies.map((unit, i) => ({ cfg: { ...unit, hp: 100000, atk: 10, armor: 100, mr: 100, range: 6, maxMana: 0, startMana: 0, atkSpeed: .6, critChance: 0 }, side: 1 as const, x: 1 + i % 3 * 2, y: 5 + Math.floor(i / 3) }))], { seed: 1018 });
    this.sim = sim;
    for (const unit of sim.units) if (unit.side === 0) unit.mana = unit.cfg.maxMana;
    const views = new Map<number, UnitView>();
    for (const unit of sim.units) {
      const node = new Node(`previewUnit_${unit.id}`);this.root.addChild(node);
      node.addComponent(UITransform).setContentSize(56,56);
      const view = node.addComponent(UnitView);view.setup(unit.cfg.id, unit.side, unit.id, 56, unit.cfg.artId ?? unit.cfg.id, unit.cfg.tint, 1.3);
      view.setStar(unit.star);node.setPosition(this.board.cellToWorld(unit.x,unit.y));views.set(unit.id, view);
      node.on(Node.EventType.TOUCH_END, () => { this.inspected = unit.id;this.showUnitDetails(); });
    }
    const fx = new Node('shadowPreviewFx');this.root.addChild(fx);
    fx.addComponent(UITransform).setContentSize(this.board.boardPixelW,this.board.boardPixelH);
    this.replay.bind(sim,views,56,this.board);this.replay.setFxRoot(fx);
    this.traits.refresh(resolveTraits([shadow],members.map(unit=>unit.id),this.roster),this.roster);
    this.advance(this.showcaseIndex===null?40:0);
    console.info('Shadow preview ready: ' + this.status.string);
    this.scheduleOnce(() => {
      if (this.sim !== sim || !fx.isValid) return;
      const fog = fx.getChildByName('shadowBoardFog');
      const victim = [...views.values()].find(view => view.node.getChildByName('shadowCorruption'));
      const aura = victim?.node.getChildByName('shadowCorruption');
      console.info('Shadow VFX loaded: ' + JSON.stringify({ fog: !!fog, fogFrame: !!fog?.getComponent(Sprite)?.spriteFrame,
        tick: sim.tick, fogLayer: fog?.layer, fogActive: fog?.activeInHierarchy, fogOpacity: fog?.getComponent(UIOpacity)?.opacity,
        fogWorld: fog?.worldPosition, fogSize: fog?.getComponent(UITransform)?.contentSize,
        aura: !!aura, auraFrame: !!aura?.children.some(node=>!!node.getComponent(Sprite)?.spriteFrame),
        auraLayer: aura?.layer, auraActive: aura?.activeInHierarchy }));
    }, 1);
  }

  private showUnitDetails(): void {
    const unit = this.sim.units.find(unit => unit.id === this.inspected);
    if (!unit) return;
    const cfg = { ...unit.cfg, armor: unit.armor, mr: unit.mr, atkSpeed: unit.attackSpeed, damageAmp: unit.damageAmp };
    const skill = cfg.skillId ? this.cfg.getSkill(cfg.skillId) : undefined;
    this.ui.showUnitDetail({ ...cfg, name: cfg.name, artId: cfg.artId ?? cfg.id, side: unit.side, star: unit.star,
      hp: unit.hp, maxHp: cfg.hp, mana: unit.mana, maxMana: cfg.maxMana, shield: unit.shield, manaPerSecond: unit.manaPerSecond,
      skillName: skill?.name ?? '无主动技能', skillDescription: buildSkillDescription(this.cfg,cfg,unit.star,unit.skillScale),
      skillRichDescription: buildSkillDescription(this.cfg,cfg,unit.star,unit.skillScale,true),
      skillStats: buildSkillStatRows(this.cfg,cfg,unit.star,unit.skillScale,true), traits: unit.side === 0 ? ['暗影'] : [],
      detailKey: `shadow-v3:${unit.id}:${unit.star}` });
  }

  private advance(ticks: number): void {
    for (let i=0;i<ticks&&!this.sim.finished;i++)this.sim.step();
    this.replay.consumeEvents();this.replay.syncViews(0);
    this.refreshStatus();
    if (this.inspected !== null && this.ui.unitDetailVisible) this.showUnitDetails();
  }

  private refreshStatus(): void {
    const enemy = this.sim.units.find(unit => unit.side === 1 && unit.shadowCorruption);
    const friend = this.sim.units[0];
    this.status.string = `${this.showcaseIndex===null?`${this.tier} 暗影`:friend.cfg.name+' · 技能特写'} · ${(this.sim.tick * .05).toFixed(1)}秒 · 友军攻速 ${(friend.attackSpeed * 100).toFixed(0)}%（暗影+${(friend.shadowAttackSpeedBonus*100).toFixed(0)}%）` +
      (enemy ? ` · 侵蚀目标双抗 ${enemy.armor.toFixed(0)}/${enemy.mr.toFixed(0)} · 增伤 ${(enemy.damageAmp*100).toFixed(0)}%` : '');
  }

  update(dt: number): void {
    if (!this.sim) return;
    if (!this.paused) {
      this.elapsed += dt;
      while(this.elapsed >= .05 && !this.sim.finished) {this.elapsed -= .05;this.sim.step();}
    }
    this.replay.consumeEvents();this.replay.syncViews(this.paused ? 0 : dt, this.paused ? 0 : this.elapsed/.05);
    this.refreshStatus();
    if (this.inspected !== null && this.ui.unitDetailVisible) this.showUnitDetails();
  }
}
