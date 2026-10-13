import { _decorator, Component, Node, UITransform, Graphics, Color, Label, resources, JsonAsset, director } from 'cc';
import { button, label, panel } from './BattleUI';
import { loadSaveV2, writeSaveV2, freshSaveV2, SAVE_KEY } from '../core/ShopSave';
import { RunConfig, DEFAULT_STAGE_COUNT, normalizeStageCount, runRoundCount } from '../core/RunSetup';

const { ccclass } = _decorator;
const GOLD = new Color(204, 174, 109), TEAL = new Color(89, 203, 176), MUTED = new Color(133, 161, 164);

@ccclass('MainMenu')
export class MainMenu extends Component {
  private stageCount = DEFAULT_STAGE_COUNT;
  private runConfig: RunConfig;
  private countLabel: Label;
  private summary: Label;
  private status: Label;
  private loading = false;
  private ready = false;

  start(): void {
    this.stageCount = loadSaveV2()?.stageCount ?? DEFAULT_STAGE_COUNT;
    this.buildUI();
    resources.load('config/run', JsonAsset, (error, asset) => {
      if (!this.isValid) return;
      if (error) { this.status.string = '关卡配置加载失败，请重新打开主界面'; return; }
      this.runConfig = asset.json as RunConfig; this.ready = true;
      this.status.string = ''; this.refreshCount();
    });
  }

  private buildUI(): void {
    this.node.addComponent(UITransform).setContentSize(1280, 720);
    const background = new Node('menuBackground'); this.node.addChild(background);
    const g = background.addComponent(Graphics);
    g.fillColor = new Color(8, 20, 29); g.rect(-1600, -1000, 3200, 2000); g.fill();
    for (let i = 0; i < 6; i++) {
      g.fillColor = new Color(12 + i * 2, 27 + i * 3, 34 + i * 3);
      g.ellipse(0, 60, 610 - i * 55, 320 - i * 35); g.fill();
    }
    label(this.node, '浮 空 棋 境', 0, 239, 48, GOLD, 660);
    label(this.node, '远征', 0, 190, 17, TEAL, 360);
    const card = panel(this.node, 'runSetup', 0, -5, 520, 330, undefined, GOLD, 'panel_modal');
    label(card, '本局阶段数', 0, 121, 19, GOLD, 380);
    const minus = button(card, '−', -114, 61, 52, 46, () => this.changeStages(-1)); minus.name = 'fewerStages';
    this.countLabel = label(card, `${this.stageCount}`, 0, 61, 40, TEAL, 150);
    const plus = button(card, '+', 114, 61, 52, 46, () => this.changeStages(1)); plus.name = 'moreStages';
    this.summary = label(card, '', 0, -13, 17, MUTED, 470);
    this.summary.node.getComponent(UITransform)!.setContentSize(470, 86);
    const start = button(card, '开始游戏', 0, -108, 300, 48, () => this.startNewRun(), true); start.name = 'startGame';
    const saved = loadSaveV2();
    if (saved?.round && saved.round.phase !== 'ended') {
      const resume = button(this.node, '继续游戏', 0, -222, 250, 40, () => this.enterGame(false)); resume.name = 'continueGame';
    }
    label(this.node, '首阶段 3 小关 · 后续每阶段 10 小关 · 至少 3 阶段', 0, -283, 14, MUTED, 700);
    this.status = label(this.node, '正在加载关卡配置…', 0, -319, 14, GOLD, 720);
  }

  private changeStages(delta: number): void {
    if (this.loading) return;
    this.stageCount = normalizeStageCount(this.stageCount + delta); this.refreshCount();
  }
  private refreshCount(): void {
    this.countLabel.string = `${this.stageCount}`;
    if (this.runConfig) this.summary.string = `共 ${runRoundCount(this.stageCount, this.runConfig)} 小关\n首阶段为极弱野怪 · 开局 1 个一星一费棋子`;
  }
  private startNewRun(): void { this.enterGame(true); }

  private enterGame(fresh: boolean): void {
    if (!this.ready || this.loading) return;
    this.loading = true; this.status.string = '正在进入棋境…';
    const previous = loadSaveV2();
    if (fresh) writeSaveV2(freshSaveV2(this.stageCount));
    const fail = () => {
      // Keep an existing run if the target scene cannot be launched.
      if (fresh) {
        if (previous) writeSaveV2(previous);
        else { try { localStorage.removeItem(SAVE_KEY); } catch {} }
      }
      this.loading = false;
      if (this.isValid) this.status.string = '战斗场景加载失败，请重试';
    };
    const accepted = director.loadScene('scene', error => { if (error) fail(); });
    if (!accepted) fail();
  }
}
