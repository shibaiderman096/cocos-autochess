import { _decorator, Component, Node, JsonAsset, resources, Label, UITransform, view, ResolutionPolicy } from 'cc';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import { BattleSim } from '../battle/BattleSim';
import { CombatStatistics } from '../battle/CombatStatistics';
import { resolveTraits } from '../battle/Traits';
import { BoardView } from '../view/BoardView';
import { UnitView } from '../view/UnitView';
import { BattleReplayer } from '../view/BattleReplayer';
import { TraitPanel } from '../ui/TraitPanel';
import { BattleUI, button, label } from '../ui/BattleUI';
import { buildSkillDescription, buildSkillStatRows } from '../ui/SkillPresentation';
import { setUISkin } from '../ui/UISkin';
const { ccclass } = _decorator;

/** Independent acceptance scene. It never creates a RunSession or reads/writes player saves. */
@ccclass('SunlightPreview')
export class SunlightPreview extends Component {
  private cfg = new ConfigManager();
  private sim: BattleSim;
  private replay: BattleReplayer;
  private board: BoardView;
  private root: Node;
  private traits: TraitPanel;
  private ui: BattleUI;
  private status: Label;
  private members: UnitConfigData[];
  private index: number | null = null;
  private tier = 10;
  private star = 1;
  private paused = true;
  private elapsed = 0;
  private statistics = new CombatStatistics();
  async start(): Promise<void> {
    const read = (name: string): Promise<any> => new Promise((resolve, reject) => resources.load(`config/${name}`, JsonAsset, (e, a) => e ? reject(e) : resolve(a.json)));
    const [battle, units, skills, equipment] = await Promise.all(['battle', 'units', 'skills', 'equipment'].map(read));
    this.cfg.setBattle(JSON.parse(JSON.stringify(battle))); this.cfg.setUnits(units); this.cfg.setSkills(skills); this.cfg.setEquipment(equipment);
    this.cfg.battle.traits = this.cfg.battle.traits!.filter(t => t.id === 'sunlight');
    this.members = this.cfg.battle.traits[0].members.map(id => this.cfg.getUnit(id));
    const sky = new Node('sunlightPreviewSky'); this.node.parent!.addChild(sky); sky.setSiblingIndex(0);
    sky.addComponent(UITransform).setContentSize(1280, 720); setUISkin(sky, 'arena_sky');
    this.board = this.node.parent!.getChildByName('Board')!.getComponent(BoardView)!;
    this.board.initialize(7, 8, 48); this.board.node.setPosition(0, 20, 0);
    this.replay = this.node.addComponent(BattleReplayer); this.traits = new TraitPanel(this.node);
    label(this.node, '日辉 · 羁绊与10棋子技能演示', 0, 315, 23, undefined, 800);
    this.status = label(this.node, '', 0, -230, 14, undefined, 1000);
    [3,5,7,10].forEach((n,i) => button(this.node, `${n} 日辉`, -285 + i * 125, -290, 112, 40, () => { this.index = null; this.show(n); }));
    button(this.node, '播放 / 暂停', 260, -290, 120, 40, () => { this.paused = !this.paused; });
    button(this.node, '前进1秒', 395, -290, 120, 40, () => this.advance(20));
    [1,2,3].forEach((star,i) => button(this.node, `${star}星`, -110 + i * 110, -340, 100, 32, () => { this.star = star; this.show(this.tier); }));
    button(this.node, '技能特写', -425, -340, 140, 32, () => { this.index = this.index === null ? 0 : null; this.show(this.tier); });
    button(this.node, '下一技能', 300, -340, 120, 32, () => { this.index = ((this.index ?? -1) + 1) % this.members.length; this.show(this.tier); });
    button(this.node, '前进0.1秒', 435, -340, 130, 32, () => this.advance(2));
    const details = new Node('sunlightUnitDetails'); this.node.parent!.addChild(details); this.ui = details.addComponent(BattleUI); this.ui.init(); this.ui.enabled = false;
    details.children.forEach(n => { n.active = false; });
    view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL); this.show(10);
  }
  private show(count: number): void {
    this.tier = count; this.paused = true; this.elapsed = 0; this.traits.hideDetail(); this.ui.closeUnitDetail();
    if (this.root) { this.root.active = false; this.root.destroy(); }
    this.root = new Node('sunlightPreviewUnits'); this.board.node.addChild(this.root);
    const members = this.index === null ? this.members.slice(0,count) : [this.members[this.index]];
    const placements = members.map((cfg,i) => ({ cfg, side: 0 as const, x: this.index === null ? i % 7 : 3, y: 2 + Math.floor(i / 7), star: this.star }));
    // Seraphiel's isolated preview reaches a lethal finisher at every star, then demonstrates the recast.
    const targetHp = this.index !== null && members[0].id === 'seraphiel' ? [600, 1100, 32000][this.star - 1] : 100000;
    const dummy = { ...this.cfg.getUnit('helion'), skillId: undefined, hp: targetHp, atk: 10, armor: 0, mr: 0, range: 6, maxMana: 0, startMana: 0, atkSpeed: .6, critChance: 0 };
    this.sim = new BattleSim(this.cfg, [...placements, ...[0,1,2,3,4,5].map((i) => ({ cfg: dummy, side: 1 as const, x: i % 3 * 2 + 1, y: 5 + Math.floor(i / 3) }))], { seed: 1019 });
    this.statistics.begin(this.sim.units);
    for (const u of this.sim.units) if (u.side === 0) u.mana = u.cfg.maxMana;
    const views = new Map<number, UnitView>();
    for (const u of this.sim.units) {
      const node = new Node(`sunlightUnit_${u.id}`); this.root.addChild(node); node.addComponent(UITransform).setContentSize(56,56);
      const uv = node.addComponent(UnitView); uv.setup(u.cfg.id,u.side,u.id,56,u.cfg.artId ?? u.cfg.id,undefined,1.3); uv.setStar(u.star);
      node.setPosition(this.board.cellToWorld(u.x,u.y)); views.set(u.id,uv);
      node.on(Node.EventType.TOUCH_END, () => {
        const cfg = { ...u.cfg, armor:u.armor, mr:u.mr, atkSpeed:u.attackSpeed, damageAmp:u.damageAmp }, sk = cfg.skillId ? this.cfg.getSkill(cfg.skillId) : undefined;
        this.ui.showUnitDetail({ ...cfg, name:cfg.name, artId:cfg.id, side:u.side, star:u.star, hp:u.hp, maxHp:cfg.hp, mana:u.mana, maxMana:cfg.maxMana, shield:u.shield,
          skillName:sk?.name ?? '无主动技能', skillDescription:buildSkillDescription(this.cfg,cfg,u.star,u.skillScale), skillRichDescription:buildSkillDescription(this.cfg,cfg,u.star,u.skillScale,true),
          skillStats:buildSkillStatRows(this.cfg,cfg,u.star,u.skillScale,true), traits:u.side === 0 ? ['日辉'] : [], detailKey:`sunlight:${u.id}:${u.star}` });
      });
    }
    const fx = new Node('sunlightPreviewFx'); this.root.addChild(fx); fx.addComponent(UITransform).setContentSize(this.board.boardPixelW,this.board.boardPixelH);
    this.replay.bind(this.sim,views,56,this.board); this.replay.setFxRoot(fx);
    this.traits.refresh(resolveTraits(this.cfg.battle.traits!,members.map(u=>u.id),this.cfg.allUnits()),this.cfg.allUnits());
    this.sim.start(); this.replay.consumeEvents(); this.replay.syncViews(0); this.refreshStatus();
  }
  private refreshStatus(): void {
    this.statistics.consume(this.sim.events); this.ui.refreshCombatStats(this.statistics.snapshot());
    // Global activity input also reaches this disabled HUD; the standalone scene has no run progress.
    this.ui.node.getChildByName('waveTrack')!.active = false;
    const first = this.sim.units[0];
    this.status.string = `${this.index === null ? this.tier + ' 日辉' : first.cfg.name + ' · 技能特写'} · ${(this.sim.tick * .05).toFixed(1)}秒 · 护盾${first.shield} · 羁绊审判${this.sim.events.filter(e=>e.t==='sun_pulse'&&e.effect==='judgment'&&e.trait).length}次`;
  }
  private advance(ticks: number): void {
    for (let i=0;i<ticks&&!this.sim.finished;i++) this.sim.step();
    this.replay.consumeEvents(); this.replay.syncViews(0); this.refreshStatus();
  }
  update(dt: number): void {
    if (!this.sim) return;
    if (!this.paused) { this.elapsed += dt; while (this.elapsed >= .05 && !this.sim.finished) { this.elapsed -= .05; this.sim.step(); } }
    this.replay.consumeEvents(); this.replay.syncViews(this.paused ? 0 : dt, this.paused ? 0 : this.elapsed/.05); this.refreshStatus();
  }
}
