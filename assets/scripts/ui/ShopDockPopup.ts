import { Node, UIOpacity, Tween, tween } from 'cc';

/** One entrance per occupying content identity, even when a purchase rebuilds its nodes. */
export class ShopDockPopup {
  private key = '';
  private progress = { value: 1 };
  private root: Node | null = null;
  private opacity: UIOpacity | null = null;
  private origin = { x: 0, y: 0, z: 0 };

  play(root: Node, key: string): void {
    const changed = key !== this.key;
    if (changed) {
      Tween.stopAllByTarget(this.progress);
      this.key = key; this.progress = { value: 0 };
    }
    this.root = root; this.origin = { x: root.position.x, y: root.position.y, z: root.position.z };
    this.opacity = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
    this.apply();
    if (changed) tween(this.progress).to(0.28, { value: 1 }, { easing: 'cubicOut', onUpdate: () => this.apply() }).start();
  }

  clear(reset = true): void {
    this.root = null; this.opacity = null;
    if (reset) { Tween.stopAllByTarget(this.progress); this.key = ''; this.progress.value = 1; }
  }

  private apply(): void {
    if (!this.root || !this.opacity) return;
    const p = this.progress.value, scale = 0.92 + 0.08 * p + Math.sin(p * Math.PI) * 0.035;
    this.root.setPosition(this.origin.x, this.origin.y - 28 * (1 - p), this.origin.z);
    this.root.setScale(scale, scale, 1);
    this.opacity.opacity = Math.round(255 * Math.min(1, p * 2));
  }
}
