import { Node, UITransform, Graphics, Color, Label, Vec3, sys } from 'cc';
import type { EventTouch } from 'cc';
import { button, label, panel } from './UIPrimitives';
import { GameAudio } from '../view/GameAudio';

export interface BattleSettings { speed: number; damageNumbers: boolean; healingNumbers: boolean }
const KEY = 'autochess.battleSettings';
const GOLD = new Color(204, 174, 109), MUTED = new Color(163, 189, 192), TEAL = new Color(89, 203, 176);

export function loadBattlePreferences(): BattleSettings {
  try {
    const s = JSON.parse(sys.localStorage.getItem(KEY) ?? '{}');
    return { speed: [1, 2, 3].includes(s?.speed) ? s.speed : 1, damageNumbers: s?.damageNumbers !== false, healingNumbers: s?.healingNumbers !== false };
  } catch { return { speed: 1, damageNumbers: true, healingNumbers: true }; }
}
export function saveBattlePreferences(settings: BattleSettings): void {
  try { sys.localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Preferences still apply in this scene. */ }
}

/** Wide touch target, continuous dragging, and separate step buttons for precise adjustment. */
export class VolumeSlider {
  readonly root: Node;
  private track: Node;
  private fill: Graphics;
  private thumb: Node;
  private valueLabel: Label;
  private value = 0;
  private dragging = false;
  private readonly width = 352;
  constructor(parent: Node, name: string, title: string, y: number, private read: () => number, private write: (value: number) => void,
    private preview = false) {
    this.root = new Node(name); parent.addChild(this.root); this.root.setPosition(0, y, 0);
    this.root.addComponent(UITransform).setContentSize(480, 76);
    label(this.root, title, -126, 25, 17, MUTED, 220);
    this.valueLabel = label(this.root, '', 186, 25, 17, GOLD, 100);
    this.track = new Node('volumeTrack'); this.root.addChild(this.track); this.track.setPosition(0, -13, 0);
    this.track.addComponent(UITransform).setContentSize(this.width, 48);
    this.fill = this.track.addComponent(Graphics);
    this.thumb = new Node('volumeThumb'); this.track.addChild(this.thumb);
    this.thumb.addComponent(UITransform).setContentSize(24, 24);
    const knob = this.thumb.addComponent(Graphics); knob.fillColor = GOLD; knob.ellipse(0, 0, 12, 12); knob.fill();
    const update = (event: EventTouch) => {
      const p = event.getUILocation(), local = this.track.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
      this.set((local.x + this.width / 2) / this.width); event.propagationStopped = true;
    };
    this.track.on(Node.EventType.TOUCH_START, (event: EventTouch) => { this.dragging = true; update(event); });
    this.track.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => { if (this.dragging) update(event); });
    this.track.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (!this.dragging) return; update(event); this.dragging = false; if (this.preview) GameAudio.play('click');
    });
    this.track.on(Node.EventType.TOUCH_CANCEL, () => { this.dragging = false; });
    button(this.root, '−', -218, -13, 44, 44, () => this.set(this.value - .05)).name = 'volumeDecrease';
    button(this.root, '+', 218, -13, 44, 44, () => this.set(this.value + .05)).name = 'volumeIncrease';
    this.refresh();
  }
  private set(value: number): void {
    this.value = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
    this.write(this.value); this.paint();
  }
  refresh(): void { this.value = this.read(); this.paint(); }
  private paint(): void {
    const g = this.fill; g.clear(); g.fillColor = new Color(43, 65, 72); g.roundRect(-this.width / 2, -4, this.width, 8, 4); g.fill();
    if (this.value > 0) { g.fillColor = TEAL; g.roundRect(-this.width / 2, -4, this.width * this.value, 8, 4); g.fill(); }
    this.thumb.setPosition(-this.width / 2 + this.width * this.value, 0, 0);
    this.valueLabel.string = this.value === 0 ? '静音' : `${Math.round(this.value * 100)}%`;
  }
}

export class SettingsPanel {
  readonly root: Node;
  readonly content: Node;
  private rows: Label[] = [];
  private sliders: VolumeSlider[];
  constructor(parent: Node, private options: {
    read?: () => BattleSettings; change?: (settings: BattleSettings) => void; home?: () => void;
  } = {}) {
    this.root = panel(parent, 'mainMenu', 0, 0, 1280, 720, new Color(0, 0, 0, 180), new Color(0, 0, 0, 0), null);
    for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_MOVE, Node.EventType.TOUCH_END])
      this.root.on(type, event => { event.propagationStopped = true; });
    this.content = panel(this.root, 'mainMenuContent', 0, 0, 560, 624, new Color(13, 27, 35), GOLD, 'panel_side');
    label(this.content, '设 置', -170, 270, 27, GOLD, 160);
    button(this.content, '关闭', 216, 270, 80, 44, () => this.hide()).name = 'mainMenuClose';
    const keys = ['speed', 'damageNumbers', 'healingNumbers'] as const;
    keys.forEach((key, i) => {
      const row = button(this.content, '', 0, 194 - i * 56, 480, 44, () => {
        const s = this.read();
        if (key === 'speed') s.speed = s.speed % 3 + 1; else s[key] = !s[key];
        saveBattlePreferences(s); this.options.change?.(s); this.refresh();
      });
      row.name = ['settingSpeed', 'settingDamageNumbers', 'settingHealingNumbers'][i];
      this.rows.push(row.getChildByName('text')!.getComponent(Label)!);
    });
    this.sliders = [new VolumeSlider(this.content, 'settingSoundVolume', '音效音量', 6, () => GameAudio.volume, value => GameAudio.setVolume(value), true),
      new VolumeSlider(this.content, 'settingMusicVolume', '背景音乐', -86, () => GameAudio.musicVolume, value => GameAudio.setMusicVolume(value))];
    if (options.home) button(this.content, '返回主界面', 0, -220, 480, 44, () => options.home!()).name = 'returnHome';
    label(this.content, options.home ? '设置自动保存 · 战斗中继续计时' : '设置自动保存，下次进入仍然生效', 0, options.home ? -278 : -180, 14, MUTED, 500);
    this.refresh(); this.root.active = false;
  }
  private read(): BattleSettings { return { ...(this.options.read?.() ?? loadBattlePreferences()) }; }
  refresh(): void {
    const s = this.read();
    const text = [`战斗倍速  ×${s.speed}`, `伤害数字  ${s.damageNumbers ? '显示' : '隐藏'}`, `治疗数字  ${s.healingNumbers ? '显示' : '隐藏'}`];
    this.rows.forEach((row, i) => row.string = text[i]); this.sliders?.forEach(slider => slider.refresh());
  }
  show(): void { this.refresh(); this.root.active = true; this.root.setSiblingIndex(this.root.parent!.children.length - 1); }
  hide(): void { this.root.active = false; }
}
