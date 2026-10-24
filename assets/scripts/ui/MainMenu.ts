import { _decorator, Component, Node, UITransform, Graphics, Color, Label, Sprite, resources, JsonAsset, SpriteFrame, director } from 'cc';
import { button, label, panel, fillScreen } from './BattleUI';
import { loadSaveV2, writeSaveV2, freshSaveV2, SAVE_KEY } from '../core/ShopSave';
import { freshRunSeed } from '../core/RunRandomContext';
import { RunConfig, DEFAULT_STAGE_COUNT, runRoundCount } from '../core/RunSetup';
import { UNIT_ART } from '../view/ArtPaths';
import { ConfigManager } from '../core/ConfigManager';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { CollectionPanel } from './CollectionPanel';
import { setSkyBackground } from '../view/SkyBackgroundAnimation';
import { GameAudio } from '../view/GameAudio';
import { GameLoadingOverlay } from './GameLoadingOverlay';

const { ccclass } = _decorator;
const GOLD = new Color(204, 174, 109), TEAL = new Color(89, 203, 176), MUTED = new Color(133, 161, 164);

@ccclass('MainMenu')
export class MainMenu extends Component {
  private readonly stageCount = DEFAULT_STAGE_COUNT;
  private cfg = new ConfigManager();
  private collection: CollectionPanel;
  private runConfig: RunConfig;
  private countLabel: Label;
  private summary: Label;
  private status: Label;
  private loading = false;
  private ready = false;
  private loadScreen: GameLoadingOverlay | null = null;

  start(): void {
    GameAudio.mount(this.node);
    GameAudio.setMusic('menu');
    fillScreen();
    this.buildUI();
    this.loadScreen = GameLoadingOverlay.show(this.node, '正在准备棋境');
    const data: Record<string, any> = {}; let remaining = 5, failed = false;
    for (const name of ['run', 'units', 'skills', 'battle', 'equipment']) resources.load(`config/${name}`, JsonAsset, (error, asset) => {
      if (!this.isValid) return;
      if (error) { failed = true; this.loadScreen?.finish(); this.loadScreen = null; this.status.string = '配置加载失败，请重新打开主界面'; return; }
      data[name] = asset.json;
      if (--remaining || failed) return;
      try {
        this.runConfig = data.run;
        this.cfg.setUnits(data.units); this.cfg.setSkills(data.skills); this.cfg.setBattle(data.battle); this.cfg.setEquipment(data.equipment);
        this.collection = new CollectionPanel(this.node, this.cfg);
        this.refreshCount(); this.loadMonsterArt();
      } catch (error) { this.loadScreen?.finish(); this.loadScreen = null; this.status.string = '配置加载失败，请重新打开主界面'; console.error('[MainMenu]', error); }
    });
  }

  /** Finish loading creature portraits before new/continued runs enter their stage. */
  private loadMonsterArt(): void {
    const paths = Array.from(new Set(this.runConfig.monsters.map(unit => UNIT_ART[unit.artId ?? unit.id])));
    if (paths.some(path => !path)) { this.loadScreen?.finish(); this.loadScreen = null; this.status.string = '野怪素材未配置，请检查资源路径'; return; }
    if (!paths.length) { this.finishPreparation(); return; }
    this.loadScreen?.setMessage('正在准备棋子');
    this.status.string = '正在加载野怪素材…';
    let remaining = paths.length, failed = false;
    for (const path of paths) resources.load(path, SpriteFrame, error => {
      if (!this.isValid) return;
      if (error) {
        failed = true;
        this.loadScreen?.finish(); this.loadScreen = null;
        this.status.string = '野怪素材加载失败，请重新打开主界面';
        console.warn(`[MainMenu] monster sprite load failed: ${path}`, error.message);
      }
      if (--remaining === 0 && !failed) this.finishPreparation();
    });
  }

  private finishPreparation(): void {
    this.ready = true; this.status.string = '';
    this.loadScreen?.finish(); this.loadScreen = null;
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
    background.getComponent(UITransform)!.setContentSize(1280, 720);
    setSkyBackground(background, g, new Color(105, 130, 150));
    const header = panel(this.node, 'menuHeader', 0, 300, 1184, 68, new Color(12, 28, 40, 238), new Color(75, 105, 115), null);
    label(header, '浮空棋境  /  远征', -364, 0, 22, GOLD, 350);
    label(header, '图鉴', 66, 0, 16, TEAL, 80);
    const categories = [['units', '棋子'], ['traits', '羁绊'], ['equipment', '装备']] as const;
    categories.forEach(([category, title], i) => {
      button(header, title, 190 + i * 144, 0, 128, 44, () => {
        if (this.collection && !this.loading) this.collection.show(category);
      }).name = `openCollection_${category}`;
    });
    const intro = panel(this.node, 'expeditionIntro', -345, 34, 460, 376, new Color(9, 25, 36, 235), new Color(62, 99, 109), null);
    label(intro, '浮 空 棋 境', 0, 118, 48, GOLD, 440).isBold = true;
    label(intro, '布阵成军 · 羁绊同行', 0, 63, 20, TEAL, 420);
    this.countLabel = label(intro, '10 阶段远征', 0, -4, 30, GOLD, 420);
    this.summary = label(intro, '', 0, -70, 17, new Color(174, 198, 201), 420);
    this.summary.node.getComponent(UITransform)!.setContentSize(420, 70);
    label(intro, '击败第 10 阶段首领，开启后续远征', 0, -145, 16, TEAL, 430);
    this.drawArena();
    const start = button(this.node, '开始游戏  →', 436, -250, 304, 76, () => this.startNewRun(), true); start.name = 'startGame';
    const saved = loadSaveV2();
    if (saved?.round && (saved.round.phase !== 'ended' || saved.round.health > 0 && saved.round.lastSettlement?.winner === 0 && saved.floor >= 10)) {
      const resume = button(this.node, '继续游戏', 436, -160, 304, 48, () => this.enterGame(false)); resume.name = 'continueGame';
    }
    label(this.node, '11 阶段起：每小关增伤 +1% · 每阶段减伤 +1%（上限 95%）', -220, -259, 15, new Color(174, 198, 201), 720);
    this.status = label(this.node, '正在加载关卡配置…', 0, -324, 14, GOLD, 1100);
    const sound = button(this.node, '', 310, 232, 176, 36, () => {
      GameAudio.setVolume(GameAudio.volume > 0 ? 0 : .6);
      sound.getChildByName('text')!.getComponent(Label)!.string = `音效：${GameAudio.volume > 0 ? '开' : '关'}`;
      GameAudio.play('click');
    }); sound.name = 'menuSound';
    sound.getChildByName('text')!.getComponent(Label)!.string = `音效：${GameAudio.volume > 0 ? '开' : '关'}`;
    const music = button(this.node, '', 500, 232, 176, 36, () => {
      GameAudio.setMusicVolume(GameAudio.musicVolume > 0 ? 0 : .3);
      music.getChildByName('text')!.getComponent(Label)!.string = `音乐：${GameAudio.musicVolume > 0 ? '开' : '关'}`;
    }); music.name = 'menuMusic';
    music.getChildByName('text')!.getComponent(Label)!.string = `音乐：${GameAudio.musicVolume > 0 ? '开' : '关'}`;
  }

  private drawArena(): void {
    const arena = new Node('menuArena'); this.node.addChild(arena); arena.setPosition(235, 15, 0);
    arena.addComponent(UITransform).setContentSize(610, 390);
    const g = arena.addComponent(Graphics);
    g.fillColor = new Color(12, 28, 42, 220); g.ellipse(0, -70, 280, 125); g.fill();
    g.strokeColor = GOLD; g.lineWidth = 2; g.ellipse(0, -40, 270, 112); g.stroke();
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
      const x = (col - 3) * 61 + (row % 2) * 30, y = (row - 2) * 33 - 28;
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i, px = x + Math.cos(angle) * 33, py = y + Math.sin(angle) * 19;
        if (!i) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.close(); g.fillColor = new Color(20 + row * 5, 54 + row * 3, 65 + row * 4, 235); g.fill();
      g.strokeColor = new Color(89, 145, 152, 160); g.lineWidth = 1; g.stroke();
    }
    ['helion', 'seraphiel', 'oris'].forEach((id, i) => {
      const node = new Node(`menuHero_${id}`); arena.addChild(node); node.setPosition((i - 1) * 142, i === 1 ? 48 : 12, 0);
      node.addComponent(UITransform).setContentSize(i === 1 ? 258 : 220, i === 1 ? 258 : 220);
      const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadArtSprite(UNIT_ART[id], (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
    });
    label(arena, '集结棋子，踏入新的棋境', 0, 180, 20, GOLD, 540);
  }
  private refreshCount(): void {
    this.countLabel.string = `${this.stageCount} 阶段远征`;
    if (this.runConfig) this.summary.string = `共 ${runRoundCount(this.stageCount, this.runConfig)} 小关 · 随机一费棋子开局\n选择奇遇，构筑你的专属阵容`;
  }
  private startNewRun(): void { this.enterGame(true); }

  private enterGame(fresh: boolean): void {
    if (!this.ready || this.loading) return;
    this.loading = true; this.status.string = '正在进入棋境…';
    this.loadScreen = GameLoadingOverlay.show(this.node, '正在进入棋境');
    const previous = loadSaveV2();
    if (fresh) writeSaveV2(freshSaveV2(this.stageCount,freshRunSeed(previous?.runSeed),'budget-v1',true));
    const fail = () => {
      // Keep an existing run if the target scene cannot be launched.
      if (fresh) {
        if (previous) writeSaveV2(previous);
        else { try { localStorage.removeItem(SAVE_KEY); } catch {} }
      }
      this.loading = false;
      this.loadScreen?.finish(); this.loadScreen = null;
      if (this.isValid) this.status.string = '战斗场景加载失败，请重试';
    };
    const accepted = director.loadScene('floating-ruins', error => { if (error) fail(); });
    if (!accepted) fail();
  }

  onDestroy(): void { this.loadScreen?.finish(); this.loadScreen = null; }
}
