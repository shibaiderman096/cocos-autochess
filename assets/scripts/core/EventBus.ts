/**
 * 轻量事件总线。
 * 表现层订阅战斗事件时使用；逻辑层不依赖它也能跑（事件直接进数组）。
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<T> {
  private listeners: Array<Listener<T>> = [];

  on(fn: Listener<T>): void {
    this.listeners.push(fn);
  }

  off(fn: Listener<T>): void {
    const i = this.listeners.indexOf(fn);
    if (i >= 0) this.listeners.splice(i, 1);
  }

  emit(payload: T): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i](payload);
  }

  clear(): void {
    this.listeners.length = 0;
  }
}
