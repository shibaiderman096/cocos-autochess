import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, Color, resources } from 'cc';
import { UI_SPRITE } from '../view/ArtPaths';

const { ccclass } = _decorator;

function makeLabel(text: string, size: number, color: Color): Node {
  const n = new Node('label');
  n.addComponent(UITransform);
  const l = n.addComponent(Label);
  l.string = text;
  l.fontSize = size;
  l.lineHeight = size + 4;
  l.color = color;
  return n;
}

function makeSpriteNode(path: string, w: number, h: number): { node: Node; sprite: Sprite } {
  const n = new Node('sprite');
  n.addComponent(UITransform).setContentSize(w, h);
  const s = n.addComponent(Sprite);
  s.sizeMode = Sprite.SizeMode.CUSTOM;
  resources.load(path, SpriteFrame, (e, sf) => {
    if (!e && sf && s.isValid) s.spriteFrame = sf;
  });
  return { node: n, sprite: s };
}

/**
 * 战斗 UI（M1 第 10/11 项）：
 * - 开战按钮（布阵阶段可见，点击后进入战斗）
 * - 倍速按钮（1x → 2x → 3x 循环）
 * - 胜负弹窗（胜利 / 失败 / 平局 + 再来一场）
 * 由 BattleStage 动态创建并挂到 uiRoot（Canvas）上。
 */
@ccclass('BattleUI')
export class BattleUI extends Component {
  onFight: () => void = () => {};
  onSpeed: (s: number) => void = () => {};
  onRestart: () => void = () => {};

  private speed = 1;
  private fightBtn: Node;
  private speedLabel: Label;
  private resultPanel: Node;
  private resultLabel: Label;

  init() {
    // 开战按钮
    const fight = makeSpriteNode(UI_SPRITE.btnPrimary, 200, 64);
    fight.node.setPosition(0, -240, 0);
    fight.node.addChild(makeLabel('开 战', 28, Color.WHITE));
    fight.node.on(Node.EventType.TOUCH_END, () => this.onFight());
    this.node.addChild(fight.node);
    this.fightBtn = fight.node;

    // 倍速按钮
    const speedBtn = makeSpriteNode(UI_SPRITE.btnSecondary, 140, 52);
    speedBtn.node.setPosition(330, -240, 0);
    const sl = makeLabel('倍速 x1', 24, Color.WHITE);
    speedBtn.node.addChild(sl);
    this.speedLabel = sl.getComponent(Label)!;
    speedBtn.node.on(Node.EventType.TOUCH_END, () => {
      this.speed = (this.speed % 3) + 1;
      this.speedLabel.string = `倍速 x${this.speed}`;
      this.onSpeed(this.speed);
    });
    this.node.addChild(speedBtn.node);

    // 胜负弹窗
    const panel = makeSpriteNode(UI_SPRITE.panel, 440, 280);
    panel.node.setPosition(0, 0, 0);
    const rl = makeLabel('', 40, Color.WHITE);
    panel.node.addChild(rl);
    this.resultLabel = rl.getComponent(Label)!;
    const restart = makeSpriteNode(UI_SPRITE.btnPrimary, 190, 56);
    restart.node.setPosition(0, -84, 0);
    restart.node.addChild(makeLabel('再来一场', 26, Color.WHITE));
    restart.node.on(Node.EventType.TOUCH_END, () => this.onRestart());
    panel.node.addChild(restart.node);
    panel.node.active = false;
    this.resultPanel = panel.node;
    this.node.addChild(panel.node);
  }

  setSpeed(s: number): void {
    this.speed = s;
    if (this.speedLabel) this.speedLabel.string = `倍速 x${s}`;
  }

  showFightBtn(): void { if (this.fightBtn) this.fightBtn.active = true; }
  hideFightBtn(): void { if (this.fightBtn) this.fightBtn.active = false; }

  showResult(winner: number): void {
    if (!this.resultLabel) return;
    this.resultLabel.string = winner === 0 ? '胜 利 !' : winner === 1 ? '失 败' : '平 局';
    this.resultLabel.color = winner === 0
      ? new Color(130, 255, 130, 255)
      : winner === 1
        ? new Color(255, 110, 110, 255)
        : new Color(230, 230, 230, 255);
    if (this.resultPanel) this.resultPanel.active = true;
  }

  hideResult(): void { if (this.resultPanel) this.resultPanel.active = false; }
}
